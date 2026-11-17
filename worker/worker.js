// Tasty Trips sync server — a Cloudflare Worker with a D1 database (free plan is plenty).
//
// Trips are stored privately in D1. Each trip is only visible to people holding
// an invite code for it; the owner code (ADMIN_CODE) sees and manages everything.
//
// Setup (Worker → Settings):
//   Bindings → D1 database, variable name: DB
//   Variables and Secrets:
//     ADMIN_CODE     (secret) your owner code — keep it to yourself
//     ALLOWED_ORIGIN (text, optional) e.g. https://githintz.github.io

const MAX_TRIP = 1_000_000;      // bytes of JSON per trip
const MAX_IMAGE = 1_400_000;     // bytes per photo
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, label TEXT, trip_ids TEXT NOT NULL, created_by TEXT, created_at TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS images (name TEXT PRIMARY KEY, type TEXT, data TEXT NOT NULL, created_at TEXT)'),
  ]);
  ready = true;
}

function randomCode(n = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'trip';
const clean = (s, n = 60) => String(s || '').replace(/[<>\n\r]/g, '').trim().slice(0, n);
const now = () => new Date().toISOString();

async function access(env, request) {
  const keys = (request.headers.get('X-Trip-Keys') || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30);
  const admin = !!env.ADMIN_CODE && keys.includes(env.ADMIN_CODE);
  const tripIds = new Set();
  const keyInfo = [];
  const inviteKeys = keys.filter((k) => k !== env.ADMIN_CODE);
  if (inviteKeys.length) {
    const rows = await env.DB.prepare(`SELECT code, label, trip_ids FROM invites WHERE code IN (${inviteKeys.map(() => '?').join(',')})`)
      .bind(...inviteKeys).all();
    for (const r of rows.results) {
      const ids = JSON.parse(r.trip_ids);
      ids.forEach((id) => tripIds.add(id));
      keyInfo.push({ code: r.code, admin: false, label: r.label || '', tripIds: ids });
    }
  }
  if (admin) keyInfo.unshift({ code: env.ADMIN_CODE, admin: true, label: 'Owner code', tripIds: [] });
  return { admin, keyInfo, valid: keyInfo.length > 0, can: (id) => admin || tripIds.has(id), tripIds };
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Trip-Keys',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
    if (!env.DB) return json({ error: 'Sync server is missing its D1 database (binding DB)' }, 500);
    if (!env.ADMIN_CODE) return json({ error: 'Sync server is missing ADMIN_CODE' }, 500);

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const method = request.method;
    const db = env.DB;

    try {
      await init(db);

      // Public: photos (names are long random strings).
      if (parts[0] === 'img' && parts[1] && method === 'GET') {
        const row = await db.prepare('SELECT type, data FROM images WHERE name = ?').bind(parts[1]).first();
        if (!row) return new Response('Not found', { status: 404, headers: cors });
        const bin = atob(row.data);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new Response(bytes, { headers: { ...cors, 'Content-Type': row.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
      }

      const who = await access(env, request);
      const body = ['POST', 'PUT'].includes(method) ? await request.json().catch(() => ({})) : {};

      // ---- trips
      if (parts[0] === 'trips' && parts.length === 1 && method === 'GET') {
        const rows = who.admin
          ? await db.prepare('SELECT id, data, version FROM trips ORDER BY updated_at').all()
          : who.tripIds.size
            ? await db.prepare(`SELECT id, data, version FROM trips WHERE id IN (${[...who.tripIds].map(() => '?').join(',')}) ORDER BY updated_at`).bind(...who.tripIds).all()
            : { results: [] };
        const all = who.admin ? await db.prepare('SELECT COUNT(*) AS n FROM trips').first() : null;
        return json({
          admin: who.admin,
          keys: who.keyInfo,
          empty: who.admin ? all.n === 0 : undefined,
          trips: rows.results.map((r) => ({ id: r.id, version: r.version, data: JSON.parse(r.data) })),
        });
      }

      if (parts[0] === 'trips' && parts.length === 1 && method === 'POST') {
        if (!who.valid) return json({ error: 'You need an invite code to create trips' }, 403);
        const data = body.data;
        if (!data || typeof data !== 'object') return json({ error: 'Invalid trip' }, 400);
        let id = slug(data.id || data.name); let n = 2;
        while (await db.prepare('SELECT 1 FROM trips WHERE id = ?').bind(id).first()) id = `${slug(data.id || data.name)}-${n++}`;
        data.id = id;
        const text = JSON.stringify(data);
        if (text.length > MAX_TRIP) return json({ error: 'Trip is too large' }, 413);
        await db.prepare('INSERT INTO trips (id, data, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, text, now()).run();
        let invite = null;
        if (!who.admin) {
          invite = randomCode();
          await db.prepare('INSERT INTO invites (code, label, trip_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(invite, `${clean(data.name, 40)} (creator)`, JSON.stringify([id]), clean(body.by, 40), now()).run();
        }
        return json({ id, version: 1, invite });
      }

      if (parts[0] === 'trips' && parts[1]) {
        const id = parts[1];
        if (!who.can(id)) return json({ error: 'You do not have access to this trip' }, 403);
        if (method === 'PUT') {
          const data = body.data;
          if (!data || data.id !== id) return json({ error: 'Invalid trip' }, 400);
          const text = JSON.stringify(data);
          if (text.length > MAX_TRIP) return json({ error: 'Trip is too large' }, 413);
          const r = await db.prepare('UPDATE trips SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
            .bind(text, now(), id, Number(body.version)).run();
          if (!r.meta.changes) {
            const exists = await db.prepare('SELECT version FROM trips WHERE id = ?').bind(id).first();
            return json({ error: exists ? 'Trip changed in the meantime' : 'Trip not found' }, exists ? 409 : 404);
          }
          return json({ version: Number(body.version) + 1 });
        }
        if (method === 'DELETE') {
          if (!who.admin) return json({ error: 'Only the trip owner can delete trips' }, 403);
          await db.prepare('DELETE FROM trips WHERE id = ?').bind(id).run();
          const inv = await db.prepare('SELECT code, trip_ids FROM invites').all();
          for (const r of inv.results) {
            const ids = JSON.parse(r.trip_ids).filter((x) => x !== id);
            if (!ids.length) await db.prepare('DELETE FROM invites WHERE code = ?').bind(r.code).run();
            else await db.prepare('UPDATE invites SET trip_ids = ? WHERE code = ?').bind(JSON.stringify(ids), r.code).run();
          }
          return json({ ok: true });
        }
      }

      // ---- invites
      const visibleInvite = (ids) => who.admin || ids.every((id) => who.tripIds.has(id));
      if (parts[0] === 'invites' && parts.length === 1 && method === 'GET') {
        if (!who.valid) return json({ invites: [] });
        const rows = await db.prepare('SELECT code, label, trip_ids, created_by, created_at FROM invites ORDER BY created_at DESC').all();
        return json({
          invites: rows.results.map((r) => ({ code: r.code, label: r.label, tripIds: JSON.parse(r.trip_ids), createdBy: r.created_by, createdAt: r.created_at }))
            .filter((i) => visibleInvite(i.tripIds)),
        });
      }
      if (parts[0] === 'invites' && parts.length === 1 && method === 'POST') {
        const ids = Array.isArray(body.tripIds) ? [...new Set(body.tripIds.map(String))].slice(0, 50) : [];
        if (!ids.length) return json({ error: 'Pick at least one trip' }, 400);
        if (!ids.every((id) => who.can(id))) return json({ error: 'You can only invite people to trips you have access to' }, 403);
        const code = randomCode();
        await db.prepare('INSERT INTO invites (code, label, trip_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(code, clean(body.label), JSON.stringify(ids), clean(body.by, 40), now()).run();
        return json({ code });
      }
      if (parts[0] === 'invites' && parts[1] && method === 'DELETE') {
        const row = await db.prepare('SELECT trip_ids FROM invites WHERE code = ?').bind(parts[1]).first();
        if (!row) return json({ ok: true });
        if (!visibleInvite(JSON.parse(row.trip_ids))) return json({ error: 'Not allowed' }, 403);
        await db.prepare('DELETE FROM invites WHERE code = ?').bind(parts[1]).run();
        return json({ ok: true });
      }

      // ---- photos
      if (parts[0] === 'images' && method === 'POST') {
        if (!who.valid) return json({ error: 'You need an invite code to upload photos' }, 403);
        const content = String(body.content || '');
        if (!content || content.length > MAX_IMAGE * 1.37) return json({ error: 'Photo too large' }, 413);
        const type = /^image\/(jpeg|png|webp)$/.test(body.type) ? body.type : 'image/jpeg';
        const name = `${randomCode(16)}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
        await db.prepare('INSERT INTO images (name, type, data, created_at) VALUES (?, ?, ?, ?)').bind(name, type, content, now()).run();
        return json({ url: `${url.origin}/img/${name}` });
      }

      // ---- one-time move of existing trips (owner only)
      if (parts[0] === 'import' && method === 'POST') {
        if (!who.admin) return json({ error: 'Only the owner can import' }, 403);
        const trips = Array.isArray(body.trips) ? body.trips : [];
        for (const t of trips) {
          if (!t || !t.id) continue;
          const text = JSON.stringify(t);
          if (text.length > MAX_TRIP) continue;
          await db.prepare('INSERT INTO trips (id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, version = trips.version + 1, updated_at = excluded.updated_at')
            .bind(slug(t.id), JSON.stringify({ ...t, id: slug(t.id) }), now()).run();
        }
        return json({ ok: true, count: trips.length });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

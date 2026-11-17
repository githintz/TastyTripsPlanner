// Data store. Trips live on the Tasty Trips sync server (worker/worker.js),
// which only returns the trips your codes unlock. Without a sync server
// (no config.json syncUrl) everything is kept in this browser.

const LS_LOCAL = 'tt.localData';
const LS_NAME = 'tt.name';
const LS_KEYS = 'tt.keys';
const LS_LEGACY_CODE = 'tt.tripCode';
const MAX_CHANGES = 300;

export const CATEGORIES = [
  { id: 'main', label: 'Main course' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'street', label: 'Street food' },
  { id: 'beverage', label: 'Beverage' },
];

export const VEG = {
  yes: { label: 'Yes', long: 'Vegetarian friendly' },
  maybe: { label: 'Maybe', long: 'Veg versions at some spots' },
  no: { label: 'No', long: 'Contains meat or fish' },
};

function lsGet(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function lsSet(key, v) { try { if (v === null || v === undefined || v === '') localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* ignore */ } }
function readJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function writeJSON(key, value) { lsSet(key, value === null || value === undefined ? null : JSON.stringify(value)); }
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- identity & codes

export const getName = () => lsGet(LS_NAME, '').trim();
export const setName = (n) => lsSet(LS_NAME, String(n || '').trim().slice(0, 40));

export function getKeys() {
  const keys = readJSON(LS_KEYS, []);
  const legacy = lsGet(LS_LEGACY_CODE, '');
  if (legacy) { lsSet(LS_LEGACY_CODE, null); if (!keys.includes(legacy)) keys.push(legacy); writeJSON(LS_KEYS, keys); }
  return keys;
}
export function addKey(code) {
  const c = String(code || '').trim();
  if (!c) return;
  const keys = getKeys();
  if (!keys.includes(c)) { keys.push(c); writeJSON(LS_KEYS, keys); }
}
export function removeKey(code) { writeJSON(LS_KEYS, getKeys().filter((k) => k !== code)); }

// ---------------------------------------------------------------- config

let config = { syncUrl: '' };
export async function loadConfig() {
  try {
    const res = await fetch(`config.json?t=${Date.now()}`);
    if (res.ok) config = { ...config, ...(await res.json()) };
  } catch { /* no config: fine */ }
  config.syncUrl = String(config.syncUrl || '').replace(/\/+$/, '');
  return config;
}
export const getConfig = () => config;
export const backendKind = () => (config.syncUrl ? 'shared' : null);
export const isConnected = () => !!config.syncUrl;

// ---------------------------------------------------------------- server calls

class HttpError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${config.syncUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Trip-Keys': getKeys().join(',') },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch { throw new HttpError("Can't reach the sync server", 0); }
  let j = null;
  try { j = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new HttpError((j && j.error) || res.statusText, res.status);
  return j;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------- store

class Store {
  constructor() {
    this.data = { trips: [] };
    this.versions = {};
    this.access = { admin: false, keys: [], empty: false };
    this.mode = 'local'; // 'shared' | 'local'
    this.loadError = '';
    this.listeners = new Set();
    this.saving = Promise.resolve();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  async fetchShared() {
    const j = await api('/trips');
    // Forget codes the server no longer recognises (e.g. revoked invites).
    if (getKeys().length && j.keys) {
      const ok = new Set(j.keys.map((k) => k.code));
      getKeys().filter((k) => !ok.has(k)).forEach(removeKey);
    }
    return {
      data: { trips: j.trips.map((t) => t.data) },
      versions: Object.fromEntries(j.trips.map((t) => [t.id, t.version])),
      access: { admin: !!j.admin, keys: j.keys || [], empty: !!j.empty },
    };
  }

  async load() {
    this.loadError = '';
    if (isConnected()) {
      try {
        const r = await this.fetchShared();
        Object.assign(this, r);
        this.mode = 'shared';
        return;
      } catch (e) {
        this.loadError = e.message;
        this.mode = 'shared';
        this.data = { trips: [] };
        throw e;
      }
    }
    this.mode = 'local';
    const local = readJSON(LS_LOCAL, null);
    if (local) { this.data = local; return; }
    try {
      const res = await fetch(`data/trips.json?t=${Date.now()}`);
      this.data = res.ok ? await res.json() : { trips: [] };
    } catch { this.data = { trips: [] }; }
  }

  canCreate() { return this.mode === 'local' || this.access.keys.length > 0; }

  /**
   * Apply a change. `mutate(data)` runs against the freshest copy, so with the
   * sync server it is re-applied on top of anything saved from another device.
   * `change` (optional) is added to that trip's change log.
   */
  update(mutate, message, change, opts = {}) {
    const entry = change ? {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      by: getName() || 'Someone',
      ...change,
    } : null;
    const apply = (d) => {
      mutate(d);
      const t = entry && entry.tripId && d.trips.find((x) => x.id === entry.tripId);
      if (t) t.changes = [entry, ...(t.changes || []).filter((c) => c.id !== entry.id)].slice(0, MAX_CHANGES);
    };
    apply(this.data);
    this.emit();
    this.saving = this.saving.then(() => this.persist(apply, opts)).catch(async (e) => {
      console.warn(e);
      this.onError && this.onError(e);
      if (this.mode === 'shared') { try { await this.load(); } catch { /* ignore */ } this.emit(); }
    });
    return this.saving;
  }

  async persist(apply, opts = {}) {
    if (this.mode !== 'shared') {
      writeJSON(LS_LOCAL, this.data);
      this.onSaved && this.onSaved('local', opts);
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const fresh = await this.fetchShared();
      const before = new Map(fresh.data.trips.map((t) => [t.id, JSON.stringify(t)]));
      const d = clone(fresh.data);
      apply(d);
      const versions = { ...fresh.versions };
      try {
        for (const t of d.trips) {
          if (!before.has(t.id)) {
            const r = await api('/trips', { method: 'POST', body: { data: t, by: getName() } });
            if (r.invite) addKey(r.invite);
            if (r.id !== t.id) { this.onRenamed && this.onRenamed(t.id, r.id); t.id = r.id; }
            versions[t.id] = r.version;
          } else if (before.get(t.id) !== JSON.stringify(t)) {
            const r = await api(`/trips/${encodeURIComponent(t.id)}`, { method: 'PUT', body: { data: t, version: versions[t.id] } });
            versions[t.id] = r.version;
          }
        }
        for (const id of before.keys()) {
          if (!d.trips.some((t) => t.id === id)) await api(`/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
        }
      } catch (e) {
        if (e.status === 409) continue;
        throw e;
      }
      this.data = d; this.versions = versions;
      const after = await this.fetchShared().catch(() => null); // pick up new access (e.g. creator invite)
      if (after) Object.assign(this, after);
      this.emit();
      this.onSaved && this.onSaved('shared', opts);
      return;
    }
    throw new Error('Could not save: the trip kept changing. Try again.');
  }

  // ---- invites
  async listInvites() { return (await api('/invites')).invites; }
  async createInvite(tripIds, label) { return (await api('/invites', { method: 'POST', body: { tripIds, label, by: getName() } })).code; }
  async revokeInvite(code) { await api(`/invites/${encodeURIComponent(code)}`, { method: 'DELETE' }); }

  /** Owner only: copy trips (e.g. the old data/trips.json) onto the server. */
  async importTrips(trips) {
    await api('/import', { method: 'POST', body: { trips } });
    await this.load();
    this.emit();
  }

  /** Upload a photo; returns its URL (or a data: URL when not connected). */
  async uploadImage(blob) {
    if (this.mode !== 'shared') {
      return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    }
    const content = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
    return (await api('/images', { method: 'POST', body: { content, type: blob.type || 'image/jpeg' } })).url;
  }
}

export const store = new Store();

/** Photos uploaded by earlier versions live in the repo's images/ folder. */
export function rawUrl(path) {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return '';
  const repo = location.pathname.split('/').filter(Boolean)[0] || `${m[1]}.github.io`;
  return `https://raw.githubusercontent.com/${m[1]}/${repo}/main/${path}`;
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export function uniqueId(base, taken) {
  let id = slugify(base); let n = 2;
  const set = new Set(taken);
  while (set.has(id)) id = `${slugify(base)}-${n++}`;
  return id;
}

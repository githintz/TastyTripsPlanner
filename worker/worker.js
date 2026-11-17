// Tasty Trips sync server — a Cloudflare Worker (free plan is plenty).
//
// It keeps the GitHub token secret and lets everyone with the trip code edit
// data/trips.json (and add photos to images/) without a GitHub account.
//
// Settings → Variables and Secrets:
//   GITHUB_TOKEN   (secret) fine-grained token, this repo only, Contents: Read and write
//   TRIP_PASSCODE  (secret) the code friends need to edit; leave unset to let anyone edit
//   OWNER          (text)   e.g. githintz
//   REPO           (text)   e.g. TastyTripsPlanner
//   BRANCH         (text)   the branch GitHub Pages deploys from, e.g. main
//   ALLOWED_ORIGIN (text, optional) e.g. https://githintz.github.io

const DATA_PATH = 'data/trips.json';
const MAX_DATA = 5 * 1024 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Trip-Key',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (!env.GITHUB_TOKEN || !env.OWNER || !env.REPO) return json({ error: 'Sync server is not configured yet' }, 500);

    const url = new URL(request.url);
    const branch = env.BRANCH || 'main';
    const keyOk = !env.TRIP_PASSCODE || request.headers.get('X-Trip-Key') === env.TRIP_PASSCODE;

    const gh = async (path, init = {}) => {
      const res = await fetch(`https://api.github.com/repos/${env.OWNER}/${env.REPO}/${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'tasty-trips-sync',
          ...(init.headers || {}),
        },
      });
      let body = null;
      try { body = await res.json(); } catch { /* empty */ }
      return { ok: res.ok, status: res.status, body };
    };
    const fail = (r) => json({ error: (r.body && r.body.message) || 'GitHub error' }, r.status === 409 ? 409 : r.status || 502);
    const authorOf = (a) => (a && a.name
      ? { name: String(a.name).replace(/[<>\n\r]/g, '').slice(0, 40) || 'Someone', email: 'tasty-trips@users.noreply.github.com' }
      : undefined);

    try {
      if (url.pathname === '/check') {
        if (!keyOk) return json({ error: 'Wrong trip code' }, 401);
        return json({ ok: true, repo: `${env.OWNER}/${env.REPO}`, branch });
      }

      if (url.pathname === '/data' && request.method === 'GET') {
        const r = await gh(`contents/${DATA_PATH}?ref=${encodeURIComponent(branch)}`);
        if (!r.ok) return fail(r);
        return json({ content: r.body.content, sha: r.body.sha });
      }

      if (!keyOk) return json({ error: 'Wrong trip code' }, 401);

      if (url.pathname === '/data' && request.method === 'PUT') {
        const { content, sha, message, author } = await request.json();
        if (typeof content !== 'string' || content.length > MAX_DATA * 1.4) return json({ error: 'Invalid data' }, 400);
        // Only accept a well-formed trips file.
        const text = new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.trips)) return json({ error: 'Invalid data' }, 400);
        const r = await gh(`contents/${DATA_PATH}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: String(message || 'Update trips').slice(0, 200),
            content, sha, branch, author: authorOf(author),
          }),
        });
        return r.ok ? json({ sha: r.body.content.sha }) : fail(r);
      }

      if (url.pathname === '/image' && request.method === 'PUT') {
        const { name, content, author } = await request.json();
        if (!/^[a-z0-9][a-z0-9-]{0,80}\.jpg$/.test(String(name))) return json({ error: 'Invalid file name' }, 400);
        if (typeof content !== 'string' || content.length > MAX_IMAGE * 1.4) return json({ error: 'Photo too large' }, 413);
        const r = await gh(`contents/images/${name}`, {
          method: 'PUT',
          body: JSON.stringify({ message: `Add photo ${name}`, content, branch, author: authorOf(author) }),
        });
        return r.ok ? json({ path: `images/${name}` }) : fail(r);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

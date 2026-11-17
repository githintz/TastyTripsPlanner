// Data store: loads trips.json, applies edits, logs who changed what, and saves
// through one of three backends:
//   1. "shared"  – the Tasty Trips sync server (worker/worker.js). Holds the
//                  GitHub token itself; friends only need the invite link.
//   2. "github"  – direct GitHub API calls with a personal token (owner only).
//   3. "local"   – this browser only.

const DATA_PATH = 'data/trips.json';
const LS_SETTINGS = 'tt.github';
const LS_LOCAL = 'tt.localData';
const LS_NAME = 'tt.name';
const LS_CODE = 'tt.tripCode';
const MAX_CHANGES = 500;

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

// ---------------------------------------------------------------- identity

export const getName = () => lsGet(LS_NAME, '').trim();
export const setName = (n) => lsSet(LS_NAME, String(n || '').trim().slice(0, 40));
export const getTripCode = () => lsGet(LS_CODE, '');
export const setTripCode = (c) => lsSet(LS_CODE, String(c || '').trim());

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

/** Guess owner/repo from a GitHub Pages URL like owner.github.io/repo/. */
function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return { owner: '', repo: '' };
  const first = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: first || `${m[1]}.github.io` };
}

export function getSettings() {
  const g = guessRepo();
  const s = readJSON(LS_SETTINGS, {});
  return { owner: s.owner || g.owner, repo: s.repo || g.repo, branch: s.branch || 'main', token: s.token || '' };
}
export function saveSettings(s) { writeJSON(LS_SETTINGS, s); }

/** 'shared' | 'github' | null */
export function backendKind() {
  if (config.syncUrl) return 'shared';
  const s = getSettings();
  if (s.token && s.owner && s.repo) return 'github';
  return null;
}
export const isConnected = () => !!backendKind();

// ---------------------------------------------------------------- base64 (UTF-8 safe)

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const toBase64 = (str) => bytesToB64(new TextEncoder().encode(str));
function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

class HttpError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function req(url, opts, label) {
  let res;
  try { res = await fetch(url, opts); } catch { throw new HttpError(`${label}: can't reach the server`, 0); }
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || res.statusText;
    throw new HttpError(res.status === 401 ? 'Wrong trip code' : `${label}: ${msg}`, res.status);
  }
  return body;
}

const author = () => (getName() ? { name: getName() } : null);

// ---- shared sync server
const shared = {
  headers() { return { 'Content-Type': 'application/json', 'X-Trip-Key': getTripCode() }; },
  async get() {
    const j = await req(`${config.syncUrl}/data?t=${Date.now()}`, { headers: this.headers() }, 'Sync');
    return { data: JSON.parse(fromBase64(j.content)), sha: j.sha };
  },
  async put(data, sha, message) {
    const j = await req(`${config.syncUrl}/data`, {
      method: 'PUT', headers: this.headers(),
      body: JSON.stringify({ content: toBase64(JSON.stringify(data, null, 2) + '\n'), sha, message, author: author() }),
    }, 'Sync');
    return j.sha;
  },
  async image(name, b64) {
    const j = await req(`${config.syncUrl}/image`, {
      method: 'PUT', headers: this.headers(), body: JSON.stringify({ name, content: b64, author: author() }),
    }, 'Sync');
    return j.path;
  },
  async check() { return req(`${config.syncUrl}/check`, { headers: this.headers() }, 'Sync'); },
};

// ---- direct GitHub (owner with a personal token)
const github = {
  async call(path, opts = {}) {
    const s = getSettings();
    return req(`https://api.github.com/repos/${s.owner}/${s.repo}/${path}`, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${s.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    }, 'GitHub');
  },
  authorObj() { const a = author(); return a ? { name: a.name, email: 'tasty-trips@users.noreply.github.com' } : undefined; },
  async get() {
    const j = await this.call(`contents/${DATA_PATH}?ref=${encodeURIComponent(getSettings().branch)}&t=${Date.now()}`);
    return { data: JSON.parse(fromBase64(j.content)), sha: j.sha };
  },
  async put(data, sha, message) {
    const j = await this.call(`contents/${DATA_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(JSON.stringify(data, null, 2) + '\n'), sha, branch: getSettings().branch, author: this.authorObj() }),
    });
    return j.content.sha;
  },
  async image(name, b64) {
    const path = `images/${name}`;
    await this.call(`contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `Add photo ${name}`, content: b64, branch: getSettings().branch, author: this.authorObj() }) });
    return path;
  },
  async check() {
    const repo = await this.call('');
    if (!repo.permissions || !repo.permissions.push) throw new Error('This token can read the repo but not write to it.');
    await this.call(`branches/${encodeURIComponent(getSettings().branch)}`);
    return { repo: repo.full_name, branch: getSettings().branch };
  },
};

const backend = () => ({ shared, github }[backendKind()] || null);
export const testConnection = () => backend().check();

// ---------------------------------------------------------------- store

class Store {
  constructor() {
    this.data = null;
    this.sha = null;
    this.mode = 'static'; // 'shared' | 'github' | 'local' | 'static'
    this.listeners = new Set();
    this.saving = Promise.resolve();
    this.loadError = '';
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  async load() {
    this.loadError = '';
    const b = backend();
    if (b) {
      try {
        const { data, sha } = await b.get();
        this.data = data; this.sha = sha; this.mode = backendKind();
        return;
      } catch (e) {
        console.warn('Remote load failed, falling back', e);
        this.loadError = e.message;
      }
    }
    const local = readJSON(LS_LOCAL, null);
    if (local) { this.data = local; this.mode = 'local'; return; }
    const res = await fetch(`${DATA_PATH}?t=${Date.now()}`);
    this.data = await res.json();
    this.mode = 'static';
  }

  hasLocalChanges() { return !!readJSON(LS_LOCAL, null); }

  /**
   * Apply a change. `mutate(data)` runs against the freshest copy, so when
   * syncing it is re-applied on top of anything saved from another device in
   * the meantime. `change` (optional) is recorded in the change log.
   */
  update(mutate, message, change) {
    const who = getName() || 'Someone';
    const entry = change ? {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      by: who,
      ...change,
    } : null;
    const apply = (d) => {
      mutate(d);
      if (entry) d.changes = [entry, ...(d.changes || []).filter((c) => c.id !== entry.id)].slice(0, MAX_CHANGES);
    };
    apply(this.data);
    this.emit();
    const msg = `${message || 'Update trips'}${getName() ? ` (by ${getName()})` : ''}`;
    this.saving = this.saving.then(() => this.persist(apply, msg)).catch(async (e) => {
      console.warn(e);
      this.onError && this.onError(e);
      // The change didn't save: show what is actually stored again.
      if (backendKind()) { try { await this.load(); this.emit(); } catch { /* keep local view */ } }
    });
    return this.saving;
  }

  async persist(apply, message) {
    const b = backend();
    if (!b) {
      writeJSON(LS_LOCAL, this.data);
      this.mode = 'local';
      this.onSaved && this.onSaved('local');
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await b.get();
      apply(data);
      try {
        this.sha = await b.put(data, sha, message);
        this.data = data;
        this.mode = backendKind();
        writeJSON(LS_LOCAL, null);
        this.emit();
        this.onSaved && this.onSaved(this.mode);
        return;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
      }
    }
    throw new Error('Could not save: the trip kept changing. Reload and try again.');
  }

  /** Push this browser's local-only copy, replacing the shared file. */
  async pushLocal() {
    const b = backend();
    const local = readJSON(LS_LOCAL, null) || this.data;
    const { sha } = await b.get();
    this.sha = await b.put(local, sha, `Upload trips saved in a browser${getName() ? ` (by ${getName()})` : ''}`);
    this.data = local; this.mode = backendKind();
    writeJSON(LS_LOCAL, null);
    this.emit();
  }

  replaceAll(data, message, change) {
    const copy = JSON.parse(JSON.stringify(data));
    return this.update((d) => {
      const keepLog = d.changes || [];
      Object.keys(d).forEach((k) => delete d[k]);
      Object.assign(d, JSON.parse(JSON.stringify(copy)));
      d.changes = [...(d.changes || []), ...keepLog.filter((c) => !(d.changes || []).some((x) => x.id === c.id))]
        .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_CHANGES);
    }, message, change);
  }

  /** Upload an image into the repo's images/ folder; returns its path. */
  async uploadImage(blob, name) {
    const b64 = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
    return backend().image(name, b64);
  }
}

export const store = new Store();

export function rawUrl(path) {
  const s = getSettings();
  if (!s.owner || !s.repo) return '';
  return `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.branch}/${path}`;
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

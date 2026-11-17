// Data store: loads trips.json, applies edits, and saves them either to the
// GitHub repo (via the Contents API, when a token is configured) or to this
// browser only.

const DATA_PATH = 'data/trips.json';
const LS_SETTINGS = 'tt.github';
const LS_LOCAL = 'tt.localData';

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

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

/** Guess owner/repo from a GitHub Pages URL like owner.github.io/repo/. */
function guessRepo() {
  const host = location.hostname;
  const m = host.match(/^([^.]+)\.github\.io$/i);
  if (!m) return { owner: '', repo: '' };
  const first = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: first || `${m[1]}.github.io` };
}

export function getSettings() {
  const g = guessRepo();
  const s = readJSON(LS_SETTINGS, {});
  return {
    owner: s.owner || g.owner,
    repo: s.repo || g.repo,
    branch: s.branch || 'main',
    token: s.token || '',
  };
}
export function saveSettings(s) { writeJSON(LS_SETTINGS, s); }
export function isConnected() { const s = getSettings(); return !!(s.token && s.owner && s.repo); }

// ---- base64 helpers that survive UTF-8 (¥, €, ō …) ----
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function gh(path, opts = {}) {
  const s = getSettings();
  const res = await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}/${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${s.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); if (j.message) msg += ` · ${j.message}`; } catch { /* ignore */ }
    const err = new Error(`GitHub: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function fetchRemote() {
  const s = getSettings();
  const j = await gh(`contents/${DATA_PATH}?ref=${encodeURIComponent(s.branch)}&t=${Date.now()}`);
  return { data: JSON.parse(fromBase64(j.content)), sha: j.sha };
}

/** Check that the token can read and write the repo. */
export async function testConnection() {
  const s = getSettings();
  const repo = await gh('');
  if (!repo.permissions || !repo.permissions.push) throw new Error('Token can read the repo but not write to it.');
  await gh(`branches/${encodeURIComponent(s.branch)}`);
  return repo.full_name;
}

class Store {
  constructor() {
    this.data = null;
    this.sha = null;
    this.mode = 'static'; // 'github' | 'local' | 'static'
    this.listeners = new Set();
    this.saving = Promise.resolve();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  async load() {
    if (isConnected()) {
      try {
        const { data, sha } = await fetchRemote();
        this.data = data; this.sha = sha; this.mode = 'github';
        return;
      } catch (e) {
        console.warn('GitHub load failed, falling back', e);
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
   * Apply a change. `mutate(data)` is run against the freshest copy, so when
   * saving to GitHub the change is re-applied on top of anything committed
   * from another device in the meantime.
   */
  update(mutate, message) {
    mutate(this.data);
    this.emit();
    this.saving = this.saving.then(() => this.persist(mutate, message)).catch((e) => {
      console.error(e);
      this.onError && this.onError(e);
    });
    return this.saving;
  }

  async persist(mutate, message) {
    if (!isConnected()) {
      writeJSON(LS_LOCAL, this.data);
      this.mode = 'local';
      this.onSaved && this.onSaved('local');
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await fetchRemote();
      mutate(data);
      try {
        const res = await gh(`contents/${DATA_PATH}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: message || 'Update trips',
            content: toBase64(JSON.stringify(data, null, 2) + '\n'),
            sha,
            branch: getSettings().branch,
          }),
        });
        this.sha = res.content.sha;
        this.data = data;
        this.mode = 'github';
        writeJSON(LS_LOCAL, null);
        this.emit();
        this.onSaved && this.onSaved('github');
        return;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
      }
    }
    throw new Error('Could not save: the file kept changing. Reload and try again.');
  }

  /** Push this browser's local-only copy to GitHub, replacing the repo file. */
  async pushLocal() {
    const local = readJSON(LS_LOCAL, null) || this.data;
    const { sha } = await fetchRemote();
    const res = await gh(`contents/${DATA_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Upload trips saved in browser',
        content: toBase64(JSON.stringify(local, null, 2) + '\n'),
        sha,
        branch: getSettings().branch,
      }),
    });
    this.sha = res.content.sha; this.data = local; this.mode = 'github';
    writeJSON(LS_LOCAL, null);
    this.emit();
  }

  discardLocal() { writeJSON(LS_LOCAL, null); }

  replaceAll(data, message) {
    return this.update((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, JSON.parse(JSON.stringify(data))); }, message);
  }

  /** Upload an image file into the repo's images/ folder; returns its path. */
  async uploadImage(blob, name) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const path = `images/${name}`;
    await gh(`contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Add photo ${name}`, content: btoa(bin), branch: getSettings().branch }),
    });
    return path;
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

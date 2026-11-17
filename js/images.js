// Resolves a photo for a dish: an explicit image URL/path if set, otherwise
// the lead image of a Wikipedia article (looked up in the browser and cached).

import { rawUrl } from './store.js';

const LS_CACHE = 'tt.wikiImages.v1';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(LS_CACHE) || '{}'); } catch { cache = {}; }
const pending = new Map();

function saveCache() {
  try { localStorage.setItem(LS_CACHE, JSON.stringify(cache)); } catch { /* ignore */ }
}

async function lookupTitles(titles) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1'
    + '&prop=pageimages&piprop=thumbnail&pithumbsize=1200&titles=' + encodeURIComponent(titles.join('|'));
  const res = await fetch(url);
  const j = await res.json();
  const q = j.query || {};
  // Map requested titles -> final titles through normalization and redirects.
  const map = {};
  titles.forEach((t) => { map[t] = t; });
  (q.normalized || []).forEach((n) => { for (const k in map) if (map[k] === n.from) map[k] = n.to; });
  (q.redirects || []).forEach((r) => { for (const k in map) if (map[k] === r.from) map[k] = r.to; });
  const byTitle = {};
  Object.values(q.pages || {}).forEach((p) => { if (p.thumbnail) byTitle[p.title] = p.thumbnail.source; });
  const out = {};
  titles.forEach((t) => { out[t] = byTitle[map[t]] || ''; });
  return out;
}

/** Returns a Promise of an image URL ('' if none) for a list of candidate article titles. */
export function wikiImage(candidates) {
  const list = (candidates || []).filter(Boolean);
  if (!list.length) return Promise.resolve('');
  const key = list.join('|');
  if (key in cache) return Promise.resolve(cache[key]);
  if (pending.has(key)) return pending.get(key);
  const p = lookupTitles(list).then((found) => {
    const url = list.map((t) => found[t]).find(Boolean) || '';
    cache[key] = url; saveCache();
    return url;
  }).catch(() => '').finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** Fill an <img> (or a container with a placeholder) for a food/trip item. */
export function hydrateImage(img, item) {
  const fallbackWrap = img.closest('.photo');
  const show = (src, fallback) => {
    if (!src) { fallbackWrap && fallbackWrap.classList.add('is-empty'); return; }
    img.onload = () => fallbackWrap && fallbackWrap.classList.add('is-loaded');
    img.onerror = () => {
      if (fallback) { const f = fallback; fallback = null; img.src = f; return; }
      fallbackWrap && fallbackWrap.classList.add('is-empty');
    };
    img.src = src;
  };
  const explicit = item.image || item.cover;
  if (explicit) {
    const isRelative = !/^(https?:|data:|blob:)/.test(explicit);
    show(explicit, isRelative ? rawUrl(explicit) : null);
    return;
  }
  wikiImage(item.wiki || item.coverWiki).then((src) => show(src));
}

/** Downscale a picked photo to a JPEG blob (max 1600px). */
export async function resizeImage(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

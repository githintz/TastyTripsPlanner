// Destinations: places & events, day plans (timeline with drag / stretch),
// approximate travel times, weather (Open-Meteo), maps (Leaflet + OpenStreetMap).

let C; // helpers handed over by app.js
export function setup(ctx) { C = ctx; }

// ---------------------------------------------------------------- small helpers

const PXH = 64;                 // pixels per hour on the timeline
const PX = PXH / 60;
const SNAP = 5;                 // minutes
const MIN_DUR = 15;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
export const fmtT = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
const parseT = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const fmtDur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`);
const snap = (m) => Math.round(m / SNAP) * SNAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function addDays(iso, n) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

const svg = (paths, size = 16, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;
const ICON = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>', 18),
  cloud: svg('<path d="M7 17h10a4 4 0 00.6-7.95A6 6 0 006.4 8.2 4.5 4.5 0 007 17z"/>', 18),
  rain: svg('<path d="M7 15h10a4 4 0 00.6-7.95A6 6 0 006.4 6.2 4.5 4.5 0 007 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>', 18),
  snow: svg('<path d="M7 15h10a4 4 0 00.6-7.95A6 6 0 006.4 6.2 4.5 4.5 0 007 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01"/>', 18),
  warn: svg('<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5h.01"/>', 16, 'stroke-width="2"'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 16, 'stroke-width="2"'),
  map: svg('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>', 16),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', 16, 'stroke-width="2"'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 16),
  go: svg('<path d="M3 11l18-8-8 18-2-8-8-2z"/>', 16, 'stroke-width="2"'),
  walk: svg('<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 12l2-4 4 1 2 3"/>', 13),
  train: svg('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01"/>', 13),
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 16),
  heart: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.2C1.7 7.4 3.9 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.1 0 5.3 2.9 4 6.3C19 15.6 12 20 12 20z"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 'stroke-width="2"'),
  dots: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 20),
  back: svg('<path d="M15 18l-6-6 6-6"/>', 20),
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', 18),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  place: svg('<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>', 26, 'stroke-width="1.4"'),
  event: svg('<circle cx="12" cy="12" r="2.5"/><path d="M12 4.5a3 3 0 010 5M12 14.5a3 3 0 010 5M4.5 12a3 3 0 015 0M14.5 12a3 3 0 015 0"/>', 26, 'stroke-width="1.4"'),
  locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>', 16),
};

const SETTING = { indoor: 'Indoor', outdoor: 'Outdoor', both: 'Indoor & outdoor' };
const THEME = {
  indoor: { bg: '#E3EAF2', bar: '#6F8FAE', ink: '#1F3449', sub: '#2F4E6B' },
  outdoor: { bg: '#E1ECE4', bar: '#6E9C7D', ink: '#1F3D2A', sub: '#2B5A3E' },
  both: { bg: '#E9E0EE', bar: '#9A7FB0', ink: '#3B2A49', sub: '#58406A' },
  event: { bg: '#FBEDEA', bar: '#B8432F', ink: '#5A2A20', sub: '#9A3826' },
  food: { bg: '#F3E3C6', bar: '#C9A25E', ink: '#4A3412', sub: '#6E4A14' },
};

// ---------------------------------------------------------------- data helpers

const placesOf = (trip) => trip.places || [];
const daysOf = (trip) => trip.days || [];
const locName = (trip, id) => (trip.locations.find((l) => l.id === id) || {}).name || '';
export function dayDate(trip, day) {
  const i = daysOf(trip).findIndex((d) => d.id === day.id);
  return trip.startDate && i >= 0 ? addDays(trip.startDate, i) : null;
}
const dayNumber = (trip, day) => daysOf(trip).findIndex((d) => d.id === day.id) + 1;
function isToday(trip, day) {
  const iso = dayDate(trip, day);
  if (iso === todayISO()) return true;
  return lsGet(`tt.today.${trip.id}`, '') === `${day.id}|${todayISO()}`;
}
const effectiveDate = (trip, day) => (isToday(trip, day) ? todayISO() : dayDate(trip, day));

function stopInfo(trip, stop) {
  if (stop.type === 'food') {
    const f = trip.foods.find((x) => x.id === stop.refId);
    return {
      name: f ? `${f.name}${stop.spot ? ` · ${stop.spot}` : ''}` : 'Food stop', short: f ? f.name : 'Food',
      setting: 'indoor', theme: THEME.food, kind: 'food', lat: stop.lat, lng: stop.lng, href: f ? `#/trip/${trip.id}/food/${f.id}` : null, ref: f,
    };
  }
  const p = placesOf(trip).find((x) => x.id === stop.refId);
  if (!p) return { name: 'Removed place', short: 'Removed', setting: 'indoor', theme: THEME.indoor, kind: 'place', ref: null };
  return {
    name: p.name, short: p.name, setting: p.setting || 'indoor', theme: p.kind === 'event' ? THEME.event : THEME[p.setting || 'indoor'],
    kind: p.kind, lat: p.lat, lng: p.lng, href: `#/trip/${trip.id}/place/${p.id}`, ref: p,
  };
}
const sorted = (stops) => [...stops].sort((a, b) => a.start - b.start);

// ---------------------------------------------------------------- travel estimate

function km(a, b) {
  const R = 6371; const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat); const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Rough door-to-door estimate from straight-line distance. */
export function travel(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const d = km(a, b) * 1.3; // streets are longer than the crow flies
  if (d < 1.3) return { mode: 'walk', min: Math.max(5, Math.ceil((d / 4.8) * 60 / 5) * 5) };
  return { mode: 'transit', min: Math.ceil((10 + (d / 22) * 60) / 5) * 5 };
}

// ---------------------------------------------------------------- weather (Open-Meteo)

const wxMem = new Map();
function wxKind(code) {
  if (code == null) return 'cloud';
  if (code <= 1) return 'sun';
  if (code <= 48) return 'cloud';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain';
}
const rainy = (h) => h && (h.pop >= 50 || h.mm >= 0.5);

async function weatherFor(lat, lng, iso) {
  if (lat == null || !iso) return null;
  const diff = daysBetween(todayISO(), iso);
  if (diff < 0 || diff > 15) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${iso}`;
  const hit = wxMem.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.p;
  const p = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timezone=auto&start_date=${iso}&end_date=${iso}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !j.hourly) return null;
      const H = j.hourly;
      return H.time.map((t, i) => ({
        h: +t.slice(11, 13), temp: Math.round(H.temperature_2m[i]), pop: H.precipitation_probability[i] ?? 0,
        mm: H.precipitation[i] || 0, kind: wxKind(H.weather_code[i]),
      }));
    }).catch(() => null);
  wxMem.set(key, { at: Date.now(), p });
  return p;
}

// ---------------------------------------------------------------- geocoding (Nominatim)

const geoMem = {};
export async function geocode(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Location search is busy, try again in a moment');
  return (await res.json()).map((r) => ({ name: r.display_name, lat: +r.lat, lng: +r.lon }));
}
async function cityCenter(name) {
  if (!name) return null;
  if (geoMem[name]) return geoMem[name];
  const cached = lsGet(`tt.geo.${name}`, '');
  if (cached) { try { return (geoMem[name] = JSON.parse(cached)); } catch { /* ignore */ } }
  try {
    const [r] = await geocode(name);
    if (r) { geoMem[name] = { lat: r.lat, lng: r.lng }; lsSet(`tt.geo.${name}`, JSON.stringify(geoMem[name])); return geoMem[name]; }
  } catch { /* ignore */ }
  return null;
}
function linkCoords(s) {
  const m = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(s) || /[?&](?:q|query|ll|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(s)
    || /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(s);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}

// ---------------------------------------------------------------- maps (Leaflet, loaded on demand)

let leafletP;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => resolve(window.L); s.onerror = () => { leafletP = null; reject(new Error("Map couldn't load")); };
    document.head.appendChild(s);
  });
  return leafletP;
}
async function makeMap(el, opts = {}) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: false, attributionControl: true, ...opts });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  if (opts.zoomControl !== false) L.control.zoom({ position: 'bottomright' }).addTo(map);
  return { L, map };
}
const pinIcon = (L, label, cls = '') => L.divIcon({ className: '', html: `<span class="map-pin ${cls}">${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

// ---------------------------------------------------------------- shared UI bits

const badge = (text, cls) => `<span class="dbadge ${cls}">${C.esc(text)}</span>`;
function placeMeta(p) {
  if (p.kind === 'event') {
    const d = p.dateFrom ? `${fmtDate(p.dateFrom, { day: 'numeric', month: 'short' })}${p.dateTo && p.dateTo !== p.dateFrom ? ` – ${fmtDate(p.dateTo, { day: 'numeric', month: 'short' })}` : ''}` : '';
    const t = p.open && p.close ? `${p.open}–${p.close}` : '';
    return [d, t].filter(Boolean).join(' · ') || 'Dates not set';
  }
  const h = p.open && p.close ? `Open ${p.open}–${p.close}` : '';
  const closed = (p.closedDays || []).length ? `closed ${p.closedDays.map((d) => WEEKDAYS[d]).join(', ')}` : '';
  return [h, closed].filter(Boolean).join(' · ') || 'Hours not set';
}
function scheduledIn(trip, placeId) {
  return daysOf(trip).map((d, i) => ({ d, n: i + 1, s: (d.stops || []).find((s) => s.type === 'place' && s.refId === placeId) })).filter((x) => x.s);
}
function heartBtn(p, kind, wide = false) {
  const likes = p.likes || [];
  const mine = !!C.getName() && likes.includes(C.getName());
  return `<button class="like-btn${wide ? ' wide' : ''}${lastLiked === p.id ? ' pop' : ''}" data-action="like-place" data-place="${C.esc(p.id)}" aria-pressed="${mine}" aria-label="${C.esc(`${mine ? 'Remove your interest in' : "I'm interested in"} ${p.name}. ${likes.length} interested`)}" title="${C.esc(likes.join(', ') || 'No one yet')}">
    ${ICON.heart}${wide ? `<span>${mine ? 'Interested' : "I'm interested"}</span>` : ''}<span class="n">${likes.length || ''}</span></button>`;
}
let lastLiked = null;

// ---------------------------------------------------------------- destinations tab (in the trip page)

export const dui = { sub: lsGet('tt.dsub', 'places') === 'days' ? 'days' : 'places', filter: 'all', view: 'list' };

export function destinationsTab(trip, quiet) {
  return `
    <div class="subtabs" role="tablist">
      <button role="tab" data-action="dsub" data-value="places" aria-selected="${dui.sub === 'places'}">Places &amp; events</button>
      <button role="tab" data-action="dsub" data-value="days" aria-selected="${dui.sub === 'days'}">Day plans</button>
    </div>
    <div id="dest-body">${dui.sub === 'places' ? placesBody(trip, quiet) : daysBody(trip, quiet)}</div>
    <div class="fade-bottom"></div>
    <button class="fab" data-action="${dui.sub === 'places' ? 'add-place' : 'add-day'}"${quiet ? ' style="animation:none"' : ''}>${ICON.plus}${dui.sub === 'places' ? 'Add place' : 'Add day'}</button>`;
}

function placesBody(trip, quiet) {
  const loc = C.activeLoc(trip);
  const all = placesOf(trip).filter((p) => !loc || !p.locationId || p.locationId === loc.id);
  const f = dui.filter;
  const pass = (p) => f === 'all' || (f === 'place' && p.kind !== 'event') || (f === 'event' && p.kind === 'event')
    || (f === 'indoor' && p.setting !== 'outdoor') || (f === 'outdoor' && p.setting !== 'indoor');
  const list = all.filter(pass).sort((a, b) => (b.likes || []).length - (a.likes || []).length || a.name.localeCompare(b.name));
  const count = (fn) => all.filter(fn).length;
  const pill = (id, label, n) => `<button class="pill" data-action="dfilter" data-value="${id}" aria-pressed="${f === id}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
  return `
    <div class="pills" role="group" aria-label="Filter">
      ${pill('all', 'All', all.length)}${pill('place', 'Places', count((p) => p.kind !== 'event'))}${pill('event', 'Events', count((p) => p.kind === 'event'))}
      ${pill('indoor', 'Indoor')}${pill('outdoor', 'Outdoor')}
    </div>
    <div class="dest-bar">
      <span class="hint">${list.length ? 'Sorted by interest' : ''}</span>
      <div class="segmented sm" role="group" aria-label="View">
        <span class="thumb"></span>
        <button data-action="dview" data-value="list" aria-pressed="${dui.view === 'list'}" aria-label="List view">${ICON.list}</button>
        <button data-action="dview" data-value="map" aria-pressed="${dui.view === 'map'}" aria-label="Map view">${ICON.map}</button>
      </div>
    </div>
    ${dui.view === 'map' ? '<div class="places-map" id="places-map"></div>' : ''}
    ${!list.length ? `<div class="empty"><h2>${all.length ? 'Nothing here' : 'No places yet'}</h2><p>${all.length ? 'No places match this filter.' : `Add sights, museums, parks or events you might want to visit${loc ? ` in ${C.esc(loc.name)}` : ''}.`}</p></div>`
    : dui.view === 'list' ? `<div class="food-grid" style="margin-top:12px">${list.map((p, i) => placeCard(trip, p, quiet ? 0 : Math.min(i, 12), quiet)).join('')}</div>` : ''}`;
}

function placeCard(trip, p, i, quiet) {
  const days = scheduledIn(trip, p.id);
  return `<div class="food-card place-card" style="--i:${i}${quiet ? ';animation:none' : ''}">
    <a class="card-link" href="#/trip/${encodeURIComponent(trip.id)}/place/${encodeURIComponent(p.id)}" aria-label="${C.esc(p.name)}"></a>
    <div class="photo" style="--tint:${(p.kind === 'event' ? THEME.event : THEME[p.setting || 'indoor']).bg};--tint-ink:${(p.kind === 'event' ? THEME.event : THEME[p.setting || 'indoor']).sub}"><img alt="" data-img="place:${C.esc(p.id)}"><span class="ph">${p.kind === 'event' ? ICON.event : ICON.place}</span></div>
    <div class="body">
      <span class="name">${C.esc(p.name)}</span>
      <div class="badges">
        ${p.kind === 'event' ? badge('Event', 'ev') : ''}${badge(SETTING[p.setting || 'indoor'], p.setting || 'indoor')}${badge(`~${fmtDur(p.duration || 60)}`, 'dur')}
        ${days.map((x) => badge(`Day ${x.n}`, 'day')).join('')}
      </div>
      <span class="top">${C.esc(placeMeta(p))}</span>
    </div>
    ${heartBtn(p)}
  </div>`;
}

function dayBar(trip, day) {
  const stops = sorted(day.stops || []);
  const W = 320; const x = (m) => ((m - 360) / (24 * 60 - 360)) * W; // 06:00–24:00
  return `<svg width="100%" height="16" viewBox="0 0 ${W} 16" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="5" width="${W}" height="6" rx="3" fill="#F1ECE6"></rect>
    ${stops.map((s) => { const t = stopInfo(trip, s).theme; return `<rect x="${x(s.start).toFixed(1)}" y="2" width="${Math.max(3, x(s.start + s.duration) - x(s.start)).toFixed(1)}" height="12" rx="4" fill="${t.bar}"></rect>`; }).join('')}
  </svg>`;
}

function daysBody(trip) {
  const days = daysOf(trip);
  const range = trip.startDate ? `${fmtDate(trip.startDate)}${trip.endDate ? ` – ${fmtDate(trip.endDate)}` : ''}` : '';
  const head = `<div class="dest-bar" style="margin-top:16px">
      <span class="hint">${range ? `${C.esc(range)} · ` : ''}${days.length} day${days.length === 1 ? '' : 's'} · ${days.filter((d) => (d.stops || []).length).length} planned</span>
      ${trip.startDate ? '' : '<button class="link-btn" data-action="edit-trip">Add travel dates</button>'}
    </div>`;
  if (!days.length) {
    return `${head}<div class="empty"><h2>No days yet</h2><p>${trip.startDate ? 'Add a day to start planning.' : 'Add days to plan them. Set travel dates on the trip to match each day to a date and get the weather.'}</p></div>`;
  }
  return `${head}<div class="day-list">${days.map((d, i) => {
    const iso = dayDate(trip, d);
    const stops = sorted(d.stops || []);
    const today = isToday(trip, d);
    const span = stops.length ? `${fmtT(stops[0].start)} – ${fmtT(Math.max(...stops.map((s) => s.start + s.duration)))}` : '';
    return `<a class="day-card${today ? ' today' : ''}${stops.length ? '' : ' empty-day'}" href="#/trip/${encodeURIComponent(trip.id)}/day/${encodeURIComponent(d.id)}" style="--i:${Math.min(i, 10)}">
      <div class="dc-head"><span class="dc-title">Day ${i + 1}</span><span class="hint">${[iso ? fmtDate(iso) : '', locName(trip, d.locationId)].filter(Boolean).map(C.esc).join(' · ')}</span>
        ${today ? '<span class="dbadge today">Today</span>' : ''}</div>
      ${stops.length ? dayBar(trip, d) : ''}
      <div class="dc-foot"><span>${stops.length ? `${stops.length} stop${stops.length === 1 ? '' : 's'} · ${span}` : 'Not planned yet'}</span>
        <span class="dc-wx" data-daywx="${C.esc(d.id)}"></span></div>
    </a>`;
  }).join('')}</div>`;
}

/** Called after the trip page renders. */
export function afterRender(root, trip) {
  if (C.ui().tab !== 'destinations') return;
  C.syncSegmented(root, false);
  C.hydrate(root, Object.fromEntries(placesOf(trip).map((p) => [`place:${p.id}`, { ...p, wiki: p.wiki || [p.name] }])));
  if (dui.sub === 'places' && dui.view === 'map') renderPlacesMap(trip);
  if (dui.sub === 'days') {
    $$q('[data-daywx]', root).forEach(async (el) => {
      const day = daysOf(trip).find((d) => d.id === el.dataset.daywx);
      const s = await daySummary(trip, day);
      if (s) el.innerHTML = s;
    });
  }
}
const $$q = (sel, root) => Array.from(root.querySelectorAll(sel));

async function dayCenter(trip, day) {
  const withPos = (day.stops || []).map((s) => stopInfo(trip, s)).filter((x) => x.lat != null);
  if (withPos.length) return { lat: withPos.reduce((a, x) => a + x.lat, 0) / withPos.length, lng: withPos.reduce((a, x) => a + x.lng, 0) / withPos.length };
  return cityCenter(locName(trip, day.locationId));
}
async function dayWeather(trip, day) {
  const iso = effectiveDate(trip, day);
  if (!iso) return null;
  const c = await dayCenter(trip, day);
  return c ? weatherFor(c.lat, c.lng, iso) : null;
}
async function daySummary(trip, day) {
  const wx = await dayWeather(trip, day);
  if (!wx) return '';
  const stops = sorted(day.stops || []);
  const from = stops.length ? Math.floor(stops[0].start / 60) : 9;
  const to = stops.length ? Math.ceil(Math.max(...stops.map((s) => s.start + s.duration)) / 60) : 20;
  const hours = wx.filter((h) => h.h >= from && h.h < to);
  const firstRain = hours.find(rainy);
  if (firstRain) return `<span class="wx rain">${ICON.rain}Rain from ${pad(firstRain.h)}:00</span>`;
  const max = Math.max(...hours.map((h) => h.temp));
  const sunny = hours.filter((h) => h.kind === 'sun').length >= hours.length / 2;
  return `<span class="wx">${sunny ? ICON.sun : ICON.cloud}${max}°</span>`;
}

async function renderPlacesMap(trip) {
  const el = document.getElementById('places-map');
  if (!el) return;
  const loc = C.activeLoc(trip);
  const list = placesOf(trip).filter((p) => p.lat != null && (!loc || !p.locationId || p.locationId === loc.id));
  try {
    const { L, map } = await makeMap(el);
    const pts = list.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(L, p.kind === 'event' ? '★' : '•', p.kind === 'event' ? 'ev' : p.setting) }).addTo(map);
      m.bindPopup(`<a href="#/trip/${encodeURIComponent(trip.id)}/place/${encodeURIComponent(p.id)}"><b>${C.esc(p.name)}</b></a><br>${C.esc(placeMeta(p))}`);
      return [p.lat, p.lng];
    });
    if (pts.length) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    else {
      const c = await cityCenter(loc && loc.name);
      map.setView(c ? [c.lat, c.lng] : [35.68, 139.76], 12);
    }
  } catch (e) { el.innerHTML = `<p class="hint" style="padding:16px">${C.esc(e.message)}</p>`; }
}

// ---------------------------------------------------------------- clicks inside the trip page

export function handleClick(action, b, trip) {
  switch (action) {
    case 'dsub': {
      if (dui.sub === b.dataset.value) return true;
      dui.sub = b.dataset.value; lsSet('tt.dsub', dui.sub);
      rerenderTab(trip);
      return true;
    }
    case 'dfilter': dui.filter = b.dataset.value; rerenderTab(trip); return true;
    case 'dview': {
      if (dui.view === b.dataset.value) return true;
      dui.view = b.dataset.value; C.pressOnly(b.parentElement, b);
      setTimeout(() => rerenderTab(trip), 180);
      return true;
    }
    case 'add-place': placeForm(trip, null); return true;
    case 'add-day': addDay(trip); return true;
    case 'like-place': togglePlaceLike(trip, b.dataset.place); return true;
    default: return false;
  }
}
function rerenderTab(trip) {
  const box = document.getElementById('tab-content');
  if (!box) return;
  box.innerHTML = destinationsTab(trip);
  afterRender(box, trip);
}

async function togglePlaceLike(trip, placeId) {
  const name = await C.ensureName();
  if (!name) return;
  const p = placesOf(trip).find((x) => x.id === placeId);
  if (!p) return;
  const want = !(p.likes || []).includes(name);
  lastLiked = want ? placeId : null;
  setTimeout(() => { if (lastLiked === placeId) lastLiked = null; }, 700);
  const tid = trip.id;
  C.store.update((d) => {
    const x = d.trips.find((t) => t.id === tid);
    const pl = x && (x.places || []).find((q) => q.id === placeId);
    if (!pl) return;
    const set = new Set(pl.likes || []); if (want) set.add(name); else set.delete(name);
    pl.likes = [...set];
  }, `${want ? 'Interested in' : 'Not interested in'} ${p.name}`, null, { quiet: true });
}

async function addDay(trip) {
  if (!(await C.ensureName())) return;
  const loc = C.activeLoc(trip);
  const id = uid('d');
  const n = daysOf(trip).length + 1;
  const tid = trip.id;
  C.store.update((d) => {
    const t = d.trips.find((x) => x.id === tid); if (!t) return;
    t.days = t.days || [];
    if (!t.days.some((x) => x.id === id)) t.days.push({ id, locationId: loc ? loc.id : (t.locations[0] || {}).id || '', stops: [] });
  }, `Add Day ${n}`, { kind: 'day', action: 'added', tripId: tid, tripName: trip.name, dayId: id, target: `Day ${n}`, details: [] });
  location.hash = `#/trip/${encodeURIComponent(tid)}/day/${encodeURIComponent(id)}`;
}

/** Make sure there's one day per travel date (never removes days). */
export function fillDaysForDates(t) {
  if (!t.startDate || !t.endDate) return;
  const n = daysBetween(t.startDate, t.endDate) + 1;
  t.days = t.days || [];
  for (let i = t.days.length; i < Math.min(n, 60); i++) {
    t.days.push({ id: uid('d'), locationId: (t.days[i - 1] || {}).locationId || (t.locations[0] || {}).id || '', stops: [] });
  }
}

// ---------------------------------------------------------------- overlays (place detail, day view)

let ov = null; // { el, scrim, kind, id, tripId, ... }
export let overlayOpenedInApp = false;
export function markInApp() { overlayOpenedInApp = true; }

function openOverlay(kind, id, tripId, cls) {
  if (ov && ov.kind === kind && ov.id === id) return ov;
  closeOverlay(true);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', () => leaveOverlay());
  const el = document.createElement('article');
  el.className = cls;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
  document.getElementById('sheet-root').append(scrim, el);
  document.body.classList.add('no-scroll');
  ov = { el, scrim, kind, id, tripId };
  el.addEventListener('click', onOverlayClick);
  return ov;
}
export function closeOverlay(instant = false) {
  if (!ov) return;
  const { el, scrim } = ov;
  if (ov.timer) clearInterval(ov.timer);
  if (ov.map) { try { ov.map.remove(); } catch { /* ignore */ } }
  if (ov.watch != null) navigator.geolocation.clearWatch(ov.watch);
  ov = null;
  if (!document.querySelector('.sheet:not(.out)') && !document.querySelector('.detail:not(.out)')) document.body.classList.remove('no-scroll');
  if (instant) { el.remove(); scrim.remove(); return; }
  el.classList.add('out'); scrim.classList.add('out');
  setTimeout(() => { el.remove(); scrim.remove(); }, 320);
}
export function leaveOverlay() {
  if (!ov) return;
  if (ov.kind === 'day' && ov.edit && ov.dirty && !ov.confirmLeave) {
    ov.confirmLeave = true; C.toast('Unsaved changes. Tap back again to discard them.'); return;
  }
  const tid = ov.tripId;
  if (overlayOpenedInApp) { overlayOpenedInApp = false; history.back(); } else location.hash = `#/trip/${encodeURIComponent(tid)}`;
}
export const hasOverlay = () => !!ov;

/** Route hook from app.js: open/close overlays from the hash. */
export function route(r, trip) {
  if (r.placeId) {
    const p = placesOf(trip).find((x) => x.id === r.placeId);
    if (p) { openPlace(trip, p); return true; }
  }
  if (r.dayId) {
    const d = daysOf(trip).find((x) => x.id === r.dayId);
    if (d) { openDay(trip, d); return true; }
  }
  overlayOpenedInApp = false;
  closeOverlay();
  return false;
}

/** Data changed (from this device or another): redraw what's open. */
export function refreshOverlay(trip) {
  if (!ov || !trip) return;
  if (ov.kind === 'place') {
    const p = placesOf(trip).find((x) => x.id === ov.id);
    if (p) fillPlace(trip, p); else leaveOverlay();
  } else if (ov.kind === 'day') {
    const d = daysOf(trip).find((x) => x.id === ov.id);
    if (!d) { leaveOverlay(); return; }
    if (!ov.edit && !ov.dragging) renderDay();
  }
}

// ---------------------------------------------------------------- place detail

function openPlace(trip, p) {
  const o = openOverlay('place', p.id, trip.id, 'detail');
  fillPlace(trip, p);
  o.el.focus({ preventScroll: true });
}

function fillPlace(trip, p) {
  const el = ov.el;
  if (ov.map) { try { ov.map.remove(); } catch { /* ignore */ } ov.map = null; }
  const days = scheduledIn(trip, p.id);
  const theme = p.kind === 'event' ? THEME.event : THEME[p.setting || 'indoor'];
  const when = p.kind === 'event' ? { k: 'When', v: placeMeta(p) } : { k: 'Open', v: p.open && p.close ? `${p.open} – ${p.close}` : 'Not set', s: (p.closedDays || []).length ? `Closed ${p.closedDays.map((d) => WEEKDAYS[d]).join(', ')}` : 'Every day' };
  el.setAttribute('aria-label', p.name);
  el.innerHTML = `
    <div class="hero-actions"><div>
      <button class="icon-btn float" data-oa="back" aria-label="Back">${ICON.back}</button>
      <button class="icon-btn float" data-oa="edit-place" aria-label="Edit">${ICON.edit}</button>
    </div></div>
    <div class="hero"><div class="photo" style="--tint:${theme.bg};--tint-ink:${theme.sub}"><img alt="Photo of ${C.esc(p.name)}" data-img="place">${`<span class="ph">${p.kind === 'event' ? ICON.event : ICON.place}</span>`}</div></div>
    <div class="panel">
      <div class="grabber"></div>
      <div>
        <span class="eyebrow">${p.kind === 'event' ? 'Event' : 'Place'}${locName(trip, p.locationId) ? ` · ${C.esc(locName(trip, p.locationId))}` : ''}</span>
        <h1>${C.esc(p.name)}</h1>
        ${p.description ? `<p class="desc">${C.esc(p.description)}</p>` : ''}
      </div>
      <div class="tiles">
        <div class="tile"><span class="k">Recommended time</span><span class="big">~${fmtDur(p.duration || 60)}</span></div>
        <div class="tile"><span class="k">Setting</span>${badge(SETTING[p.setting || 'indoor'], `${p.setting || 'indoor'} lg`)}</div>
        <div class="tile"><span class="k">${when.k}</span><span class="big" style="font-size:15px">${C.esc(when.v)}</span>${when.s ? `<span class="sub">${C.esc(when.s)}</span>` : ''}</div>
        <div class="tile"><span class="k">Price</span><span class="big" style="font-size:15px">${C.esc(p.price || '–')}</span>${p.link ? `<a class="sub" href="${C.esc(p.link)}" target="_blank" rel="noopener">Website / tickets</a>` : ''}</div>
      </div>
      ${p.lat != null ? `<div class="map-card"><div class="mini-map" id="place-map"></div>
        <div class="map-foot"><span class="addr">${C.esc(p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)}</span>
          <a class="secondary-btn" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">${ICON.pin}Open in Maps</a></div></div>`
    : '<p class="hint" style="margin:0">No map location yet. Edit the place to add one.</p>'}
      ${p.notes ? `<div class="tile"><span class="k">Notes</span><span style="white-space:pre-line">${C.esc(p.notes)}</span></div>` : ''}
      <section class="interest">
        <div class="where-head"><h2>Who's interested</h2>${heartBtn(p, 'place', true)}</div>
        ${(p.likes || []).length ? `<div class="people">${p.likes.map((n) => `<span class="person">${C.avatar(n)}${C.esc(n)}</span>`).join('')}</div>` : '<p class="hint" style="margin:0">Nobody yet.</p>'}
      </section>
      <section class="interest">
        <div class="where-head"><h2>In your plan</h2><button class="primary-btn" data-oa="add-to-day">${ICON.cal}&nbsp;Add to a day</button></div>
        ${days.length ? `<div class="people">${days.map((x) => `<a class="person day-chip" href="#/trip/${encodeURIComponent(trip.id)}/day/${encodeURIComponent(x.d.id)}">Day ${x.n} · ${fmtT(x.s.start)}</a>`).join('')}</div>` : '<p class="hint" style="margin:0">Not in any day yet.</p>'}
      </section>
    </div>`;
  C.hydrateImage(el.querySelector('img[data-img]'), { ...p, wiki: p.wiki || [p.name] });
  if (p.lat != null) {
    makeMap(el.querySelector('#place-map'), { dragging: false, scrollWheelZoom: false, zoomControl: false, doubleClickZoom: false, touchZoom: false, keyboard: false })
      .then(({ L, map }) => { map.setView([p.lat, p.lng], 15); L.marker([p.lat, p.lng], { icon: pinIcon(L, '', p.kind === 'event' ? 'ev' : p.setting) }).addTo(map); if (ov) ov.map = map; })
      .catch(() => {});
  }
}

function addToDaySheet(trip, p) {
  const days = daysOf(trip);
  if (!days.length) { C.toast('Add a day first in Day plans'); return; }
  C.openSheet({
    title: `Add ${p.name}`,
    body: `<p class="hint" style="margin:0">It goes in the first free slot of the day you pick. You can move it in the planner.</p>
      <div class="check-list">${days.map((d, i) => {
    const iso = dayDate(trip, d);
    const has = (d.stops || []).some((s) => s.type === 'place' && s.refId === p.id);
    return `<button class="check-row" data-day="${C.esc(d.id)}"${has ? ' disabled' : ''}><span class="grow"><b>Day ${i + 1}</b> <span class="hint">${[iso ? fmtDate(iso) : '', locName(trip, d.locationId)].filter(Boolean).map(C.esc).join(' · ')}</span></span><span class="hint">${has ? 'Already in' : `${(d.stops || []).length} stops`}</span></button>`;
  }).join('')}</div>`,
    onMount({ el, close }) {
      el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await C.ensureName())) return;
        const dayId = b.dataset.day;
        const day = days.find((d) => d.id === dayId);
        const stop = { id: uid('s'), type: 'place', refId: p.id, start: nextSlot(trip, day.stops || [], { lat: p.lat, lng: p.lng }), duration: p.duration || 60 };
        const n = dayNumber(trip, day);
        close();
        C.store.update((d) => {
          const t = d.trips.find((x) => x.id === trip.id);
          const dd = t && (t.days || []).find((x) => x.id === dayId);
          if (dd && !(dd.stops || []).some((s) => s.id === stop.id)) dd.stops = [...(dd.stops || []), stop];
        }, `Add ${p.name} to Day ${n}`, { kind: 'day', action: 'edited', tripId: trip.id, tripName: trip.name, dayId, target: `Day ${n}`, details: [`Added ${p.name} at ${fmtT(stop.start)}`] });
        C.toast(`Added to Day ${n} at ${fmtT(stop.start)}`);
      }));
    },
  });
}

/** First free time after the last stop (allowing for travel), or 09:00. */
function nextSlot(trip, stops, pos) {
  const s = sorted(stops);
  if (!s.length) return 9 * 60;
  const last = s[s.length - 1];
  const t = travel(stopInfo(trip, last), pos);
  return Math.min(23 * 60, Math.ceil((last.start + last.duration + (t ? t.min : 15)) / 15) * 15);
}

// ---------------------------------------------------------------- place form

function placeForm(trip, place) {
  const isNew = !place;
  const loc = C.activeLoc(trip);
  const p = place ? clone(place) : {
    id: '', kind: 'place', name: '', description: '', locationId: loc ? loc.id : '', address: '', lat: null, lng: null,
    setting: 'indoor', duration: 60, open: '', close: '', closedDays: [], dateFrom: '', dateTo: '', price: '', link: '', image: '', notes: '', likes: [],
  };
  const seg = (id, val, opts) => `<div class="segmented" role="group" id="${id}"><span class="thumb"></span>${opts.map(([v, l]) => `<button type="button" data-value="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div>`;
  const body = `
    ${seg('pf-kind', p.kind, [['place', 'Place'], ['event', 'Event']])}
    <div class="field"><label for="pf-name">Name</label>
      <input class="input" id="pf-name" value="${C.esc(p.name)}" placeholder="e.g. Tokyo Skytree" maxlength="80" autocomplete="off"></div>
    <div class="field"><label for="pf-desc">Description</label>
      <textarea class="input" id="pf-desc" rows="2" maxlength="200" placeholder="One sentence about it">${C.esc(p.description)}</textarea></div>
    <div class="field"><span class="label">Location</span>
      <div class="join-row" style="margin:0;max-width:none">
        <input class="input" id="pf-q" placeholder="Search a place or paste a Google Maps link" value="${C.esc(p.address)}" autocomplete="off">
        <button class="secondary-btn" type="button" id="pf-search">Search</button>
      </div>
      <div id="pf-results" class="check-list"></div>
      <div class="mini-map form-map" id="pf-map"${p.lat != null ? '' : ' hidden'}></div>
      <span class="hint" id="pf-loc-hint">${p.lat != null ? 'Drag the pin to fine-tune.' : 'Search, then pick a result to drop a pin.'}</span>
    </div>
    ${trip.locations.length > 1 ? `<div class="field"><span class="label">City</span>
      <div class="chips" style="margin:0" id="pf-city">${trip.locations.map((l) => `<button type="button" class="chip" data-value="${C.esc(l.id)}" aria-pressed="${p.locationId === l.id}">${C.esc(l.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span class="label">Setting</span>${seg('pf-setting', p.setting, [['indoor', 'Indoor'], ['outdoor', 'Outdoor'], ['both', 'Both']])}</div>
    <div class="field"><span class="label">Recommended time</span>
      <div class="stepper"><button type="button" class="icon-btn" id="pf-minus" aria-label="15 minutes less">−</button>
        <span id="pf-dur" class="stepper-val">${fmtDur(p.duration)}</span>
        <button type="button" class="icon-btn" id="pf-plus" aria-label="15 minutes more">+</button></div>
      <div class="btn-row">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [240, 'Half day']].map(([v, l]) => `<button type="button" class="pill" data-dur="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="field" id="pf-event-only"${p.kind === 'event' ? '' : ' hidden'}><span class="label">Dates</span>
      <div class="price-row"><input class="input" type="date" id="pf-from" value="${C.esc(p.dateFrom)}" aria-label="First day"><span style="color:var(--muted)">–</span><input class="input" type="date" id="pf-to" value="${C.esc(p.dateTo)}" aria-label="Last day"></div></div>
    <div class="field"><span class="label" id="pf-hours-label">${p.kind === 'event' ? 'Daily hours' : 'Opening hours'}</span>
      <div class="price-row"><input class="input" type="time" id="pf-open" value="${C.esc(p.open)}" aria-label="Opens"><span style="color:var(--muted)">–</span><input class="input" type="time" id="pf-close" value="${C.esc(p.close)}" aria-label="Closes"></div>
      <div class="chips" style="margin:0" id="pf-closed"${p.kind === 'event' ? ' hidden' : ''}>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip sm" data-value="${d}" aria-pressed="${(p.closedDays || []).includes(d)}">${WEEKDAYS[d]}</button>`).join('')}</div>
      <span class="hint" id="pf-closed-hint"${p.kind === 'event' ? ' hidden' : ''}>Tap the days it's closed.</span>
    </div>
    <div class="field"><label for="pf-price">Price (optional)</label><input class="input" id="pf-price" value="${C.esc(p.price)}" placeholder="e.g. ¥2,100" maxlength="40"></div>
    <div class="field"><label for="pf-link">Website or tickets (optional)</label><input class="input" id="pf-link" value="${C.esc(p.link)}" placeholder="https://…" autocomplete="off"></div>
    <div class="field"><label for="pf-img">Photo link (optional)</label><input class="input" id="pf-img" value="${C.esc(p.image)}" placeholder="Leave empty to use a Wikipedia photo" autocomplete="off"></div>
    <div class="field"><label for="pf-notes">Notes (optional)</label><textarea class="input" id="pf-notes" rows="2" maxlength="500">${C.esc(p.notes)}</textarea></div>
    <span class="hint err" id="pf-err" hidden></span>
    ${isNew ? '' : `<button class="danger-btn" type="button" id="pf-delete">${svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}<span>Delete</span></button>`}`;

  let fmap = null; let fmarker = null;
  C.openSheet({
    title: isNew ? 'Add place or event' : `Edit ${place.kind === 'event' ? 'event' : 'place'}`,
    body,
    onClose() { if (fmap) { try { fmap.remove(); } catch { /* ignore */ } } },
    onMount({ el, close }) {
      const $ = (s) => el.querySelector(s);
      const segClick = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; C.pressOnly($(id), b); fn(b.dataset.value); });
      segClick('#pf-kind', (v) => {
        p.kind = v;
        $('#pf-event-only').hidden = v !== 'event'; $('#pf-closed').hidden = v === 'event'; $('#pf-closed-hint').hidden = v === 'event';
        $('#pf-hours-label').textContent = v === 'event' ? 'Daily hours' : 'Opening hours';
      });
      segClick('#pf-setting', (v) => { p.setting = v; });
      const city = $('#pf-city');
      city && city.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; C.pressOnly(city, b); p.locationId = b.dataset.value; });
      const setDur = (v) => { p.duration = clamp(v, 15, 720); $('#pf-dur').textContent = fmtDur(p.duration); };
      $('#pf-minus').addEventListener('click', () => setDur(p.duration - 15));
      $('#pf-plus').addEventListener('click', () => setDur(p.duration + 15));
      el.querySelectorAll('[data-dur]').forEach((b) => b.addEventListener('click', () => setDur(+b.dataset.dur)));
      $('#pf-closed').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      });

      const showPin = async () => {
        const box = $('#pf-map'); box.hidden = false;
        $('#pf-loc-hint').textContent = 'Drag the pin to fine-tune.';
        try {
          if (!fmap) {
            const { L, map } = await makeMap(box, { zoomControl: false });
            fmap = map;
            fmarker = L.marker([p.lat, p.lng], { draggable: true, icon: pinIcon(L, '', 'drag') }).addTo(map);
            fmarker.on('dragend', () => { const ll = fmarker.getLatLng(); p.lat = +ll.lat.toFixed(6); p.lng = +ll.lng.toFixed(6); });
            map.on('click', (ev) => { fmarker.setLatLng(ev.latlng); p.lat = +ev.latlng.lat.toFixed(6); p.lng = +ev.latlng.lng.toFixed(6); });
          } else fmarker.setLatLng([p.lat, p.lng]);
          fmap.setView([p.lat, p.lng], 16);
          setTimeout(() => fmap.invalidateSize(), 60);
        } catch (er) { $('#pf-loc-hint').textContent = er.message; }
      };
      if (p.lat != null) setTimeout(showPin, 380);

      const doSearch = async () => {
        const q = $('#pf-q').value.trim();
        if (!q) return;
        const direct = linkCoords(q);
        const res = $('#pf-results');
        if (direct) { p.lat = direct.lat; p.lng = direct.lng; res.innerHTML = ''; showPin(); return; }
        res.innerHTML = '<p class="hint">Searching…</p>';
        try {
          const cityName = locName(trip, p.locationId);
          let list = await geocode(cityName && !q.toLowerCase().includes(cityName.toLowerCase()) ? `${q}, ${cityName}` : q);
          if (!list.length && cityName) list = await geocode(q);
          if (!list.length) { res.innerHTML = '<p class="hint">No results. Try another name, or paste a Google Maps link.</p>'; return; }
          res.innerHTML = list.map((r, i) => `<button type="button" class="check-row" data-i="${i}"><span class="grow">${C.esc(r.name)}</span></button>`).join('');
          res.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
            const r = list[+b.dataset.i];
            p.lat = r.lat; p.lng = r.lng; p.address = r.name.split(',').slice(0, 3).join(',');
            $('#pf-q').value = p.address;
            res.innerHTML = '';
            showPin();
          }));
        } catch (er) { res.innerHTML = `<p class="hint err">${C.esc(er.message)}</p>`; }
      };
      $('#pf-search').addEventListener('click', doSearch);
      $('#pf-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

      const del = $('#pf-delete');
      del && C.twoStepDelete(del, 'Delete', async () => {
        if (!(await C.ensureName())) return;
        close();
        if (ov && ov.kind === 'place') leaveOverlay();
        const tid = trip.id; const pid = place.id;
        C.store.update((d) => {
          const t = d.trips.find((x) => x.id === tid); if (!t) return;
          t.places = (t.places || []).filter((x) => x.id !== pid);
          (t.days || []).forEach((dd) => { dd.stops = (dd.stops || []).filter((s) => !(s.type === 'place' && s.refId === pid)); });
        }, `Delete ${place.name}`, { kind: 'place', action: 'deleted', tripId: tid, tripName: trip.name, target: place.name, details: [] });
      });
    },
    async onSave({ el }) {
      const $ = (s) => el.querySelector(s);
      const err = $('#pf-err');
      const name = $('#pf-name').value.trim();
      if (!name) { err.textContent = 'Give it a name.'; err.hidden = false; return false; }
      const open = $('#pf-open').value; const closeT = $('#pf-close').value;
      if ((open && !closeT) || (!open && closeT)) { err.textContent = 'Fill in both opening and closing time, or neither.'; err.hidden = false; return false; }
      if (p.kind === 'event' && $('#pf-from').value && $('#pf-to').value && $('#pf-to').value < $('#pf-from').value) { err.textContent = 'The last day is before the first day.'; err.hidden = false; return false; }
      if (!(await C.ensureName())) return false;
      const out = {
        ...p,
        id: place ? place.id : C.uniqueId(name, placesOf(trip).map((x) => x.id)),
        name, description: $('#pf-desc').value.trim().replace(/\s+/g, ' '),
        address: p.lat != null ? (p.address || $('#pf-q').value.trim()) : $('#pf-q').value.trim(),
        open, close: closeT,
        closedDays: p.kind === 'event' ? [] : [...el.querySelectorAll('#pf-closed [aria-pressed="true"]')].map((b) => +b.dataset.value),
        dateFrom: p.kind === 'event' ? $('#pf-from').value : '', dateTo: p.kind === 'event' ? ($('#pf-to').value || $('#pf-from').value) : '',
        price: $('#pf-price').value.trim(), link: $('#pf-link').value.trim(), image: $('#pf-img').value.trim(), notes: $('#pf-notes').value.trim(),
        wiki: place && place.name === name ? place.wiki : [name],
      };
      const tid = trip.id;
      C.store.update((d) => {
        const t = d.trips.find((x) => x.id === tid); if (!t) return;
        t.places = t.places || [];
        const i = t.places.findIndex((x) => x.id === out.id);
        if (i >= 0) t.places[i] = { ...clone(out), likes: t.places[i].likes || [] };
        else t.places.push({ ...clone(out), likes: [] });
      }, `${place ? 'Update' : 'Add'} ${name}`, {
        kind: 'place', action: place ? 'edited' : 'added', tripId: tid, tripName: trip.name, placeId: out.id, target: name,
        details: [[out.kind === 'event' ? 'Event' : 'Place', SETTING[out.setting], `~${fmtDur(out.duration)}`].join(' · ')],
      });
      return true;
    },
  });
}

// ---------------------------------------------------------------- day view & planner

function openDay(trip, day) {
  const o = openOverlay('day', day.id, trip.id, 'dayview');
  if (!o.view) { o.view = 'timeline'; o.edit = false; o.wx = undefined; }
  renderDay();
  o.el.focus({ preventScroll: true });
  loadDayWeather();
  if (!o.timer) o.timer = setInterval(() => { if (ov && ov.kind === 'day' && !ov.edit && !ov.dragging) renderDay(); }, 60000);
}

const curTrip = () => ov && C.getTrip(ov.tripId);
const curDay = () => { const t = curTrip(); return t && daysOf(t).find((d) => d.id === ov.id); };
const workDay = () => (ov.edit ? ov.work : curDay());

async function loadDayWeather() {
  const trip = curTrip(); const day = curDay();
  if (!trip || !day) return;
  const wx = await dayWeather(trip, workDay());
  if (!ov || ov.kind !== 'day') return;
  ov.wx = wx;
  if (!ov.dragging) renderDay({ keepScroll: true });
}

function stopWarnings(trip, iso, wx, stop, info, next) {
  const out = [];
  const end = stop.start + stop.duration;
  const p = info.kind !== 'food' ? info.ref : null;
  if (wx && (info.setting === 'outdoor' || info.setting === 'both')) {
    const hrs = wx.filter((h) => h.h * 60 < end && (h.h + 1) * 60 > stop.start && rainy(h));
    if (hrs.length) {
      const pop = Math.max(...hrs.map((h) => h.pop));
      const mm = hrs.reduce((a, h) => a + h.mm, 0);
      const from = Math.max(stop.start, hrs[0].h * 60); const to = Math.min(end, (hrs[hrs.length - 1].h + 1) * 60);
      out.push({
        level: info.setting === 'outdoor' ? 'warn' : 'info', title: info.setting === 'outdoor' ? 'Rain expected during this outdoor stop' : 'Rain expected',
        text: `${pop}% chance of rain between ${fmtT(from)} and ${fmtT(to)}${mm >= 0.2 ? `, about ${mm.toFixed(1)} mm` : ''}. ${info.setting === 'outdoor' ? 'Bring an umbrella, or swap it with an indoor stop.' : 'The indoor parts are a good fallback.'}`,
      });
    }
  }
  if (p) {
    const o = parseT(p.open); const c = parseT(p.close);
    if (o != null && c != null && (stop.start < o || end > (c <= o ? c + 1440 : c))) {
      out.push({ level: 'warn', title: p.kind === 'event' ? 'Outside the event hours' : 'Outside opening hours', text: `${p.kind === 'event' ? 'Runs' : 'Open'} ${p.open}–${p.close}, but this visit is ${fmtT(stop.start)}–${fmtT(end)}.` });
    }
    if (iso && p.kind !== 'event' && (p.closedDays || []).includes(weekday(iso))) {
      out.push({ level: 'warn', title: 'Closed that day', text: `${p.name} is closed on ${WEEKDAYS[weekday(iso)]}days.` });
    }
    if (iso && p.kind === 'event' && p.dateFrom && (iso < p.dateFrom || iso > (p.dateTo || p.dateFrom))) {
      out.push({ level: 'warn', title: 'Not on that day', text: `This event runs ${placeMeta(p).split(' · ')[0]}.` });
    }
  }
  if (next) {
    const t = travel(info, stopInfo(trip, next));
    if (next.start < end) out.push({ level: 'warn', title: 'Overlaps the next stop', text: `This ends at ${fmtT(end)}, but the next stop starts at ${fmtT(next.start)}.` });
    else if (t && next.start < end + t.min) out.push({ level: 'info', title: 'Tight connection', text: `Only ${next.start - end} min to get to the next stop, and the trip takes about ${t.min} min.` });
  }
  return out;
}

function timelineHTML(trip, day, iso, wx, editable, now) {
  const stops = sorted(day.stops || []);
  const minS = stops.length ? Math.min(...stops.map((s) => s.start)) : 9 * 60;
  const maxE = stops.length ? Math.max(...stops.map((s) => s.start + s.duration)) : 18 * 60;
  const h0 = clamp(Math.min(8, Math.floor(minS / 60) - (editable ? 1 : 0)), 0, 23);
  const h1 = clamp(Math.max(20, Math.ceil(maxE / 60) + (editable ? 1 : 0)), h0 + 4, 24);
  const y = (m) => (m - h0 * 60) * PX + 14;
  ov.grid = { h0, h1, y };
  const hasWx = !!wx;
  const rows = [];
  for (let h = h0; h <= h1; h++) {
    rows.push(`<div class="tl-hour" style="top:${y(h * 60) - 7}px">${pad(h % 24)}:00</div><div class="tl-line" style="top:${y(h * 60)}px"></div>`);
    const w = hasWx && h < h1 && wx.find((x) => x.h === h);
    if (w) {
      if (rainy(w)) rows.push(`<div class="tl-rain" style="top:${y(h * 60)}px;height:${PXH}px"></div>`);
      rows.push(`<div class="tl-wx k-${w.kind}${rainy(w) ? ' wet' : ''}" style="top:${y(h * 60) + 8}px" title="${w.temp}° · ${w.pop}% rain">${ICON[w.kind]}<span>${rainy(w) ? `${w.pop}%` : `${w.temp}°`}</span></div>`);
    }
  }
  const blocks = stops.map((s, i) => {
    const info = stopInfo(trip, s);
    const next = stops[i + 1];
    const warns = stopWarnings(trip, iso, wx, s, info, next);
    const lvl = warns.some((w) => w.level === 'warn') ? 'warn' : warns.length ? 'info' : '';
    const t = info.theme;
    const h = Math.max(s.duration * PX, 22);
    const isNow = now != null && now >= s.start && now < s.start + s.duration;
    return `<div class="tl-block${editable ? ' editable' : ''}${h < 44 ? ' short' : ''}${isNow ? ' now' : ''}${now != null && now >= s.start + s.duration ? ' past' : ''}" data-stop="${C.esc(s.id)}"
        style="top:${y(s.start)}px;height:${h}px;background:${t.bg};border-left-color:${t.bar};color:${t.ink};right:${hasWx ? 56 : 14}px"
        ${!editable && info.href ? `data-href="${C.esc(info.href)}"` : ''} tabindex="0" role="button" aria-label="${C.esc(`${info.name}, ${fmtT(s.start)} to ${fmtT(s.start + s.duration)}`)}">
      <span class="tb-name">${C.esc(info.name)}</span>
      <span class="tb-sub" style="color:${t.sub}">${fmtT(s.start)} – ${fmtT(s.start + s.duration)} · ${info.kind === 'food' ? 'Food' : `${info.kind === 'event' ? 'Event · ' : ''}${SETTING[info.setting]}`}</span>
      ${lvl ? `<button class="tb-warn ${lvl}" data-warn="${C.esc(s.id)}" aria-label="${C.esc(warns.map((w) => w.title).join(', '))}">${lvl === 'warn' ? ICON.warn : ICON.info}</button>` : ''}
      ${editable ? '<span class="tb-handle" aria-hidden="true"><span></span></span>' : ''}
    </div>`;
  }).join('');
  const links = stops.slice(0, -1).map((s, i) => {
    const n = stops[i + 1];
    const t = travel(stopInfo(trip, s), stopInfo(trip, n));
    const end = s.start + s.duration;
    if (!t) return '';
    const tight = n.start < end + t.min;
    const top = y(end) + 2;
    return `<div class="tl-link${tight ? ' tight' : ''}" style="top:${top}px">${t.mode === 'walk' ? ICON.walk : ICON.train}${t.mode === 'walk' ? 'Walk' : 'Transit'} ~${t.min} min</div>`;
  }).join('');
  const nowLine = now != null && now >= h0 * 60 && now <= h1 * 60 ? `<div class="tl-now" style="top:${y(now)}px"><span>${fmtT(now)}</span></div>` : '';
  return `<div class="tl" id="tl" style="height:${y(h1 * 60) + 20}px">${rows.join('')}${links}${blocks}${nowLine}<div class="tl-drop" id="tl-drop" hidden></div></div>`;
}

function nowNextHTML(trip, day) {
  const stops = sorted(day.stops || []);
  const now = nowMin();
  const cur = stops.find((s) => now >= s.start && now < s.start + s.duration);
  const next = stops.find((s) => s.start > now);
  let html = '';
  if (cur) {
    const info = stopInfo(trip, cur);
    const left = cur.start + cur.duration - now;
    html += `<div class="now-card"><div class="nc-top"><span class="nc-label"><span class="live-dot"></span>Now · ${fmtT(now)}</span><span>until ${fmtT(cur.start + cur.duration)}</span></div>
      <span class="nc-name">${C.esc(info.name)}</span>
      <div class="nc-bar"><div style="width:${Math.round(((now - cur.start) / cur.duration) * 100)}%"></div></div>
      <span class="nc-sub">${fmtDur(left)} left</span></div>`;
  } else if (!next && stops.length) {
    html += '<div class="now-card"><span class="nc-name">That\'s the plan done for today</span><span class="nc-sub">Enjoy your evening.</span></div>';
  }
  if (next) {
    const info = stopInfo(trip, next);
    const from = cur ? stopInfo(trip, cur) : null;
    const t = travel(from, info);
    const leave = t ? next.start - t.min : null;
    const dest = info.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${info.lat},${info.lng}&travelmode=transit` : null;
    html += `<div class="next-card"><div class="grow"><span class="nc-label dark">Next · ${fmtT(next.start)}</span>
      <span class="nx-name">${C.esc(info.name)}</span>
      <span class="hint">${t ? `${leave <= now ? 'Leave now' : `Leave by ${fmtT(leave)}`} · ${t.mode === 'walk' ? 'walk' : 'transit'} ~${t.min} min` : `Starts in ${fmtDur(next.start - now)}`}</span></div>
      ${dest ? `<a class="primary-btn go-btn" href="${dest}" target="_blank" rel="noopener">${ICON.go}Go</a>` : ''}</div>`;
  }
  return html;
}

function renderDay({ keepScroll = false } = {}) {
  if (!ov || ov.kind !== 'day') return;
  const trip = curTrip(); const day0 = curDay();
  if (!trip || !day0) return;
  const day = workDay();
  const el = ov.el;
  const n = dayNumber(trip, day0);
  const iso = effectiveDate(trip, day0);
  const today = isToday(trip, day0);
  const scroller = el.querySelector('.dv-body');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const now = today && !ov.edit ? nowMin() : null;
  const city = locName(trip, day.locationId);
  const wxNote = ov.wx === null && iso && daysBetween(todayISO(), iso) > 15 ? 'Forecast appears 16 days ahead' : !iso ? 'Set trip dates to see the weather' : '';
  el.setAttribute('aria-label', `Day ${n}`);
  el.classList.toggle('editing', !!ov.edit);
  el.innerHTML = `
    <header class="dv-head">
      ${ov.edit
    ? `<button class="text-btn" data-oa="cancel-edit">${ov.dirty ? 'Discard' : 'Cancel'}</button>`
    : `<button class="icon-btn" data-oa="back" aria-label="Back">${ICON.back}</button>`}
      <div class="dv-title"><span>Day ${n}</span><span class="hint">${[iso ? fmtDate(iso) : '', city].filter(Boolean).map(C.esc).join(' · ')}</span></div>
      ${ov.edit
    ? '<button class="primary-btn" data-oa="save-plan">Save</button>'
    : `<div class="dv-actions"><button class="icon-btn" data-oa="day-menu" aria-label="Day settings">${ICON.dots}</button></div>`}
    </header>
    <div class="dv-sub">
      <div class="segmented sm" role="group" aria-label="View">
        <span class="thumb"></span>
        <button data-oa="view" data-value="timeline" aria-pressed="${ov.view === 'timeline'}">Timeline</button>
        <button data-oa="view" data-value="map" aria-pressed="${ov.view === 'map'}">Map</button>
      </div>
      ${ov.edit ? '<span class="hint">Drag to move · pull the bottom edge to change length</span>'
    : `<button class="secondary-btn" data-oa="edit-plan">${ICON.edit}Edit plan</button>`}
    </div>
    ${ov.view === 'timeline' ? `
      <div class="dv-body">
        ${now != null ? nowNextHTML(trip, day) : ''}
        ${wxNote && !ov.edit ? `<p class="hint dv-note">${wxNote}</p>` : ''}
        ${(day.stops || []).length || ov.edit ? timelineHTML(trip, day, iso, ov.wx, !!ov.edit, now)
    : `<div class="empty"><h2>Nothing planned yet</h2><p>Tap Edit plan, then drag places from your list onto the timeline.</p><button class="primary-btn" data-oa="edit-plan" style="margin-top:16px;height:44px">Plan this day</button></div>`}
      </div>` : `
      <div class="dv-map"><div id="dv-mapbox" class="dv-mapbox"></div>
        ${today ? `<button class="icon-btn float locate-btn" data-oa="locate" aria-label="Show my location">${ICON.locate}</button>` : ''}
        <div class="dv-stops">${sorted(day.stops || []).map((s, i) => { const inf = stopInfo(trip, s); return `<button class="stop-card" data-oa="focus-stop" data-stop="${C.esc(s.id)}"><span class="sc-num">${i + 1}</span><span class="sc-name">${C.esc(inf.name)}</span><span class="hint">${fmtT(s.start)}${inf.lat == null ? ' · no location' : ''}</span></button>`; }).join('') || '<p class="hint" style="padding:0 20px">No stops yet.</p>'}</div>
      </div>`}
    ${ov.edit ? trayHTML(trip, day) : ''}`;
  C.syncSegmented(el, false);
  const sc = el.querySelector('.dv-body');
  if (sc) {
    if (ov.scrolled && (keepScroll || scroller)) sc.scrollTop = scrollTop;
    else if (!ov.scrolled) {
      ov.scrolled = true;
      const target = now != null ? now - 60 : (sorted(day.stops || [])[0] || { start: 9 * 60 }).start - 30;
      if (ov.grid) requestAnimationFrame(() => { sc.scrollTop = Math.max(0, ov.grid.y(target) - 40); });
    }
  }
  if (ov.edit) attachEditHandlers();
  if (ov.view === 'map') renderDayMap(trip, day, today);
}

function trayHTML(trip, day) {
  const tab = ov.tray || 'places';
  const inDay = new Set((day.stops || []).map((s) => `${s.type}:${s.refId}`));
  let items;
  if (tab === 'places') {
    items = placesOf(trip).filter((p) => !inDay.has(`place:${p.id}`))
      .sort((a, b) => (b.locationId === day.locationId) - (a.locationId === day.locationId) || (b.likes || []).length - (a.likes || []).length || a.name.localeCompare(b.name))
      .map((p) => ({ type: 'place', id: p.id, name: p.name, sub: `~${fmtDur(p.duration || 60)} · ${p.kind === 'event' ? 'Event' : SETTING[p.setting || 'indoor']}`, likes: (p.likes || []).length, theme: p.kind === 'event' ? THEME.event : THEME[p.setting || 'indoor'], other: p.locationId && p.locationId !== day.locationId }));
  } else {
    items = trip.foods.filter((f) => !inDay.has(`food:${f.id}`))
      .sort((a, b) => (b.likes || []).length - (a.likes || []).length || a.name.localeCompare(b.name))
      .map((f) => { const spot = ((f.spots || {})[day.locationId] || [])[0]; return { type: 'food', id: f.id, name: f.name, sub: spot ? spot.name : 'No spot in this city', likes: (f.likes || []).length, theme: THEME.food }; });
  }
  return `<div class="tray">
    <div class="tray-head"><span class="tray-title">Add from your list</span>
      <div class="tray-tabs"><button data-oa="tray" data-value="places" aria-pressed="${tab === 'places'}">Places</button><button data-oa="tray" data-value="food" aria-pressed="${tab === 'food'}">Food</button></div></div>
    <div class="tray-list">${items.length ? items.map((it) => `
      <button class="tray-card${it.other ? ' other' : ''}" data-add="${it.type}:${C.esc(it.id)}">
        <span class="tc-dot" style="background:${it.theme.bg};border-color:${it.theme.bar}"></span>
        <span class="tc-name">${C.esc(it.name)}</span><span class="tc-sub">${C.esc(it.sub)}</span>
        ${it.likes ? `<span class="tc-likes">♥ ${it.likes}</span>` : ''}
      </button>`).join('') : `<p class="hint" style="padding:8px 0">${tab === 'places' ? 'Everything is already in this day, or add places in Places & events.' : 'No dishes left to add.'}</p>`}</div>
  </div>`;
}

async function renderDayMap(trip, day, today) {
  const box = ov.el.querySelector('#dv-mapbox');
  if (!box) return;
  if (ov.map) { try { ov.map.remove(); } catch { /* ignore */ } ov.map = null; }
  const stops = sorted(day.stops || []).map((s, i) => ({ s, i, inf: stopInfo(trip, s) })).filter((x) => x.inf.lat != null);
  try {
    const { L, map } = await makeMap(box);
    if (!ov || !ov.el.contains(box)) { map.remove(); return; }
    ov.map = map; ov.markers = {};
    const now = today ? nowMin() : null;
    stops.forEach(({ s, i, inf }) => {
      const active = now != null && now >= s.start && now < s.start + s.duration;
      const m = L.marker([inf.lat, inf.lng], { icon: pinIcon(L, i + 1, active ? 'active' : now != null && now >= s.start + s.duration ? 'done' : '') }).addTo(map);
      m.bindPopup(`<b>${i + 1}. ${C.esc(inf.name)}</b><br>${fmtT(s.start)} – ${fmtT(s.start + s.duration)}`);
      ov.markers[s.id] = m;
    });
    const pts = stops.map((x) => [x.inf.lat, x.inf.lng]);
    if (pts.length > 1) L.polyline(pts, { color: '#1C1B1A', weight: 3, dashArray: '2 8', lineCap: 'round' }).addTo(map);
    if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
    else { const c = await cityCenter(locName(trip, day.locationId)); map.setView(c ? [c.lat, c.lng] : [35.68, 139.76], 12); }
    setTimeout(() => map.invalidateSize(), 80);
  } catch (e) { box.innerHTML = `<p class="hint" style="padding:16px">${C.esc(e.message)}</p>`; }
}

function showWarn(stopId) {
  const trip = curTrip(); const day = workDay();
  const stops = sorted(day.stops || []);
  const i = stops.findIndex((s) => s.id === stopId);
  if (i < 0) return;
  const s = stops[i];
  const warns = stopWarnings(trip, effectiveDate(trip, curDay()), ov.wx, s, stopInfo(trip, s), stops[i + 1]);
  const tl = ov.el.querySelector('#tl');
  tl.querySelectorAll('.tl-pop').forEach((x) => x.remove());
  const pop = document.createElement('div');
  pop.className = 'tl-pop';
  pop.setAttribute('role', 'dialog');
  pop.style.top = `${ov.grid.y(s.start) + 34}px`;
  pop.innerHTML = `${warns.map((w) => `<div class="tp-item ${w.level}"><b>${C.esc(w.title)}</b><span>${C.esc(w.text)}</span></div>`).join('')}
    <div class="btn-row">${ov.edit ? '' : '<button class="primary-btn" data-oa="edit-plan">Rearrange day</button>'}<button class="secondary-btn" data-oa="close-pop">Got it</button></div>`;
  tl.appendChild(pop);
  pop.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onOverlayClick(e) {
  if (!ov) return;
  const warnBtn = e.target.closest('[data-warn]');
  if (warnBtn) { e.stopPropagation(); showWarn(warnBtn.dataset.warn); return; }
  const b = e.target.closest('[data-oa]');
  const trip = curTrip();
  if (!b) {
    if (ov.kind === 'day' && !ov.edit) {
      const blk = e.target.closest('.tl-block[data-href]');
      if (blk) { C.navigate(blk.dataset.href); return; }
    }
    if (ov.kind === 'day' && ov.edit) {
      const add = e.target.closest('[data-add]');
      if (add && !ov.suppressClick) addFromTray(add.dataset.add);
    }
    return;
  }
  const a = b.dataset.oa;
  if (a === 'back') { leaveOverlay(); return; }
  if (ov.kind === 'place') {
    const p = placesOf(trip).find((x) => x.id === ov.id);
    if (a === 'edit-place') placeForm(trip, p);
    if (a === 'add-to-day') addToDaySheet(trip, p);
    return;
  }
  switch (a) {
    case 'view': ov.view = b.dataset.value; renderDay(); break;
    case 'edit-plan': startEdit(); break;
    case 'cancel-edit':
      if (ov.dirty && !ov.confirmCancel) { ov.confirmCancel = true; b.textContent = 'Tap again to discard'; return; }
      ov.edit = false; ov.work = null; ov.dirty = false; ov.confirmCancel = false; renderDay(); loadDayWeather(); break;
    case 'save-plan': savePlan(); break;
    case 'tray': ov.tray = b.dataset.value; renderDay({ keepScroll: true }); break;
    case 'close-pop': b.closest('.tl-pop').remove(); break;
    case 'day-menu': dayMenu(); break;
    case 'focus-stop': {
      const m = ov.markers && ov.markers[b.dataset.stop];
      ov.el.querySelectorAll('.stop-card').forEach((x) => x.classList.toggle('on', x === b));
      if (m) { ov.map.setView(m.getLatLng(), 16, { animate: true }); m.openPopup(); }
      break;
    }
    case 'locate': locateMe(); break;
    default: break;
  }
}

function locateMe() {
  if (!navigator.geolocation || !ov.map) { C.toast("Location isn't available on this device", true); return; }
  if (ov.watch != null) return;
  ov.watch = navigator.geolocation.watchPosition((pos) => {
    if (!ov || !ov.map) return;
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (!ov.me) { ov.me = window.L.circleMarker(ll, { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#3B82C4', fillOpacity: 1 }).addTo(ov.map); ov.map.setView(ll, 15); } else ov.me.setLatLng(ll);
  }, () => C.toast("Couldn't get your location", true), { enableHighAccuracy: true, maximumAge: 30000 });
}

function dayMenu() {
  const trip = curTrip(); const day = curDay();
  const n = dayNumber(trip, day);
  const iso = dayDate(trip, day);
  const forced = lsGet(`tt.today.${trip.id}`, '') === `${day.id}|${todayISO()}`;
  C.openSheet({
    title: `Day ${n}`,
    body: `
      ${trip.locations.length ? `<div class="field"><span class="label">City</span>
        <div class="chips" style="margin:0" id="dm-city">${trip.locations.map((l) => `<button type="button" class="chip" data-value="${C.esc(l.id)}" aria-pressed="${day.locationId === l.id}">${C.esc(l.name)}</button>`).join('')}</div></div>` : ''}
      ${iso === todayISO() ? '' : `<button class="row-btn" id="dm-today">${ICON.cal}<span class="grow">${forced ? "Stop using as today's plan" : "Use as today's plan"}</span></button>
        <span class="hint" style="margin-top:-10px">${iso ? `This day is ${fmtDate(iso)}. ` : ''}Shows the live view with the current time, just on this device.</span>`}
      <button class="danger-btn" type="button" id="dm-delete">${svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}<span>Delete Day ${n}</span></button>
      ${trip.startDate ? '<span class="hint" style="text-align:center">Days after this one move up a date.</span>' : ''}`,
    onMount({ el, close }) {
      const city = el.querySelector('#dm-city');
      city && city.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b || b.dataset.value === day.locationId) return;
        if (!(await C.ensureName())) return;
        C.pressOnly(city, b);
        const lid = b.dataset.value;
        C.store.update((d) => { const t = d.trips.find((x) => x.id === trip.id); const dd = t && (t.days || []).find((x) => x.id === day.id); if (dd) dd.locationId = lid; },
          `Day ${n} city`, { kind: 'day', action: 'edited', tripId: trip.id, tripName: trip.name, dayId: day.id, target: `Day ${n}`, details: [`City: ${locName(trip, day.locationId) || '–'} → ${locName(trip, lid)}`] });
        ov.wx = undefined; loadDayWeather();
      });
      const td = el.querySelector('#dm-today');
      td && td.addEventListener('click', () => {
        lsSet(`tt.today.${trip.id}`, forced ? null : `${day.id}|${todayISO()}`);
        close(); ov.scrolled = false; ov.wx = undefined; renderDay(); loadDayWeather();
      });
      C.twoStepDelete(el.querySelector('#dm-delete'), `Delete Day ${n}`, async () => {
        if (!(await C.ensureName())) return;
        close();
        const did = day.id;
        leaveOverlay();
        C.store.update((d) => { const t = d.trips.find((x) => x.id === trip.id); if (t) t.days = (t.days || []).filter((x) => x.id !== did); },
          `Delete Day ${n}`, { kind: 'day', action: 'deleted', tripId: trip.id, tripName: trip.name, target: `Day ${n}`, details: [`${(day.stops || []).length} stops removed`] });
      });
    },
  });
}

// ---------------------------------------------------------------- editing

function startEdit() {
  ov.edit = true;
  ov.work = clone(curDay());
  ov.work.stops = ov.work.stops || [];
  ov.dirty = false; ov.confirmCancel = false; ov.confirmLeave = false;
  ov.view = 'timeline';
  renderDay();
}

async function savePlan() {
  const trip = curTrip(); const day = curDay();
  if (!(await C.ensureName())) return;
  const before = sorted(day.stops || []);
  const after = sorted(ov.work.stops);
  const n = dayNumber(trip, day);
  const names = (list) => new Set(list.map((s) => stopInfo(trip, s).short));
  const added = [...names(after)].filter((x) => !names(before).has(x));
  const removed = [...names(before)].filter((x) => !names(after).has(x));
  const details = [];
  if (added.length) details.push(`Added ${added.join(', ')}`);
  if (removed.length) details.push(`Removed ${removed.join(', ')}`);
  if (!added.length && !removed.length) details.push('Changed times');
  const stops = clone(ov.work.stops);
  const did = day.id;
  ov.edit = false; ov.work = null;
  const wasDirty = ov.dirty; ov.dirty = false;
  renderDay();
  loadDayWeather();
  if (!wasDirty) return;
  C.store.update((d) => {
    const t = d.trips.find((x) => x.id === trip.id);
    const dd = t && (t.days || []).find((x) => x.id === did);
    if (dd) dd.stops = stops;
  }, `Plan Day ${n}`, { kind: 'day', action: 'edited', tripId: trip.id, tripName: trip.name, dayId: did, target: `Day ${n}`, details: [`${stops.length} stops`, ...details] });
}

function markDirty() { ov.dirty = true; ov.confirmCancel = false; const c = ov.el.querySelector('[data-oa="cancel-edit"]'); if (c) c.textContent = 'Discard'; }

function addFromTray(key, start) {
  const trip = curTrip();
  const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const day = ov.work;
  let stop;
  if (type === 'place') {
    const p = placesOf(trip).find((x) => x.id === id); if (!p) return;
    stop = { id: uid('s'), type, refId: id, start: start ?? nextSlot(trip, day.stops, p), duration: p.duration || 60 };
  } else {
    const f = trip.foods.find((x) => x.id === id); if (!f) return;
    const spot = ((f.spots || {})[day.locationId] || [])[0];
    stop = { id: uid('s'), type, refId: id, spot: spot ? spot.name : '', start: start ?? nextSlot(trip, day.stops, null), duration: 60 };
    const city = locName(trip, day.locationId);
    if (spot) {
      geocode(`${spot.name}, ${city}`).then((r) => {
        if (!r[0] || !ov || !ov.work) return;
        const s = ov.work.stops.find((x) => x.id === stop.id);
        if (s) { s.lat = r[0].lat; s.lng = r[0].lng; if (!ov.dragging) renderDay({ keepScroll: true }); }
      }).catch(() => {});
    }
  }
  stop.start = clamp(snap(stop.start), 0, 24 * 60 - stop.duration);
  day.stops.push(stop);
  markDirty();
  ov.flash = stop.id;
  renderDay({ keepScroll: true });
  const el = ov.el.querySelector(`[data-stop="${stop.id}"]`);
  if (el) { el.classList.add('flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function stopSheet(stopId) {
  const trip = curTrip();
  const s = ov.work.stops.find((x) => x.id === stopId);
  if (!s) return;
  const info = stopInfo(trip, s);
  let dur = s.duration;
  C.openSheet({
    title: info.short,
    body: `
      <div class="field"><label for="ss-start">Starts at</label><input class="input" type="time" id="ss-start" step="300" value="${fmtT(s.start)}"></div>
      <div class="field"><span class="label">How long</span>
        <div class="stepper"><button type="button" class="icon-btn" id="ss-minus" aria-label="15 minutes less">−</button>
          <span id="ss-dur" class="stepper-val">${fmtDur(dur)}</span>
          <button type="button" class="icon-btn" id="ss-plus" aria-label="15 minutes more">+</button></div></div>
      ${info.href ? `<a class="row-btn" href="${C.esc(info.href)}" id="ss-open"><span class="grow">Open details</span></a>` : ''}
      <button class="danger-btn" type="button" id="ss-remove">${ICON.x}<span>Remove from this day</span></button>`,
    onMount({ el, close }) {
      const set = (v) => { dur = clamp(v, MIN_DUR, 720); el.querySelector('#ss-dur').textContent = fmtDur(dur); };
      el.querySelector('#ss-minus').addEventListener('click', () => set(dur - 15));
      el.querySelector('#ss-plus').addEventListener('click', () => set(dur + 15));
      el.querySelector('#ss-remove').addEventListener('click', () => {
        ov.work.stops = ov.work.stops.filter((x) => x.id !== stopId); markDirty(); close(); renderDay({ keepScroll: true });
      });
      const open = el.querySelector('#ss-open');
      open && open.addEventListener('click', (e) => { e.preventDefault(); C.toast('Save or discard the plan first'); });
    },
    onSave({ el }) {
      const st = parseT(el.querySelector('#ss-start').value);
      if (st != null) s.start = clamp(snap(st), 0, 24 * 60 - dur);
      s.duration = dur;
      markDirty(); renderDay({ keepScroll: true });
      return true;
    },
  });
}

// Drag & stretch on the timeline (pointer events; long-press on touch so scrolling still works).
function attachEditHandlers() {
  const el = ov.el;
  const sc = el.querySelector('.dv-body');
  el.querySelectorAll('.tl-block.editable').forEach((blk) => {
    const id = blk.dataset.stop;
    blk.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.tb-warn')) return;
      const handle = e.target.closest('.tb-handle');
      beginDrag(e, blk, id, handle ? 'resize' : 'move', sc);
    });
    blk.addEventListener('touchmove', (e) => { if (ov && ov.dragging) e.preventDefault(); }, { passive: false });
    blk.addEventListener('keydown', (e) => {
      const s = ov.work.stops.find((x) => x.id === id); if (!s) return;
      if (e.key === 'Enter') { stopSheet(id); return; }
      const delta = e.key === 'ArrowUp' ? -SNAP : e.key === 'ArrowDown' ? SNAP : 0;
      if (!delta) return;
      e.preventDefault();
      if (e.shiftKey) s.duration = Math.max(MIN_DUR, s.duration + delta); else s.start = clamp(s.start + delta, 0, 1440 - s.duration);
      markDirty(); renderDay({ keepScroll: true });
      const again = ov.el.querySelector(`[data-stop="${id}"]`); if (again) again.focus();
    });
  });
  el.querySelectorAll('.tray-card').forEach((card) => {
    card.addEventListener('pointerdown', (e) => { if (e.button > 0) return; beginTrayDrag(e, card, sc); });
    card.addEventListener('touchmove', (e) => { if (ov && ov.dragging) e.preventDefault(); }, { passive: false });
  });
}

function beginDrag(e, blk, id, mode, sc) {
  const s = ov.work.stops.find((x) => x.id === id);
  if (!s) return;
  const touch = e.pointerType === 'touch';
  const y0 = e.clientY; const sc0 = sc.scrollTop;
  const orig = { start: s.start, duration: s.duration };
  let active = false; let moved = false; let timer = null; let val = { ...orig };
  const label = document.createElement('span');
  label.className = 'drag-label';
  const activate = () => {
    active = true; ov.dragging = true;
    blk.classList.add(mode === 'move' ? 'lifting' : 'stretching');
    blk.appendChild(label);
    try { blk.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(8);
    update(y0);
  };
  const update = (cy) => {
    const dy = cy - y0 + (sc.scrollTop - sc0);
    const dm = snap(dy / PX);
    if (mode === 'move') {
      val.start = clamp(orig.start + dm, 0, 1440 - orig.duration);
      blk.style.top = `${ov.grid.y(val.start)}px`;
      label.textContent = `${fmtT(val.start)} – ${fmtT(val.start + val.duration)}`;
    } else {
      val.duration = clamp(orig.duration + dm, MIN_DUR, 1440 - orig.start);
      blk.style.height = `${val.duration * PX}px`;
      label.textContent = `until ${fmtT(orig.start + val.duration)} · ${fmtDur(val.duration)}`;
    }
  };
  if (touch && mode === 'move') timer = setTimeout(activate, 260);
  else if (mode === 'resize') { e.preventDefault(); activate(); }
  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const dist = Math.abs(ev.clientY - y0) + Math.abs(ev.clientX - e.clientX);
    if (!active) {
      if (dist > 6) moved = true;
      if (touch) { if (dist > 8) cleanup(); return; }
      if (dist > 4) activate(); else return;
    }
    ev.preventDefault();
    autoScroll(sc, ev.clientY);
    update(ev.clientY);
  };
  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const was = active;
    cleanup();
    if (was) {
      if (val.start !== orig.start || val.duration !== orig.duration) { s.start = val.start; s.duration = val.duration; markDirty(); }
      renderDay({ keepScroll: true });
    } else if (!moved && ev.type === 'pointerup') stopSheet(id);
  };
  function cleanup() {
    clearTimeout(timer);
    lastDragY = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    ov.dragging = false;
    blk.classList.remove('lifting', 'stretching');
    label.remove();
  }
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function beginTrayDrag(e, card, sc) {
  const touch = e.pointerType === 'touch';
  const x0 = e.clientX; const y0 = e.clientY;
  let active = false; let timer = null; let ghost = null; let drop = null;
  const tl = ov.el.querySelector('#tl');
  const ind = ov.el.querySelector('#tl-drop');
  const key = card.dataset.add;
  const trip = curTrip();
  const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const dur = type === 'place' ? ((placesOf(trip).find((p) => p.id === id) || {}).duration || 60) : 60;
  const activate = () => {
    active = true; ov.dragging = true; ov.suppressClick = true;
    ghost = card.cloneNode(true);
    ghost.className = 'tray-card drag-ghost';
    document.body.appendChild(ghost);
    card.classList.add('picked');
    try { card.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(8);
    place(x0, y0);
  };
  const place = (cx, cy) => {
    ghost.style.transform = `translate(${cx - 70}px, ${cy - 40}px) rotate(-3deg)`;
    const r = tl.getBoundingClientRect();
    const scr = sc.getBoundingClientRect();
    if (cy > scr.top && cy < scr.bottom && cx > r.left && cx < r.right) {
      const m = clamp(snap((cy - r.top - 14) / PX + ov.grid.h0 * 60 - 10), 0, 1440 - dur);
      drop = m;
      ind.hidden = false;
      ind.style.top = `${ov.grid.y(m)}px`; ind.style.height = `${dur * PX}px`;
      ind.textContent = `Drop here · ${fmtT(m)}`;
    } else { drop = null; ind.hidden = true; }
  };
  if (touch) timer = setTimeout(activate, 300);
  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const dx = Math.abs(ev.clientX - x0); const dy = Math.abs(ev.clientY - y0);
    if (!active) {
      if (touch) { if (dx + dy > 8) cleanup(); return; }
      if (dx + dy > 6) activate(); else return;
    }
    ev.preventDefault();
    autoScroll(sc, ev.clientY);
    place(ev.clientX, ev.clientY);
  };
  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const was = active; const at = drop;
    cleanup();
    if (was && at != null) addFromTray(key, at);
    setTimeout(() => { if (ov) ov.suppressClick = false; }, 50);
  };
  function cleanup() {
    clearTimeout(timer);
    lastDragY = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (ov) ov.dragging = false;
    card.classList.remove('picked');
    if (ghost) ghost.remove();
    if (ind) ind.hidden = true;
  }
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** Scroll the timeline when a drag heads into its top or bottom edge. */
let lastDragY = null;
function autoScroll(sc, cy) {
  const r = sc.getBoundingClientRect();
  const dir = lastDragY == null ? 0 : cy - lastDragY;
  lastDragY = cy;
  if (cy < r.top + 60 && dir < 0) sc.scrollTop -= 12;
  else if (cy > r.bottom - 60 && cy < r.bottom && dir > 0) sc.scrollTop += 12;
}

/** Placeholder for the hero image of a place in lists (used by app.js hydrate). */
export const placeImageItem = (p) => ({ ...p, wiki: p.wiki || [p.name] });

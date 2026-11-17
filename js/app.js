import {
  store, CATEGORIES, VEG, getSettings, saveSettings, isConnected, testConnection, uniqueId, slugify,
  loadConfig, backendKind, getName, setName, getTripCode, setTripCode,
} from './store.js';
import { hydrateImage, resizeImage } from './images.js';

// ---------------------------------------------------------------- helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const svg = (paths, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const I = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>', 'sm'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', 'sm'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  plusXs: svg('<path d="M12 5v14M5 12h14"/>', 'xs'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  cloud: svg('<path d="M7 18h10.5a4 4 0 00.6-7.95A6 6 0 006.4 9.2 4.5 4.5 0 007 18z"/>'),
  ext: svg('<path d="M7 17L17 7"/><path d="M8 7h9v9"/>', 'sm'),
  leaf: svg('<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>', 'xs'),
  leafMd: svg('<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>', 'sm'),
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 'xs'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>', 'sm'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 'sm'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-8 7"/>', 'xs'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 'xs'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', 'xs'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 'sm'),
  share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>', 'xs'),
  history: svg('<path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>', 'sm'),
};
const PH = {
  main: '<path d="M3 12h18a9 9 0 01-18 0z"/><path d="M8 8c0-2 1.5-3 4-3s4 1 4 3"/>',
  dessert: '<path d="M4 20h16v-7H4z"/><path d="M4 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M12 4v4"/>',
  street: '<path d="M4 20L20 4"/><circle cx="9" cy="15" r="2.2"/><circle cx="13" cy="11" r="2.2"/><circle cx="17" cy="7" r="2.2"/>',
  beverage: '<path d="M5 8h12v5a6 6 0 01-12 0z"/><path d="M17 10h1.5a2.5 2.5 0 010 5H17"/><path d="M8 3v2M12 3v2"/>',
  trip: '<path d="M2 20h20"/><path d="M12 4l9 16H3z"/><path d="M9.5 9.5l2.5 1.5 2.5-1.5"/>',
};
const phIcon = (kind, size = 26) => `<span class="ph"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PH[kind] || PH.main}</svg></span>`;

const catLabel = (id) => (CATEGORIES.find((c) => c.id === id) || { label: id }).label;
const vegBadge = (v, lg = false) => `<span class="veg-badge ${esc(v)}${lg ? ' lg' : ''}">${v === 'yes' || v === 'maybe' ? I.leaf : ''}${esc((VEG[v] || VEG.maybe).label)}</span>`;

function fmtLocal(n, cur) { return `${cur.local}${Number(n).toLocaleString('en-US')}`; }
function fmtHome(n, cur) {
  return `${cur.home}${(Number(n) * cur.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function priceRange(f, cur, home = false) {
  const fmt = home ? fmtHome : fmtLocal;
  if (f.priceMin == null && f.priceMax == null) return '';
  if (f.priceMax == null || f.priceMin === f.priceMax) return fmt(f.priceMin ?? f.priceMax, cur);
  return `${fmt(f.priceMin, cur)} – ${fmt(f.priceMax, cur)}`;
}
const mapsUrl = (name, city) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`;

let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 5000 : 2400);
}

function syncSegmented(root = document, animate = true) {
  $$('.segmented', root).forEach((seg) => {
    const thumb = $('.thumb', seg);
    const btn = $('button[aria-pressed="true"]', seg);
    if (!thumb || !btn) return;
    const base = parseFloat(getComputedStyle(thumb).left) || 0;
    if (!animate) thumb.style.transition = 'none';
    thumb.style.width = `${btn.offsetWidth}px`;
    thumb.style.transform = `translateX(${btn.offsetLeft - base}px)`;
    seg.dataset.value = btn.dataset.value || '';
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = ''; });
  });
}
function pressOnly(group, btn) {
  $$('[aria-pressed]', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  if (group.classList.contains('segmented')) syncSegmented(group.parentElement);
}
window.addEventListener('resize', () => syncSegmented(document, false));

function hydrate(root, items) {
  $$('img[data-img]', root).forEach((img) => {
    const item = items[img.dataset.img];
    if (item) hydrateImage(img, item);
  });
}

// ---------------------------------------------------------------- state

const getTrip = (id) => store.data.trips.find((t) => t.id === id);
const ui = { tab: 'food', cat: 'all', q: '' };
function activeLoc(trip) {
  const saved = lsGet(`tt.loc.${trip.id}`, '');
  return trip.locations.find((l) => l.id === saved) || trip.locations[0] || null;
}
function setActiveLoc(trip, id) { lsSet(`tt.loc.${trip.id}`, id); }

// ---------------------------------------------------------------- router

let current = { page: null, tripId: null };
let detailOpenedInApp = false;

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'trip' && parts[1]) return { page: 'trip', tripId: parts[1], foodId: parts[2] === 'food' ? parts[3] : null };
  return { page: 'trips' };
}

function route() {
  const r = parseHash();
  if (r.page === 'trip' && !getTrip(r.tripId)) { location.replace('#/'); return; }
  const samePage = current.page === r.page && current.tripId === r.tripId;
  if (!samePage) {
    closeDetail(true);
    current = { page: r.page, tripId: r.tripId };
    if (r.page === 'trip') { ui.cat = 'all'; ui.q = ''; ui.tab = 'food'; }
    renderPage();
    window.scrollTo(0, 0);
  }
  if (r.page === 'trip') {
    const trip = getTrip(r.tripId);
    const food = r.foodId && trip.foods.find((f) => f.id === r.foodId);
    if (food) openDetail(trip, food); else { detailOpenedInApp = false; closeDetail(); }
  }
}
window.addEventListener('hashchange', route);

function renderPage() {
  const app = $('#app');
  if (current.page === 'trip') app.innerHTML = tripPage(getTrip(current.tripId));
  else app.innerHTML = tripsPage();
  afterRender(app);
}

function afterRender(app) {
  syncSegmented(app, false);
  if (current.page === 'trip') {
    const trip = getTrip(current.tripId);
    hydrate(app, Object.fromEntries(trip.foods.map((f) => [`food:${f.id}`, f])));
  } else {
    hydrate(app, Object.fromEntries(store.data.trips.map((t) => [`trip:${t.id}`, t])));
  }
}

/** Re-render after data changes, keeping scroll position and open overlays. */
function refresh() {
  if (!store.data) return;
  if (current.page === 'trip' && !getTrip(current.tripId)) { location.hash = '#/'; return; }
  const y = window.scrollY;
  const app = $('#app');
  if (current.page === 'trip') {
    const trip = getTrip(current.tripId);
    app.innerHTML = tripPage(trip, true);
    afterRender(app);
    if (detail) {
      const food = trip.foods.find((f) => f.id === detail.foodId);
      if (food) fillDetail(trip, food); else closeDetail();
    }
  } else {
    app.innerHTML = tripsPage(true);
    afterRender(app);
  }
  window.scrollTo(0, y);
}

function syncButton() {
  const kind = backendKind();
  const cls = kind ? (store.mode === kind ? 'on' : 'warn') : (store.hasLocalChanges() ? 'warn' : '');
  return `<button class="icon-btn sync-dot ${cls}" data-action="settings" aria-label="Sync and settings">${I.cloud}</button>`;
}

// ---------------------------------------------------------------- trips page

function tripsPage(quiet = false) {
  const trips = store.data.trips;
  return `<main class="page"${quiet ? ' style="animation:none"' : ''}>
    <div class="topbar"><span class="brand">Tasty Trips</span>${syncButton()}</div>
    <div class="hero-title"><h1>Your trips</h1><p>Plan what to eat and where to go.</p></div>
    <div class="trip-grid">
      ${trips.map((t, i) => `
        <a class="trip-card" href="#/trip/${encodeURIComponent(t.id)}" style="--i:${quiet ? 0 : i};${quiet ? 'animation:none' : ''}">
          <div class="photo"><img alt="" data-img="trip:${esc(t.id)}">${phIcon('trip', 40)}</div>
          <div class="info">
            <div style="display:flex;justify-content:space-between;align-items:center"><h2>${esc(t.name)}</h2>${I.next}</div>
            ${t.locations.length ? `<div class="tags">${t.locations.map((l) => `<span class="tag">${esc(l.name)}</span>`).join('')}</div>` : ''}
            <div class="stats"><span><b>${t.foods.length}</b> dishes</span><span><b>${(t.destinations || []).length}</b> destinations</span></div>
          </div>
        </a>`).join('')}
      <button class="new-trip" data-action="new-trip">${I.plus}New trip</button>
    </div>
  </main>`;
}

// ---------------------------------------------------------------- trip page

function tripPage(trip, quiet = false) {
  const loc = activeLoc(trip);
  return `<main class="page"${quiet ? ' style="animation:none"' : ''}>
    <div class="topbar">
      <a class="back" href="#/">${I.back}Trips</a>
      <div style="display:flex;gap:8px">${syncButton()}<button class="icon-btn" data-action="edit-trip" aria-label="Edit trip">${I.more}</button></div>
    </div>
    <div class="hero-title">
      <h1>${esc(trip.name)}</h1>
      <p>${trip.locations.length} location${trip.locations.length === 1 ? '' : 's'} · ${trip.foods.length} dish${trip.foods.length === 1 ? '' : 'es'} to try</p>
    </div>
    <div class="chips" id="loc-chips" role="group" aria-label="Location">
      ${trip.locations.map((l) => `<button class="chip" data-action="set-loc" data-loc="${esc(l.id)}" aria-pressed="${loc && l.id === loc.id}">${loc && l.id === loc.id ? I.pin : ''}${esc(l.name)}</button>`).join('')}
      <button class="chip dashed" data-action="add-loc">${I.plusXs}Add</button>
    </div>
    <div class="segmented section-switch" role="group" aria-label="Section">
      <span class="thumb"></span>
      <button data-action="tab" data-value="food" aria-pressed="${ui.tab === 'food'}">Food</button>
      <button data-action="tab" data-value="destinations" aria-pressed="${ui.tab === 'destinations'}">Destinations</button>
    </div>
    <div id="tab-content">${ui.tab === 'food' ? foodTab(trip, quiet) : destinationsTab()}</div>
  </main>`;
}

function destinationsTab() {
  return `<div class="soon"><h2>Destinations</h2><p>Coming soon: temples, viewpoints and neighbourhoods for each location.</p></div>`;
}

function foodTab(trip, quiet) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, trip.foods.filter((f) => f.category === c.id).length]));
  return `
    <div class="pills" role="group" aria-label="Category">
      <button class="pill" data-action="cat" data-cat="all" aria-pressed="${ui.cat === 'all'}">All<span class="n">${trip.foods.length}</span></button>
      ${CATEGORIES.map((c) => `<button class="pill" data-action="cat" data-cat="${c.id}" aria-pressed="${ui.cat === c.id}">${c.label}<span class="n">${counts[c.id]}</span></button>`).join('')}
    </div>
    <label class="search">${I.search}<span class="sr-only">Search dishes</span>
      <input id="food-search" type="search" placeholder="Search dishes or restaurants" value="${esc(ui.q)}" autocomplete="off">
    </label>
    <div id="food-groups">${foodGroups(trip, quiet)}</div>
    <div class="fade-bottom"></div>
    <button class="fab" data-action="add-food"${quiet ? ' style="animation:none"' : ''}>${I.plus}Add dish</button>`;
}

function foodGroups(trip, quiet = false) {
  const loc = activeLoc(trip);
  const q = ui.q.trim().toLowerCase();
  const match = (f) => !q || f.name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q)
    || Object.values(f.spots || {}).some((arr) => arr.some((s) => s.name.toLowerCase().includes(q)));
  const cats = ui.cat === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === ui.cat);
  let i = 0;
  const groups = cats.map((c) => {
    const foods = trip.foods.filter((f) => f.category === c.id && match(f));
    if (!foods.length) return '';
    return `<section class="group">
      <div class="group-head"><h2>${c.label}</h2><span>${foods.length} dish${foods.length === 1 ? '' : 'es'}</span></div>
      <div class="food-grid">${foods.map((f) => foodCard(trip, f, loc, quiet ? 0 : Math.min(i++, 12), quiet)).join('')}</div>
    </section>`;
  }).join('');
  if (groups) return groups;
  if (!trip.foods.length) {
    return `<div class="empty"><h2>No dishes yet</h2><p>Add the first dish you want to try on this trip.</p></div>`;
  }
  return `<div class="empty"><h2>Nothing here</h2><p>${q ? 'No dishes match your search.' : 'No dishes in this category yet.'}</p></div>`;
}

function foodCard(trip, f, loc, i, quiet) {
  const spots = (loc && f.spots && f.spots[loc.id]) || [];
  const top = spots.find((s) => s.name);
  const topLine = !loc ? '' : top ? `Top in ${esc(loc.name)}: ${esc(top.name)}` : `No spots in ${esc(loc.name)} yet`;
  return `<a class="food-card" href="#/trip/${encodeURIComponent(trip.id)}/food/${encodeURIComponent(f.id)}" style="--i:${i}${quiet ? ';animation:none' : ''}">
    <div class="photo cat-${esc(f.category)}"><img alt="" data-img="food:${esc(f.id)}">${phIcon(f.category)}</div>
    <div class="body">
      <div class="row"><span class="name">${esc(f.name)}</span>${vegBadge(f.veg)}</div>
      <span class="price">${priceRange(f, trip.currency)} <span>· ${priceRange(f, trip.currency, true)}</span></span>
      ${topLine ? `<span class="top">${topLine}</span>` : ''}
    </div>
  </a>`;
}

function refreshGroups(trip) {
  const box = $('#food-groups');
  if (!box) return;
  box.innerHTML = foodGroups(trip);
  hydrate(box, Object.fromEntries(trip.foods.map((f) => [`food:${f.id}`, f])));
}

// ---------------------------------------------------------------- detail overlay

let detail = null; // { el, scrim, foodId, tripId }

function openDetail(trip, food) {
  if (detail && detail.foodId === food.id) return;
  if (detail) { detail.foodId = food.id; fillDetail(trip, food); detail.el.scrollTo(0, 0); return; }
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', () => leaveDetail());
  const el = document.createElement('article');
  el.className = 'detail';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  const root = $('#sheet-root');
  root.append(scrim, el);
  detail = { el, scrim, foodId: food.id, tripId: trip.id };
  document.body.classList.add('no-scroll');
  fillDetail(trip, food);
  el.focus({ preventScroll: true });
}

function vegNote(food, trip, loc) {
  if (food.veg === 'yes') return 'Vegetarian friendly';
  if (food.veg === 'no') return 'Contains meat or fish';
  const spots = ((loc && food.spots[loc.id]) || []).filter((s) => s.name);
  const n = spots.filter((s) => s.veg).length;
  if (!loc || !spots.length) return 'Can be made vegetarian';
  return n ? `Veg version at ${n} of ${spots.length} spots in ${loc.name}` : `No veg version listed in ${loc.name}`;
}

function spotsList(trip, food, loc) {
  const spots = ((loc && food.spots[loc.id]) || []).filter((s) => s.name);
  if (!spots.length) return `<div class="none">No spots added for ${esc(loc ? loc.name : 'this location')} yet.</div>`;
  return spots.map((s, i) => `
    <a class="spot" href="${mapsUrl(s.name, loc.name)}" target="_blank" rel="noopener">
      <span class="rank">${i + 1}</span>
      <span class="nm"><span>${esc(s.name)}</span>${s.veg && food.veg !== 'yes' ? `<span class="veg-note">${I.leaf}Veg option</span>` : ''}</span>
      <span class="ext" aria-label="Open in Google Maps">${I.ext}</span>
    </a>`).join('');
}

function fillDetail(trip, food) {
  const loc = activeLoc(trip);
  const el = detail.el;
  el.setAttribute('aria-label', food.name);
  el.innerHTML = `
    <div class="hero-actions"><div>
      <button class="icon-btn float" data-action="close-detail" aria-label="Back">${I.back}</button>
      <button class="icon-btn float" data-action="edit-food" data-food="${esc(food.id)}" aria-label="Edit dish">${I.edit}</button>
    </div></div>
    <div class="hero"><div class="photo cat-${esc(food.category)}"><img alt="Photo of ${esc(food.name)}" data-img="food">${phIcon(food.category, 56)}</div></div>
    <div class="panel">
      <div class="grabber"></div>
      <div>
        <span class="eyebrow">${esc(catLabel(food.category))}</span>
        <h1>${esc(food.name)}</h1>
        ${food.description ? `<p class="desc">${esc(food.description)}</p>` : ''}
      </div>
      <div class="tiles">
        <div class="tile"><span class="k">Vegetarian</span>${vegBadge(food.veg, true)}<span class="sub" id="veg-note">${esc(vegNote(food, trip, loc))}</span></div>
        <div class="tile"><span class="k">Price estimate</span><span class="big">${priceRange(food, trip.currency)}</span><span class="sub">${priceRange(food, trip.currency, true)}</span></div>
      </div>
      <section style="display:flex;flex-direction:column;gap:12px">
        <div class="where-head">
          <h2>Where to eat</h2>
          ${trip.locations.length > 1 ? `<div class="segmented sm" role="group" aria-label="Location" id="detail-loc">
            <span class="thumb"></span>
            ${trip.locations.map((l) => `<button data-action="detail-loc" data-value="${esc(l.id)}" aria-pressed="${loc && l.id === loc.id}">${esc(l.name)}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="spots"><div class="spots-inner" id="spots">${spotsList(trip, food, loc)}</div></div>
      </section>
    </div>`;
  hydrateImage($('img[data-img]', el), food);
  requestAnimationFrame(() => syncSegmented(el, false));
}

function closeDetail(instant = false) {
  if (!detail) return;
  const { el, scrim } = detail;
  detail = null;
  if (!$('.sheet')) document.body.classList.remove('no-scroll');
  if (instant) { el.remove(); scrim.remove(); return; }
  el.classList.add('out'); scrim.classList.add('out');
  setTimeout(() => { el.remove(); scrim.remove(); }, 320);
}

function leaveDetail() {
  if (!detail) return;
  if (detailOpenedInApp) { detailOpenedInApp = false; history.back(); } else location.hash = `#/trip/${encodeURIComponent(current.tripId)}`;
}

// ---------------------------------------------------------------- sheets

function openSheet({ title, body, saveLabel = 'Save', onSave, onMount, onClose }) {
  const root = $('#sheet-root');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.style.zIndex = '48';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const tid = `sheet-${Date.now()}`;
  el.setAttribute('aria-labelledby', tid);
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="sheet-head">
      <button class="text-btn" data-sheet="cancel">Cancel</button>
      <h2 id="${tid}">${esc(title)}</h2>
      ${onSave ? `<button class="primary-btn" data-sheet="save">${esc(saveLabel)}</button>` : '<span style="width:60px"></span>'}
    </div>
    <div class="sheet-body">${body}</div>`;
  root.append(scrim, el);
  document.body.classList.add('no-scroll');
  const api = {
    el,
    close() {
      if (el.classList.contains('out')) return;
      onClose && onClose();
      el.classList.add('out'); scrim.classList.add('out');
      setTimeout(() => { el.remove(); scrim.remove(); }, 320);
      if (!detail && $$('.sheet:not(.out)').length === 0) document.body.classList.remove('no-scroll');
    },
  };
  scrim.addEventListener('click', api.close);
  $('[data-sheet="cancel"]', el).addEventListener('click', api.close);
  el.addEventListener('click', (e) => {
    // Following an in-app link (e.g. from the change log) closes every open sheet.
    if (e.target.closest('a[href^="#/"]')) $$('.sheet:not(.out) [data-sheet="cancel"]').forEach((b) => b.click());
  });
  if (onSave) {
    $('[data-sheet="save"]', el).addEventListener('click', async () => {
      const ok = await onSave(api);
      if (ok !== false) api.close();
    });
  }
  onMount && onMount(api);
  requestAnimationFrame(() => { syncSegmented(el, false); el.focus({ preventScroll: true }); });
  return api;
}

function twoStepDelete(btn, label, onConfirm) {
  let armed = false; let t;
  btn.addEventListener('click', () => {
    if (armed) { clearTimeout(t); onConfirm(); return; }
    armed = true;
    btn.lastChild.textContent = 'Tap again to delete';
    t = setTimeout(() => { armed = false; btn.lastChild.textContent = label; }, 3000);
  });
}

// ---------------------------------------------------------------- food form

function foodForm(trip, food) {
  const isNew = !food;
  const f = food ? JSON.parse(JSON.stringify(food)) : {
    id: '', name: '', category: ui.cat !== 'all' ? ui.cat : 'main', description: '', veg: 'maybe',
    priceMin: null, priceMax: null, image: '', wiki: [], spots: {},
  };
  trip.locations.forEach((l) => {
    const arr = (f.spots[l.id] || []).slice(0, 3);
    while (arr.length < 3) arr.push({ name: '', veg: false });
    f.spots[l.id] = arr;
  });
  const loc = activeLoc(trip);
  const body = `
    <div class="field">
      <label for="ff-name">Dish name</label>
      <div class="photo-row">
        <div class="photo cat-${esc(f.category)}" id="ff-photo"><img alt="" id="ff-img">${phIcon(f.category)}</div>
        <input class="input" id="ff-name" value="${esc(f.name)}" placeholder="e.g. Omurice" maxlength="60" autocomplete="off">
      </div>
      <div class="btn-row">
        <label class="secondary-btn" style="cursor:pointer">${I.image}Upload photo<input type="file" accept="image/*" id="ff-file" class="sr-only"></label>
        <button class="secondary-btn" type="button" id="ff-url-toggle">Image link</button>
        <button class="secondary-btn" type="button" id="ff-wiki-reset"${f.image ? '' : ' hidden'}>Use Wikipedia photo</button>
      </div>
      <input class="input" id="ff-url" placeholder="https://… link to a photo" value="${esc(/^https?:/.test(f.image) ? f.image : '')}" hidden>
      <span class="hint" id="ff-photo-hint">${f.image ? 'Using your own photo.' : 'Photo is picked automatically from Wikipedia.'}</span>
    </div>
    <div class="field">
      <label for="ff-desc">Description</label>
      <textarea class="input" id="ff-desc" maxlength="160" rows="3" placeholder="One sentence about the dish">${esc(f.description)}</textarea>
    </div>
    <div class="field">
      <span class="label">Category</span>
      <div class="chips" style="margin:0" role="group" aria-label="Category" id="ff-cat">
        ${CATEGORIES.map((c) => `<button type="button" class="chip" data-value="${c.id}" aria-pressed="${f.category === c.id}">${c.label}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <span class="label">Vegetarian friendly</span>
      <div class="segmented veg" role="group" aria-label="Vegetarian friendly" id="ff-veg">
        <span class="thumb"></span>
        ${['yes', 'maybe', 'no'].map((v) => `<button type="button" data-value="${v}" aria-pressed="${f.veg === v}">${VEG[v].label}</button>`).join('')}
      </div>
      <span class="hint">Maybe = has vegetarian versions (e.g. veg fillings). Mark those spots with the leaf.</span>
    </div>
    <div class="field">
      <span class="label">Price estimate (${esc(trip.currency.local)})</span>
      <div class="price-row">
        <input class="input" id="ff-min" inputmode="numeric" aria-label="Price from" placeholder="From" value="${f.priceMin ?? ''}">
        <span style="color:var(--muted)">–</span>
        <input class="input" id="ff-max" inputmode="numeric" aria-label="Price to" placeholder="To" value="${f.priceMax ?? ''}">
      </div>
      <span class="hint" id="ff-conv"></span>
    </div>
    <div class="field">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="label">Top 3 spots</span>
        ${trip.locations.length > 1 ? `<div class="segmented sm" role="group" aria-label="Location" id="ff-loc">
          <span class="thumb"></span>
          ${trip.locations.map((l) => `<button type="button" data-value="${esc(l.id)}" aria-pressed="${loc && l.id === loc.id}">${esc(l.name)}</button>`).join('')}
        </div>` : ''}
      </div>
      ${trip.locations.length ? trip.locations.map((l) => `
        <div class="loc-spots" data-loc="${esc(l.id)}"${loc && l.id === loc.id ? '' : ' hidden'} style="display:flex;flex-direction:column;gap:8px">
          ${f.spots[l.id].map((s, i) => `
            <div class="spot-row">
              <span class="n">${i + 1}</span>
              <input class="input" data-spot="${i}" aria-label="${esc(l.name)} spot ${i + 1}" placeholder="Restaurant name" value="${esc(s.name)}" autocomplete="off">
              <button type="button" class="leaf-toggle" data-leaf="${i}" aria-pressed="${!!s.veg}" aria-label="Has a vegetarian version" title="Has a vegetarian version">${I.leafMd}</button>
            </div>`).join('')}
        </div>`).join('') : '<span class="hint">Add a location to this trip first.</span>'}
      <span class="hint" id="ff-rule" hidden></span>
    </div>
    <span class="hint err" id="ff-err" hidden></span>
    ${isNew ? '' : `<button class="danger-btn" type="button" id="ff-delete">${I.trash}<span>Delete dish</span></button>`}`;

  let pendingUpload = null; // { blob, name }
  const sheet = openSheet({
    title: isNew ? 'Add dish' : 'Edit dish',
    body,
    onMount({ el, close }) {
      const photo = $('#ff-photo', el);
      const img = $('#ff-img', el);
      const showPhoto = () => {
        photo.className = `photo cat-${f.category}`;
        img.removeAttribute('src');
        if (pendingUpload) { img.src = URL.createObjectURL(pendingUpload.blob); img.onload = () => photo.classList.add('is-loaded'); return; }
        hydrateImage(img, { image: f.image, wiki: f.wiki && f.wiki.length ? f.wiki : [f.name] });
      };
      showPhoto();
      const hint = $('#ff-photo-hint', el);
      const wikiReset = $('#ff-wiki-reset', el);
      const setOwn = (on, msg) => { wikiReset.hidden = !on; hint.textContent = msg || (on ? 'Using your own photo.' : 'Photo is picked automatically from Wikipedia.'); };

      $('#ff-name', el).addEventListener('change', () => { if (!f.image && !pendingUpload) { f.wiki = []; showPhoto(); } });
      $('#ff-url-toggle', el).addEventListener('click', () => { const u = $('#ff-url', el); u.hidden = !u.hidden; if (!u.hidden) u.focus(); });
      $('#ff-url', el).addEventListener('change', (e) => {
        const v = e.target.value.trim();
        pendingUpload = null;
        f.image = v; setOwn(!!v); showPhoto();
      });
      wikiReset.addEventListener('click', () => {
        pendingUpload = null; f.image = ''; $('#ff-url', el).value = ''; setOwn(false); showPhoto();
      });
      $('#ff-file', el).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const blob = await resizeImage(file, isConnected() ? 1600 : 900);
          if (isConnected()) {
            pendingUpload = { blob, name: `${slugify($('#ff-name', el).value || 'dish')}-${Date.now().toString(36)}.jpg` };
            setOwn(true, 'Photo will be uploaded to your repo when you save.');
          } else {
            f.image = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
            setOwn(true, 'Saved in this browser only. Connect GitHub to keep photos everywhere.');
          }
          showPhoto();
        } catch { toast('Could not read that image', true); }
      });

      $('#ff-cat', el).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        pressOnly($('#ff-cat', el), b); f.category = b.dataset.value; photo.className = photo.className.replace(/cat-\w+/, `cat-${f.category}`);
        $('.ph', photo).outerHTML = phIcon(f.category);
      });
      $('#ff-veg', el).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        pressOnly($('#ff-veg', el), b); f.veg = b.dataset.value; checkRule();
      });
      const locSeg = $('#ff-loc', el);
      locSeg && locSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        pressOnly(locSeg, b);
        $$('.loc-spots', el).forEach((box) => { box.hidden = box.dataset.loc !== b.dataset.value; });
      });
      $$('.leaf-toggle', el).forEach((b) => b.addEventListener('click', () => {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); checkRule();
      }));
      $$('.loc-spots input', el).forEach((inp) => inp.addEventListener('input', checkRule));

      const conv = () => {
        const a = num($('#ff-min', el).value); const b = num($('#ff-max', el).value);
        $('#ff-conv', el).textContent = a == null && b == null ? `Converted to ${trip.currency.home} automatically`
          : `≈ ${priceRange({ priceMin: a ?? b, priceMax: b ?? a }, trip.currency, true)}, converted automatically`;
      };
      $('#ff-min', el).addEventListener('input', conv);
      $('#ff-max', el).addEventListener('input', conv);
      conv();

      function checkRule() {
        const rule = $('#ff-rule', el);
        if (f.veg !== 'maybe') { rule.hidden = true; return; }
        const missing = trip.locations.filter((l) => {
          const box = $(`.loc-spots[data-loc="${CSS.escape(l.id)}"]`, el);
          const rows = $$('.spot-row', box).filter((r) => $('input', r).value.trim());
          return rows.length && !rows.some((r) => $('.leaf-toggle', r).getAttribute('aria-pressed') === 'true');
        });
        rule.hidden = !missing.length;
        rule.className = 'hint warn';
        rule.textContent = missing.length ? `"Maybe" dishes need at least one veg spot (leaf) per city. Missing: ${missing.map((l) => l.name).join(', ')}.` : '';
      }
      checkRule();

      const del = $('#ff-delete', el);
      del && twoStepDelete(del, 'Delete dish', async () => {
        if (!(await ensureName())) return;
        const id = food.id; const tid = trip.id;
        close();
        if (detail) leaveDetail();
        store.update((d) => { const t = d.trips.find((x) => x.id === tid); if (t) t.foods = t.foods.filter((x) => x.id !== id); },
          `Delete dish: ${food.name}`,
          { kind: 'dish', action: 'deleted', tripId: tid, tripName: trip.name, foodId: id, target: food.name, details: [] });
      });
    },
    async onSave({ el }) {
      const err = $('#ff-err', el);
      const name = $('#ff-name', el).value.trim();
      let a = num($('#ff-min', el).value); let b = num($('#ff-max', el).value);
      if (a == null) a = b; if (b == null) b = a;
      const fail = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; };
      if (!name) return fail('Give the dish a name.');
      if (a != null && b < a) return fail('The "to" price should be higher than the "from" price.');
      if (!(await ensureName())) return false;
      const spots = {};
      trip.locations.forEach((l) => {
        const box = $(`.loc-spots[data-loc="${CSS.escape(l.id)}"]`, el);
        spots[l.id] = $$('.spot-row', box).map((r) => ({
          name: $('input', r).value.trim(),
          veg: $('.leaf-toggle', r).getAttribute('aria-pressed') === 'true',
        })).filter((s) => s.name);
      });
      const out = {
        id: food ? food.id : uniqueId(name, trip.foods.map((x) => x.id)),
        name,
        category: f.category,
        description: $('#ff-desc', el).value.trim().replace(/\s+/g, ' '),
        veg: f.veg,
        priceMin: a, priceMax: b,
        image: f.image || '',
        wiki: f.wiki && f.wiki.length && food && name === food.name ? f.wiki : [name],
        spots,
      };
      if (pendingUpload) {
        const btn = $('[data-sheet="save"]', el);
        btn.disabled = true; btn.textContent = 'Uploading…';
        try { out.image = await store.uploadImage(pendingUpload.blob, pendingUpload.name); } catch (e) {
          btn.disabled = false; btn.textContent = 'Save';
          return fail(`Photo upload failed: ${e.message}`);
        }
      }
      const tid = trip.id;
      const details = food ? foodDiff(food, out, trip)
        : [[catLabel(out.category), `Vegetarian: ${VEG[out.veg].label}`, priceRange(out, trip.currency)].filter(Boolean).join(' · ')];
      if (food && !details.length) return true; // nothing changed
      store.update((d) => {
        const t = d.trips.find((x) => x.id === tid);
        if (!t) return;
        const idx = t.foods.findIndex((x) => x.id === out.id);
        if (idx >= 0) t.foods[idx] = JSON.parse(JSON.stringify(out)); else t.foods.push(JSON.parse(JSON.stringify(out)));
      }, `${food ? 'Update' : 'Add'} dish: ${name}`,
      { kind: 'dish', action: food ? 'edited' : 'added', tripId: tid, tripName: trip.name, foodId: out.id, target: name, details });
      return true;
    },
  });
  return sheet;
}

function num(v) {
  const s = String(v || '').replace(/[^\d.]/g, '');
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- trip form

function tripForm(trip, { addLocation = false } = {}) {
  const isNew = !trip;
  const t = trip ? JSON.parse(JSON.stringify(trip)) : {
    id: '', name: '', cover: '', coverWiki: [], currency: { local: '¥', localCode: 'JPY', home: '€', homeCode: 'EUR', rate: 0.005701 },
    locations: [], foods: [], destinations: [],
  };
  const locRow = (l) => `<div class="loc-row" data-id="${esc(l.id)}">
    <input class="input" value="${esc(l.name)}" placeholder="City or area, e.g. Osaka" aria-label="Location name" autocomplete="off">
    <button type="button" class="icon-btn" data-remove aria-label="Remove location">${I.x}</button></div>`;
  const body = `
    <div class="field"><label for="tf-name">Trip name</label>
      <input class="input" id="tf-name" value="${esc(t.name)}" placeholder="e.g. Japan" maxlength="40" autocomplete="off"></div>
    <div class="field"><span class="label">Locations</span>
      <div class="loc-list" id="tf-locs">${t.locations.map(locRow).join('')}</div>
      <button type="button" class="secondary-btn" id="tf-add" style="align-self:flex-start">${I.plusXs}Add location</button>
      <span class="hint">Removing a location also removes its restaurant spots.</span></div>
    <div class="field"><span class="label">Currency</span>
      <div class="price-row">
        <input class="input" id="tf-local" value="${esc(t.currency.local)}" aria-label="Local currency symbol" style="max-width:72px;text-align:center">
        <span style="color:var(--muted)">1 =</span>
        <input class="input" id="tf-rate" inputmode="decimal" value="${t.currency.rate}" aria-label="Exchange rate">
        <input class="input" id="tf-home" value="${esc(t.currency.home)}" aria-label="Home currency symbol" style="max-width:72px;text-align:center">
      </div>
      <span class="hint">Used to convert prices, e.g. ${esc(t.currency.local)}1,000 = ${fmtHome(1000, t.currency)}.</span></div>
    <div class="field"><label for="tf-cover">Cover photo link (optional)</label>
      <input class="input" id="tf-cover" value="${esc(t.cover)}" placeholder="https://…" autocomplete="off"></div>
    <span class="hint err" id="tf-err" hidden></span>
    ${isNew ? '' : `<button class="danger-btn" type="button" id="tf-delete">${I.trash}<span>Delete trip</span></button>`}`;
  openSheet({
    title: isNew ? 'New trip' : 'Edit trip',
    body,
    onMount({ el, close }) {
      const list = $('#tf-locs', el);
      const add = (focus = true) => {
        list.insertAdjacentHTML('beforeend', locRow({ id: '', name: '' }));
        if (focus) $('.loc-row:last-child input', list).focus();
      };
      $('#tf-add', el).addEventListener('click', () => add());
      list.addEventListener('click', (e) => { const b = e.target.closest('[data-remove]'); if (b) b.closest('.loc-row').remove(); });
      if (isNew) add(false);
      else if (addLocation) setTimeout(() => add(), 350);
      const del = $('#tf-delete', el);
      del && twoStepDelete(del, 'Delete trip', async () => {
        if (!(await ensureName())) return;
        const id = trip.id; close();
        location.hash = '#/';
        store.update((d) => { d.trips = d.trips.filter((x) => x.id !== id); }, `Delete trip: ${trip.name}`,
          { kind: 'trip', action: 'deleted', tripId: id, tripName: trip.name, target: trip.name, details: [`${trip.foods.length} dishes removed`] });
      });
    },
    async onSave({ el }) {
      const err = $('#tf-err', el);
      const name = $('#tf-name', el).value.trim();
      if (!name) { err.textContent = 'Give the trip a name.'; err.hidden = false; return false; }
      const rate = Number(String($('#tf-rate', el).value).replace(',', '.'));
      if (!(rate > 0)) { err.textContent = 'Enter an exchange rate above 0.'; err.hidden = false; return false; }
      const taken = [];
      const locations = $$('.loc-row', el).map((r) => ({ id: r.dataset.id, name: $('input', r).value.trim() })).filter((l) => l.name)
        .map((l) => { const id = l.id || uniqueId(l.name, taken.concat(t.locations.map((x) => x.id))); taken.push(id); return { id, name: l.name }; });
      const currency = { ...t.currency, local: $('#tf-local', el).value.trim() || t.currency.local, home: $('#tf-home', el).value.trim() || t.currency.home, rate };
      const cover = $('#tf-cover', el).value.trim();
      if (!(await ensureName())) return false;
      if (isNew) {
        const id = uniqueId(name, store.data.trips.map((x) => x.id));
        const nt = { ...t, id, name, cover, coverWiki: [name], currency, locations };
        store.update((d) => { d.trips.push(JSON.parse(JSON.stringify(nt))); }, `Add trip: ${name}`,
          { kind: 'trip', action: 'added', tripId: id, tripName: name, target: name, details: locations.length ? [`Locations: ${locations.map((l) => l.name).join(', ')}`] : [] });
        location.hash = `#/trip/${encodeURIComponent(id)}`;
      } else {
        const id = trip.id;
        const keep = new Set(locations.map((l) => l.id));
        const details = tripDiff(trip, { name, cover, currency, locations });
        if (!details.length) return true;
        store.update((d) => {
          const x = d.trips.find((y) => y.id === id); if (!x) return;
          x.name = name; x.cover = cover; x.currency = currency; x.locations = locations;
          if (!x.coverWiki || !x.coverWiki.length) x.coverWiki = [name];
          x.foods.forEach((f) => { Object.keys(f.spots || {}).forEach((k) => { if (!keep.has(k)) delete f.spots[k]; }); });
        }, `Update trip: ${name}`, { kind: 'trip', action: 'edited', tripId: id, tripName: name, target: name, details });
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------- change log helpers

function foodDiff(a, b, trip) {
  const out = [];
  const cur = trip.currency;
  if (a.name !== b.name) out.push(`Name: ${a.name} → ${b.name}`);
  if (a.category !== b.category) out.push(`Category: ${catLabel(a.category)} → ${catLabel(b.category)}`);
  if ((a.description || '') !== (b.description || '')) out.push(a.description ? 'Description updated' : 'Description added');
  if (a.veg !== b.veg) out.push(`Vegetarian: ${VEG[a.veg].label} → ${VEG[b.veg].label}`);
  const pa = priceRange(a, cur); const pb = priceRange(b, cur);
  if (pa !== pb) out.push(`Price: ${pa || '–'} → ${pb || '–'}`);
  if ((a.image || '') !== (b.image || '')) out.push('Photo changed');
  trip.locations.forEach((l) => {
    const fmt = (f) => ((f.spots || {})[l.id] || []).filter((s) => s.name).map((s) => s.name + (s.veg ? ' (veg)' : '')).join(', ') || '–';
    const sa = fmt(a); const sb = fmt(b);
    if (sa !== sb) out.push(`${l.name} spots: ${sa} → ${sb}`);
  });
  return out;
}

function tripDiff(a, b) {
  const out = [];
  if (a.name !== b.name) out.push(`Name: ${a.name} → ${b.name}`);
  const la = a.locations.map((l) => l.name).join(', ') || '–';
  const lb = b.locations.map((l) => l.name).join(', ') || '–';
  if (la !== lb) out.push(`Locations: ${la} → ${lb}`);
  if (a.currency.rate !== b.currency.rate || a.currency.local !== b.currency.local || a.currency.home !== b.currency.home) {
    out.push(`Exchange rate: ${a.currency.local}1 = ${a.currency.home}${a.currency.rate} → ${b.currency.local}1 = ${b.currency.home}${b.currency.rate}`);
  }
  if ((a.cover || '') !== (b.cover || '')) out.push('Cover photo changed');
  return out;
}

const AVATARS = [['#F3E3C6', '#6E4A14'], ['#E4E6DA', '#4A5233'], ['#F2DFDA', '#84402F'], ['#DDE6EE', '#33506A'], ['#E9E0EE', '#58406A'], ['#E1ECE4', '#2B5A3E']];
function avatar(name) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [bg, fg] = AVATARS[h % AVATARS.length];
  return `<span class="avatar" style="background:${bg};color:${fg}" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>`;
}

function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function changeItem(c) {
  const at = new Date(c.at);
  const trip = store.data.trips.find((t) => t.id === c.tripId);
  const food = trip && c.foodId && trip.foods.find((f) => f.id === c.foodId);
  let target = `<b>${esc(c.target || '')}</b>`;
  if (food) target = `<a href="#/trip/${encodeURIComponent(trip.id)}/food/${encodeURIComponent(food.id)}">${esc(c.target)}</a>`;
  else if (c.kind === 'trip' && trip) target = `<a href="#/trip/${encodeURIComponent(trip.id)}">${esc(c.target)}</a>`;
  const what = c.kind === 'data' ? 'imported a data file' : `${esc(c.action)} ${c.kind === 'trip' ? 'trip ' : ''}${target}`;
  const where = c.kind === 'dish' && c.tripName ? `${esc(c.tripName)} · ` : '';
  const details = (c.details || []).filter(Boolean);
  return `<li class="change">
    ${avatar(c.by || '?')}
    <div class="c-body">
      <div class="c-title"><b>${esc(c.by || 'Someone')}</b> ${what}</div>
      <div class="c-meta"><time datetime="${esc(c.at)}" title="${esc(at.toLocaleString())}">${where}${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
      ${details.length ? `<ul class="c-details">${details.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>
  </li>`;
}

function changesSheet() {
  const list = (store.data.changes || []).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  let body;
  if (!list.length) {
    body = '<div class="empty" style="margin:0"><h2>No changes yet</h2><p>Every add, edit and delete from now on shows up here with who made it and when.</p></div>';
  } else {
    const groups = [];
    list.forEach((c) => {
      const label = dayLabel(new Date(c.at));
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.items.push(c); else groups.push({ label, items: [c] });
    });
    body = groups.map((g) => `<section class="change-day"><h3>${esc(g.label)}</h3><ul class="changes">${g.items.map(changeItem).join('')}</ul></section>`).join('');
  }
  openSheet({ title: 'Changes', body });
}

// ---------------------------------------------------------------- your name

function askName({ welcome = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const tripNames = store.data.trips.map((t) => t.name).join(', ');
    openSheet({
      title: welcome ? 'Welcome' : 'Your name',
      saveLabel: 'Continue',
      body: `
        <p style="margin:0;color:var(--ink-2)">${welcome
    ? `You're planning ${tripNames ? `<b>${esc(tripNames)}</b>` : 'a trip'} together. What name should your friends see next to your changes?`
    : 'Your name is shown next to your changes in the change log.'}</p>
        <div class="field"><label for="nm-name">Your name</label>
          <input class="input" id="nm-name" value="${esc(getName())}" placeholder="e.g. Alex" maxlength="40" autocomplete="given-name"></div>
        <span class="hint err" id="nm-err" hidden></span>`,
      onMount({ el }) {
        const inp = $('#nm-name', el);
        setTimeout(() => inp.focus(), 350);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-sheet="save"]', el).click(); });
      },
      onSave({ el }) {
        const v = $('#nm-name', el).value.trim();
        if (!v) { const e = $('#nm-err', el); e.textContent = 'Please enter a name.'; e.hidden = false; return false; }
        setName(v); done = true; resolve(v);
        return true;
      },
      onClose() { if (!done) resolve(getName() || null); },
    });
  });
}
const ensureName = async () => getName() || askName();

function inviteLink() {
  const code = getTripCode();
  return `${location.origin}${location.pathname}${code ? `#join=${encodeURIComponent(code)}` : ''}`;
}

async function shareInvite() {
  const url = inviteLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'Tasty Trips', text: 'Plan the food for our trip with me', url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { prompt('Copy this invite link', url); }
}

// ---------------------------------------------------------------- settings / sync

function settingsSheet() {
  const kind = backendKind();
  const s = getSettings();
  const local = store.hasLocalChanges();
  const card = (dot, title, sub) => `<span class="dot ${dot}"></span><div><b>${esc(title)}</b><br><span class="hint">${esc(sub)}</span></div>`;
  let status;
  if (kind === 'shared') {
    status = store.mode === 'shared'
      ? card('on', 'Shared with your group', 'Everyone with the invite link can add and edit. Changes save for everyone.')
      : card('warn', "Can't reach the sync server", store.loadError || 'Check your connection and reload.');
  } else if (kind === 'github') {
    status = store.mode === 'github'
      ? card('on', 'Synced with GitHub', `Edits are committed to ${s.owner}/${s.repo} (${s.branch}).`)
      : card('warn', "Can't reach GitHub", store.loadError || 'Check your token.');
  } else {
    status = card(local ? 'warn' : '', 'Saved on this device only', 'Turn on the shared sync server so friends can edit together (see README).');
  }
  const nChanges = (store.data.changes || []).length;
  const body = `
    <div class="status-card">${status}</div>
    ${kind && local ? `<button class="secondary-btn" id="st-push">${I.upload}Upload this browser's edits</button>` : ''}
    <button class="row-btn" id="st-changes">${I.history}<span class="grow">Track changes</span><span class="count">${nChanges}</span>${I.next}</button>
    <div class="field"><label for="st-name">Your name</label>
      <input class="input" id="st-name" value="${esc(getName())}" placeholder="Shown next to your changes" maxlength="40" autocomplete="given-name"></div>
    ${kind === 'shared' ? `
      <div class="field"><label for="st-code">Trip code</label>
        <input class="input" id="st-code" type="password" value="${esc(getTripCode())}" placeholder="From the invite link" autocomplete="off" autocapitalize="off">
        <span class="hint">Needed to make changes. Opening the invite link fills it in.</span></div>
      <button class="secondary-btn" id="st-invite" style="align-self:flex-start">${I.share}Share invite link</button>` : `
      <details class="adv"${kind === 'github' ? ' open' : ''}>
        <summary>Trip owner: sync with a GitHub token</summary>
        <div class="field"><span class="label">GitHub repository</span>
          <div class="price-row">
            <input class="input" id="st-owner" value="${esc(s.owner)}" placeholder="owner" aria-label="Owner" autocomplete="off" autocapitalize="off">
            <span style="color:var(--muted)">/</span>
            <input class="input" id="st-repo" value="${esc(s.repo)}" placeholder="repository" aria-label="Repository" autocomplete="off" autocapitalize="off">
          </div></div>
        <div class="field"><label for="st-branch">Branch</label>
          <input class="input" id="st-branch" value="${esc(s.branch)}" autocomplete="off" autocapitalize="off"></div>
        <div class="field"><label for="st-token">Access token</label>
          <input class="input" id="st-token" type="password" value="${esc(s.token)}" placeholder="github_pat_…" autocomplete="off">
          <span class="hint">Only for you. Friends don't need this once the shared sync server is set up.</span></div>
        ${kind === 'github' ? '<button class="secondary-btn" id="st-disconnect" type="button">Disconnect</button>' : ''}
      </details>`}
    <span class="hint err" id="st-err" hidden></span>
    <div class="btn-row">
      <button class="secondary-btn" id="st-export">${I.download}Export data</button>
      <label class="secondary-btn" style="cursor:pointer">${I.upload}Import data<input type="file" accept="application/json,.json" id="st-import" class="sr-only"></label>
    </div>`;
  openSheet({
    title: 'Sync & settings',
    body,
    onMount({ el, close }) {
      $('#st-changes', el).addEventListener('click', changesSheet);
      const inv = $('#st-invite', el);
      inv && inv.addEventListener('click', () => { const c = $('#st-code', el).value.trim(); if (c) setTripCode(c); shareInvite(); });
      const push = $('#st-push', el);
      push && push.addEventListener('click', async () => {
        try { await store.pushLocal(); toast('Uploaded'); close(); refresh(); } catch (e) { toast(e.message, true); }
      });
      const dis = $('#st-disconnect', el);
      dis && dis.addEventListener('click', async () => {
        saveSettings({ ...getSettings(), token: '' });
        close(); await store.load(); refresh(); toast('Disconnected from GitHub');
      });
      $('#st-export', el).addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'trips.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      $('#st-import', el).addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!data || !Array.isArray(data.trips)) throw new Error('Not a Tasty Trips file');
          if (!(await ensureName())) return;
          close();
          store.replaceAll(data, 'Import trips', { kind: 'data', action: 'imported', target: file.name, details: [`${data.trips.length} trip(s)`] });
          toast('Imported');
        } catch (er) { toast(`Import failed: ${er.message}`, true); }
      });
    },
    async onSave({ el }) {
      const err = $('#st-err', el);
      const showErr = (m) => { err.textContent = m; err.hidden = false; return false; };
      const name = $('#st-name', el).value.trim();
      if (name) setName(name);
      const btn = $('[data-sheet="save"]', el);
      if (kind === 'shared') {
        const code = $('#st-code', el).value.trim();
        const prev = getTripCode();
        setTripCode(code);
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
          await testConnection();
          if (store.mode !== 'shared') await store.load();
          refresh(); toast('Saved');
          return true;
        } catch (e) {
          setTripCode(prev); btn.disabled = false; btn.textContent = 'Save';
          return showErr(e.status === 401 ? 'That trip code is not right.' : e.message);
        }
      }
      const next = {
        owner: $('#st-owner', el).value.trim(), repo: $('#st-repo', el).value.trim(),
        branch: $('#st-branch', el).value.trim() || 'main', token: $('#st-token', el).value.trim(),
      };
      const prev = getSettings();
      if (!next.token || (next.token === prev.token && next.owner === prev.owner && next.repo === prev.repo && next.branch === prev.branch)) {
        refresh(); return true;
      }
      if (!next.owner || !next.repo) return showErr('Fill in the repository.');
      const hadLocal = store.hasLocalChanges();
      saveSettings(next);
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const info = await testConnection();
        await store.load();
        refresh();
        toast(`Connected to ${info.repo}${hadLocal ? '. Open this panel to upload your browser edits.' : ''}`);
        return true;
      } catch (e) {
        saveSettings(prev);
        btn.disabled = false; btn.textContent = 'Save';
        return showErr(e.status === 401 ? 'That token was rejected by GitHub.' : e.status === 404 ? 'Repository or branch not found for this token.' : e.message);
      }
    },
  });
}

// ---------------------------------------------------------------- events

document.addEventListener('click', (e) => {
  const a = e.target.closest('a.food-card');
  if (a) detailOpenedInApp = true;
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const action = b.dataset.action;
  const trip = current.tripId && getTrip(current.tripId);
  switch (action) {
    case 'settings': settingsSheet(); break;
    case 'new-trip': tripForm(null); break;
    case 'edit-trip': tripForm(trip); break;
    case 'add-loc': tripForm(trip, { addLocation: true }); break;
    case 'add-food': foodForm(trip, null); break;
    case 'close-detail': leaveDetail(); break;
    case 'edit-food': {
      const food = trip.foods.find((f) => f.id === b.dataset.food);
      if (food) foodForm(trip, food);
      break;
    }
    case 'set-loc': {
      setActiveLoc(trip, b.dataset.loc);
      $$('#loc-chips [data-action="set-loc"]').forEach((c) => {
        const on = c === b;
        c.setAttribute('aria-pressed', String(on));
        c.innerHTML = `${on ? I.pin : ''}${esc(trip.locations.find((l) => l.id === c.dataset.loc).name)}`;
      });
      refreshGroups(trip);
      break;
    }
    case 'tab': {
      if (ui.tab === b.dataset.value) break;
      ui.tab = b.dataset.value;
      pressOnly(b.parentElement, b);
      const box = $('#tab-content');
      box.innerHTML = ui.tab === 'food' ? foodTab(trip) : destinationsTab();
      hydrate(box, Object.fromEntries(trip.foods.map((f) => [`food:${f.id}`, f])));
      break;
    }
    case 'cat': {
      ui.cat = b.dataset.cat;
      pressOnly(b.parentElement, b);
      b.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      refreshGroups(trip);
      break;
    }
    case 'detail-loc': {
      setActiveLoc(trip, b.dataset.value);
      pressOnly(b.parentElement, b);
      const food = trip.foods.find((f) => f.id === detail.foodId);
      const loc = activeLoc(trip);
      const box = $('#spots', detail.el);
      box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
      box.innerHTML = spotsList(trip, food, loc);
      $('#veg-note', detail.el).textContent = vegNote(food, trip, loc);
      // Keep the page underneath in sync.
      $$('#loc-chips [data-action="set-loc"]').forEach((c) => {
        const on = c.dataset.loc === loc.id;
        c.setAttribute('aria-pressed', String(on));
        c.innerHTML = `${on ? I.pin : ''}${esc(trip.locations.find((l) => l.id === c.dataset.loc).name)}`;
      });
      refreshGroups(trip);
      break;
    }
    default: break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'food-search') {
    ui.q = e.target.value;
    refreshGroups(getTrip(current.tripId));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const sheets = $$('.sheet:not(.out)');
  if (sheets.length) { $('[data-sheet="cancel"]', sheets[sheets.length - 1]).click(); return; }
  if (detail) leaveDetail();
});

// ---------------------------------------------------------------- boot

store.onSaved = (where) => toast(where === 'shared' ? 'Saved for everyone' : where === 'github' ? 'Saved to GitHub' : 'Saved on this device');
store.onError = (e) => { toast(`Not saved: ${e.message}`, true); };
store.on(refresh);

/** An invite link looks like …/#join=CODE. Remember the code and tidy the URL. */
function readJoinLink() {
  const m = location.hash.match(/[#&?/]join=([^&]+)/);
  if (!m) return false;
  setTripCode(decodeURIComponent(m[1]));
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  return true;
}

(async function boot() {
  $('#app').innerHTML = '<div class="loading"><div class="spinner" aria-label="Loading"></div></div>';
  const joined = readJoinLink();
  try {
    await loadConfig();
    await store.load();
  } catch (e) {
    $('#app').innerHTML = `<main class="page"><div class="empty"><h2>Couldn't load trips</h2><p>${esc(e.message)}</p></div></main>`;
    return;
  }
  route();
  if (document.fonts) document.fonts.ready.then(() => syncSegmented(document, false));
  if (!getName() && (joined || backendKind() === 'shared')) setTimeout(() => askName({ welcome: true }), 500);
  else if (joined) toast('You joined the trip');
}());

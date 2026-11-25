// Free, keyless place data for autofill and "Popular in …":
//   Wikidata (search, details, popularity), OpenStreetMap Overpass (opening hours),
//   Nominatim (reverse geocoding for a readable address).

const WD_API = 'https://www.wikidata.org/w/api.php';
const WD_SPARQL = 'https://query.wikidata.org/sparql';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } };
const photoUrl = (file, w = 1200) => (file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}` : '');
export const thumbUrl = (file) => photoUrl(file, 160);

// ---------------------------------------------------------------- guessing from the type of place

const RULES = [
  [/theme park|amusement park|disney|universal studios/, 'both', 300, 'other'],
  [/aquarium/, 'indoor', 120, 'museum'],
  [/museum|gallery|exhibition|planetarium/, 'indoor', 120, 'museum'],
  [/theatre|theater|opera house|concert hall|kabuki/, 'indoor', 150, 'other'],
  [/shopping (mall|centre|center)|department store/, 'indoor', 90, 'shopping'],
  [/observation|tower|skyscraper|sky deck|viewpoint|lookout/, 'indoor', 75, 'views'],
  [/castle|palace/, 'both', 90, 'temples'],
  [/shrine|temple|church|cathedral|mosque|basilica|pagoda|monastery|chapel/, 'outdoor', 60, 'temples'],
  [/zoo/, 'outdoor', 150, 'parks'],
  [/botanical|garden|park/, 'outdoor', 90, 'parks'],
  [/mountain|volcano|hiking|trail/, 'outdoor', 180, 'views'],
  [/lake|beach|waterfall|island|river|bay/, 'outdoor', 90, 'parks'],
  [/onsen|hot spring|bath/, 'indoor', 120, 'other'],
  [/market|arcade|shopping street|street|crossing|square|plaza/, 'outdoor', 60, 'shopping'],
  [/district|neighbou?rhood|quarter|old town|area/, 'outdoor', 90, 'shopping'],
  [/monument|statue|memorial|bridge|landmark|gate/, 'outdoor', 30, 'other'],
];
export const CATEGORIES = [
  { id: 'all', label: 'All' }, { id: 'temples', label: 'Temples & shrines' }, { id: 'museum', label: 'Museums' },
  { id: 'views', label: 'Views' }, { id: 'parks', label: 'Parks & nature' }, { id: 'shopping', label: 'Streets & markets' }, { id: 'other', label: 'Other' },
];
/** Guess setting, visit time and category from a name + description. */
export function guess(label = '', desc = '') {
  const s = `${desc} ${label}`.toLowerCase();
  for (const [re, setting, duration, category] of RULES) if (re.test(s)) return { setting, duration, category };
  return { setting: 'both', duration: 60, category: 'other' };
}
// Well covered on Wikipedia but not sights, even when the description mentions e.g. a park.
const HARD_NO = /\b(university|college|school|company|corporation|station|railway|subway|airport|hotel|stadium|arena|olympics|paralympics|hospital|government|ministry|embassy|headquarters|office building|bank)\b/;
const IS_A_SIGHT = /(temple|shrine|museum|gallery|park|garden|tower|castle|palace|market|street|crossing|zoo|aquarium|observation|landmark|tourist|theatre|theater|monument|statue|cathedral|church|square|district|neighbou?rhood|shopping|amusement|onsen|hot spring|mountain|lake|waterfall|beach|island|viewpoint|bridge|gate|pagoda|skyscraper|arcade|old town|memorial)/;

// ---------------------------------------------------------------- Wikidata

async function wd(params) {
  const url = `${WD_API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Place search is unavailable right now');
  return res.json();
}

function entityToPlace(e) {
  const c = e.claims || {};
  const coord = c.P625 && c.P625[0].mainsnak.datavalue && c.P625[0].mainsnak.datavalue.value;
  if (!coord) return null;
  const file = c.P18 && c.P18[0].mainsnak.datavalue && c.P18[0].mainsnak.datavalue.value;
  const label = (e.labels && e.labels.en && e.labels.en.value) || '';
  const desc = (e.descriptions && e.descriptions.en && e.descriptions.en.value) || '';
  const site = c.P856 && c.P856[0].mainsnak.datavalue && c.P856[0].mainsnak.datavalue.value;
  return {
    qid: e.id, name: label, description: desc, lat: +coord.latitude.toFixed(6), lng: +coord.longitude.toFixed(6),
    imageFile: file || '', image: photoUrl(file), thumb: thumbUrl(file), link: site || '',
    wiki: e.sitelinks && e.sitelinks.enwiki ? [e.sitelinks.enwiki.title] : [label],
    ...guess(label, desc),
  };
}

/** Suggestions for what the user is typing, closest to `near` first. */
export async function searchPlaces(q, near = []) {
  const s = await wd({ action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', type: 'item', limit: '12' });
  const ids = (s.search || []).map((x) => x.id);
  if (!ids.length) return [];
  const d = await wd({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|descriptions|sitelinks', languages: 'en', sitefilter: 'enwiki' });
  const list = ids.map((id) => d.entities[id] && entityToPlace(d.entities[id])).filter(Boolean)
    .filter((p) => !HARD_NO.test(p.description.toLowerCase()));
  if (near.length) {
    const dist = (p) => Math.min(...near.map((c) => km(c, p)));
    list.forEach((p) => { p.km = dist(p); });
    list.sort((a, b) => (a.km > 80) - (b.km > 80) || 0); // nearby first, Wikidata's relevance otherwise
  }
  return list.slice(0, 5);
}

/** The most widely covered sights within ~12 km of a point. Cached for 30 days. */
export async function popularNear(center, key) {
  const ck = `tt.popular.v1.${key}`;
  const cached = lsGet(ck);
  if (cached) {
    try { const j = JSON.parse(cached); if (Date.now() - j.at < 30 * 864e5) return j.list; } catch { /* ignore */ }
  }
  const query = `SELECT ?item ?itemLabel ?itemDescription ?coord ?links (SAMPLE(?img) AS ?image) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${center.lng} ${center.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "12" . }
  ?item wikibase:sitelinks ?links . FILTER(?links >= 8)
  OPTIONAL { ?item wdt:P18 ?img }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?item ?itemLabel ?itemDescription ?coord ?links ORDER BY DESC(?links) LIMIT 300`;
  const res = await fetch(`${WD_SPARQL}?format=json&query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error('Popular places are unavailable right now. Try again in a minute.');
  const j = await res.json();
  const seen = new Set();
  const list = j.results.bindings.map((b) => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
    const label = b.itemLabel ? b.itemLabel.value : '';
    const desc = b.itemDescription ? b.itemDescription.value : '';
    const file = b.image ? decodeURIComponent(b.image.value.split('/').pop()) : '';
    return {
      qid: b.item.value.split('/').pop(), name: label, description: desc, lat: m ? +(+m[2]).toFixed(6) : null, lng: m ? +(+m[1]).toFixed(6) : null,
      links: +b.links.value, imageFile: file, image: photoUrl(file), thumb: thumbUrl(file), wiki: [label], ...guess(label, desc),
    };
  }).filter((p) => {
    const d = p.description.toLowerCase();
    if (!p.name || /^Q\d+$/.test(p.name) || seen.has(p.qid)) return false;
    seen.add(p.qid);
    return IS_A_SIGHT.test(d) && !HARD_NO.test(d);
  }).slice(0, 60);
  lsSet(ck, JSON.stringify({ at: Date.now(), list }));
  return list;
}

// ---------------------------------------------------------------- OpenStreetMap opening hours

const DAY = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
function expandDays(spec) {
  const out = new Set();
  spec.split(',').forEach((part) => {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return;
    const a = ORDER.indexOf(m[1]); const b = m[2] ? ORDER.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { out.add(DAY[ORDER[i]]); if (i === b) break; }
  });
  return out;
}
/**
 * Read the common cases of OSM `opening_hours`, e.g. "Mo-Su 09:00-17:00",
 * "Tu-Su 09:30-17:00; Mo off", "24/7". Returns null if it can't be read simply.
 */
export function parseOpeningHours(s) {
  if (!s) return null;
  s = s.trim();
  if (s === '24/7') return { open: '00:00', close: '23:59', closedDays: [], raw: s };
  const openDays = new Set(); let open = null; let close = null; let sawDays = false;
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    if (/PH|SH|week|[A-Z][a-z]{2} \d/.test(rule) && !/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(rule)) continue; // holidays / date ranges: skip
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? expandDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (m[1]) sawDays = true;
    const rest = (m[2] || '').trim();
    if (/^(off|closed)$/i.test(rest)) { days.forEach((d) => openDays.delete(d)); continue; }
    const t = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(rest);
    if (!t) return null;
    days.forEach((d) => openDays.add(d));
    if (!open) { open = `${t[1].padStart(2, '0')}:${t[2]}`; close = `${t[3].padStart(2, '0')}:${t[4]}`; }
  }
  if (!open) return null;
  if (close === '24:00') close = '23:59';
  return { open, close, closedDays: sawDays ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !openDays.has(d)) : [], raw: s };
}

/** Opening hours from OpenStreetMap for a Wikidata item, if mapped. */
export async function hoursFor(qid) {
  if (!qid) return null;
  try {
    const q = `[out:json][timeout:8];nwr["wikidata"="${qid}"];out tags 3;`;
    const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const j = await res.json();
    const el = (j.elements || []).find((e) => e.tags && e.tags.opening_hours);
    return el ? parseOpeningHours(el.tags.opening_hours) : null;
  } catch { return null; }
}

/** A short readable address for a point (Nominatim reverse geocoding). */
export async function addressFor(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=en&lat=${lat}&lon=${lng}`);
    if (!res.ok) return '';
    const j = await res.json();
    const a = j.address || {};
    return [a.road, a.neighbourhood || a.suburb || a.quarter, a.city_district || a.city || a.town].filter(Boolean).slice(0, 3).join(', ') || (j.display_name || '').split(',').slice(0, 3).join(',');
  } catch { return ''; }
}

export function km(a, b) {
  const R = 6371; const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat); const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

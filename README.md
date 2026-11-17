# Tasty Trips

A small, static trip planner for GitHub Pages. Create trips, add locations (e.g. Tokyo, Kyoto) and
collect the dishes you want to try: photo, one-line description, vegetarian friendliness,
price range in local and home currency, and the top 3 spots per location. Plan together with
friends: everyone invited to a trip can edit it, heart the dishes they want to try, and see a change
log of who changed what and when.

No build step: plain HTML, CSS and JavaScript modules.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell |
| `css/styles.css` | All styling and animations |
| `js/app.js` | Screens, forms, invites, hearts, change log and routing |
| `js/store.js` | Loading/saving data through the sync server |
| `js/images.js` | Dish photos (chosen photo, or Wikipedia as a fallback) |
| `config.json` | Address of the sync server |
| `worker/worker.js` | The sync server (a Cloudflare Worker + D1 database) |

## How sharing works

Trips are stored privately in a Cloudflare D1 database behind the sync server, not in this public
repo. Nobody can see a trip without a code that unlocks it:

- **Owner code** (`ADMIN_CODE`, yours only): sees every trip, can delete trips and manage all invites.
- **Invite links** (`…/#join=<code>`): each one unlocks only the trips picked when it was made.
  Anyone with access to a trip can invite people to it; invites can be revoked at any time.
- A friend who creates a new trip automatically gets a private code for it.

The first time someone opens the site, it asks for their name. Names are shown on hearts and in the
change log. They're self-reported, not verified accounts.

## Setting up the sync server (Cloudflare)

1. **Worker**: [dash.cloudflare.com](https://dash.cloudflare.com) → *Workers & Pages* → *Create* →
   *Hello World* → name `tasty-trips` → *Deploy* → *Edit code* → paste `worker/worker.js` → *Deploy*.
2. **Database**: *Storage & Databases* → *D1 SQL Database* → *Create* → name `tasty-trips`.
   No tables needed; the worker creates them.
3. **Bind it**: Worker → *Settings* → *Bindings* → *Add* → *D1 database* →
   variable name `DB`, database `tasty-trips` → *Deploy*.
4. **Owner code**: Worker → *Settings* → *Variables and Secrets* → *Add* → type *Secret*,
   name `ADMIN_CODE`, value: a long code only you know → *Deploy*.
   Optional: `ALLOWED_ORIGIN` (*Text*) = `https://githintz.github.io`.
5. Put the worker address in `config.json`: `{ "syncUrl": "https://tasty-trips.<you>.workers.dev" }`.
6. Open the site → cloud button → add your owner code → then use the person-plus button on a trip
   to create invite links. Back up all trips any time with *Export data*.

Without a sync server (empty `syncUrl`), the site keeps everything in the browser.

## Interest

Tap the heart on a dish to show you want to try it. The number shows how many people are interested;
the dish page lists who. *Sort → Interest* orders the list by hearts.

## Track changes

Cloud button → **Track changes** lists every add, edit and delete in the trips you can see, grouped by
day, with the person's name, the time and what changed. Each trip keeps its newest 300 changes.

## Data format (one trip)

```jsonc
{
  "id": "japan", "name": "Japan",
  "currency": { "local": "¥", "home": "€", "rate": 0.005701 },   // 1 local = rate home
  "locations": [{ "id": "tokyo", "name": "Tokyo" }],
  "foods": [{
    "id": "omurice", "name": "Omurice",
    "category": "main",            // main | dessert | street | beverage
    "description": "One sentence.",
    "veg": "maybe",                // yes | maybe | no
    "priceMin": 1000, "priceMax": 1800,
    "image": "https://…",          // photo URL; empty = Wikipedia photo
    "wiki": ["Omurice"],           // Wikipedia article(s) used if the photo is missing or fails
    "spots": { "tokyo": [{ "name": "Rengatei", "veg": false }] },  // ranked, up to 3
    "likes": ["Alex", "Maya"]      // who is interested
  }],
  "changes": [{ "at": "2026-11-17T17:41:00Z", "by": "Alex", "kind": "dish", "action": "edited",
                "target": "Omurice", "details": ["Price: ¥1,000 – ¥1,800 → ¥1,200 – ¥1,800"] }]
}
```

A `maybe` dish should have at least one spot with `"veg": true` in every city; the editor warns when it doesn't.
Dish photos come from Wikimedia Commons.

# Tasty Trips

A small, static trip planner for GitHub Pages. Create trips, add locations (e.g. Tokyo, Kyoto) and
collect the dishes you want to try: photo, one-line description, vegetarian friendliness,
price range in local and home currency, and the top 3 spots per location. Plan together with
friends: everyone can edit, and a change log shows who changed what and when.

No build step: plain HTML, CSS and JavaScript modules.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell |
| `css/styles.css` | All styling and animations |
| `js/app.js` | Screens, forms, change log and routing |
| `js/store.js` | Loading/saving data, sync backends |
| `js/images.js` | Dish photos (chosen photo, or Wikipedia as a fallback) |
| `data/trips.json` | **All trip data**, including the change log |
| `config.json` | Address of the shared sync server |
| `worker/worker.js` | The sync server (a Cloudflare Worker) |
| `images/` | Photos uploaded from the site (created on first upload) |

## Hosting on GitHub Pages

1. Settings → Pages → *Deploy from a branch* → pick the branch and `/ (root)`.
2. Open `https://<user>.github.io/<repo>/`.

## Planning together (shared sync server)

Friends shouldn't need GitHub accounts or tokens. A tiny free Cloudflare Worker holds one GitHub
token for the whole group and saves everyone's edits to `data/trips.json`. Friends only need the
invite link. Set it up once (about 10 minutes):

1. **GitHub token**: create a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
   → *Only select repositories* → this repo → Permissions → Repository → **Contents: Read and write**.
2. **Worker**: sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (free account) →
   *Workers & Pages* → *Create* → *Create Worker* → name it `tasty-trips` → *Deploy* →
   *Edit code* → replace everything with the contents of `worker/worker.js` → *Deploy*.
3. **Settings** of the worker → *Variables and Secrets* → add:
   - `GITHUB_TOKEN`: *Secret*, the token from step 1
   - `TRIP_PASSCODE`: *Secret*, any code your friends will need to edit (e.g. `ramen2026`)
   - `OWNER`: `githintz`, `REPO`: `TastyTripsPlanner`, `BRANCH`: the branch Pages deploys from
   - optional `ALLOWED_ORIGIN`: `https://githintz.github.io`
4. Put the worker's address (e.g. `https://tasty-trips.<you>.workers.dev`) into `config.json`:
   `{ "syncUrl": "https://tasty-trips.<you>.workers.dev" }`.
5. Open the site → cloud button → enter the trip code → **Share invite link**. The link looks like
   `https://githintz.github.io/TastyTripsPlanner/#join=ramen2026`. Anyone who opens it can edit;
   the site asks for their name once.

Every save becomes a commit in this repo, with the friend's name as the commit author.

### Without the sync server

- **Owner only**: cloud button → *Trip owner: sync with a GitHub token* lets you save straight to
  GitHub with your own token (stored only in that browser).
- **Nothing set up**: edits are kept in that browser; use *Export / Import data* to move them.

## Track changes

Cloud button → **Track changes** lists every add, edit and delete, grouped by day, with the person's
name, the time, and what changed (e.g. `Price: ¥1,000 – ¥1,800 → ¥1,200 – ¥1,800`). The log lives in
`data/trips.json` (`changes`, newest 500 kept), so everyone sees the same history. Names are what each
person typed in, not verified accounts.

## Data format

```jsonc
{
  "version": 1,
  "trips": [{
    "id": "japan", "name": "Japan",
    "currency": { "local": "¥", "home": "€", "rate": 0.005701 },   // 1 local = rate home
    "locations": [{ "id": "tokyo", "name": "Tokyo" }],
    "foods": [{
      "id": "omurice", "name": "Omurice",
      "category": "main",            // main | dessert | street | beverage
      "description": "One sentence.",
      "veg": "maybe",                // yes | maybe | no
      "priceMin": 1000, "priceMax": 1800,
      "image": "https://…",          // photo URL or images/… path; empty = Wikipedia photo
      "wiki": ["Omurice"],           // Wikipedia article(s) used if the photo is missing or fails
      "spots": { "tokyo": [{ "name": "Rengatei", "veg": false }] }  // ranked, up to 3; veg = offers a veg version
    }]
  }],
  "changes": [{ "at": "2026-11-17T17:41:00Z", "by": "Alex", "kind": "dish", "action": "edited",
                "target": "Omurice", "details": ["Price: ¥1,000 – ¥1,800 → ¥1,200 – ¥1,800"] }]
}
```

A `maybe` dish should have at least one spot with `"veg": true` in every city; the editor warns when it doesn't.
Dish photos come from Wikimedia Commons.

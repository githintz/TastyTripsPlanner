# Tasty Trips

A small, static trip planner for GitHub Pages. Create trips, add locations (e.g. Tokyo, Kyoto) and
collect the dishes you want to try: photo, one-line description, vegetarian friendliness,
price range in local and home currency, and the top 3 spots per location.

No build step: plain HTML, CSS and JavaScript modules.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell |
| `css/styles.css` | All styling and animations |
| `js/app.js` | Screens, forms and routing |
| `js/store.js` | Loading/saving data, GitHub sync |
| `js/images.js` | Dish photos (custom or from Wikipedia) |
| `data/trips.json` | **All trip data** |
| `images/` | Photos uploaded from the site (created on first upload) |

## Hosting on GitHub Pages

1. Settings → Pages → *Deploy from a branch* → pick the branch and `/ (root)`.
2. Open `https://<user>.github.io/<repo>/`.

## Saving edits

Edits made on the site are committed straight to `data/trips.json` in this repo:

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access
   to **only this repository** and **Contents: Read and write**.
2. On the site, tap the cloud button → paste the token → **Connect**. Use the same branch that Pages deploys from.

The token is stored only in that browser. Without a token, edits are kept in the browser only
(and can be exported/imported as JSON from the same panel).

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
      "image": "",                   // optional URL or images/… path; empty = Wikipedia photo
      "wiki": ["Omurice"],           // Wikipedia article(s) to take the photo from
      "spots": { "tokyo": [{ "name": "Rengatei", "veg": false }] }  // ranked, up to 3; veg = offers a veg version
    }]
  }]
}
```

A `maybe` dish should have at least one spot with `"veg": true` in every city; the editor warns when it doesn't.

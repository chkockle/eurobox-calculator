# Eurobox calculator

Find the best combination of Euroboxes for the shelf you actually have — not for a pallet.

You describe your shelf (from the product page dimensions or measured clear space), pick the
boxes you would buy, and the calculator suggests layouts per level, shows them in a front /
3D view and produces a shopping list. German and English UI. No backend: everything runs and is
stored in the browser.

## Features

- **Shelf input**: presets (e.g. OBI Schwerlast-Steckregal XL 180 × 160 × 60), quick setup from
  outer dimensions (height, width, depth, boards, bays), then per-level clear height, stacking,
  "boxes behind boxes" and optional load limits. Multiple shelves per project.
- **Accessibility**: by default every box is reachable from the front (one row, no stacking).
  Stacking and rows behind each other are opt-in per level.
- **Front overhang**: allowed per shelf up to a max. mm, while at least 2/3 (configurable) of the
  box depth must rest on the board.
- **Box catalogue**: Euroboxes (60×40, 40×30, 30×20, 80×60), attached-lid containers and VDA KLT,
  plus your own boxes. Optional prices per box.
- **Per-level box choice**: limit a level to certain boxes (e.g. small boxes to keep small parts
  apart), and pick any alternative layout per level in the results.
- **Objectives**: most volume, most boxes, fewest box types, best price per litre.
- **Manufacturer tolerance**: nominal sizes plus a configurable tolerance (default 5 mm) and gap
  between boxes (default 10 mm). Tight fits are flagged, and when a layout would only fit with
  exactly nominal boxes and no gaps, the calculator says so ("measure your boxes").
- **Load warnings**: only with numbers you provide (board / shelf load from the manufacturer,
  expected content weight in kg per litre). Nothing is assumed.
- **3D view** (Three.js via Threlte): orthographic front elevation or free 3D, with letter codes
  that match the shopping list and per-level top views.
- **Backup & sharing**: autosave in `localStorage`, JSON export/import, share link with the
  project compressed into the URL hash, print / PDF.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # solver + persistence tests (Vitest)
npm run check      # svelte-check + TypeScript
npm run build      # static build into dist/
```

## Deployment (Cloudflare Pages)

The build is fully static; `dist/` can be served by any static host. It is deployed with
Cloudflare Pages' Git integration:

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm test && npm run build` |
| Build output directory | `dist` |
| Node version | from `.node-version` (22) |

Every push to `main` deploys to production; other branches get their own preview URL.
Response headers (long-term caching for hashed assets, basic security headers) are in
`public/_headers`.

### Structure

```
src/lib/data/catalog.generated.ts   box catalogue (generated — see below)
src/lib/model/                      types, defaults, presets, shelf generator
src/lib/solver/level.ts             per-level solver (columns + width knapsack)
src/lib/solver/plans.ts             shelf-wide plans, ranking, manual overrides
src/lib/solver/geometry.ts          box positions for the 3D/top views
src/lib/state/                      app state, persistence, import/export, share links
src/lib/i18n/                       de / en dictionaries
src/components/                     UI
```

### How the solver works

A level is filled with *columns*: a strip of one box type in one orientation, `rows` deep and
`stack` high. For every enabled box and both orientations the solver computes the column that fits
the level's depth (with the allowed overhang), height (minus top clearance) and access rules. The
width is then filled with an unbounded knapsack over those columns (exact, in mm), once for max
volume and once for max box count, and additionally restricted to one footprint, one box type and
"one column type repeated". The resulting candidates are combined into shelf-wide plans and ranked
by the chosen objective. A full shelf solves in ~10 ms.

## Data

Box dimensions and capacities come from
[“Industrial Storage Container Dimensions”](https://huggingface.co/datasets/danielrosehill/storage-container-dimensions)
by Daniel Rosehill, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
`src/lib/data/catalog.generated.ts` is produced by:

```bash
npm run import-data                     # downloads containers.csv from Hugging Face
npm run import-data -- path/to/file.csv # or from a local copy
```

Capacities are the dataset's conservative "typical" figures computed from internal dimensions;
vendors' nominal litres are often 5–10 % higher.

See [BACKLOG.md](BACKLOG.md) for what is planned next.

## License

Code: [MIT](LICENSE). Box data: CC BY 4.0, see [Data](#data).

The privacy notice (`#datenschutz`) and Impressum (`#impressum`) read their details from
`src/lib/legal.ts`. The Impressum link only appears once address and email are filled in; set
`analytics: true` there when Cloudflare Web Analytics is enabled.

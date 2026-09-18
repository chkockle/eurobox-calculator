# Backlog

Ideas and follow-ups that are deliberately not in v1, roughly in priority order.

## Planned

- **Reverse mode — "where should my boards go?"**
  For shelves with adjustable boards (most Steckregale): the user picks the boxes they want
  (or a target like "3 levels of 60×40×32, 1 level of 40×30×22") and the calculator suggests
  board positions. Needs the hole pitch / adjustment step of the uprights as an input, the total
  height, number of boards and board thickness. Solve as: choose level heights (multiples of the
  pitch) that maximise the objective, then run the existing level solver per level.

- **Purchase comparison ("volume price")** — as in the original storage-container-calculator:
  build two or more baskets (e.g. different shops / box ranges), rank them by price per usable
  litre (with per m³ alongside). v1 already ranks layouts by price per litre for one price list;
  this adds several price lists / shops side by side. One comparison = one currency, no FX.

- **Sections within one board** — split a single board (without a middle upright) into sections,
  e.g. left 60 cm small boxes for screws, right large boxes. Bays can already be configured
  separately ("Configure bays separately"); this would add the same inside one bay.

- **Inventory: boxes I already own** — quantities per box type; plans use owned boxes first and the
  shopping list only shows what is missing.

## Ideas

- Mixed-height stacks (e.g. 32 + 17 cm in one stack) and mixed depths within one column
  (a 40 cm box in front of a 20 cm box on a 60 cm board).
- Per-box weight when full (instead of one kg/L value), box tare weight, and the boxes' own
  stacking load limits.
- More shelf presets (IKEA IVAR / BROR, common Schulte / Tarifold Steckregale, Kallax-style cubes),
  ideally with measured clear dimensions from users.
- Manufacturer profiles for box ranges (e.g. exact outer dimensions of a specific brand) as
  optional overrides on top of the nominal catalogue.
- Manual editing directly in the 3D view (drag boxes, swap a single box).
- Export the front view as SVG/PNG, nicer printable A4 sheet.
- Share links get long for big projects — optionally shorten by dropping solver-irrelevant data.
- Offline support (PWA) so it works in the basement next to the shelf.
- Inch units for non-metric users.
- Compact header on phones.

# Location Navigation certification — section 2 (reopened)

**Status:** Material visual re-implementation complete — awaiting product approval.  
**Header:** Frozen.  
**Comparison:** [`location-nav-visual-comparison.md`](./location-nav-visual-comparison.md)

## Material visual changes (this pass)

| Area | Before (rejected) | After |
| --- | --- | --- |
| Proportion | 256px filter queue | **328px** (`20.5rem`) collection column |
| Header | Uppercase queue label + checkbox | Sentence-case **Locations** title, **+ Add location**, count under title |
| Controls | Search alone; Inactive checkbox in header | Search + filter **icon button** row |
| Rows | Compact title + one subtitle string | Glyph · name · locality · status pill · attention |
| Selected | Soft tinted list item | Pine **border + wash + inset + chevron** |
| Density | Queue-chip height | ~65px identity rows |

## Screenshots

- Before: `screenshots/nav-before.png`
- After (rail): `screenshots/nav-after.png`
- After 1440 viewport: `screenshots/nav-after-1440.png`
- After 1280 viewport: `screenshots/nav-after-1280.png` + `nav-after-1280-rail.png`

## Live metrics

- Rail width: **328px**; overflow-x: **false**; search contained: **true**
- Selected row height: **~65px**
- Glyph, status pill, Add, filter icon: present

## Final row-information rule

1. Name  
2. Locality / short place line (when available)  
3. Active / Inactive status pill  
4. One operational signal — attention when Fix items exist  

Never readiness %. No fabricated photos (MapPin glyph tile instead).

## Out of scope

Header, Overview, Programs, Rooms, Schedule, Tours, Placement, Access.

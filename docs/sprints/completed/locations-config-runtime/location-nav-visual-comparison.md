# Location Navigation — mock / current / proposed

**Status:** Comparison locked before material visual re-implementation.
**Scope:** Location Navigation rail only.

## Side-by-side

| | Directional mock | Current (rejected) | Proposed Alloy translation |
| --- | --- | --- | --- |
| **Proportion** | Wide collection panel | 256px filter queue | **~20.5rem (328px)** collection column; width recovered from detail |
| **Header** | Bold “Locations” + green Add | Tiny uppercase label + whisper Add + Inactive checkbox | **Sentence-case collection title**, compact **+ Add location** beside it, count under title; Inactive leaves the title row |
| **Search/filter** | Search + filter icon button in one row | Search alone; checkbox up in header | **One control row:** search field (with icon) + **filter icon toggle** for Inactive |
| **Row anatomy** | Thumb · name · address · status pill · chevron | Title · single subtitle string | **Glyph tile · name · locality · status pill · one attention signal**; no photos (none exist) |
| **Row height** | Tall identity cards | Compact queue chips | **Medium-tall** (~64–72px) with clear vertical hierarchy |
| **Selected** | Full green outline + fill + chevron | Soft wash + thin inset bar | **2px Bend-Pine border + stronger wash + inset bar + chevron**; unmistakable object selection |
| **Signal** | Status pill primary | Attention/locality collapsed into one line | **Status always**; attention only when Fix exists; **no readiness %** |

## Visible differences we will implement

1. Wider rail — obvious column proportion change vs detail workspace.
2. Collection header that reads as a workspace, not a queue section label.
3. Add Location obvious in the collection chrome.
4. Search + filter icon as a composed control row.
5. Rows with glyph, name, locality, status pill (and attention when present).
6. Selected row as a bordered object card, not a tinted list item.
7. Taller row density so place identity has room.

## Explicit non-goals

- No fabricated photos
- No “View all locations” footer
- No header / Overview / other tab changes
- No readiness percentages in rows

## Reference images

- Mock: project assets directional Locations nav mock
- Current before: `screenshots/nav-before.png` / prior `nav-after.png` (compact queue)

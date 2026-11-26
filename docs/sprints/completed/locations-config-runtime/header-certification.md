# Locations header certification — section 1

**Status:** Approved and frozen. Do not revisit unless a later certified section exposes a true architectural conflict.
**Sources:** Jul 16 North Campus directional mock + [`configuration-workspace-visual-language.md`](../../../platform/operator/configuration-workspace-visual-language.md).
**Note:** A separate comparison document was not available in the workspace at plan time.

## Critique — why the mock feels premium

- One loud signal: location name is the page title.
- Ownership path is quiet (`Settings > Locations`), not a second product title.
- Status pill sits beside the name as confirmation.
- Locality + timezone sit under the name in muted meta type with light place/time glyphs.
- Primary Edit lives with identity on the header right.
- Tabs name owned concerns under a hairline.

## Critique — why the previous header felt unfinished

- Dual titles: shell “Locations” competed with the location hero.
- `Organization · Location · This location` was control language above the hero, not an ownership breadcrumb.
- Edit lived primarily on the Actions rail, so the header read as a label block.
- Facts were a plain joined string without place-like meta weight.
- Scope chrome + tight hero padding made the band feel stacked rather than one composition.

## Alloy translation decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Sole hero title | Location name is the only H1 when a location is selected; hide competing `ConfigurationContext` title bar in that mode | Object-shape: answer “what am I configuring?” in one beat |
| Fleet title | Keep `ConfigurationContext` “Locations” + MapPin on organization/fleet landing | Product title remains when no object is selected |
| Breadcrumb | `Locations › {displayName}` inside `ConfigObjectHeader`; `Locations` returns to fleet | Ownership path in business language; replaces selected-location `ConfigScopeContextBar` |
| Scope bar | Still used on fleet (no selected location) | Fleet still needs org/all-locations scope language |
| Status | Unchanged Active/Inactive pill beside name | Already matches doctrine |
| Identity facts | Same data from `buildLocationIdentityFacts`; rendered with MapPin / Clock glyphs | Place-like meta without inventing fields |
| Primary Edit | “Edit location” in header `actions` (`locations-edit-location`) | Doctrine: primary action beside identity |
| Rail Edit | Removed duplicate “Edit location” from overview/tours/access rail groups | Header owns primary edit; rail keeps Fix/Next/Apply/More |
| Overflow | Not added | No existing secondary header menu to promote |
| Tabs | Same set/labels/behavior; hairline under identity block | Owned concerns only; spacing for one header unit |
| Body | Untouched | Certification methodology: one section at a time |

## Screenshots

- Before: `screenshots/header-before.png`
- After: `screenshots/header-after.png`

# Data Model Workspace + Configured Field Availability

**Sprint:** July 2026  
**Branches:** `feat/fields-registry-audit-wt-p2os` → staging; finish pass `feat/data-model-finish-pass`

## Workspace UX model

Settings → **Data Model** at **`/settings/fields`** (`?entity=&tab=`) is a single calm workspace. `/settings/data-model` redirects to `/settings/fields`.

| Area | Behavior |
| --- | --- |
| Entity rail | Child, Person, Family, Lead / Enrollment, Location + Manage Entities |
| Entity header | Compact identity, Lucide icon, grain badge, compressed stats, View Usage, Add menu |
| Tabs (same shell) | Overview · Relationships · Fields · Computed Signals |
| Field detail | Overlay drawer on click only — no persistent inspector |

Built on the canonical field platform stack (catalog → resolver → capability → builders).

## Entity / relationship model

- **Entities** are operator-facing hub grains (Child merges `customer_member` + `inquiry_child` API types).
- **Relationships** catalog (`entityRelationshipCatalog.ts`) documents how entities connect.
- **Person roles** (parent, guardian, emergency, billing) are roles on Person — not separate entities.

Relationship vocabulary can be created in-workspace via **Add Relationship** (family roles + person relationship types). Full table management remains in Settings → Relationships.

## Context-aware availability rules

Surfaces declare context (`child`, `lead_with_child`, `family_with_children`, etc.).

A field is available when:

1. Field exists in registry/catalog  
2. Entity is reachable from context  
3. Resolver exists  
4. Renderer exists  
5. Builder supports placement  
6. Publish validation allows  
7. Runtime can hydrate data  

**Queue rows stay stricter** — validator allow-list only.

**Focus panels, drawers, forms, business processes, documents** use richer context via `availability_context` on resolver input and `hub_entity` in Settings availability display.

## Configured field availability rule

Configured/custom fields must be trustworthy:

- If a field is active in `field_definitions`, availability is derived — not hand-hidden from builders.
- If unavailable, Settings shows **why** (capability engine layer reason).
- Business Process requirements accept configured fields via `resolveRuleIdForCanonicalRef()` → `custom:{entity}:{field_key}` when no static binding exists.

## Gender proof case

| Surface | Status | Reason |
| --- | --- | --- |
| Forms | Available | Registry + Forms picker grain |
| Drawers | Available | Layout runtime + child profile resolver |
| Focus Panel | Available | Child profile field + `lead_with_child` context |
| Business Processes | Available | Canonical rule mapping for configured fields |
| Queue Rows | Unavailable | Not on queue hydration validator allow-list |

Not hardcoded — general model for `customer_member` profile resolution fields.

## Business Process integration

- `resolveBusinessProcess()` supports any active registry field with a canonical rule id (bound or `custom:*`).
- Lifecycle palette uses `fieldRegistryReferenceMatrix` — no parallel process field list.
- Operators can use configured fields (e.g. Potty Trained) in stage requirements when child/lead context applies.

## Finish Pass

Visual + platform completion pass after architecture landed on staging. No stack changes.

### Visual polish decisions

- **Compact header** — Platform Configuration eyebrow + short subtitle; removed tall trust callout so Overview cards are above the fold.
- **Bend Pine accents** — selected rail, tabs, CTAs, and available badges use `alloy-bend-pine` (not legacy `alloy-pine` Midnight Forge).
- **Lucide icon language** — entity rail, overview usage/available tiles, relationships; no emoji.
- **Entity rail** — Configuration Mode selected treatment (`inset` Bend Pine rail + soft fill); Manage Entities is secondary.
- **Overview cards** — Processing / Surface Builder card rhythm: soft borders, subdued shadows, hierarchical relationship/field previews with `+N` overflow.
- **Computed Signals** — Runtime vs Future grouping with subtle status chips.
- **Used Throughout / Available In** — icon tiles with honest Future state for Reports.

### Platform completion in this pass

1. **Add Relationship** — real in-workspace modal posting to family-role or person-relationship APIs (no route away).
2. **Focus Panel builder badges** — library + field inspector use capability engine via `focusPanelFieldAvailability.ts`.
3. **Usage** — remains on Overview (no separate Usage tab).

### Remaining intentional limitations

1. **Reports builder** — Future in Available In; not fake-available.
2. **Queue hydration for child profile values** — validator-gated by design; do not broaden Queue Rows.
3. **Live usage analytics** — Overview tiles use orientation hints, not instrumented counts.
4. **Computed signal authoring** — platform-defined; Add Computed Signal stays disabled.
5. **Relationship catalog cards** — informational model; creating vocabulary updates Settings → Relationships APIs, not the static overview catalog until refresh/reseed.

### Future enhancements

- Instrument real surface usage counts for Used Throughout.
- Deep-link Overview relationship cards into live family/person relationship rows.
- Expand Focus Panel concept → registry refKey coverage for more library items.
- Optional dedicated Usage analytics surface if instrumentation justifies it.

## Tests

```bash
cd web && npm run test -- tests/fields
cd web && npm run test -- tests/adminV2/focusPanelComposer.test.ts tests/adminV2/focusPanelDrillInComposer.test.ts
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

New: `tests/fields/dataModelFinishPass.test.ts`

Updated: Data Model workspace tests, Focus Panel builder availability wiring.

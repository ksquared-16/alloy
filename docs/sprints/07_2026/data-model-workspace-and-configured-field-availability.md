# Data Model Workspace + Configured Field Availability

**Sprint:** July 2026  
**Branch:** `feat/fields-registry-audit-wt-p2os`

## Workspace UX model

Settings → **Data Model** at **`/settings/fields`** (`?entity=&tab=`) is a single calm workspace. `/settings/data-model` redirects to `/settings/fields`.

| Area | Behavior |
| --- | --- |
| Entity rail | Child, Person, Family, Lead / Enrollment, Location + Manage Entities |
| Entity header | Breadcrumb, icon, grain badge, stats, View Usage, Add menu |
| Tabs (same shell) | Overview · Relationships · Fields · Computed Signals |
| Field detail | Overlay drawer on click only — no persistent inspector |

Built on the canonical field platform stack (catalog → resolver → capability → builders).

## Entity / relationship model

- **Entities** are operator-facing hub grains (Child merges `customer_member` + `inquiry_child` API types).
- **Relationships** catalog (`entityRelationshipCatalog.ts`) documents how entities connect.
- **Person roles** (parent, guardian, emergency, billing) are roles on Person — not separate entities.

Relationship authoring vocabulary remains in Settings → Relationships; the workspace surfaces and links to it.

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

## Remaining gaps

1. **Relationship Add flow** — placeholder in workspace; full authoring still in Relationships settings.
2. **Usage tab** — summarized on Overview; dedicated Usage tab optional later.
3. **Reports builder** — marked Future in Available In card.
4. **Queue hydration for child profile values** — still validator-gated; intentional strictness.
5. **Focus Panel builder inspector badges** — Settings/Data Model shows them; builder UI parity pending.

## Tests

```bash
cd web && npm run test -- tests/fields
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

New: `tests/fields/dataModelWorkspace.test.ts`

Updated: gender context availability, BP configured field support.

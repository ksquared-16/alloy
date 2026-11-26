---
owner: operator
status: canonical
last_reviewed: 2026-07-15
supersedes: [./identity-surface-composition.md]
---

# Identity Surface Doctrine — Canonical Disclosure Model

**Status:** Active — July 2026  
**Scope:** One identity interaction model for every identity entity in Alloy (runtime and Surface Builder)  
**Does not change:** Current Work, Capability Registry execution, Process Runtime, entity/relationship truth

---

## North star

> Runtime disclosure has four layers, but configuration has three field purposes plus evidence collections. **Summary does not feed Context; Details inherits Context Facts plus Detail Fields.**

Every identity follows the same grammar: Household, Parent, Guardian, Child, Employee, Additional Contact, Emergency Contact, Vendor, and future identity types.

**Builder must mirror runtime cognition.** The administrator learns the same hierarchy the operator experiences.

---

## 1. Runtime layers (operator experience)

Identity information progressively discloses through four **runtime layers**:

```
Summary → Context → Details → Evidence
```

These are information layers, not UI widgets.

| Layer | Question | Purpose |
| --- | --- | --- |
| **Summary** | Who is this? | Recognition — avatar, name, phone, badge |
| **Context** | What else belongs here? | Collection view — **Context Facts only** (shortened Details projection) |
| **Details** | Tell me more about **this** person? | **Context Facts + Detail Fields** after selecting one identity |
| **Evidence** | Show me supporting proof? | Collection-oriented proof (documents, forms, …) |

Runtime flow:

```
Summary → View Collection → Select Identity → Details → Evidence
```

Do **not** jump directly from collection to inspection.

---

## 2. Configuration purposes (administrator buckets)

Administrators configure **three field purposes** plus evidence collections:

```
Summary Fields → Context Facts → Detail Fields → Evidence Collections
```

**Context Facts are the Collection projection; Summary is independent.**

```
Context (runtime) = Context Facts only
Details (runtime) = Context Facts + Detail Fields
```

### Summary Fields

Recognition only. Lightweight. No inspection-level information.

### Context Facts

Operational facts for the collection view — teacher, program, room, rate, etc.

The **same field may appear in Summary and Context Facts** with different policy, label, or layout. Summary does **not** automatically merge into Context at runtime.

### Detail Fields

Inspect one identity after selection — address, employer, notes, secondary phone, etc.

Detail fields must **never** appear in Context unless explicitly configured as Context Facts (discouraged for inspection-level data).

### Evidence Collections

Collection-oriented — documents, health forms, licenses, immunizations, authorizations. **Not** a generic field-placement bucket.

---

## 3. Configuration shape

Persisted on `NestedSurfaceGroupConfig` (no parallel format):

| Purpose | Persistence | Placement tier |
| --- | --- | --- |
| Summary Fields | `selectedFieldKeys` | `summary` |
| Context Facts | `contextFieldKeys` | `context_fact` (legacy tier `context` adapts on read) |
| Detail Fields | `expandedFieldKeys` | `details` (legacy tier `expanded` adapts on read) |
| Evidence Collections | `evidenceCollections` | collection config |

Conceptual section shape:

```ts
type IdentitySectionConfig = {
  summary: { fields: IdentityFieldPlacement[] };
  context: { facts: IdentityFieldPlacement[] };  // incremental only
  details: { fields: IdentityFieldPlacement[] };
  evidence: { collections: IdentityEvidenceCollectionConfig[] };
};
```

Shared VM invariant:

```ts
contextRows = contextFactRows; // Summary does not merge into Context
```

- Stable order: summary first, then incremental facts  
- Deduplicate by field ref; **summary placement wins**

---

## 4. Runtime examples

### Household Summary

```
Jordan Johnson · Phone · Email
Taylor Johnson · Phone · Email
2 children
```

### View Household / Context

```
Jordan Johnson · Phone · Email · (+ configured context facts)
Taylor Johnson · Phone · Email
Children · Emergency Contacts · Additional Contacts
```

Summary information appears automatically — no duplicate configuration.

### Parent Details

```
Address · Employer · Language · Notes
```

### Children Context

```
Name · DOB/Age · Schedule · Teacher · Program · Room · Rate
         ↑ summary only                     ↑ context facts only
```

---

## 5. Builder interaction

Progressive drill — **not** four unrelated top-level tabs:

```
Identity Surface → Summary Fields → Context Facts → Detail Fields → Evidence Collections
```

For collection surfaces:

```
Household → Summary → Primary Contact → Configure Summary
Back → Context Facts → Primary Contact → Configure incremental facts
Back → Detail Fields → …
Back → Evidence Collections → …
```

### Context Facts editor

Must show:

1. **Inherited from Summary** (read-only) — cannot remove from Context here; remove from Summary to remove from Context  
2. **Context Facts** (editable) — add only incremental facts  
3. **Context Preview** — Context Facts only (representative labels, never raw field keys)

---

## 6. Boundaries

### Evidence

Collection reference, ordering, display mode, empty state. Not another field grid.

### Capabilities

Identity config controls **placement** only. Capability Registry owns execution, permissions, and handlers. Do not mix capabilities into field lists.

---

## 7. Compatibility

| Legacy | Canonical |
| --- | --- |
| `selectedFieldKeys` | Summary Fields |
| `contextFieldKeys` | Context Facts (summary duplicates stripped on reconcile) |
| `expandedFieldKeys` | Detail Fields |
| placement tier `context` | `context_fact` |
| placement tier `expanded` | `details` |

Existing published configs continue to load. Reconcile adapts tiers and strips duplicate context facts.

---

## 8. Wireframes

### Builder — Context Facts

```
┌ Context Facts — Primary Contact ────────────┐
│ Context includes Summary automatically.      │
│                                              │
│ Inherited from Summary (read-only)           │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│   Name · Phone · Email                       │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                              │
│ Context Facts                    [+ Add fact]│
│   Teacher · Room                             │
│                                              │
│ Context Preview                              │
│   Name · Phone · Email · Teacher · Room      │
└──────────────────────────────────────────────┘
```

---

## 9. Code map

| Layer | Path |
| --- | --- |
| Doctrine | `docs/platform/operator/identity-surface-composition-v2.md` |
| Context composition | `web/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows.ts` |
| Layer types | `web/lib/adminV2/settings/surfaces/identityDisclosureLayers.ts` |
| VM projection | `web/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM.ts` |
| Builder drill-in | `web/components/adminV2/settings/surfaces/composer/IdentityBuilderDrillIn.tsx` |
| Context Facts panel | `web/components/adminV2/settings/surfaces/composer/IdentityContextFactsPanel.tsx` |
| Published config resolver | `web/lib/adminV2/runtime/focusPanel/identity/resolvePublishedIdentitySurfaceConfig.ts` |
| Compatibility adapters | `web/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat.ts` |
| Tests | `web/tests/adminV2/runtime/publishedIdentitySurfaceParity.test.ts`, `identityBuilderRuntimeParity.test.ts` |

---

## 10. Remaining gaps

| Gap | Notes |
| --- | --- |
| Card disclosure state machine | Wire Household/Children local expanded/focus to `IdentityDisclosureDepth` |
| Evidence collection builder | Minimal UI; types persisted |
| Nested identity builder drill | `nested-purpose` frames defined; full collection-surface drill pending |
| Builder/runtime parity fixture | **Done** — `publishedIdentitySurfaceParity.test.ts` |
| `insightTemplate` on summary/context | Type hook reserved; not yet implemented |

---

## 11. Published configuration resolution (Builder ↔ runtime parity)

**Invariant:** Builder **Published / Live** preview and `/work-unit` runtime must project through one canonical path:

```
published Focus Panel surface document
  → resolvePublishedIdentitySurfaceConfigFromDoc
  → reconcileIdentityNestedConfigFromDocMetadata
  → shared Identity VM (buildHouseholdCardEvidence / buildChildIdentityRecordVM)
```

Publish serializes identity surfaces through `serializeIdentityNestedSurfacesForPublish`, which:

- writes only canonical keys (`household_surface`, `children_surface`);
- omits legacy adapter keys (`household_contact_surface`, `child_surface`);
- preserves operator-authored `fieldPlacements` (row/column/width pairings).

### Precedence

| Source | When it applies |
| --- | --- |
| Explicit canonical published group config | Always wins when present |
| Legacy compatible published config | Adapter input only when canonical config is absent |
| Platform/default seed | Fallback only when no explicit published config exists |

### Explicit empty vs undefined

| Value | Meaning |
| --- | --- |
| `undefined` | Tier not authored — platform fallback may apply |
| `[]` | Explicitly empty — no fallback fields injected |

Applies to `selectedFieldKeys`, `contextFieldKeys`, `expandedFieldKeys`, `evidenceCollections`, and `fieldPlacements`.

### Canonical surface and group keys

| Surface | Canonical key | Legacy adapter key (read-only migration) |
| --- | --- | --- |
| Household | `household_surface` | `household_contact_surface` |
| Children | `children_surface` | `child_surface` |

Household relationship sections: `primary_contact`, `other_parent_guardian`, `household_members`, `emergency_contacts`, `children`, `billing_contact`, `authorized_pickups`. Children roster: `roster`, `medical`, etc.

### Builder preview modes

| Mode | Config source |
| --- | --- |
| Working Copy (Configure) | Composer session `configFor(surfaceId)` |
| Published / Live (Preview) | `readHouseholdNestedConfigFromDoc` / `readChildrenNestedConfigFromDoc` |

Representative Johnson data in Builder preview may differ from Kurzman runtime records; layout semantics (field selection, tier, order, pairing, labels, icons, policies) must match.

### Post-publish refresh

`usePublishedFocusPanelSummaryDoc` caches the published summary document per org/location. Publishing dispatches `FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT` to invalidate the cache in-tab so `/work-unit` recomposes against the latest revision.

---

## 12. QA refinement — tier policy, role configuration, layout, drill, placement

### Tier-specific field policy

Field policy identity is **`surface + group + field + tier`**. Summary, Context Facts, and Detail Fields each store independent `placement.policy` values. Legacy `fieldPolicies[fieldRef]` remains a read fallback when no tier-specific placement policy exists.

### Role-based Household configuration

Parent / Guardian defaults live on the **`contact_edit`** template group (Builder label: **Parent / Guardian**). Runtime sections **`primary_contact`** and **`other_parent_guardian`** inherit that template unless `roleOverride: true` on the runtime section.

Representative Johnson/Taylor preview rows are **not** configuration identity — Builder drill targets semantic roles/sections.

### Section labels

Operators may set `sectionLabel` on a group (e.g. rename **Other Parent / Guardian** → **Secondary Parent**). Runtime and Builder use `nestedGroupLabel()`; internal `groupKey` values never surface.

### Relationship section precedence

Household contact bucketing assigns each person to the highest-priority semantic section once: `primary_contact → other_parent_guardian → emergency_contact → additional_contact`. Duplicates are suppressed by `person_id`.

### Third-width field layout

Identity field rows support **`full` | `half` | `third`** semantic widths (max three fields per row). Builder drag/drop and runtime `IdentityFieldGrid` share the same chunking resolver.

### Direct identity drill

Selecting an identity from Context (`select_identity`) opens **Details** for that exact record id immediately. Household child clicks hand off to the Children card via `requestFocus("children", childId)`.

### Builder/runtime card placement parity

Focus Panel composer grid areas in the same column normalize into a vertical stack via `normalizeGridColumnStacking` — overlap is not required to express order. Builder and `/work-unit` both consume the same published grid coordinates.

---

## 13. Final QA cleanup — canonical catalog, relationship sections, composer state

### Canonical Configuration Fields catalog

Identity field pickers consume `filterCanonicalDataProviders({ consumer: "focus_panel" })` grouped by Configuration category metadata (`categoryKey` → `platformCategoryLabel`). Derived display fields (`child.name`, etc.) are excluded from selectable options.

### Explicit empty vs default seed

- `expandedFieldKeys: undefined` — tier not explicitly authored on that group; when Parent / Guardian template is present, inherited parent sections leave Details empty rather than absorbing primary_contact seed.
- `expandedFieldKeys: []` — intentionally empty; reconcile must preserve `[]` (never treat as falsy).

### Composer state invariants

Configure mode uses configured tier keys only — no record-VM fallback rows after removal. Read/write both reconcile through `reconcileIdentityNestedConfig` for household/children surfaces.

### Configurable relationship sections

Household sections carry optional `relationshipCriteria`, `sectionVisibility`, and `sectionOrder`. Runtime assigns each person to the highest-precedence matching section once (`identityRelationshipSections.ts`).

### Children handoff

Household Builder **Children** navigates to the canonical **Children** surface configuration. Child Summary/Context/Details/Evidence remain owned by `children_surface`.

### Lifecycle stage/status boundary

Stage/status fields appear in pickers only when registered canonical providers exist; calculated lifecycle projections are read-only. Process stage is not invented as an editable child attribute in this pass.

### Composer containment and opaque drill-in

Shared compose shell uses flex/min-height scroll ownership; categorized field picker popovers portal to `document.body`. Drill-in depth uses a **fully opaque** Alloy surface background on the elevated card, body, footer, and compose canvas (no canvas bleed-through). Relationship section management is collapsible and orthogonal to section-tab field authoring.

---

## 14. Focus Panel Builder final architecture

### Builder convergence model

```
Relationship Sections → Canonical Fields → Disclosure Layers → Runtime
```

The Focus Panel Builder does not own field definitions. It consumes the Configuration Fields catalog (`focus_panel` consumer), filters by namespace, groups by configured category metadata, and authors disclosure placement and policy.

### Relationship sections

Each Household relationship section configures:

- **label** — operator-facing section title
- **relationshipCriteria** — role/type matching for contact assignment
- **visibility** — `always` | `when_nonempty` | `hidden`
- **order** — persisted on nested surface group sequence
- **presentation** — Parent / Guardian template (`contact_edit`) applies to Primary and Other Parent unless `roleOverride`

Runtime resolves contacts into the highest-priority matching section once. Children remains a handoff to the canonical Children surface — child Summary/Context/Details/Evidence are not duplicated in Household.

### Canonical field consumption readiness

When Canonical Field Consumer Convergence lands, new fields registered in Configuration → Fields appear in Focus Panel pickers automatically via `filterCanonicalDataProviders`. Focus Panel adds no parallel labels, categories, or ownership metadata.

### Disclosure authoring

Every relationship section supports independent Summary, Context, Details, and Evidence Collections configuration.

- **One visual composer** authors Summary / Context / Details on the canvas.
- **Context** is an explicit presentation list (`contextFieldKeys`) — inheritance is not Builder UX.
- **Evidence** uses the collection editor only.
- Raw canonical refs never render in Builder UI.

### Placement parity

Builder grid placement and runtime card placement share `focusPanelGridLayoutOps` and `focusPanelPublishedLayout`. Same-column cards stack vertically in both surfaces.

### Remaining consumer-only gaps

- Canonical Field Consumer Convergence integration (automatic when convergence lands)
- Future UX polish (nested-purpose drill frames, insight templates)


---

## 15. Relationship section definitions and instances

Prior completion claims that only edited metadata on fixed groups were incorrect. The Builder now supports **+ Add section** via canonical relationship-section definitions and tenant section instances.

Definitions own capability metadata; instances own label, criteria, visibility, order, and presentation reference. Field options inside a section remain a Canonical Field Platform consumer concern — not duplicated here.

Children section handoff to `children_surface` is explicit in the Builder inspector; child field ownership is not duplicated in Household.

---

## 16. Relationship-section UX cleanup

Final Focus Panel Builder polish (July 2026):

- Optional/default sections (including Additional Contacts) soft-delete and stay deleted across save/reload.
- Collapsible Relationship Sections management (UI-only collapse state).
- Disclosure purposes use section tabs for field authoring; Children tab offers Configure Children surface handoff.
- Parent / Guardian shared template; Other Parent override tab only when `roleOverride` is enabled.
- Opaque elevated drill-in surface with one internal scroll owner.

---

## 17. Composer convergence

Final cleanup removes the duplicate flat field-layout editor from identity Builder. Canvas-owned green `NestedSurfaceFieldLayoutSurface` is the only Summary/Context/Details authoring UI. Inspector retains purpose navigation, relationship-section management, and section metadata.


## Configuration vs runtime navigation (final product shape)

**Configuration purposes** (Builder): Summary Fields · Context Facts · Detail Fields · Evidence Collections.

**Runtime interaction** (operator):

```text
Summary card
→ Collection view (Summary fields + configured Context Facts per section)
→ Selected identity Details
→ Evidence
```

Context Facts remain a configuration layer that enrich the collection presentation.
They are **not** a separately named mandatory runtime screen. When a section has no
Context Facts, collection rows may equal Summary for that section — do not add a
redundant click.

### Direct summary navigation

Household Summary is a navigation hub:

- Parent / Guardian identity → that person's Details
- Children section → Children card handoff
- Specific child (when shown) → that child's Details on Children
- Emergency (and other) section tiles → Household collection focused on that section
- Specific emergency contact → that contact's Details
- `View Household` → full Household collection

Back navigation stays deterministic: Evidence → Details → Collection → Summary.

### Semantic avatars

Avatar color conveys identity **type/role** via Alloy tokens (Primary = Alloy blue,
Other Parent = Bend Pine, contacts = neutral, children = deterministic id palette).
Never gender. Badges convey Primary / Parent / Enrolling / status.

### Collection vs person Details

Collection shows every configured relationship section with effective collection
presentation (Context Facts on Collection; Context Facts + Detail Fields on Details). Detail Fields appear only after an identity
is selected.


## Collection focus and published field authority

Collection depth (`context`) uses the same centered elevated Focus Card surface as
Details and Evidence — not an in-column narrow expand.

Published Parent / Guardian (`contact_edit`) tier keys are authoritative for Primary
and Other Parent runtime sections when `roleOverride` is unset:

- explicit keys (including `[]`) replace platform seed entirely
- when the Parent / Guardian template exists, an `undefined` tier means that tier is
  unset on the role — runtime does **not** inherit `primary_contact` seed pollution
  (for example DOB / legacy `person.address_line`)
- address aliases (`person.address_line`, `contact.address_line1`, …) normalize to
  canonical Field Platform refs before projection; duplicate aliases collapse by
  canonical identity, not by label
- Builder published preview and work-unit runtime project through the same Household
  VM builder (`buildHouseholdIdentityCardVM` + role merge)
- Collection is the Context projection (no mandatory separate Context screen label)


## Disclosure-tier field policy (Focus Panel)

Field **policy belongs to the placement at that disclosure tier** on the presentation group
(`primary_contact`, `other_parent_guardian`, …). Mutation capability on `contact_edit` /
`child_edit` does not make Summary or Context cells editable when that tier is read-only.

Runtime resolves policy in order: tier placement policy → group `fieldPolicies` → read-only
for presentation groups. `editGroupKey` still binds save support (`CONTACT_EDIT_FIELD_MAP`)
but must not leak default `editable` from the edit surface.

## Inline editing by disclosure tier (Household + Children)

Editable policy is **per tier**, not global to the card:

- **Collection (`context`)** — Context Facts only. Inline Edit works when those
  tiers are editable under published policy. Detail Fields do not appear until an identity
  is selected.
- **Details (after drill)** — Detail-tier fields render with the same inline grammar. Save
  commits through canonical mutation bindings (`savePersonContact` for household contacts;
  `saveInquiryChild` for child roster fields).

Collection rows expose a persistent **Details →** control (not hover-only) beside the name
when identities are selectable. Field-level **Edit** stays quiet but discoverable at rest
(~55% opacity, full opacity on hover/focus) so touch and keyboard paths work without
hover-only discovery.

Summary scan stays read-only by default when all visible Summary cells are read-only.
Person-level Edit remains for complex `contact_edit` / `ChildFocusEdit` when inline save
is unsupported.

## Atomic vs derived name fields

`person.first_name` and `person.last_name` are distinct atomic fields. `person.primary_contact_name`
/ Full Name is derived display-only and must not collapse first/last in role merge dedupe.

## Focus Panel QA corrections (label, context, full name, Primary badge)

- **Label visibility:** Builder `fieldModes[fieldKey].showLabel === false` is authoritative for runtime when `placement.labelMode` is unset. The write path mirrors `showLabel` into every matching `fieldPlacements[].labelMode` (`hidden` / `visible`). Published configs without `labelMode` still honor `showLabel` via the runtime bridge in `buildRecordRows` and placement seeding / role merge (`buildAuthoritativePlacements`).
- **Same field in Summary and Context Facts:** Each tier keeps its own placement, policy, and label. Runtime Context (`contextRows`) shows Context Facts only; Summary does not merge in.
- **Full Name:** `person.full_name` / `contact.full_name` are **computed** from first + last (or evidence `name` fallback for persons). They are display-only — not mutation-supported and not aliased to atomic first/last keys. `person.primary_contact_name` remains the evidence display name.
- **Primary relationship badge:** Relationship pill text `Primary` (case-insensitive) uses Bend Pine (`alloy-os-card-pill--positive`). Other roles (e.g. Guardian) stay on the neutral pill wash.


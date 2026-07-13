---
owner: operator
status: canonical
last_reviewed: 2026-07-13
---

# Focus Panel Builder

**Status:** Feature-complete architecture — July 2026  
**Scope:** Authoring Focus Panel identity surfaces (Household, Children) and card placement  
**Does not own:** Field definitions, entity truth, Current Work, Process Runtime

---

## Architecture

```
Relationship Sections
        ↓
Canonical Fields (Settings → Fields, focus_panel consumer)
        ↓
Disclosure Layers (Summary / Context Facts / Details / Evidence)
        ↓
Runtime (Identity Disclosure + Published Layout)
```

## Relationship sections

### Section definitions vs tenant instances

**Definitions** (`householdRelationshipSectionDefinitions.ts`) describe canonical platform capabilities: default label, presentation owner, default criteria, click behavior, and required/default/optional policy.

**Instances** (`householdRelationshipSectionInstances.ts`) are tenant-configured sections on one Household surface: stable `instanceKey`, `definitionKey`, label override, criteria, visibility, order, and `presentationRef` for field authoring.

Legacy fixed registry groups migrate into instances on reconcile — no manual rebuild required.

### Required / default / optional policy

| Policy | Examples | Remove? |
| --- | --- | --- |
| **required** | Primary Contact | No — always enabled on reconcile |
| **default** | Other Parent / Guardian, Children | Removable unless pinned as always-enabled (Children stays present as handoff when enabled) |
| **optional** | Additional Contacts, Emergency Contacts, Authorized Pickup, Billing, custom | Yes — soft-delete (`enabled: false`) honors explicit removal; reconcile must not re-enable |

`HOUSEHOLD_ALWAYS_ENABLED_KEYS` is only Primary Contact + Children. Additional Contacts must **not** be silently protected by its legacy `household_members` key.

Children remains a **presentation handoff** to `children_surface` — Household configures label/order/visibility only.

### Manage sections vs configure fields

These are orthogonal Builder concerns:

1. **Manage relationship sections** — collapsible `RelationshipSectionsPanel` (add / rename / reorder / delete / criteria / visibility). Collapse is UI-only session state — not published.
2. **Configure selected section fields** — purpose nav (Summary / Context Facts / Detail Fields / Evidence) + compact **section tabs** generated from configured instances.

Do not keep the full management list open while authoring Context Facts or Detail Fields. Default: management collapsed when field-authoring is active; expandable via **Manage sections**.

### Parent / Guardian shared presentation

- One **Parent / Guardian** tab authors the shared `contact_edit` template.
- Primary Contact and Other Parent inherit it unless `roleOverride` is enabled on the Other Parent instance.
- Do not show a separate `Parent#2` tab by default; use configured labels (`Other Parent / Guardian` or tenant rename) only when override is on.

### + Add section workflow

Household Configure mode shows **Relationship Sections** with **+ Add section**. The picker lists addable definitions; selecting one creates/enables an instance, seeds criteria, and selects it for configuration.

Household sections are configurable relationship regions — not fixed Primary/Other/Additional buckets.

| Capability | Storage |
| --- | --- |
| Label | `sectionLabel` on group |
| Criteria | `relationshipCriteria.roleKeys` |
| Visibility | `sectionVisibility` |
| Order | `groups` array sequence |
| Field policy | Parent/Guardian template + tier placements |

Authoring UI: `IdentityRelationshipSectionInspector` in the identity Builder inspector.

Runtime: `identityRelationshipSections.ts` + `buildHouseholdCardEvidence.ts`.

## Canonical fields

Pickers use `identityPickerFieldCatalog.ts` — no Builder-owned field catalog. Focus Panel only filters, groups, hides, and presents.

## Disclosure layers

See [Identity Surface Doctrine](./identity-surface-composition-v2.md).

## Placement

Card grid placement in Builder equals runtime via shared published layout resolvers.

## Future work (not Builder architecture)

- Canonical Field Consumer Convergence — automatic field availability
- UX polish — nested-purpose drill, insight templates

## Drill-in surface

The shared elevated identity drill-in uses an opaque Alloy surface background on the card shell, body, footer, and compose canvas. Backdrop/scrim may dim the canvas outside the surface; underlying cards must not show through the composer.

## Canonical visual field composer

Disclosure field authoring uses **one** green visual composer (`NestedSurfaceFieldLayoutSurface` via `IdentityComposeSectionCanvas`) for:

- Summary Fields
- Context
- Detail Fields

Evidence uses the collection editor. The flat white `IdentityNestedFieldLayoutPanel` is not an active authoring path for identity surfaces — the inspector is metadata/navigation only; the canvas owns field layout.

### Context model

Builder Context is an **explicit** `contextFieldKeys` presentation list. Operators do not see “Inherited from Summary.” Runtime may still compose Summary+Facts as an implementation detail.

### Display labels

Canonical field refs never render raw (`contact.first_name`). Labels resolve through the presentation catalog adapter; unresolved refs show a humanized leaf label or `Unavailable field`.

### Opaque drill-in

Shared elevated identity drill-in is fully opaque; non-elevated cards are obscured during composer edit mode.


## Elevated compose containment and field picker

When a card is elevated for composition:

- Every nested composer layer uses a solid Alloy surface background (opaque).
- The active surface owns its stacking context; dimmed canvas content stays behind.
- Add Field pickers render in a body portal with collision-aware above/below
  placement, viewport-clamped max-height, and internal scroll — so cards near the
  bottom of the canvas do not clip the picker.

## Builder / runtime placement

Published Focus Panel layouts share one projection:

- same column · same order · same width · same vertical gap token (`--alloy-os-fp-gap-y`)
- same-column cards normalize into an ordered stack (column-range overlap aware)
- `/work-unit` Summary projects published grids as column lanes when partitionable
  so vertical rhythm matches content flow rather than empty CSS-grid tracks

Builder continues to author on the grid track model (76px); runtime Preview on
`/work-unit` uses the shared lanes resolver for flush stack parity.


## Household person edit and emergency contacts

- Collection/scan surfaces expose **one person-level Edit** affordance (not per-field Edit links).
- Edit presentation is driven by the Parent/Guardian `contact_edit` semantic map; the selected
  person supplies values and the mutation target only.
- Seed uses authoritative family-row truth with evidence channels as fallback; synthetic display
  ids (`primary`, `secondary:…`) are not editable.
- Save continues through `savePersonContact` → `patchLinkedPersonFromOpportunityDrawer` with truth refresh.

### Add Emergency Contact

Focus Panel opens the **identity-resolved one-surface** action (not the legacy four-step wizard):

```text
Enter identity → resolve candidates → confirm existing or create new → choose scope → save
```

Candidates come from the canonical intake record-resolution path. Scope labels use real child
names; Household invocation defaults to **All children**.


## Runtime collection focus

`View Household` / `View Children` elevate into the shared centered focus surface
(same primitive as selected-identity Details). Max width uses
`--alloy-os-focus-panel-max-width`.

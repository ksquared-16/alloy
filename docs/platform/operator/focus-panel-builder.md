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
| **required** | Primary Contact | No |
| **default** | Parents/Guardians, Children, Additional Contacts | Optional hide only |
| **optional** | Emergency Contacts, Authorized Pickup, Billing | Yes — via + Add section |

Children remains a **presentation handoff** to `children_surface` — Household configures label/order/visibility only.

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

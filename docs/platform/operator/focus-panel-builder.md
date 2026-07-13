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

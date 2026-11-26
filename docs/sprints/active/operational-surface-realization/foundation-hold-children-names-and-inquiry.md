# Foundation HOLD addendum — Children Names + Inquiry Participation (2026-07-24)

**Recommendation: HOLD** until authenticated browser re-proof.

## Failure 1 — Children Names not effective

### Stored keys
| Picker label | refKey |
|--|--|
| Children names | `children.names` |
| Children count | `children.count` |
| Children summary | `children.summary` |

### Root cause
1. **Builder Live Preview** set `row_count = 2` for groupCount but **did not seed `related_subjects_summary`**. CondensedQueueRow resolves names/count from related subjects — same as live. Preview therefore could not show names (and often fell back to count-looking empty/grouped heuristics).
2. **Distinct presentation modes** were not always persisted onto compact slots. Legacy keys share the `children` collection primitive; without attaching `collectionPresentation` per key (`list` / `count` / `summary`), modes could collapse toward a generic default.

### Fix
- Seed preview with Blake/Jarek sample subjects when any children collection field is configured.
- Always derive `collectionPresentationByFieldKey` from legacy key when mapping published/builder layouts.
- Library pick + inspector use `collectionPresentationForFieldKey` (names≠count≠summary).
- Summary format: `2 children · Blake Wenc, Jarek Wenc`.

## Failure 2 — Inquiry Participation excluded from Children identity Add Field

### Composer registry source
`groupDefsFor(children_surface)` → `acceptedNamespaces` was **only namespaces present on seed evidence items**. Identity seeds were all `namespace: "child"`, so `inquiry_child.*` was excluded from the identity picker even though /fields and placement had them.

### Why “Current Schedule” appeared
`CHILD_ENROLLMENT_PROJECTIONS` overrode inquiry participation labels to **Current Program / Current Room / Current Schedule / Enrollment Start Date** — synthetic presentation aliases of the same inquiry_child providers, not committed operational fields.

### Fix
- `acceptedNamespacesForNestedGroup`: children_surface / child_surface always include `child` + `inquiry_child` (and `opportunity` on readiness).
- Relabel projections to inquiry truth: Location, Program, Room, Schedule, Start date, Enrollment status (`projectionKind: inquiry_participation`).

## Synthetic alias inventory (post-fix)

| Label (old → new) | Provider | Truth |
|--|--|--|
| Current Location → Location | `inquiry_child.location_id` | Inquiry participation |
| Current Program → Program | `inquiry_child.program` | Inquiry participation |
| Current Room → Room | `inquiry_child.program_room_cohort_key` | Inquiry participation |
| Current Schedule → Schedule | `inquiry_child.schedule_type` | Inquiry participation |
| Enrollment Start Date → Start date | `inquiry_child.start_date` | Inquiry participation |

Committed “Current / Next” placement fields remain a separate future provider set — not these aliases.

## Browser
Authenticated QA still required (slot4 re-auth). Unit coverage proves preview + identity catalog.

## Commit
See git log on branch `agent/cursor/4-operational-surface-realization`.

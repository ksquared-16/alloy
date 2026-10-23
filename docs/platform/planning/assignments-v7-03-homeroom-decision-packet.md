---
owner: platform
status: frozen
last_reviewed: 2026-10-23
supersedes: []
---

# V7-03 — Derived homerooms: decision packet

> **Decided 2026-10-23:** H-ID **Option A** and H-COMPAT **Option 1** (with placement compatibility for a room-less enrollment assignment). Implementation: master plan §12.

Evidence base: staging `1c7e4ccd` (V7-02a deployed); deployed census `certification/census/v7-03-homeroom-census.sql`
(2026-10-23); read-only code and migration discovery. No V7-03 code has been written. This packet exists because
the authorization requires a stop when there is no unambiguous configured Homeroom identity (§3).

## 1. What the platform already permits

| Question | Answer (source) |
|---|---|
| Can a child hold two live assignments in two classrooms at once? | **Yes.** Only primaries are limited: one live primary per enrollment agreement (`ux_schedule_assignments_one_operational_primary_child`, 20261022120000) and no overlapping primaries per agreement (`validate_schedule_assignments_primary_overlap`, 20261023120000). Secondaries have no uniqueness, overlap or category limit. |
| Do placements limit it? | One live placement per agreement, classroom only. Placement is the licensing/program anchor and stays one; homerooms are derived from assignments, not placements. |
| Temporal contract | `start_date`/`end_date`, both inclusive; in effect = status `planned`/`active`/`ending` and the date inside the window. Supersession ends the predecessor the day before the successor. (The external schedule projection counts only `active`/`planned` — an existing disagreement, out of scope.) |
| Schema change needed for many homerooms? | **No.** |

## 2. Why there is no Homeroom identity today

1. No category is seeded as Homeroom. The seeded `primary_classroom` means the tuition-bearing base class in code (billing label "Tuition", `buildSchedulingProjection.ts:89`); it is not a homeroom.
2. Category keys are `label + random suffix` (`slugAssignmentTypeKey`). One staging org made its own "Homeroom" (`homeroom_br1u0`, 0 assignments); another org has no seeded categories at all. A rule by key or label would be a label rule.
3. Every live primary (the enrollment's own schedule) is **uncategorized** (8 of 8). A rule that requires the assignment's category to match the room's Homeroom use gives zero homerooms to every enrolled child.
4. Census: 0 spaces carry `space_uses`; 0 children are in more than one live classroom. Every decision below changes nothing for any child until an operator configures it.

## 3. Decision H-ID — how a use means "Homeroom"

| Option | What it is | Cost / risk |
|---|---|---|
| **A (recommended)** | A behavior flag on the existing category, `default_behavior.providesHomeroom: true`, set in Assignment Categories. Child-only; any number of categories may carry it. A space provides Homeroom when its configured uses include a flagged category **and** it is a classroom (`operational_group`). | No migration (jsonb behavior); no second registry; works for the existing org-made "Homeroom" by setting its flag. One Studio control + reader. |
| B | Seed a reserved `homeroom` key in every org. | Data migration in every org; collides with the operator-made "Homeroom"; still needs H-COMPAT. |
| C | Treat `primary_classroom` as Homeroom. | Conflates tuition with homeroom; absent in orgs without seeds; label-adjacent. Not recommended. |

## 4. Decision H-COMPAT — which assignments qualify in a Homeroom space

| Option | Qualifying assignment (in effect on the date, in a classroom configured with a Homeroom-flagged use) | Effect today |
|---|---|---|
| **1 (recommended)** | Its category is Homeroom-flagged **or** it is the enrollment's own uncategorized schedule. The space's configuration decides — an unconfigured classroom gives no homeroom, `is_primary` alone gives none. | A child's enrolled classroom becomes a homeroom only after an operator configures that classroom for Homeroom. Two homerooms arise from a primary plus a Homeroom-categorized secondary in another configured classroom. |
| 2 | Only assignments whose category is Homeroom-flagged. | Zero homerooms for every enrolled child until each enrollment schedule is re-categorized (no writer does that; a backfill is a data migration). |

Under every option: enrichment/before-care/shared-space participation never yields a homeroom; the set is
distinct by space; order is display-only (label); no persistence, no change to `is_primary`, placement, pricing,
attendance or the external API.

## 5. After the decision (smallest change)

- One resolver, `deriveHomerooms(assignments, spaces, categories, onDate)` → `[{ spaceId, spaceLabel, categoryId|null, assignmentId, from, to }]`, distinct by space, pure, shared.
- Consumers that today pick one room by `is_primary`/first row converge on it where the display means Homeroom: the roster's "Primary:" line (`buildAssignmentRosterReadModel.ts:584-596`, `AssignmentRosterPanel.tsx:734`) and the Focus Panel identity line (`assignmentProgramRoomGating.ts:24`, `buildIdentityCardVM.ts:222`). Attendance, expectations and pricing keep the placement / `is_primary` they certify against.
- Tests: the authorized 14 cases, with real-database temporal fixtures.

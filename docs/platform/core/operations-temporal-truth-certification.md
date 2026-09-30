---
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Operations temporal truth — certification record

**Status:** Canonical (September 2026). The measured state of effective-dated operational truth in
Enrollment/Placement and Staff/Scheduling, and the benchmark contract for both.

This document records what is **proven**, what is **measured but insufficient**, and what is **not yet
measured**. It is not a design note: every claim below names the artifact that establishes it, and the
sections that say "not certified" say so because measurement is missing, not because the work is hard.

Shared temporal mechanics are owned by
[`effective-dated-assignment-doctrine.md`](effective-dated-assignment-doctrine.md) and are not repeated
here. Placement domain semantics are owned by [`placement-system.md`](placement-system.md).

---

## 1. What is certified

**`OPERATIONS_TEMPORAL_CONVERGENCE_COMPLETE`.**

One transactional owner for effective-dated participation truth, with no bypass, proven behaviourally
against a live database rather than by inspection.

| Claim | Established by |
|---|---|
| Persistence is one SQL transaction | `supabase/migrations/20261108120000_participation_operational_change_atomic.sql` |
| A supersession carries facts the caller did not change | `20261109120000_assignment_successor_carries_its_placement_facts.sql` |
| A named null clears; an absent key inherits | `20261110120000_named_field_versus_absent_field.sql` |
| The primitive behaves as specified (11 scenarios) | `web/tests/access/live/participationOperationalChange.live.test.ts` |
| The wiring respects it (10 scenarios) | `web/tests/access/live/participationWiringApplication.live.test.ts` |
| There is no second write path | `web/tests/access/participationTemporalWriterCensus.test.ts` |
| Cardinality asymmetry survives implementation | `web/tests/access/temporalCardinalityAsymmetry.test.ts` |

The primitive is `SECURITY INVOKER` with `search_path` pinned, `EXECUTE` revoked from `anon` and
`authenticated` and granted only to `service_role`, and its attempts table has RLS enabled with a
service-role policy. It owns atomic persistence, supersession linkage, truth-interval integrity and
concurrency/retry protection — and nothing else. It emits **no events**; the canonical services emit
theirs after the commit returns.

### Two defects this convergence found in its own work

Recorded because a certification that only lists successes teaches nothing about how it was earned.

1. **The assignment successor dropped the child's room.** The `schedule_assignments` successor INSERT
   omitted `room_location_id` and `operational_assignment_type_id`. Measured by superseding a real row
   and diffing prior against successor — not inferred. Repaired in `20261109120000`.
2. **A service-level retry was not idempotent** even though the primitive was. The service validated
   before calling, so a retry re-read its own successor as the current row and refused. Safe, but a
   wrong answer to a client whose change had in fact succeeded. A completed attempt is now recognised
   before validation.

---

## 2. Measured operator surfaces and their authority

**Measured 2026-09-30 from `scripts/routeCapabilities.declared.json` at method grain, and confirmed
against the handlers.** Authority is what the server enforces. UI visibility is not authority, and a
declaration is not enforcement.

### Enrollment / Placement write surfaces

| Surface | Method | Enforced capability | Temporal effect |
|---|---|---|---|
| `admin/child-participation` | POST | `enrollment.record.manage` | draft edit, or supersession post-materialisation |
| `admin/child-placements` | POST | `enrollment.decide` | initial placement or supersession |
| `admin/child-enrollment-agreements` | POST | `enrollment.decide` | agreement header |
| `admin/child-enrollment-agreements/[id]/{cancel,ending,ended}` | POST | `enrollment.decide` | agreement lifecycle |
| `admin/scheduling` | POST | **none — declared `pending`** | supersedes child schedule truth |
| `v1/placements/move` | POST | `none` by design: external bearer principal gated on the PUBLIC scope `enrollment.write` | supersession |

### Staff / Scheduling surfaces

| Group | Handlers | `declared` | `none` | `pending` |
|---|---|---|---|---|
| scheduling | 3 | 0 | 1 | **2** (including the POST write) |
| staff | 13 | 3 | 8 | 2 |
| employment | 2 | 0 | 0 | **2** (including the POST write) |

### The authority gap, stated plainly

`app/api/admin/scheduling` POST gates on `getAdminContextCached()` only — an authenticated session with
org membership — and enforces **no capability**. Since this convergence it commits a supersession of
effective-dated schedule truth. Its sibling participation and placement surfaces require
`enrollment.record.manage` and `enrollment.decide` respectively, so the inconsistency is within one
domain, not between domains.

`admin/employment-positions` POST is in the same position.

This is recorded rather than repaired here on purpose: choosing which capability gates a write is an
authority decision owned by the Identity/Access W-15 burndown, whose declaration table is ratcheted
downward only. It is named as the next wave in §6.

---

## 3. Claim matrix — documentation against implementation

| Claim previously made | Status |
|---|---|
| "In-place mutation is refused for every caller, Alloy's own surfaces included" (`v1/placements/move`) | **Was false, now true.** A guard was cited that always threw and was called by nothing, while an internal surface bypassed it. The guard is deleted; the claim now rests on there being no in-place path, enforced by the writer census. |
| `assertNoOperationalPlacementPatch()` protects the invariant | **Removed.** It had zero call sites. |
| `schedule_assignments` invariant owner is `operationalAssignmentService.ts` | **Corrected** in the doctrine: that service owns *proposed* rows; child supersession is `scheduleAssignmentService.ts`, the primary switch is `setPrimaryOperationalAssignment.ts`. |
| One operational row per subject, uniformly | **Corrected earlier and still true:** child placement and child primary assignment are single-operational by partial unique index; staff primary is overlap-governed, so current + future-dated may coexist. |
| Placement `start_date` means requested start | **Ambiguous, now split:** draft = family-requested; post-materialisation = operational truth-interval start. |
| A cross-site move is supported through `location_id` | **False and left open.** It updates the agreement header only; the placement keeps its site. Returned as product work. |

## 4. Owner set — minimal canonical owners

| Concern | Owner |
|---|---|
| Shared temporal law | `docs/platform/core/effective-dated-assignment-doctrine.md` |
| Placement domain semantics | `docs/platform/core/placement-system.md` |
| Transaction + persistence | `apply_participation_operational_change` via `lib/childcareOperational/participationOperationalChange.ts` |
| Placement domain decision + event | `lib/childcareOperational/childPlacementService.ts` |
| Child schedule decision + event | `lib/childcareOperational/scheduleAssignmentService.ts` |
| Combined edit orchestration | `lib/childcareOperational/applyCombinedParticipationChange.ts` |
| Primary switch (child and staff) | `lib/operationalAssignments/setPrimaryOperationalAssignment.ts` |
| Proposed assignment lifecycle | `lib/operationalAssignments/operationalAssignmentService.ts` |

---

## 5. Benchmark inference contract

### Enrollment / Placement — SAFE, because proven

- Placement is effective-dated: a change to a defining fact creates a successor and closes the prior
  interval the day before the successor starts.
- A transfer between rooms is represented **through supersession**, not by editing a row.
- **Cancellation is distinct from supersession.** Supersession guarantees the prior row asserted a
  non-empty interval; `canceled` is for a planned record that never became true at all.
- Placement Candidate status is domain state under a CHECK constraint, **not** governed platform Status.
- Business Process stage is not Placement state.
- Persistence of a combined placement + schedule change is **one transaction**: a failure in either half
  leaves both tables untouched and emits no event.
- A retry of the same operator intent is one change, not a chain.

### Enrollment / Placement — FORBIDDEN

- "Latest row" = active row. Resolve the current row by the operational-state predicate
  (`planned`/`active`/`ending`), never by `ORDER BY created_at DESC LIMIT 1`.
- Candidate status = platform Status.
- Stage = placement.
- Future-dating exists in the model, therefore every UI supports future placement.
- A direct row patch is a valid operational placement pattern.
- A cross-site move is supported. It is not.
- A declared capability in the route table means the handler enforces it — `admin/scheduling` POST is
  declared `pending` and enforces none.

### Staff / Scheduling — SAFE, because proven

- Person is the canonical human identity; Employment is separate from authentication, and an employment
  record does **not** imply an auth account.
- Employment position is not an RBAC role.
- Child and staff assignments share one engine and one temporal law, deliberately.
- Staff and child cardinality differ **intentionally**: a staff member may hold a current and a
  future-dated primary assignment because the overlap trigger permits disjoint intervals; a child may
  not, because a partial unique index forbids a second operational row per agreement.
- Implemented and measurable as tables: `departments`, `employments`, `employment_positions`,
  `employment_compensation_terms`, `schedule_assignments`, `schedule_patterns`, `schedules`,
  `schedule_statuses`, `schedule_tags`, `staff_availability_windows`, `staff_availability_exceptions`,
  `staff_coverage_allocations`, `user_department_access`.

### Staff / Scheduling — FORBIDDEN

- Staff role = RBAC role.
- Auth user = employee.
- A current + future-dated staff primary assignment is invalid because child rules forbid it.
- A hidden action means the action is unauthorized.
- Certification evidence is doctrine.
- **Planned workforce concepts are implemented.** Measured 2026-09-30, there is no `shift`, no time-off
  and no substitution table in `public`. Shifts, time off, substitutions and draft/published scheduling
  states must not be described as existing.

---

## 6. What is NOT certified, and exactly what remains

Neither domain is declared documentation-context ready. Both are blocked on measurement that this record
does not contain, and declaring readiness over an unmeasured surface is the failure mode this estate
exists to prevent.

**Enrollment / Placement — remaining:** a complete mounted-surface inventory (the API surface alone is
25+ route files; only the write surfaces above are measured), the per-action operator→server→effect
matrix for read and list surfaces, and the UI surface inventory.

**Staff / Scheduling — remaining:** organizational assignment semantics (department, classroom/team,
supervisor, multi-site and multi-department), the scheduling-concept inventory beyond table existence
(what `schedules`, `schedule_statuses` and `staff_coverage_allocations` actually govern at runtime),
mounted operator surfaces, and classification of the ~33 existing certification evidence artifacts into
CURRENT_CERTIFICATION / CURRENT_REFERENCE / STALE / HISTORICAL / SPRINT_EVIDENCE / DUPLICATE.

**Both — blocking authority work:** the `pending` capability declarations on `admin/scheduling` POST and
`admin/employment-positions` POST. A write surface that supersedes durable truth behind session-only
authorization is an authority fact a benchmark consumer would otherwise infer wrongly.

---

## Related

- [`effective-dated-assignment-doctrine.md`](effective-dated-assignment-doctrine.md) — the shared law
- [`placement-system.md`](placement-system.md) — placement candidates and the placement domain
- [`status-and-state-system.md`](status-and-state-system.md) — governed Status, which these tables are outside

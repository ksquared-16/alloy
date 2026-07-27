# Assignment Platform foundation certification (2026-07)

**Status:** certified for first foundation commit — Timeline / bulk / Studio UI remain blocked until after that commit.

## 1. Final `schedule_assignments` grain

One row = one **typed, effective-dated operational assignment commitment**.

| Field | Meaning |
|---|---|
| `subject_type` | `child` \| `staff` — namespaces never collide |
| Child subject | `enrollment_agreement_id` + `customer_member_id` required; `subject_person_id` null |
| Staff subject | `subject_person_id` → `persons.id` (active employee); enrollment fields null; `site_location_id` required |
| Recurrence | `schedule_pattern_id` (when) |
| Place | `room_location_id` / `program_category_id` / `site_location_id` (where) |
| Role | `operational_assignment_type_id` (why / participation defaults) |
| Primary | `is_primary` — effective-dated operational home |
| Window | `start_date` .. `end_date` (null end = open) |
| Lifecycle | `status` + `supersedes_assignment_id` |

Physical table name remains compatibility; product noun is **Assignment**.

### Primary uniqueness (effective-dated)

Enforced by trigger `trg_validate_schedule_assignments_primary_overlap` using
`schedule_assignment_date_ranges_overlap`.

**Not** a global unique on `(subject, is_primary)` among operational statuses
(that would incorrectly block non-overlapping future primaries).

| Example | Result |
|---|---|
| Primary + secondary same dates | Allowed |
| Ended primary `01-01`–`08-31` + planned primary `09-01`–∞ | Allowed (proven on local DB) |
| Two open/overlapping primaries same child | Rejected (proven on local DB) |
| Child primary + staff primary | Allowed (different namespaces) |

Secondary assignments may overlap intentionally.

## 2. Canonical staff subject

| Concern | Owner |
|---|---|
| Identity | `persons.id` |
| Employment eligibility | `persons.is_employee = true` and `archived_at IS NULL` |
| Org scope | `persons.org_id` |
| Site scope | Assignment `site_location_id` |
| Name | `persons` display fields |
| Job title | Not on persons — Assignment Type / future employment edge |

**Verdict:** `subject_person_id` → `persons.id` is correct. No subject-key correction required.

## 3. Ownership boundaries

| Concept | Owner | Answers |
|---|---|---|
| Assignment Type | `operational_assignment_types` | Why / operational role + participation defaults |
| Schedule Pattern | `schedule_patterns` | When it recurs |
| Room | `locations` / assignment room FK | Where |
| Program / service | LPC / offerings / financial_services | Business offering |
| Billing item | financial / commercial catalog | Financial consequence |

`operational_assignment_types` is a legitimate new vocabulary, not a duplicate.

## 4. Primary command

- Action key: `assignment.set_primary`
- Service: `setPrimaryOperationalAssignment`
- Supports child + staff, effective date, promote or create, history-preserving supersede, idempotency key, overlap rejection, compensating rollback on failed write, projection refresh targets, child placement sync when home room changes, schedule-changed event for child subjects.

## 5. Migration result (local managed DB `127.0.0.1:56322`)

- Applied: `20260725030801_operational_assignment_foundation_v1.sql`
- Pre-state: `schedule_assignments` existed with V1 columns; **0** committed assignment rows (no Scheduling V1 rows to regress)
- Post-state: new columns, types table, overlap trigger, old one-operational unique index dropped
- Backfill `UPDATE` touched 0 rows (empty table)
- Cert fixtures created:
  - child primary + before-care secondary
  - staff primary classroom + float
  - non-overlapping future child primary succeeded
  - overlapping primary insert rejected

## 6. Tests / typecheck

- Focused assignment + scheduling suites: **75 passed** (re-run subset after fixture fix also green)
- Full production typecheck (`alloy-validate … typecheck` / `tsconfig.build.json`): **rc=0**
- Assignment-touched test files: no remaining `tsc` errors under those paths
- Repo-wide `typecheck:tests` still reports pre-existing AdminV2 queue-layout fixture errors unrelated to this foundation (unchanged by this work)
- `git diff --check`: clean

## 7. Remaining risks

- Local DB had no pre-existing Scheduling V1 assignment rows — compatibility is proven by schema shape + empty backfill + service tests, not by a populated production-like ledger.
- Placement supersede compensation on mid-flight faults restores the prior primary but does not rewind an already-written placement supersede (effective-dated placement history remains coherent).
- Staff primary changes do not yet emit a dedicated staff assignment event (child path reuses `schedule_assignment_changed`).
- Focus Panel / Workspace UI still use Scheduling vocabulary (intentional — no global rename).
- Timeline, bulk commands, billing bindings, Studio Type UI, dropdown audit: **not started**.

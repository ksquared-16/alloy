# process_instances — platform primitive + OCM removal plan

**Decision (frozen):** `process_instances` is the generic platform primitive for a running operational
journey and the **runtime owner of child participation** in Enrollment. `opportunity_customer_members`
(OCM) is demoted to a **temporary migration/data source** and removed after cutover. No indefinite mirroring.

Doctrine: **Lead/opportunity = context · Child = subject · Process Instance = the running journey ·
Work attaches to the instance · Outcomes move the instance · Work Views read instances.**

## The primitive
`process_instances (id, org_id, process_key, subject_type, subject_id, context_type, context_id,
stage_key, state, close_reason_key, metadata jsonb, created_at, updated_at)`, unique on
`(org_id, process_key, subject_id, context_id)`. Generic — enrollment specifics live in `metadata`.
Enrollment binding: `process_key='enrollment_process'`, `subject_type='child'` (`subject_id`=customer_members.id),
`context_type='opportunity'` (`context_id`=opportunities.id).

## Migration plan (files; validated in a rolled-back txn on staging; NOT yet applied)
| # | File | Purpose | Destructive |
|---|------|---------|-------------|
| 1 | `20260713000000_process_instances.sql` | create the table + indexes + RLS | no (additive) |
| 2 | `20260713000100_process_instances_backfill_from_ocm.sql` | one enrollment instance per OCM row (idempotent, no-op on empty OCM) | no |
| (later) | `2026071x_drop_ocm_runtime.sql` | after cutover: drop `outcome_status_key`/`stage_key` writers, then OCM (see removal plan) | yes |

## Affected tables
- **New:** `process_instances`.
- **Read/written at runtime (cutover):** Create Lead writers, queue/projection readers, outcome executor,
  drawer child list — move from `opportunity_customer_members` to `process_instances`.
- **Legacy (read-only, then dropped):** `opportunity_customer_members`.

## Exact replacement for OCM (field mapping)
| OCM column | process_instances |
|---|---|
| `id` | (new `id`; `metadata.migrated_from_ocm_id` preserves lineage) |
| `org_id` | `org_id` |
| `customer_member_id` | `subject_id` (subject_type='child') |
| `opportunity_id` | `context_id` (context_type='opportunity') |
| `outcome_status_key` | **`state`** |
| `stage_key` | `stage_key` |
| `close_reason_key` | `close_reason_key` |
| `start_date`, `schedule_type`, `program_category_id`, `location_id`, `program_room_cohort_key`, `notes` | `metadata.*` |
| (process) | `process_key='enrollment_process'` |

## What Create Lead writes now — DONE (bridge)
`applyCreateLeadChildParticipationFromIdentity` now calls `createEnrollmentProcessInstance()` per child:
one `process_instances` row (`process_key=enrollment_process`, `subject_id`=child, `context_id`=lead,
`stage_key=null`, `state=null`, participation in `metadata`). Returns `process_instance_id`.
It still writes OCM **during the migration bridge only** — that OCM write is removed at cutover step C.

## What Work Views read now — CUTOVER (next slice)
Today child-grain membership reads OCM (`ocmEnrollmentTrackQueueBuilder` filters `opportunity_customer_members`
by `stage_key`). Cutover: read `process_instances` where `process_key='enrollment_process'` and
`stage_key = <lane stage>` (helpers `listEnrollmentInstancesForStage` / `listEnrollmentInstancesForLead`
already added in `lib/process/processInstances.ts`). Family/lead grain is unchanged (opportunities).
Queue-row subject becomes the process instance (`subject_id`=child, `context_id`=lead).

## What outcomes update now — CUTOVER (next slice)
`stageOutcomeRuleTargetExecutor`: the `move_to_stage` (child segment) and `update_child_enrollment_status`
targets switch from updating OCM to updating `process_instances` via `moveProcessInstanceStage()` /
`setProcessInstanceState()` (both already added). **Stop writing `opportunity_customer_members.outcome_status_key`.**

## UI: stop saying "Enrollment Status" (next slice)
Operator-facing "Enrollment Status" → "Enrollment" / process-state language; the child badge reads
`process_instances.state` via the entity-label system. Internal `state` values unchanged.

## What can be deleted after migration
- `opportunity_customer_members` table (after readers/writers cut over) and all `inquiry_child`/OCM
  runtime modules (registry, drawer OCM paths, `ocmEnrollmentTrackQueueBuilder`, `outcome_status_key`
  writers). `metadata.migrated_from_ocm_id` retained for audit until a later cleanup.
- The OCM write in Create Lead (bridge) — remove at cutover step C.

## Cutover sequence (no double-write beyond the bridge)
A. Apply migrations 1–2 (create + backfill). B. Switch Work-View/queue reads + drawer to `process_instances`
(read cutover). C. Switch outcome executor to write `process_instances`; **remove** the OCM write in
Create Lead + stop `outcome_status_key`. D. UI text. E. Drop OCM (migration 3). Each step verified; B before C.

## QA checklist
- [ ] Migrations 1–2 apply on staging (session conn); ledger rows recorded; `process_instances` exists.
- [ ] Backfill count == OCM count per org (on envs with OCM data).
- [ ] Create Lead: each child → exactly one `process_instances` row (`state=null`, `stage_key=null`, participation in metadata); `process_instance_id` returned.
- [ ] New lead appears in New Leads (family grain, unchanged); child instances exist with null stage until decision.
- [ ] After read cutover: child-grain Work Views (Waitlist/Enrolling/Enrolled) list `process_instances` by `stage_key`; no OCM read.
- [ ] After outcome cutover: waitlist/enroll/withdraw outcomes move `process_instances.stage_key`/`state`; **no `outcome_status_key` writes** (grep clean).
- [ ] Operator UI shows no "Enrollment Status" wording; child badge from `process_instances.state`.
- [ ] `rg "opportunity_customer_members|outcome_status_key"` in runtime = 0 (only legacy/migration/tests).
- [ ] OCM drop migration applies; app still green (typecheck:build=0; targeted tests).

## Status this slice (foundation — reviewable, NOT applied to staging)
Built + validated: primitive schema + backfill migrations (dry-run clean, rolled back), `lib/process/processInstances.ts`
(types + create/move/setState + read helpers), Create Lead writes a process instance per child. `typecheck:build`=0.
Remaining (sequenced cutover B–E above) to be done as focused slices with review before each staging apply.

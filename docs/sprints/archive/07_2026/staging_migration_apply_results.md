# Staging Migration Apply — Results (partial; blocked on migration defects)

**Target:** Supabase `ikaxilmwmrmbagoidedu`, org `93667019-bd28-49b5-a688-acc9bb1e0a19`. Session conn (5432).
**Backup taken first:** CSV `\copy` of 13 affected tables (status_definitions 92, status_transition_rules 3,
opportunity_customer_members 9, opportunities 7, placement_candidates 0, field_definitions 406, field_values 14,
action_definitions 74, action_placements 136, departments 5, work_units 11, entity_layouts 138, record_drawer_layouts 2)
at `scratchpad/backup_csv/`. (Platform PITR is separate; not verifiable from here.) pg_dump unusable: client v14 vs server v17.

## Applied successfully (2 of 7) — ledger recorded
| version | name | effect | verified |
|---|---|---|---|
| 20260630121000 | mutation_events_outbox (renamed from 20260630120000 to fix collision) | creates `mutation_events` table + `execute_lead_status_mutation` RPC | table + RPC exist ✓ |
| 20260630140000 | execute_enrollment_status_mutation_rpc | creates `execute_enrollment_status_mutation` RPC | RPC exists ✓ |

Both are additive and safe; no impact on existing data.

## BLOCKED (5 of 7) — defective vs staging schema; NOT applied, NOT recorded
All failed migrations ran in single transactions and **rolled back cleanly** (verified: OCM still has `desired_*`,
placement_candidates still has `desired_start_date`, status_definitions unchanged).

1. **20260630131000 update_lead_status_action_seed** — `action_definitions.action_type` CHECK rejects value
   `mutation_command`.
2. **20260630150000 update_child_enrollment_status_action_seed** — `column "metadata" of relation
   "action_definitions" does not exist`.
3. **20260701200000 bpep_action_catalog_seeds** — same missing `action_definitions.metadata`.
   → Root cause for 1–3: these seeds require an `action_definitions` schema (a `metadata jsonb` column + an
   `action_type` CHECK that includes `mutation_command`). **No migration in the repo adds either**, and the
   canonical schema doc (`docs/schema/schema-columns.md`) also lacks `metadata`. The seed migrations are
   defective — they need a prerequisite schema migration (`ALTER TABLE action_definitions ADD COLUMN metadata jsonb
   DEFAULT '{}'::jsonb; ` + widen the action_type CHECK to include `mutation_command`) authored + reviewed first.
4. **20260711000000 enrollment_participation_canonical_fields** — aborted at
   `DELETE FROM field_values WHERE ... field_key = ...`: staging `field_values` is **normalized**
   (`field_definition_id`, no `field_key` column). The migration assumes a denormalized `field_values.field_key`.
   The OCM/placement column renames + layout JSON rewrites are fine; only the `field_values` statements are
   incompatible. Fix: rewrite the two `field_values` statements to key off `field_definition_id`
   (`DELETE FROM field_values WHERE field_definition_id IN (SELECT id FROM field_definitions WHERE
   entity_type='inquiry_child' AND field_key='desired_program_type')`) — and drop the `UPDATE field_values SET
   field_key=...` entirely (values reference the definition by id, so renaming `field_definitions.field_key`
   already "renames" for all values). Then re-run.
5. **20260711000100 enrollment_status_collapse_and_stage_key** — NOT attempted (batch stopped when #4 failed).
   It is independent of #4 and would likely apply, but applying it **without** #4 makes `/settings/statuses`
   truthful while leaving OCM columns as `desired_*` — which the merged code (expects `start_date`/
   `program_category_id`/`stage_key`) would mismatch. Recommend applying #4 (fixed) and #5 together.

## Status rows — before == after (no enrollment migration applied)
Lead (opportunities) active: new_inquiry, needs_qualification, open, qualified, closed, tour_requested,
tour_scheduled, inactive, tour_completed, decision_pending, archived, lost, withdrawn, not_enrolling.
Enrollment (OCM) active: waitlisted, enrolling, registration_pending, paperwork_pending, start_date_scheduled, enrolled.
(Unchanged — the collapse has NOT been applied. `/settings/statuses` still shows the old set.)

## Ledger delta this session: +2 rows (20260630121000, 20260630140000).

## Required next steps (need review — I did not autonomously rewrite migrations against prod)
- **Fix migration 20260711000000** `field_values` statements to staging's normalized schema (see #4). Small, safe.
- **Author a prerequisite migration** adding `action_definitions.metadata` + widening `action_type` CHECK for
  `mutation_command` (see 1–3), then the 3 action seeds apply.
- Re-run: fixed #4 → #5 (enrollment truth), then the action seeds after the prerequisite. Backup already in place.
- The collision rename of `mutation_events_outbox` → `20260630121000` is now in the staging ledger; the repo file
  was renamed to match (this commit).

# Staging Migration Fixes — Prepared + Dry-Run Validated (NOT applied to live)

Fixes #1 and #2 prepared and validated against staging's real schema via a single **rolled-back
transaction** (session connection). Nothing was persisted. Apply only after review.

## Files changed
| File | Change |
|---|---|
| `20260711000000_enrollment_participation_canonical_fields.sql` (FIX #1) | field_values section rewritten for the **normalized** schema: delete legacy values via `field_definition_id IN (select id from field_definitions …)`; **removed** the invalid `UPDATE field_values SET field_key …` (values follow the definition rename automatically). OCM/placement column renames + layout JSON rewrites unchanged. |
| `20260630130500_action_definitions_mutation_command_prereq.sql` (FIX #2, NEW) | `ALTER TABLE action_definitions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'`; drop+recreate `action_definitions_action_type_check` widened to include `mutation_command` (keeps all 8 prior values). Idempotent. |
| `20260630150000_update_child_enrollment_status_action_seed.sql` (seed reassess) | placement insert: `sort_order`→`order_index`, removed non-existent `metadata` column; `on conflict (key)`→`on conflict (key) where org_id is null` (matches staging's partial unique index). |
| `20260701200000_bpep_action_catalog_seeds.sql` (seed reassess) | same three fixes across close_lead/waitlist_child/enroll_child (order_index, drop placement metadata, partial-index on-conflict). |
| `20260630131000_update_lead_status_action_seed.sql` | **No change needed** — already used `order_index`, no placement metadata, `where not exists`; only blocked by the CHECK, which FIX #2 resolves. |

## Why the seeds were broken vs staging (reassessment result)
staging `action_definitions`: no `metadata`, `action_type` CHECK excludes `mutation_command`, unique key is
**partial** (`(key) WHERE org_id IS NULL`). staging `action_placements`: column is `order_index` (not
`sort_order`) and has **no** `metadata`. The seeds assumed a denormalized/newer schema. FIX #2 + the seed
edits reconcile them. `field_values` is normalized (`field_definition_id`, no `field_key`) → FIX #1.

## Migration order (apply)
1. `20260711000000_enrollment_participation_canonical_fields` (fixed)
2. `20260711000100_enrollment_status_collapse_and_stage_key`
3. `20260630130500_action_definitions_mutation_command_prereq` (new)
4. `20260630131000_update_lead_status_action_seed`
5. `20260630150000_update_child_enrollment_status_action_seed`
6. `20260701200000_bpep_action_catalog_seeds`
(The two Mutation Runtime migrations — `20260630121000_mutation_events_outbox`, `20260630140000_execute_enrollment_status_mutation_rpc` — are already applied; the seeds' RPC dependency is satisfied.)

## Destructive operations (have backup)
- #1: `DROP COLUMN desired_program_type` (OCM; backfilled to `program_category_id` first); `RENAME COLUMN`
  on OCM (`desired_start_date/desired_schedule_type/desired_program_category_id`) + `placement_candidates.desired_start_date`;
  `DELETE` field_definitions/field_values for `desired_program_type`.
- #2 (collapse): `DELETE` old `status_definitions` rows (opportunities + OCM) + `DELETE status_transition_rules`
  for both entity types; `UPDATE` opportunities/OCM status to collapsed values; `ADD COLUMN stage_key/close_reason_key`.
- Prereq: `DROP CONSTRAINT` + re-`ADD CONSTRAINT` (CHECK widen) — non-destructive to rows.
- Seeds: inserts only (guarded).

## Exact tables/columns affected
- `opportunity_customer_members`: rename→ start_date, schedule_type, program_category_id; drop desired_program_type; add stage_key, close_reason_key.
- `opportunities`: add stage_key, close_reason_key; status_key values collapsed.
- `placement_candidates`: rename desired_start_date→start_date; status may update to 'paused' (waitlist_paused mapping).
- `status_definitions`, `status_transition_rules`: rows deleted/reseeded (org-scoped enrollment entities).
- `field_definitions`, `field_values`: legacy program rows deleted; field_key renames.
- `entity_layouts`, `record_drawer_layouts`, `departments`, `work_units`: JSON refKey `desired_*`→canonical.
- `action_definitions`: add metadata; widen action_type CHECK; +5 seed rows. `action_placements`: +seed rows.

## Dry-run validation output (rolled-back txn on staging)
```
OCM_cols      = close_reason_key,program_category_id,schedule_type,stage_key,start_date   (desired_* gone)
opp_cols      = close_reason_key,stage_key
lead_status   = archived,closed,inactive,open        (old enrollment statuses removed; inactive/archived are
                                                       generic container states kept by design)
enroll_status = enrolled,enrolling,not_enrolling,waitlisted,withdrawn
action_defs   = close_lead,enroll_child,update_child_enrollment_status,update_lead_status,waitlist_child
ad_metadata_col = yes
ledger_insert_ok = 6   (all six versions insertable, no PK conflict)
→ ROLLBACK (nothing persisted)
```
All 6 migrations applied without error in order; ON_ERROR_STOP did not trigger. Rollback-on-failure was
also demonstrated earlier (the unfixed #1 aborted and left `desired_*` intact — clean rollback).

## Final apply plan (after approval)
Session connection (`:5432`), each migration `psql -v ON_ERROR_STOP=1 -1 -f`, insert ledger row on success,
in the order above. Backup already taken (13 tables CSV). Then verify (same queries). Reset NOT run until
all applied + verified.

Note: `lead_status` will still include `inactive`/`archived` (generic opportunity container states in
`ENROLLMENT_GENERIC_OPPORTUNITY_CASE_KEYS`) — these are intentional, not the old operational-work statuses.

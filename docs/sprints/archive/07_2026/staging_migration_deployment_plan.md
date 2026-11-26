# Staging Migration Deployment Plan (review before applying)

**Target (confirmed):** Supabase project `ikaxilmwmrmbagoidedu` (`ikaxilmwmrmbagoidedu.supabase.co`),
DB host `aws-0-us-west-2.pooler.supabase.com`, staging org `93667019-bd28-49b5-a688-acc9bb1e0a19`.
**Remote ledger:** 225 applied; latest recorded `20260709120000`. **Nothing applied by this analysis.**

## TL;DR / the hazard
`supabase db push --include-all` is **NOT SAFE here.** The ledger is out-of-order and has **timestamp
collisions**, and several "pending" migrations are in fact **already applied** (their objects exist).
Re-applying the non-idempotent ones would error or corrupt data. Apply **only the genuinely-missing
set**, surgically, in dependency order — see the plan.

## How "pending" was determined
Version-diff (local vs `schema_migrations`) + Supabase dry-run + **empirical object probes** on the
live DB. The object probes are authoritative because the ledger disagrees with reality (collisions).

## Timestamp collisions (root cause of the mess)
| Timestamp | Files sharing it | Ledger recorded | Shadowed (unapplied) sibling |
|---|---|---|---|
| `20260630120000` | financial_substrate_generalization_p3_1, commercial_tuition_rates, **mutation_events_outbox** | financial_substrate_generalization_p3_1 | **mutation_events_outbox** (+commercial_tuition_rates applied via objects) |
| `20260630130000` | commercial_tuition_not_offered, **update_lead_status_action_seed** | commercial_tuition_not_offered | **update_lead_status_action_seed** |
| `20260707120000` | operational_consumption_schedule_slice2, **header_metric_definitions_activation** | operational_consumption_schedule_slice2 | **header_metric_definitions_activation** |

A ledger PK is one row per `version`. The shadowed siblings can **never** be tracked/applied by
Supabase under their current names (version already taken) — they must be **renamed to unique
timestamps** before any tool will apply/record them.

## Per-migration analysis + live-DB state

Legend: **APPLIED** = objects exist on staging (skip; do not re-run). **MISSING** = objects absent (apply).

| # | File | Epic | Destructive | Data migration | Re-runnable | Live state | Verdict |
|---|------|------|-------------|----------------|-------------|-----------|---------|
| 1 | 20260630120000_financial_substrate_generalization_p3_1 | Commercial/Financial | no | backfill only | yes | **APPLIED** (ledger) | SKIP |
| 2 | 20260630120000_commercial_tuition_rates | Programs/Rates | no | no | yes | **APPLIED** (table exists) | SKIP |
| 3 | 20260630120000_**mutation_events_outbox** | Mutation Runtime | no | no | yes | **MISSING** (`mutation_events` table + `execute_lead_status_mutation` RPC absent) | **APPLY** (rename ts) |
| 4 | 20260630130000_commercial_tuition_not_offered | Programs/Rates | no | no | yes | **APPLIED** (`commercial_tuition_rates` exists) | SKIP |
| 5 | 20260630130000_**update_lead_status_action_seed** | Actions/BPEP | no | seeds config | yes (guards) | **MISSING** (action_def absent) | **APPLY** (rename ts) |
| 6 | 20260630140000_execute_enrollment_status_mutation_rpc | Mutation Runtime | no | no | yes (CREATE OR REPLACE) | **MISSING** (RPC absent) | **APPLY** |
| 7 | 20260630150000_update_child_enrollment_status_action_seed | Actions/BPEP | no | seeds config | yes (ON CONFLICT) | **MISSING** | **APPLY** |
| 8 | 20260701200000_bpep_action_catalog_seeds | Actions/BPEP | no | seeds config | yes (ON CONFLICT) | **MISSING** (close_lead/waitlist_child/enroll_child absent) | **APPLY** |
| 9 | 20260702000003_program_offering_variants | Programs/Rates | **YES** (drops cols, deletes rows) | **YES** | **NO** | **APPLIED** (`quantity_type` gone, `variant_id` present) | **SKIP — DANGEROUS to re-run** |
| 10 | 20260702000004_rate_effective_dates | Commercial/Financial | no | no | yes | **APPLIED** (`effective_start` present) | SKIP |
| 11 | 20260707120000_operational_consumption_schedule_slice2 | Operational Consumption | no | seeds 4 rows | yes | **APPLIED** (`obligation_kind` present) | SKIP |
| 12 | 20260707120000_**header_metric_definitions_activation** | Metrics/Analytics | no | seeds config | yes (WHERE NOT EXISTS) | **MISSING** (metric defs absent) | APPLY (optional; rename ts) |
| 13 | 20260710000001_commercial_fees_addons_deposits | Commercial/Financial | no | no | **NO** (bare CREATE TABLE) | **APPLIED** (`commercial_fees` exists) | **SKIP — would error on re-run** |
| 14 | 20260710000002_commercial_fees_addons_deposits_v2 | Commercial/Financial | yes (drops CHECKs) | no | yes | **APPLIED** (`revenue_category` present) | SKIP |
| 15 | 20260711000000_enrollment_participation_canonical_fields | **Enrollment Alignment** | **YES** (renames OCM cols, drops `desired_program_type`) | backfill FK | **NO** (RENAME) | **MISSING** (OCM still has `desired_*`) | **APPLY — REQUIRED** |
| 16 | 20260711000100_enrollment_status_collapse_and_stage_key | **Enrollment Alignment** | **YES** (deletes status rows) | **YES** (collapse + backfill stage_key) | partial (guards; RENAME-free) | **MISSING** (old statuses active; no stage_key) | **APPLY — REQUIRED** |
| 17 | 20260712000000_remove_auto_seeded_identity_demo | Enrollment (cleanup) | yes (deletes seed rows) | delete | yes | **NO-OP** (Rivera rows = 0 on this org) | APPLY (harmless) or skip |

## Grouped by epic
- **Enrollment Alignment (REQUIRED — the user's goal):** #15 canonical fields, #16 status collapse + stage_key, #17 cleanup (no-op here).
- **Mutation Runtime (REQUIRED for domain-verb actions at runtime):** #3 mutation_events_outbox, #6 execute_enrollment_status_mutation_rpc.
- **Actions/BPEP (REQUIRED for operator domain verbs — S5 code depends on these):** #5 update_lead_status seed, #7 update_child_enrollment_status seed, #8 close_lead/waitlist_child/enroll_child seeds.
- **Metrics/Analytics (OPTIONAL):** #12 header metric activation.
- **Commercial/Financial + Programs/Rates (ALREADY APPLIED — SKIP):** #1,2,4,9,10,11,13,14.

## Classification
- **Required:** #3, #5, #6, #7, #8, #15, #16.
- **Optional:** #12 (analytics header), #17 (no-op cleanup).
- **Obsolete / already-applied (SKIP):** #1, #2, #4, #9, #10, #11, #13, #14.
- **Dangerous (must NOT be re-applied):** #9 program_offering_variants (destructive + non-idempotent, already applied), #13 commercial_fees (bare CREATE, already applied). `--include-all` would hit both.

## Dependency chain (apply order)
```
#3 mutation_events_outbox  ─┬─> #5 update_lead_status_action_seed ─┐
                            └─> #6 execute_enrollment_status_rpc ──┼─> #8 bpep_action_catalog_seeds
                                #6 ──> #7 update_child_enrollment_status_action_seed ┘
#15 enrollment_participation_canonical_fields (independent; needs existing OCM desired_* cols)
#16 enrollment_status_collapse_and_stage_key (independent; needs opportunities/OCM/status_definitions)
#17 remove_auto_seeded_identity_demo (independent)
#12 header_metric_definitions_activation (independent)
```
Cross-epic: #16 assumes NOTHING from Commercial (safe). #15 assumes OCM `desired_program_category_id`
exists (it does). Actions (#5,7,8) assume the RPCs (#3,#6) exist.

## Recommended deployment (do NOT run `--include-all`)

**Prep — resolve collisions (in the repo, then a tiny follow-up commit):** rename the three shadowed
files to unique timestamps so tooling can track them:
- `20260630120000_mutation_events_outbox.sql` → `20260630121000_mutation_events_outbox.sql`
- `20260630130000_update_lead_status_action_seed.sql` → `20260630131000_update_lead_status_action_seed.sql`
- `20260707120000_header_metric_definitions_activation.sql` → `20260707121000_header_metric_definitions_activation.sql`

**Connection:** use a **session** connection (port 5432), NOT the transaction pooler (6543) — the
pooler breaks `supabase db push` (`prepared statement already exists`). All migrations are transactional.

**Apply the REQUIRED set only, in order, each verified:**
1. `20260630121000_mutation_events_outbox.sql`
2. `20260630140000_execute_enrollment_status_mutation_rpc.sql`
3. `20260630131000_update_lead_status_action_seed.sql`
4. `20260630150000_update_child_enrollment_status_action_seed.sql`
5. `20260701200000_bpep_action_catalog_seeds.sql`
6. `20260711000000_enrollment_participation_canonical_fields.sql`
7. `20260711000100_enrollment_status_collapse_and_stage_key.sql`
8. (optional) `20260707121000_header_metric_definitions_activation.sql`
9. (optional/no-op) `20260712000000_remove_auto_seeded_identity_demo.sql`

Two mechanisms (pick one):
- **(A) Targeted psql** — run each file's SQL on a session connection inside a transaction, then
  `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES (...)`. Precise; requires the
  collision renames first (so versions don't PK-collide with the applied siblings).
- **(B) Ledger reconcile + `supabase db push`** — first `INSERT` ledger rows for every ALREADY-APPLIED
  "pending" file (#1,2,4,9,10,11,13,14) so Supabase stops trying them, then `db push` (session URL)
  applies the rest. Higher risk (must get the reconcile list exactly right); (A) is safer.

**Verification after each enrollment migration (SQL):**
- After #6/#7: `select column_name from information_schema.columns where table_name='opportunity_customer_members' and column_name in ('start_date','schedule_type','program_category_id','stage_key','close_reason_key');` → all present, and `desired_*` gone.
- After #7: `select entity_type,status_key,is_active from status_definitions where org_id='<org>' and entity_type in ('opportunities','opportunity_customer_members') order by 1,2;` → opportunities = open,closed; OCM = waitlisted,enrolling,enrolled,withdrawn,not_enrolling; NO new_inquiry/tour_*/registration_pending/etc.

**Then re-run the collapse-safe bootstrap is NOT needed** — the migration collapses existing rows, and
PR #69 already made `childcareBootstrapV1` collapse-safe, so no old statuses will be recreated.

## Rollback posture
Enrollment migrations #15/#16 are destructive (column rename/drop; status-row delete). No down-migrations
exist. Take a **DB snapshot / point-in-time backup before applying**. #16 backfills `stage_key` from
legacy status before deleting, so stage position is preserved.

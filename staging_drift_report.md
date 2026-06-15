# Staging Drift Report

_Generated: 2026-06-14. Baseline: `docs/supabase/reference/*.csv` (staging export)._

## Executive summary

Clean `supabase db reset` cannot reproduce staging schema. The largest gap is the **placement / waitlist** object family: four tables, multiple indexes, triggers, functions, and RLS policies exist in staging but have **no `CREATE TABLE`** migration.

## Tables in staging, absent from migration chain

- placement_candidates
- placement_link_group_members
- placement_link_groups
- placement_overrides


## Functions in staging, absent from migration chain (sample)

Total: **4**. Placement-related:

- validate_placement_candidates_consistency
- validate_placement_link_group_members_consistency
- validate_placement_link_groups_consistency
- validate_placement_overrides_consistency


First 40 others:

_None._


## Indexes in staging, absent from migration chain

Total: **604**. Placement-related:

- idx_placement_candidates_org_cohort_status
- idx_placement_candidates_org_customer_member
- idx_placement_candidates_org_ocm
- idx_placement_candidates_org_opportunity
- idx_placement_candidates_org_status
- placement_candidates_pkey
- ux_placement_candidates_ocm_cohort_active
- ux_placement_candidates_org_seed_key
- ux_placement_candidates_synthetic_cohort_active
- idx_placement_link_group_members_org_candidate
- idx_placement_link_group_members_org_group
- placement_link_group_members_pkey
- uq_placement_link_group_members_group_candidate
- idx_placement_link_groups_org_opportunity
- placement_link_groups_pkey
- idx_placement_overrides_org_candidate
- idx_placement_overrides_org_cohort_active
- placement_overrides_pkey
- ux_placement_overrides_one_active_pin


_Static index parse under-counts quoted `CREATE INDEX` in `remote_schema`; total missing (604) is inflated. **Placement-prefixed** gaps (19) are the actionable signal._

## Known example: `placement_candidates`

| Artifact | In staging CSV | In migrations |
|----------|----------------|---------------|
| Table `placement_candidates` | yes | **no** |
| Table `placement_link_groups` | yes | **no** |
| Table `placement_link_group_members` | yes | **no** |
| Table `placement_overrides` | yes | **no** |
| Function `validate_placement_candidates_consistency` | yes | **no** |
| Trigger `trg_validate_placement_candidates_consistency` | yes | **no** |
| Index `idx_placement_candidates_org_status_opportunity` | partial | yes (`20260605100000`) |
| App/runtime usage | `web/lib/orchestration/placement/*` | expects table |

**Impact:** `20260605100000_waitlist_queue_lane_query_indexes.sql` runs `CREATE INDEX … ON placement_candidates` which **fails** on clean replay.

## Org-seed drift

Staging org `7803388d-cdee-4afb-89cf-23a137f39423` (Alloy Bend) is assumed by many seeds. Two migrations **abort the chain** if that org row is missing:

- `20260402143000_public_booking_field_config_seed.sql`
- `20260423143000_opportunity_identity_seed_childcare_org.sql`

Canonical skip pattern (used elsewhere): guard with `IF NOT EXISTS (SELECT 1 FROM orgs …)` then `RAISE NOTICE … skip` and `RETURN`.

## Repair migration inventory

Objects re-created by repair migrations may still be missing sibling objects (e.g. action registry repair does not fix placement tables).

- 20260430215000_repair_action_registry_foundation.sql
- 20260611120000_childcare_field_catalog_e1_repair.sql
- 20260612120000_enrollment_process_status_vocabulary_repair.sql
- 20260613120000_status_settings_category_repair.sql
- 20260614120000_enrollment_field_catalog_e3_repair.sql


## Recommended verification

After adding missing migrations, re-export staging reference:

```bash
DATABASE_URL='…' npm run export:supabase-schema
node scripts/generate-schema-docs.mjs
node scripts/supabase/audit_migrations.mjs --write-docs
```

Compare `missingTables`, `missingFuncs`, and `missingIndexes` counts — target **zero** for tables/functions required by app bootstrap.

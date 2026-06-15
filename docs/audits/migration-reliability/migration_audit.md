# Migration Audit

_Generated: 2026-06-14. Source: `node scripts/supabase/audit_migrations.mjs --write-docs`._

## Summary

| Metric | Value |
|--------|------:|
| Migration files | 173 |
| Tables created (parsed) | 164 |
| Functions created (parsed) | 63 |
| Staging tables (reference CSV) | 165 |
| Tables in staging absent from migrations | 4 |
| Forward-reference / ordering violations (all parse) | 229 |
| **Confirmed ordering blockers** | 3 |
| Org-specific hard failures (RAISE EXCEPTION) | 2 |

## 1. Forward table references (confirmed blockers)

- **`discount_programs`**: created in `20260329165048_remote_schema`, first referenced in `20260328120000_firstfree4x120_discount_program` (query)
- **`option_sets`**: created in `20260404130000_option_sets_location_fields_sqft_tier_key`, first referenced in `20260403120000_quote_intake_option_sets_specialty_opportunity` (query)
- **`placement_candidates`**: referenced in `20260605100000_waitlist_queue_lane_query_indexes` but never created in migration chain (index_on)

### Notable confirmed cases

| Object | Problem | Migrations |
|--------|---------|------------|
| `discount_programs` | UPDATE before baseline CREATE | `20260328120000` → `20260329165048` |
| `option_sets` / `option_set_items` | INSERT before CREATE TABLE | `20260403120000` → `20260404130000` |
| `placement_candidates` | CREATE INDEX before CREATE TABLE | `20260605100000` (no foundation DDL) |

## 2. Forward function references

_No forward function ordering violations detected._

## 3. References to tables never created in migration chain

- **`placement_candidates`**
- **`placement_link_group_members`**
- **`placement_link_groups`**
- **`placement_overrides`**

_All other parse hits are CTE aliases or catalog queries — see `audit-summary.json`._

## 4. Org-specific seed assumptions

| Migration | Org UUID | Skip pattern (NOTICE) | Hard fail (EXCEPTION) |
|-----------|----------|----------------------|------------------------|
| `20260402143000_public_booking_field_config_seed.sql` | `7803388d…` | no | **yes** |
| `20260403100000_pipeline_stages_semantic_key_backfill.sql` | `7803388d…` | no | no |
| `20260408170000_record_overview_layouts_cleaning_org_jobs.sql` | `7803388d…` | no | no |
| `20260408180000_cleaning_org_operations_unassigned_work_unit_seed.sql` | `7803388d…` | no | no |
| `20260409090000_cleaning_org_departments_and_work_units_seed.sql` | `7803388d…` | no | no |
| `20260414140000_growth_work_unit_opportunity_queue_definitions.sql` | `7803388d…` | no | no |
| `20260423143000_opportunity_identity_seed_childcare_org.sql` | `7803388d…` | no | **yes** |
| `20260427153000_promote_system_field_registry_bend_to_target_org.sql` | `7803388d…` | yes | no |
| `20260430211000_childcare_mvp_control_plane_seed.sql` | `7803388d…` | yes | no |
| `20260430216000_childcare_org_delete_cleaning_location_field_definitions.sql` | `93667019…` | yes | no |
| `20260501200000_seed_staging_communication_provider_bindings.sql` | `93667019…` | no | no |
| `20260501201000_activate_staging_org_resend_binding.sql` | `93667019…` | no | no |
| `20260506120000_forms_medication_authorization_demo_seed.sql` | `7803388d…` | yes | no |
| `20260507130000_forms_medication_demo_option_sets.sql` | `7803388d…` | yes | no |
| `20260513103000_childcare_opportunity_drawer_append_tour_scheduling.sql` | `93667019…` | no | no |
| `20260522180000_staging_demo_org_ai_policy_task_assist_draft.sql` | `93667019…` | no | no |
| `20260523170000_staging_demo_org_ai_policy_workflow_assist_draft.sql` | `93667019…` | no | no |
| `20260602150000_demo_kurzman_cleanup_person_gender_options.sql` | `7803388d…` | yes | no |

### Hard-failure migrations (must convert to canonical skip)

- `20260402143000_public_booking_field_config_seed.sql` — org_not_found_raise_exception
- `20260423143000_opportunity_identity_seed_childcare_org.sql` — org_not_found_raise_exception

## 5. Repair migrations

- `20260430215000_repair_action_registry_foundation.sql`
- `20260611120000_childcare_field_catalog_e1_repair.sql`
- `20260612120000_enrollment_process_status_vocabulary_repair.sql`
- `20260613120000_status_settings_category_repair.sql`
- `20260614120000_enrollment_field_catalog_e3_repair.sql`

Repair migrations use `CREATE … IF NOT EXISTS` and conditional DDL. They compensate for objects that were applied in remote history but missing from a clean replay. Each should be validated against whether the root cause is now fixed.

## 6. Duplicate CREATE declarations

### Tables

- `customer_person_role_types`: first `20260329165048_remote_schema`, again `20260403101000_customer_person_role_type_primary_contact_seed`
- `IF`: first `20260402140000_field_sections_public_visibility`, again `20260430133000_opportunity_customer_members_foundation`
- `action_definitions`: first `20260427180000_action_definitions_and_placements`, again `20260430215000_repair_action_registry_foundation`
- `action_placements`: first `20260427180000_action_definitions_and_placements`, again `20260430215000_repair_action_registry_foundation`

### Functions

- `trg_post_payment_to_ledger`: first `20260329165048_remote_schema`, again `20260329210000_payments_payment_allocations`
- `get_quote_pricing`: first `20260329165048_remote_schema`, again `20260404130000_option_sets_location_fields_sqft_tier_key`
- `get_quote_pricing`: first `20260329165048_remote_schema`, again `20260407130000_get_quote_pricing_matrix_resolution`
- `enforce_form_submissions_submitted_immutability`: first `20260506100000_forms_engine_v1_foundation`, again `20260509134500_forms_submissions_operator_intake_metadata_and_fk_updates`
- `enforce_operational_tasks_org_matches_opportunity`: first `20260521103000_task_assist_v1_1_foundation`, again `20260603120001_operational_tasks_general_unlinked`

## 7. Live replay status

`supabase db reset` was **not executed** in this audit environment (requires local Docker approval). Run:

```bash
./supabase/scripts/validate_migration_replay.sh
```

## 8. In-flight migration renames (working tree)

This branch shows deleted/replaced timestamps that must not double-apply on staging:

| Deleted | Replacement |
|---------|-------------|
| `20260603120000_operational_tasks_general_unlinked.sql` | `20260603120001_operational_tasks_general_unlinked.sql` |
| `20260610140000_location_program_categories.sql` | `20260610140001_location_program_categories.sql` |

Confirm `supabase_migrations.schema_migrations` on staging has only the replacement versions before merge.

## Methodology limits

Static regex parsing misses: dynamic SQL, qualified names outside `public`, objects created only in Supabase dashboard, and column-level drift. Staging comparison uses committed `docs/supabase/reference/*.csv` snapshot.

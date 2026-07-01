-- Canonical Data System — Phase 1 demo operational reset (local/staging only)
--
-- PURPOSE: Delete bad/untrusted demo CRM rows while preserving platform configuration.
-- DO NOT run in production. DO NOT run automatically from app code or migrations.
--
-- Preferred programmatic reset (dry-run by default):
--   DEMO_RESET_ORG_ID=<uuid> npx tsx web/scripts/resetStagingDemoData.ts
--   DEMO_RESET_ORG_ID=<uuid> DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA npx tsx web/scripts/resetStagingDemoData.ts --execute
--
-- This SQL is a manual alternative for local Supabase when you want a full org CRM wipe
-- (acceptable when only a handful of bad demo records exist).
--
-- SET org scope before running (psql example):
--   \set org_id '00000000-0000-0000-0000-000000000000'
--
-- PRESERVED (not deleted):
--   orgs, org_settings, departments, work_units, field_definitions, field_section_definitions,
--   field_values tied to config-only entities, status_definitions, status_transition_rules,
--   action_definitions, action_placements, record_drawer_layouts, record_layouts,
--   form_definitions, workflows, option_sets, locations (sites), role_definitions, permissions
--
-- DELETED (org-scoped operational CRM graph):
--   opportunities → opportunity_customer_members → opportunity_persons
--   customer_members, customer_persons, persons, customers (household shells)
--   field_values for deleted entity ids (orphan cleanup)
--   tour_bookings, placement_candidates, operational_tasks linked to deleted opportunities
--   workflow_events / activity tied to deleted opportunity ids (best-effort)

BEGIN;

-- Replace with your demo org id:
-- DELETE ... WHERE org_id = :'org_id';

-- 1) Collect opportunity ids for scoped cleanup (uncomment and set org_id)
-- CREATE TEMP TABLE _reset_opps AS
--   SELECT id FROM public.opportunities WHERE org_id = :'org_id';

-- 2) Child enrollment + case links
-- DELETE FROM public.opportunity_customer_members WHERE org_id = :'org_id';
-- DELETE FROM public.opportunity_persons WHERE org_id = :'org_id';
-- DELETE FROM public.opportunity_tags WHERE opportunity_id IN (SELECT id FROM public.opportunities WHERE org_id = :'org_id');

-- 3) Case records
-- DELETE FROM public.tour_bookings WHERE org_id = :'org_id';
-- DELETE FROM public.placement_candidates WHERE org_id = :'org_id';
-- DELETE FROM public.opportunities WHERE org_id = :'org_id';

-- 4) Household graph (demo-only — skips when multiple tenants share persons)
-- DELETE FROM public.customer_members WHERE org_id = :'org_id';
-- DELETE FROM public.customer_persons WHERE org_id = :'org_id';
-- DELETE FROM public.customers WHERE org_id = :'org_id';
-- DELETE FROM public.person_relationships WHERE org_id = :'org_id';
-- DELETE FROM public.persons WHERE org_id = :'org_id';

-- 5) Orphan field_values for deleted CRM entities (safe after entity deletes)
-- DELETE FROM public.field_values fv
-- WHERE fv.org_id = :'org_id'
--   AND fv.entity_type IN ('opportunity', 'inquiry_child', 'customer_member', 'person', 'customer');

-- 6) Legacy contacts (compatibility only — optional)
-- DELETE FROM public.contacts WHERE org_id = :'org_id';

ROLLBACK; -- Change to COMMIT only after reviewing counts on local/staging

-- Verification queries (run after reset):
-- SELECT count(*) FROM public.opportunities WHERE org_id = :'org_id';
-- SELECT count(*) FROM public.field_definitions WHERE org_id = :'org_id'; -- should be unchanged

-- Demo / runtime cleanup — DRY RUN (zero writes)
-- Counts rows that would be deleted for one org.
--
-- Usage (psql):
--   psql "$DATABASE_URL" -v org_id="'<ORG_UUID>'" -f supabase/scripts/demo_runtime_cleanup_dry_run.sql
--
-- Optional narrow filter (set ONE of these):
--   -v demo_seed_package="'golden_path_enrollment_v1'"
--   -v demo_seed_run_id="'<RUN_UUID>'"
--   -v demo_seed_family_key="'martinez_golden_v1'"
--
-- @see docs/governance/demo-runtime-cleanup-schema-audit.md

\set ON_ERROR_STOP on

-- psql variables: org_id is required; filter vars default to empty string = broad demo scope
\if :{?org_id}
\else
\echo 'ERROR: pass -v org_id="''<uuid>''"'
\quit
\endif

BEGIN;

-- Demo opportunity anchor set
CREATE TEMP TABLE demo_opps ON COMMIT DROP AS
SELECT id, customer_id, primary_person_id
FROM opportunities
WHERE org_id = :org_id::uuid
  AND (
    CASE
      WHEN NULLIF(:'demo_seed_run_id', '') IS NOT NULL THEN metadata->>'demo_seed_run_id' = :'demo_seed_run_id'
      WHEN NULLIF(:'demo_seed_family_key', '') IS NOT NULL THEN metadata->>'demo_seed_family_key' = :'demo_seed_family_key'
      WHEN NULLIF(:'demo_seed_package', '') IS NOT NULL THEN metadata->>'demo_seed_package' = :'demo_seed_package'
      ELSE (
        metadata->>'is_demo_data' = 'true'
        OR metadata->>'seed_source' = 'staging_demo_reset'
        OR metadata->>'demo_seed_package' IN (
          'staging_realistic_childcare_seed_v1',
          'enrollment_pipeline_demo_v1',
          'enrollment_pipeline_demo_v2',
          'childcare_demo_v1',
          'access_validation_demo_v1',
          'access_validation_demo_v2',
          'demo_one_family_gate_v1',
          'golden_path_enrollment_v1',
          'childcare_one_scenario_v1'
        )
        OR metadata->>'seed_key' LIKE 'childcare_realistic%'
        OR metadata->>'seed_key' LIKE 'enroll_demo%'
        OR metadata->>'seed_key' LIKE 'golden_path%'
        OR metadata->>'demo_seed' LIKE 'childcare_one_scenario%'
      )
    END
  );

CREATE TEMP TABLE demo_customers ON COMMIT DROP AS
SELECT DISTINCT id FROM (
  SELECT id FROM customers
  WHERE org_id = :org_id::uuid
    AND (
      CASE
        WHEN NULLIF(:'demo_seed_run_id', '') IS NOT NULL THEN metadata->>'demo_seed_run_id' = :'demo_seed_run_id'
        WHEN NULLIF(:'demo_seed_family_key', '') IS NOT NULL THEN metadata->>'demo_seed_family_key' = :'demo_seed_family_key'
        WHEN NULLIF(:'demo_seed_package', '') IS NOT NULL THEN metadata->>'demo_seed_package' = :'demo_seed_package'
        ELSE metadata->>'is_demo_data' = 'true' OR metadata->>'seed_key' LIKE 'golden_path%'
      END
    )
  UNION
  SELECT customer_id FROM demo_opps WHERE customer_id IS NOT NULL
) s;

CREATE TEMP TABLE demo_persons ON COMMIT DROP AS
SELECT DISTINCT id FROM (
  SELECT id FROM persons
  WHERE org_id = :org_id::uuid
    AND (
      CASE
        WHEN NULLIF(:'demo_seed_run_id', '') IS NOT NULL THEN metadata->>'demo_seed_run_id' = :'demo_seed_run_id'
        WHEN NULLIF(:'demo_seed_family_key', '') IS NOT NULL THEN metadata->>'demo_seed_family_key' = :'demo_seed_family_key'
        WHEN NULLIF(:'demo_seed_package', '') IS NOT NULL THEN metadata->>'demo_seed_package' = :'demo_seed_package'
        ELSE metadata->>'is_demo_data' = 'true' OR metadata->>'seed_key' LIKE 'golden_path%'
      END
    )
  UNION SELECT primary_person_id FROM demo_opps WHERE primary_person_id IS NOT NULL
  UNION SELECT person_id FROM customer_members WHERE org_id = :org_id::uuid AND customer_id IN (SELECT id FROM demo_customers) AND person_id IS NOT NULL
  UNION SELECT person_id FROM customer_persons WHERE org_id = :org_id::uuid AND customer_id IN (SELECT id FROM demo_customers)
) s;

CREATE TEMP TABLE demo_jobs ON COMMIT DROP AS
SELECT id FROM jobs
WHERE org_id = :org_id::uuid
  AND (opportunity_id IN (SELECT id FROM demo_opps) OR customer_id IN (SELECT id FROM demo_customers));

CREATE TEMP TABLE demo_threads ON COMMIT DROP AS
SELECT id FROM communication_threads
WHERE org_id = :org_id::uuid
  AND (
    (primary_entity_type = 'opportunities' AND primary_entity_id IN (SELECT id FROM demo_opps))
    OR (
      CASE
        WHEN NULLIF(:'demo_seed_run_id', '') IS NOT NULL THEN metadata->>'demo_seed_run_id' = :'demo_seed_run_id'
        WHEN NULLIF(:'demo_seed_family_key', '') IS NOT NULL THEN metadata->>'demo_seed_family_key' = :'demo_seed_family_key'
        WHEN NULLIF(:'demo_seed_package', '') IS NOT NULL THEN metadata->>'demo_seed_package' = :'demo_seed_package'
        ELSE metadata->>'is_demo_data' = 'true'
      END
    )
  );

CREATE TEMP TABLE demo_form_submissions ON COMMIT DROP AS
SELECT id FROM form_submissions
WHERE org_id = :org_id::uuid
  AND (opportunity_id IN (SELECT id FROM demo_opps) OR customer_id IN (SELECT id FROM demo_customers));

-- Report counts (read-only within transaction; rolled back at end)
SELECT 'communication_threads' AS table_name, COUNT(*)::bigint AS row_count FROM communication_threads WHERE id IN (SELECT id FROM demo_threads)
UNION ALL SELECT 'communication_messages', COUNT(*) FROM communication_messages WHERE thread_id IN (SELECT id FROM demo_threads)
UNION ALL SELECT 'communication_scheduled_sends', COUNT(*) FROM communication_scheduled_sends WHERE org_id = :org_id::uuid AND entity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'operational_tasks', COUNT(*) FROM operational_tasks WHERE org_id = :org_id::uuid AND entity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'placement_candidates', COUNT(*) FROM placement_candidates WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'tour_bookings', COUNT(*) FROM tour_bookings WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'opportunity_customer_members', COUNT(*) FROM opportunity_customer_members WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps)
UNION ALL SELECT 'form_submissions', COUNT(*) FROM form_submissions WHERE id IN (SELECT id FROM demo_form_submissions)
UNION ALL SELECT 'documents', COUNT(*) FROM documents WHERE org_id = :org_id::uuid AND entity_id IN (SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers)
UNION ALL SELECT 'field_values', COUNT(*) FROM field_values WHERE org_id = :org_id::uuid AND entity_id IN (SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers)
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs WHERE id IN (SELECT id FROM demo_jobs)
UNION ALL SELECT 'opportunities', COUNT(*) FROM demo_opps
UNION ALL SELECT 'customer_members', COUNT(*) FROM customer_members WHERE org_id = :org_id::uuid AND customer_id IN (SELECT id FROM demo_customers)
UNION ALL SELECT 'customers', COUNT(*) FROM demo_customers
UNION ALL SELECT 'persons', COUNT(*) FROM demo_persons
ORDER BY table_name;

ROLLBACK; -- dry run: no writes persisted

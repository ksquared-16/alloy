-- Demo / runtime cleanup — EXECUTE (single transaction)
--
-- SAFETY:
--   1. Run demo_runtime_cleanup_dry_run.sql first and review counts.
--   2. Default ends with ROLLBACK for rehearsal. Change final ROLLBACK → COMMIT only after review.
--   3. Set perform_delete = true to allow deletes (guard below).
--
-- Usage:
--   psql "$DATABASE_URL" \
--     -v org_id="'<ORG_UUID>'" \
--     -v perform_delete=true \
--     -f supabase/scripts/demo_runtime_cleanup_execute.sql
--
-- Narrow filter example:
--   -v demo_seed_package="'golden_path_enrollment_v1'" -v perform_delete=true
--
-- @see docs/governance/demo-runtime-cleanup-schema-audit.md

\set ON_ERROR_STOP on

\if :{?org_id}
\else
\echo 'ERROR: pass -v org_id="''<uuid>''"'
\quit
\endif

-- Default: rehearsal mode (no deletes). Pass -v perform_delete=true to execute.
\if :{?perform_delete}
\else
\set perform_delete false
\endif

BEGIN;

DO $$
BEGIN
  IF current_setting('perform_delete', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Refusing deletes: pass -v perform_delete=true after dry-run review';
  END IF;
END $$;

-- === Anchor temp tables (same as dry-run) ===
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
          'staging_realistic_childcare_seed_v1','enrollment_pipeline_demo_v1','enrollment_pipeline_demo_v2',
          'childcare_demo_v1','access_validation_demo_v1','access_validation_demo_v2',
          'demo_one_family_gate_v1','golden_path_enrollment_v1','childcare_one_scenario_v1'
        )
        OR metadata->>'seed_key' LIKE 'childcare_realistic%'
        OR metadata->>'seed_key' LIKE 'enroll_demo%'
        OR metadata->>'seed_key' LIKE 'golden_path%'
      )
    END
  );

CREATE TEMP TABLE demo_customers ON COMMIT DROP AS
SELECT DISTINCT id FROM (
  SELECT id FROM customers WHERE org_id = :org_id::uuid AND metadata->>'is_demo_data' = 'true'
  UNION SELECT customer_id FROM demo_opps WHERE customer_id IS NOT NULL
) s;

CREATE TEMP TABLE demo_persons ON COMMIT DROP AS
SELECT DISTINCT id FROM (
  SELECT id FROM persons WHERE org_id = :org_id::uuid AND metadata->>'is_demo_data' = 'true'
  UNION SELECT primary_person_id FROM demo_opps WHERE primary_person_id IS NOT NULL
  UNION SELECT person_id FROM customer_members WHERE org_id = :org_id::uuid AND customer_id IN (SELECT id FROM demo_customers) AND person_id IS NOT NULL
) s;

CREATE TEMP TABLE demo_threads ON COMMIT DROP AS
SELECT id FROM communication_threads
WHERE org_id = :org_id::uuid
  AND primary_entity_type = 'opportunities'
  AND primary_entity_id IN (SELECT id FROM demo_opps);

CREATE TEMP TABLE demo_jobs ON COMMIT DROP AS
SELECT id FROM jobs WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps);

CREATE TEMP TABLE demo_form_submissions ON COMMIT DROP AS
SELECT id FROM form_submissions WHERE org_id = :org_id::uuid AND opportunity_id IN (SELECT id FROM demo_opps);

-- === Deletes: children → parents (log via NOTICE) ===
DO $cleanup$
DECLARE
  n bigint;
BEGIN
  -- Communications
  DELETE FROM communication_message_reads WHERE message_id IN (
    SELECT id FROM communication_messages WHERE thread_id IN (SELECT id FROM demo_threads)
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'communication_message_reads: %', n;

  DELETE FROM communication_messages WHERE thread_id IN (SELECT id FROM demo_threads);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'communication_messages: %', n;

  DELETE FROM communication_scheduled_sends WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'communication_scheduled_sends: %', n;

  DELETE FROM communication_threads WHERE id IN (SELECT id FROM demo_threads);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'communication_threads: %', n;

  DELETE FROM operational_tasks WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'operational_tasks: %', n;

  DELETE FROM task_assist_proposals WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'task_assist_proposals: %', n;

  DELETE FROM placement_overrides WHERE placement_candidate_id IN (
    SELECT id FROM placement_candidates WHERE opportunity_id IN (SELECT id FROM demo_opps)
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'placement_overrides: %', n;

  DELETE FROM placement_link_group_members WHERE placement_candidate_id IN (
    SELECT id FROM placement_candidates WHERE opportunity_id IN (SELECT id FROM demo_opps)
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'placement_link_group_members: %', n;

  DELETE FROM placement_link_groups WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'placement_link_groups: %', n;

  DELETE FROM placement_candidates WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'placement_candidates: %', n;

  DELETE FROM tour_public_booking_links WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'tour_public_booking_links: %', n;

  DELETE FROM tour_bookings WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'tour_bookings: %', n;

  DELETE FROM opportunity_tags WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'opportunity_tags: %', n;

  DELETE FROM opportunity_persons WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'opportunity_persons: %', n;

  DELETE FROM opportunity_customer_members WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'opportunity_customer_members: %', n;

  DELETE FROM quotes WHERE opportunity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'quotes: %', n;

  DELETE FROM discount_redemptions WHERE opportunity_id IN (SELECT id FROM demo_opps) OR job_id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'discount_redemptions: %', n;

  DELETE FROM messages WHERE opportunity_id IN (SELECT id FROM demo_opps) OR job_id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'messages: %', n;

  DELETE FROM workflow_action_runs WHERE workflow_run_id IN (
    SELECT id FROM workflow_runs WHERE event_id IN (
      SELECT id FROM workflow_events WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps)
    )
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'workflow_action_runs: %', n;

  DELETE FROM messages_outbox WHERE workflow_run_id IN (
    SELECT id FROM workflow_runs WHERE event_id IN (
      SELECT id FROM workflow_events WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps)
    )
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'messages_outbox: %', n;

  DELETE FROM workflow_runs WHERE event_id IN (
    SELECT id FROM workflow_events WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps)
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'workflow_runs: %', n;

  DELETE FROM workflow_events WHERE org_id = :'org_id'::uuid AND entity_id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'workflow_events: %', n;

  DELETE FROM payments WHERE job_id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'payments: %', n;

  DELETE FROM assignments WHERE job_id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'assignments: %', n;

  DELETE FROM schedules WHERE job_id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'schedules: %', n;

  DELETE FROM jobs WHERE id IN (SELECT id FROM demo_jobs);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'jobs: %', n;

  DELETE FROM form_submission_signatures WHERE form_submission_id IN (SELECT id FROM demo_form_submissions);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'form_submission_signatures: %', n;

  DELETE FROM form_submission_documents WHERE form_submission_id IN (SELECT id FROM demo_form_submissions);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'form_submission_documents: %', n;

  DELETE FROM form_submissions WHERE id IN (SELECT id FROM demo_form_submissions);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'form_submissions: %', n;

  DELETE FROM document_field_values WHERE document_id IN (
    SELECT id FROM documents WHERE org_id = :'org_id'::uuid AND entity_id IN (
      SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers
    )
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'document_field_values: %', n;

  DELETE FROM document_versions WHERE document_id IN (
    SELECT id FROM documents WHERE org_id = :'org_id'::uuid AND entity_id IN (
      SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers
    )
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'document_versions: %', n;

  DELETE FROM documents WHERE org_id = :'org_id'::uuid AND entity_id IN (
    SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'documents: %', n;

  DELETE FROM field_values WHERE org_id = :'org_id'::uuid AND entity_id IN (
    SELECT id FROM demo_opps UNION SELECT id FROM demo_persons UNION SELECT id FROM demo_customers
  );
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'field_values: %', n;

  DELETE FROM opportunities WHERE id IN (SELECT id FROM demo_opps);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'opportunities: %', n;

  DELETE FROM customer_members WHERE customer_id IN (SELECT id FROM demo_customers);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'customer_members: %', n;

  DELETE FROM customer_persons WHERE customer_id IN (SELECT id FROM demo_customers);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'customer_persons: %', n;

  DELETE FROM person_relationships WHERE from_person_id IN (SELECT id FROM demo_persons) OR to_person_id IN (SELECT id FROM demo_persons);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'person_relationships: %', n;

  DELETE FROM customers WHERE id IN (SELECT id FROM demo_customers);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'customers: %', n;

  DELETE FROM persons WHERE id IN (SELECT id FROM demo_persons);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'persons: %', n;
END
$cleanup$;

-- Rehearsal default: no persistent writes. Change to COMMIT after dry-run + review.
ROLLBACK;

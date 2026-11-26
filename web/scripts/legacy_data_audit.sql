-- ============================================================================
-- Legacy / Demo / Stale Data Audit — READ ONLY (no writes)
-- ============================================================================
-- Enumerates every operator-visible suspect record so it can be classified
-- A(delete) / B(deactivate) / C(migrate) / D(keep) BEFORE any cleanup.
--
-- HOW TO RUN (psql): set the org, then run the file.
--   \set org_id 'YOUR-ORG-UUID'
--   \i web/scripts/legacy_data_audit.sql
-- Or in the Supabase SQL editor: replace :'org_id' with a literal '...'.
--
-- Column/table names are inferred from the application code (statusDefinitions,
-- work_units, departments.metadata.lifecycle_builder_v1, demo seed markers).
-- Verify against the live schema before acting. NOTHING here mutates data.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- A. DEMO / SEED ROWS (targetable by explicit markers written by the seed scripts)
--    Markers: metadata.is_demo_data, metadata.seed_source, metadata.demo_seed_package,
--    metadata.seed_key, external_id LIKE 'seed_opportunity_identity_%'
-- ─────────────────────────────────────────────────────────────────────────
WITH demo_pkg(pkg) AS (VALUES
  ('staging_realistic_childcare_seed_v1'),
  ('enrollment_pipeline_demo_v1'), ('enrollment_pipeline_demo_v2'),
  ('childcare_demo_v1'), ('waitlist_demo_v1'),
  ('access_validation_demo_v1'), ('access_validation_demo_v2')
),
demo_src(src) AS (VALUES
  ('staging_demo_reset'), ('opportunity_identity_seed_childcare_org'), ('demo_one_family_gate')
)
SELECT 'opportunities' AS tbl, o.id, o.org_id, o.name AS label,
       o.metadata->>'seed_source'       AS seed_source,
       o.metadata->>'demo_seed_package' AS demo_pkg,
       o.metadata->>'seed_key'          AS seed_key,
       (o.metadata->>'is_demo_data')    AS is_demo_data
FROM opportunities o
WHERE o.org_id = :'org_id'
  AND ( (o.metadata->>'is_demo_data')::boolean IS TRUE
     OR o.metadata->>'seed_source'       IN (SELECT src FROM demo_src)
     OR o.metadata->>'demo_seed_package' IN (SELECT pkg FROM demo_pkg)
     OR o.metadata->>'seed_key' LIKE 'childcare_realistic:%'
     OR o.metadata->>'seed_key' LIKE 'enroll_demo_%'
     OR o.metadata->>'seed_key' LIKE 'dept_seed%'
     OR o.external_id LIKE 'seed_opportunity_identity_%' );

-- Repeat the same marker predicate for the other seeded tables. Run each:
--   persons, customers, customer_persons, customer_members, locations, quotes,
--   communication_threads, communication_messages, jobs, schedules
-- Example (persons):
SELECT 'persons' AS tbl, p.id, p.org_id,
       concat_ws(' ', p.first_name, p.last_name) AS label,
       p.metadata->>'seed_source' AS seed_source,
       p.metadata->>'demo_seed_package' AS demo_pkg,
       p.email
FROM persons p
WHERE p.org_id = :'org_id'
  AND ( (p.metadata->>'is_demo_data')::boolean IS TRUE
     OR p.metadata->>'seed_source' IN ('staging_demo_reset','opportunity_identity_seed_childcare_org')
     OR p.metadata->>'demo_seed_package' IS NOT NULL
     OR p.email LIKE '%@example.com' OR p.email LIKE '%@example.net'
     OR p.email LIKE '%@testmail.local' OR p.email LIKE '%@demo.alloy.invalid' );

-- Counts per marker (quick triage of blast radius):
SELECT o.metadata->>'demo_seed_package' AS demo_pkg, count(*)
FROM opportunities o WHERE o.org_id = :'org_id' AND o.metadata->>'demo_seed_package' IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- B. STRAY / LEGACY LIFECYCLE PROCESSES  (THE "Enrollment (legacy)" ROW)
--    NOT a table row — a JSON entry in departments.metadata.lifecycle_builder_v1.processes[].
--    Cleanup = remove/dedup that JSON entry (see cleanupEnrollmentLifecycleProcesses.ts).
-- ─────────────────────────────────────────────────────────────────────────
SELECT d.id AS department_id, d.org_id, d.name AS department_name,
       proc->>'id'   AS process_id,
       proc->>'name' AS process_name,
       proc->>'key'  AS process_key,
       proc->>'is_active' AS process_is_active
FROM departments d,
     jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') AS proc
WHERE d.org_id = :'org_id'
  AND ( (proc->>'name') ILIKE '%(legacy)%'
     OR (proc->>'name') ILIKE '%enrollment(s)%'
     OR lower(proc->>'name') = 'lead management' );

-- B2. Departments with DUPLICATE enrollment-like processes (old + new coexisting):
SELECT d.id AS department_id, d.org_id, d.name AS department_name,
       count(*) FILTER (WHERE (proc->>'name') ILIKE '%enrollment%') AS enrollment_like_processes,
       array_agg(proc->>'name') AS process_names
FROM departments d,
     jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') AS proc
WHERE d.org_id = :'org_id'
GROUP BY 1,2,3
HAVING count(*) FILTER (WHERE (proc->>'name') ILIKE '%enrollment%') > 1;

-- B3. name_mismatch candidates — REVIEW ONLY, DO NOT auto-purge. A name_mismatch is a
--     LIVE builder-owned process whose name drifted from the department tile; it may be
--     canonical. Compare the process name to the department name and decide per row.
SELECT d.id AS department_id, d.org_id, d.name AS department_name,
       proc->>'name' AS process_name,
       (lower(trim(d.name)) = lower(trim(proc->>'name'))) AS name_matches_tile
FROM departments d,
     jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') AS proc
WHERE d.org_id = :'org_id'
  AND (proc->>'is_active')::boolean IS TRUE
  AND lower(trim(coalesce(d.name,''))) <> lower(trim(coalesce(proc->>'name','')));

-- ─────────────────────────────────────────────────────────────────────────
-- C. ORPHANED / STALE WORK UNITS
-- ─────────────────────────────────────────────────────────────────────────
-- C1. Work unit whose backing department no longer exists:
SELECT wu.id, wu.org_id, wu.key, wu.name, wu.is_active, wu.department_id
FROM work_units wu
LEFT JOIN departments d ON d.id = wu.department_id AND d.org_id = wu.org_id
WHERE wu.org_id = :'org_id' AND d.id IS NULL;

-- C2. lifecycle_wu_* work unit with no matching ACTIVE builder stage (orphaned by stage deletion):
SELECT wu.id, wu.org_id, wu.key, wu.name, wu.is_active
FROM work_units wu
WHERE wu.org_id = :'org_id'
  AND wu.is_active = true
  AND wu.key LIKE 'lifecycle_wu_%'
  AND NOT EXISTS (
    SELECT 1 FROM departments d,
      jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') AS proc,
      jsonb_array_elements(proc->'stages') AS stage
    WHERE d.id = wu.department_id AND d.org_id = wu.org_id
      AND ('lifecycle_wu_' || (stage->>'key')) = wu.key
      AND (stage->>'is_active')::boolean IS TRUE
  );

-- C3. Legacy enrollment_pipeline work unit still ACTIVE with zero bound opportunities:
SELECT wu.id, wu.org_id, wu.key, wu.name, wu.is_active
FROM work_units wu
WHERE wu.org_id = :'org_id'
  AND wu.key = 'enrollment_pipeline'
  AND wu.is_active = true
  AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.work_unit_id = wu.id);

-- ─────────────────────────────────────────────────────────────────────────
-- D. STALE STATUS KEYS (obsolete new_inquiry, keys with no active definition)
-- ─────────────────────────────────────────────────────────────────────────
-- D1. Opportunities still on the legacy new_inquiry key (candidates to backfill to 'open'):
SELECT o.id, o.org_id, o.status_key, o.stage_key, o.name
FROM opportunities o
WHERE o.org_id = :'org_id' AND o.status_key = 'new_inquiry';

-- D2. Opportunity status_key with NO active status_definition (org override or industry default):
SELECT o.id, o.org_id, o.status_key
FROM opportunities o
WHERE o.org_id = :'org_id' AND o.status_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM status_definitions sd
    WHERE sd.status_key = o.status_key
      AND sd.entity_type IN ('opportunities','opportunity')
      AND (sd.org_id = o.org_id OR sd.org_id IS NULL)
      AND sd.is_active = true
  );

-- ─────────────────────────────────────────────────────────────────────────
-- E. INACTIVE WORK UNITS still reachable by the raw list endpoint (code gap GAP-1)
--    (The /api/admin/work-units endpoint does not filter is_active — this shows what leaks.)
-- ─────────────────────────────────────────────────────────────────────────
SELECT wu.id, wu.org_id, wu.department_id, wu.key, wu.name, wu.is_active
FROM work_units wu
WHERE wu.org_id = :'org_id' AND wu.is_active = false;

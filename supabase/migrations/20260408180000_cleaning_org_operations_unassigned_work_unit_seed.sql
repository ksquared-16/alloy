-- =============================================================================
-- V2 workspace slice 1 — Operations department + Unassigned Jobs work unit
-- =============================================================================
-- Staging / Alloy Bend cleaning org (same UUID as public booking + RRS seeds).
-- Idempotent: INSERT … ON CONFLICT DO UPDATE on (org_id, key) and (department_id, key).
-- No-op when org row is missing (department insert guarded; work unit SELECT returns 0 rows).
--
-- Verification:
--   SELECT id, key, name, sort_order, is_active FROM public.departments
--   WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423' AND key = 'operations';
--   SELECT w.id, w.key, w.name, w.queue_definition, d.key AS department_key
--   FROM public.work_units w
--   JOIN public.departments d ON d.id = w.department_id
--   WHERE w.org_id = '7803388d-cdee-4afb-89cf-23a137f39423' AND w.key = 'unassigned_jobs';
-- =============================================================================

INSERT INTO public.departments (
    org_id,
    key,
    name,
    description,
    sort_order,
    is_active,
    metadata,
    updated_at
)
SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'operations',
    'Operations',
    NULL::text,
    0,
    true,
    '{}'::jsonb,
    now()
WHERE EXISTS (
    SELECT 1 FROM public.orgs o WHERE o.id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
)
ON CONFLICT (org_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.work_units (
    org_id,
    department_id,
    key,
    name,
    description,
    sort_order,
    is_active,
    queue_definition,
    metadata,
    updated_at
)
SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    d.id,
    'unassigned_jobs',
    'Unassigned Jobs',
    NULL::text,
    0,
    true,
    '{}'::jsonb,
    jsonb_build_object('seed', '20260408180000_v2_workspace_slice_1')::jsonb,
    now()
FROM public.departments d
WHERE d.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
  AND d.key = 'operations'
ON CONFLICT (department_id, key) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    queue_definition = EXCLUDED.queue_definition,
    updated_at = now();

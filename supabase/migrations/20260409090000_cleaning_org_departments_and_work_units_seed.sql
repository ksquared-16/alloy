-- =============================================================================
-- Cleaning org — full department tree + initial work units (Phase 1 + 2)
-- =============================================================================
-- Staging / Alloy Bend cleaning org (same UUID as public booking, RRS, and
-- 20260408180000_cleaning_org_operations_unassigned_work_unit_seed).
--
-- Idempotent:
--   - departments: INSERT … ON CONFLICT (org_id, key) DO UPDATE
--   - work_units:  INSERT … ON CONFLICT (department_id, key) DO UPDATE
-- Unique constraints: uq_departments_org_key, uq_work_units_department_key
--
-- No-op when org row is missing (WHERE EXISTS guards).
--
-- Verification:
--   SELECT key, name, sort_order FROM departments
--   WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423' ORDER BY sort_order;
--   SELECT d.key AS dept, w.key, w.name, w.sort_order
--   FROM work_units w JOIN departments d ON d.id = w.department_id
--   WHERE w.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
--   ORDER BY d.sort_order, w.sort_order;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Phase 1 — Departments
-- -----------------------------------------------------------------------------

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
    x.key,
    x.name,
    NULL::text,
    x.sort_order,
    true,
    '{}'::jsonb,
    now()
FROM (VALUES
    ('operations', 'Operations', 0),
    ('finance', 'Finance', 1),
    ('growth', 'Growth', 2),
    ('customer_experience', 'Customer Experience', 3),
    ('system', 'System', 4)
) AS x(key, name, sort_order)
WHERE EXISTS (
    SELECT 1 FROM public.orgs o WHERE o.id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
)
ON CONFLICT (org_id, key) DO UPDATE SET
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Phase 2 — Work units (by department key)
-- -----------------------------------------------------------------------------

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
    d.org_id,
    d.id,
    wu.key,
    wu.name,
    NULL::text,
    wu.sort_order,
    true,
    '{}'::jsonb,
    '{}'::jsonb,
    now()
FROM public.departments d
INNER JOIN (VALUES
    -- Operations
    ('operations', 'unassigned_jobs', 'Unassigned Jobs', 0),
    ('operations', 'todays_schedule', 'Today''s Schedule', 1),
    ('operations', 'needs_attention', 'Needs Attention', 2),
    -- Finance
    ('finance', 'unpaid_jobs', 'Unpaid Jobs', 0),
    ('finance', 'failed_payments', 'Failed Payments', 1),
    -- Growth
    ('growth', 'new_leads', 'New Leads', 0),
    ('growth', 'unbooked_quotes', 'Unbooked Quotes', 1),
    -- Customer Experience
    ('customer_experience', 'customer_issues', 'Customer Issues', 0),
    -- System
    ('system', 'failed_automations', 'Failed Automations', 0)
) AS wu(dept_key, key, name, sort_order)
    ON wu.dept_key = d.key
WHERE d.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
ON CONFLICT (department_id, key) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    queue_definition = EXCLUDED.queue_definition,
    updated_at = now();

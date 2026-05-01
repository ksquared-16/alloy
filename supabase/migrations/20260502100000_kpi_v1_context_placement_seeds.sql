-- KPI V1 — idempotent context-aware placement seeds (childcare orgs).
-- Do not modify 20260501193000_workspace_kpi_placement.sql (already applied).

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
)
INSERT INTO public.workspace_kpi_placement (
    org_id,
    surface,
    department_id,
    work_unit_id,
    metric_key,
    display_order,
    is_visible,
    metadata
)
SELECT
    c.org_id,
    'workspace'::text,
    NULL::uuid,
    NULL::uuid,
    'ctx.workspace.total_in_scope'::text,
    0,
    true,
    '{}'::jsonb
FROM childcare_orgs c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.workspace_kpi_placement p
    WHERE p.org_id = c.org_id
      AND p.surface = 'workspace'::text
      AND p.department_id IS NULL
      AND p.work_unit_id IS NULL
      AND p.metric_key = 'ctx.workspace.total_in_scope'::text
);

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
)
INSERT INTO public.workspace_kpi_placement (
    org_id,
    surface,
    department_id,
    work_unit_id,
    metric_key,
    display_order,
    is_visible,
    metadata
)
SELECT
    c.org_id,
    'department'::text,
    d.id,
    NULL::uuid,
    v.metric_key,
    v.display_order,
    true,
    '{}'::jsonb
FROM childcare_orgs c
JOIN public.departments d ON d.org_id = c.org_id AND d.is_active IS NOT FALSE
CROSS JOIN (
    VALUES
        ('ctx.dept.total_in_scope'::text, 5),
        ('ctx.dept.needs_attention_count'::text, 6)
) AS v(metric_key, display_order)
WHERE lower(trim(d.key)) = 'enrollment'::text
  AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_kpi_placement p
      WHERE p.org_id = c.org_id
        AND p.surface = 'department'::text
        AND p.department_id = d.id
        AND p.work_unit_id IS NULL
        AND p.metric_key = v.metric_key
        AND p.is_visible = true
  );

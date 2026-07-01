-- OIP workspace strip: seed demo OIP metrics on enrollment work units (family O bridge keys).
-- Does not replace existing Q-family placements.

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
),
enrollment_wus AS (
    SELECT w.id AS work_unit_id, w.org_id, d.id AS department_id
    FROM public.work_units w
    JOIN public.departments d ON d.id = w.department_id AND d.org_id = w.org_id
    JOIN childcare_orgs c ON c.org_id = w.org_id
    WHERE lower(trim(d.key)) = 'enrollment'::text
      AND w.is_active IS NOT FALSE
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
    e.org_id,
    'work_unit'::text,
    e.department_id,
    e.work_unit_id,
    v.metric_key,
    v.display_order,
    true,
    '{}'::jsonb
FROM enrollment_wus e
CROSS JOIN (
    VALUES
        ('oip.enrollment.tour_conversion_rate'::text, 20),
        ('oip.enrollment.time_to_schedule_tour'::text, 21),
        ('oip.ops.work_overdue_count'::text, 22)
) AS v(metric_key, display_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.workspace_kpi_placement p
    WHERE p.org_id = e.org_id
      AND p.surface = 'work_unit'::text
      AND p.work_unit_id = e.work_unit_id
      AND p.metric_key = v.metric_key
      AND p.is_visible = true
);

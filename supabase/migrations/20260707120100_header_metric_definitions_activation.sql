-- Header metric definitions activation (PR #30 — header runtime parity)
--
-- The header builder uses metric_placements to drive the runtime header strips.
-- Several metrics in the default templates had issues in the original seeds:
--   1. enrollment.lead_count and enrollment.tour_completed_count were seeded as
--      'draft', causing them to be created in metric_placements but filtered
--      at render time (resolvePlacementsForSurface checks def.status = 'active').
--   2. ops.work_overdue_count was in the adapter registry but had no seed row,
--      causing resolveDefinitionId to return null (silent publish skip).
-- This migration fixes both issues and seeds default workspace_header placements.

-- 1. Activate draft definitions that are implemented in the adapter registry.
UPDATE public.metric_definitions
SET status = 'active', updated_at = NOW()
WHERE org_id IS NULL
  AND source_type = 'oip_adapter'
  AND source_key IN (
    'enrollment.lead_count',
    'enrollment.tour_completed_count'
  )
  AND status = 'draft';

-- 2. Add ops.work_overdue_count definition (in adapter registry, not in original seeds).
INSERT INTO public.metric_definitions (
    org_id, key, label, description, category, entity_scope,
    source_type, source_key, aggregation, filter_config, dimension_config,
    default_period_config, unit, precision, is_kpi, target_config, threshold_config,
    status, version
)
SELECT
    NULL,
    'work_overdue_count',
    'Overdue Work',
    'Count of work units past their deadline in the current snapshot.',
    'operational_health',
    'org',
    'oip_adapter',
    'ops.work_overdue_count',
    'count',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"version":1,"kind":"rolling","days":30}'::jsonb,
    'count',
    0,
    true,
    '{"version":1,"kind":"count_max","targetMaxCount":5}'::jsonb,
    '{"version":1,"healthyMaxCount":5,"warningMaxCount":15}'::jsonb,
    'active',
    1
WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_definitions
    WHERE org_id IS NULL AND source_key = 'ops.work_overdue_count'
);

-- 3. Global visualization for ops.work_overdue_count.
INSERT INTO public.metric_visualizations (
    org_id, metric_definition_id, key, label, visualization_type,
    style_config, display_config, status, version
)
SELECT
    NULL,
    md.id,
    'work_overdue_kpi',
    'Overdue Work',
    'kpi_card',
    '{"version":1,"accent":"ops"}'::jsonb,
    '{"version":1,"compact":false}'::jsonb,
    'active',
    1
FROM public.metric_definitions md
WHERE md.org_id IS NULL AND md.source_key = 'ops.work_overdue_count'
  AND NOT EXISTS (
    SELECT 1 FROM public.metric_visualizations mv
    WHERE mv.org_id IS NULL AND mv.key = 'work_overdue_kpi'
  );

-- 4. Activate draft visualizations for now-active enrollment metrics.
UPDATE public.metric_visualizations
SET status = 'active', updated_at = NOW()
WHERE org_id IS NULL
  AND key IN ('lead_count_kpi', 'tour_completed_kpi')
  AND status = 'draft';

-- 5. Seed workspace_header default placements for childcare orgs.
--    Mirrors the work_unit_header seed pattern; uses primary_metrics zone
--    (the zone WorkspaceOperationalPulseStrip reads via MetricPlacementRenderer).
WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'
),
active_global_viz AS (
    SELECT mv.id AS visualization_id, mv.key AS viz_key
    FROM public.metric_visualizations mv
    WHERE mv.org_id IS NULL AND mv.status = 'active'
),
workspace_header_specs AS (
    SELECT gv.visualization_id, ps.surface, ps.surface_key, ps.placement_zone, ps.sort_order
    FROM active_global_viz gv
    JOIN (VALUES
        ('tour_conversion_kpi', 'workspace_header', 'default', 'primary_metrics', 10),
        ('needs_attention_kpi', 'workspace_header', 'default', 'primary_metrics', 20),
        ('work_overdue_kpi',    'workspace_header', 'default', 'primary_metrics', 30)
    ) AS ps(viz_key, surface, surface_key, placement_zone, sort_order)
    ON gv.viz_key = ps.viz_key
)
INSERT INTO public.metric_placements (
    org_id, visualization_id, surface, surface_key, placement_zone,
    context_config, visibility_config, sort_order, status, version
)
SELECT
    co.org_id,
    ps.visualization_id,
    ps.surface,
    ps.surface_key,
    ps.placement_zone,
    '{"version":1}'::jsonb,
    '{"version":1,"visible":true}'::jsonb,
    ps.sort_order,
    'active',
    1
FROM childcare_orgs co
CROSS JOIN workspace_header_specs ps
WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_placements mp
    WHERE mp.org_id = co.org_id
      AND mp.visualization_id = ps.visualization_id
      AND mp.surface = ps.surface
      AND mp.surface_key = ps.surface_key
      AND mp.placement_zone = ps.placement_zone
);

-- Analytics V2 — surface placement fixes + adapter enablement for usable platform QA.

-- Enable adapters that were implemented after initial seed.
UPDATE public.metric_definitions
SET status = 'active'
WHERE org_id IS NULL
  AND key IN ('lead_count', 'tour_completed_count')
  AND status = 'draft';

UPDATE public.metric_visualizations
SET status = 'active'
WHERE org_id IS NULL
  AND key IN ('lead_count_kpi', 'tour_completed_kpi')
  AND status = 'draft';

-- Normalize work unit header zone naming (overview → header_metrics).
UPDATE public.metric_placements
SET placement_zone = 'header_metrics'
WHERE surface = 'work_unit_header'
  AND placement_zone = 'overview';

-- Childcare org placements: work unit header + business process tiles.
WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
),
global_viz AS (
    SELECT mv.id AS visualization_id, mv.key AS viz_key
    FROM public.metric_visualizations mv
    WHERE mv.org_id IS NULL AND mv.status = 'active'::text
),
placement_specs AS (
    SELECT gv.visualization_id, ps.surface, ps.surface_key, ps.placement_zone, ps.sort_order
    FROM global_viz gv
    JOIN (VALUES
        ('tour_conversion_kpi', 'work_unit_header', 'default', 'header_metrics', 10),
        ('needs_attention_chip', 'work_unit_header', 'default', 'header_metrics', 20),
        ('tour_conversion_kpi', 'business_process_tile', 'enrollment', 'tile_metrics', 10),
        ('needs_attention_chip', 'business_process_tile', 'enrollment', 'tile_metrics', 20),
        ('tour_conversion_kpi', 'workspace_header', 'default', 'primary_metrics', 10),
        ('forms_completion_kpi', 'workspace_header', 'default', 'secondary_metrics', 10)
    ) AS ps(viz_key, surface, surface_key, placement_zone, sort_order)
      ON gv.viz_key = ps.viz_key
)
INSERT INTO public.metric_placements (
    org_id, visualization_id, surface, surface_key, placement_zone,
    context_config, visibility_config, sort_order, status, version
)
SELECT co.org_id, ps.visualization_id, ps.surface, ps.surface_key, ps.placement_zone,
       '{"version":1}'::jsonb,
       '{"version":1,"visible":true}'::jsonb,
       ps.sort_order, 'active'::text, 1
FROM childcare_orgs co
CROSS JOIN placement_specs ps
WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_placements mp
    WHERE mp.org_id = co.org_id
      AND mp.visualization_id = ps.visualization_id
      AND mp.surface = ps.surface
      AND mp.surface_key = ps.surface_key
      AND mp.placement_zone = ps.placement_zone
);

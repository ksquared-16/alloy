-- Analytics V2 Metric Platform — global enrollment metric templates + default visualizations/placements.
-- Idempotent seeds for childcare orgs; global templates have org_id NULL.

-- Global metric definition templates (status varies by adapter availability)
INSERT INTO public.metric_definitions (
    org_id, key, label, description, category, entity_scope,
    source_type, source_key, aggregation, filter_config, dimension_config,
    default_period_config, unit, precision, is_kpi, target_config, threshold_config,
    status, version
)
SELECT NULL, v.key, v.label, v.description, v.category, v.entity_scope,
       v.source_type, v.source_key, v.aggregation, v.filter_config, v.dimension_config,
       v.default_period_config, v.unit, v.precision, v.is_kpi, v.target_config, v.threshold_config,
       v.status, 1
FROM (VALUES
    (
        'tour_conversion_rate'::text,
        'Tour Conversion %'::text,
        'Share of scheduled tours that completed in the rolling period.'::text,
        'enrollment'::text,
        'org'::text,
        'oip_adapter'::text,
        'enrollment.tour_conversion_rate'::text,
        'rate'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'percent'::text,
        1,
        true,
        '{"version":1,"kind":"rate_min","targetMinRate":0.65}'::jsonb,
        '{"version":1,"healthyMinRate":0.65,"warningMinRate":0.50}'::jsonb,
        'active'::text
    ),
    (
        'enrollment_rate'::text,
        'Enrollment Rate'::text,
        'Placeholder until a dedicated enrollment conversion source exists.'::text,
        'enrollment'::text,
        'org'::text,
        'oip_adapter'::text,
        'enrollment.tour_conversion_rate'::text,
        'rate'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'percent'::text,
        1,
        true,
        '{"version":1,"kind":"rate_min","targetMinRate":0.40}'::jsonb,
        '{"version":1,"healthyMinRate":0.40,"warningMinRate":0.25}'::jsonb,
        'draft'::text
    ),
    (
        'needs_attention_count'::text,
        'Needs Attention Count'::text,
        'Bounded snapshot of opportunities requiring operator attention.'::text,
        'operational_health'::text,
        'org'::text,
        'oip_adapter'::text,
        'ops.needs_attention_count'::text,
        'count'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'count'::text,
        0,
        true,
        '{"version":1,"kind":"count_max","targetMaxCount":10}'::jsonb,
        '{"version":1,"healthyMaxCount":10,"warningMaxCount":25}'::jsonb,
        'active'::text
    ),
    (
        'forms_completion_rate'::text,
        'Forms Completion %'::text,
        'Share of form submissions completed in the rolling period.'::text,
        'forms'::text,
        'org'::text,
        'oip_adapter'::text,
        'forms.completion_rate'::text,
        'rate'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'percent'::text,
        1,
        true,
        '{"version":1,"kind":"rate_min","targetMinRate":0.80}'::jsonb,
        '{"version":1,"healthyMinRate":0.80,"warningMinRate":0.60}'::jsonb,
        'active'::text
    ),
    (
        'lead_count'::text,
        'Lead Count'::text,
        'Count of new enrollment opportunities created in the rolling period.'::text,
        'enrollment'::text,
        'org'::text,
        'oip_adapter'::text,
        'enrollment.lead_count'::text,
        'count'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'count'::text,
        0,
        false,
        NULL::jsonb,
        NULL::jsonb,
        'draft'::text
    ),
    (
        'tour_completed_count'::text,
        'Completed Tours'::text,
        'Count of tours completed in the rolling period.'::text,
        'enrollment'::text,
        'org'::text,
        'oip_adapter'::text,
        'enrollment.tour_completed_count'::text,
        'count'::text,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"version":1,"kind":"rolling","days":30}'::jsonb,
        'count'::text,
        0,
        false,
        NULL::jsonb,
        NULL::jsonb,
        'draft'::text
    )
) AS v(key, label, description, category, entity_scope, source_type, source_key, aggregation,
       filter_config, dimension_config, default_period_config, unit, precision, is_kpi,
       target_config, threshold_config, status)
WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_definitions md
    WHERE md.org_id IS NULL AND md.key = v.key
);

-- Default visualizations for global templates
WITH defs AS (
    SELECT id, key FROM public.metric_definitions WHERE org_id IS NULL
),
viz AS (
    SELECT d.id AS metric_definition_id, d.key AS metric_key,
           v.viz_key, v.label, v.visualization_type, v.viz_status, v.style_config, v.display_config
    FROM defs d
    JOIN (VALUES
        ('tour_conversion_rate', 'tour_conversion_kpi', 'Tour Conversion %', 'kpi_card', 'active',
         '{"version":1,"accent":"enrollment","icon":"trending_up"}'::jsonb,
         '{"version":1,"compact":false,"showThreshold":true}'::jsonb),
        ('tour_conversion_rate', 'tour_conversion_trend', 'Tour Conversion Trend', 'trend_card', 'active',
         '{"version":1,"accent":"enrollment"}'::jsonb,
         '{"version":1,"compact":false,"showSparkline":true}'::jsonb),
        ('enrollment_rate', 'enrollment_rate_kpi', 'Enrollment Rate', 'kpi_card', 'draft',
         '{"version":1,"accent":"enrollment"}'::jsonb,
         '{"version":1,"compact":false,"showThreshold":true}'::jsonb),
        ('needs_attention_count', 'needs_attention_chip', 'Needs Attention', 'chip', 'active',
         '{"version":1,"accent":"ops","icon":"alert"}'::jsonb,
         '{"version":1,"compact":true}'::jsonb),
        ('needs_attention_count', 'needs_attention_kpi', 'Needs Attention', 'kpi_card', 'active',
         '{"version":1,"accent":"ops"}'::jsonb,
         '{"version":1,"compact":false,"showThreshold":true}'::jsonb),
        ('forms_completion_rate', 'forms_completion_kpi', 'Forms Completion %', 'kpi_card', 'active',
         '{"version":1,"accent":"forms"}'::jsonb,
         '{"version":1,"compact":false,"showThreshold":true}'::jsonb),
        ('lead_count', 'lead_count_kpi', 'Lead Count', 'kpi_card', 'draft',
         '{"version":1,"accent":"enrollment"}'::jsonb,
         '{"version":1,"compact":false}'::jsonb),
        ('tour_completed_count', 'tour_completed_kpi', 'Completed Tours', 'kpi_card', 'draft',
         '{"version":1,"accent":"enrollment"}'::jsonb,
         '{"version":1,"compact":false}'::jsonb)
    ) AS v(metric_key, viz_key, label, visualization_type, viz_status, style_config, display_config)
      ON d.key = v.metric_key
)
INSERT INTO public.metric_visualizations (
    org_id, metric_definition_id, key, label, visualization_type,
    style_config, display_config, status, version
)
SELECT NULL, viz.metric_definition_id, viz.viz_key, viz.label, viz.visualization_type,
       viz.style_config, viz.display_config, viz.viz_status, 1
FROM viz
WHERE NOT EXISTS (
    SELECT 1 FROM public.metric_visualizations mv
    WHERE mv.org_id IS NULL AND mv.key = viz.viz_key
);

-- Default placements for childcare orgs (OI overview/health/trends + work unit header)
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
        ('tour_conversion_kpi', 'operational_intelligence', 'default', 'overview', 10),
        ('needs_attention_kpi', 'operational_intelligence', 'default', 'health', 10),
        ('forms_completion_kpi', 'operational_intelligence', 'default', 'health', 20),
        ('tour_conversion_trend', 'operational_intelligence', 'default', 'trends', 10),
        ('needs_attention_chip', 'operational_intelligence', 'default', 'health', 5),
        ('tour_conversion_kpi', 'work_unit_header', 'default', 'header_metrics', 10),
        ('needs_attention_chip', 'work_unit_header', 'default', 'header_metrics', 20),
        ('tour_conversion_kpi', 'business_process_tile', 'enrollment', 'tile_metrics', 10)
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

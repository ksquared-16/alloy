-- Analytics V2 Metric Platform foundation.
-- Coexists with OIP V1 metric_snapshots (key-based) and code-owned registry.
-- V2 platform tables are config-driven; V1 remains unchanged when feature flag is off.

-- ---------------------------------------------------------------------------
-- metric_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    description text NOT NULL DEFAULT ''::text,
    category text NOT NULL DEFAULT 'general'::text,
    entity_scope text NOT NULL DEFAULT 'org'::text,
    source_type text NOT NULL,
    source_key text NOT NULL,
    aggregation text NOT NULL,
    numerator_config jsonb NULL,
    denominator_config jsonb NULL,
    filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    dimension_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_period_config jsonb NOT NULL DEFAULT '{"version":1,"kind":"rolling","days":30}'::jsonb,
    unit text NOT NULL DEFAULT 'none'::text,
    precision integer NOT NULL DEFAULT 0,
    is_kpi boolean NOT NULL DEFAULT false,
    target_config jsonb NULL,
    threshold_config jsonb NULL,
    status text NOT NULL DEFAULT 'draft'::text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL,
    updated_by uuid NULL,
    CONSTRAINT metric_definitions_status_check CHECK (
        status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])
    ),
    CONSTRAINT metric_definitions_entity_scope_check CHECK (
        entity_scope = ANY (ARRAY['org'::text, 'site'::text, 'department'::text, 'work_unit'::text, 'record'::text])
    )
);

COMMENT ON TABLE public.metric_definitions IS
  'Analytics V2 configurable metric definitions. Global templates have org_id NULL; tenant copies have org_id set.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_definitions_org_key
    ON public.metric_definitions (org_id, key)
    WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_definitions_global_key
    ON public.metric_definitions (key)
    WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_metric_definitions_org_status
    ON public.metric_definitions (org_id, status);

-- ---------------------------------------------------------------------------
-- metric_visualizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_visualizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    metric_definition_id uuid NOT NULL REFERENCES public.metric_definitions (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    visualization_type text NOT NULL,
    style_config jsonb NOT NULL DEFAULT '{"version":1}'::jsonb,
    display_config jsonb NOT NULL DEFAULT '{"version":1}'::jsonb,
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft'::text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT metric_visualizations_status_check CHECK (
        status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])
    ),
    CONSTRAINT metric_visualizations_type_check CHECK (
        visualization_type = ANY (ARRAY[
            'kpi_card'::text, 'trend_card'::text, 'sparkline'::text, 'line_chart'::text,
            'area_chart'::text, 'bar_chart'::text, 'comparison'::text, 'gauge'::text,
            'scorecard'::text, 'table'::text, 'chip'::text
        ])
    )
);

COMMENT ON TABLE public.metric_visualizations IS
  'Analytics V2 visualization config — separate from metric definition and placement.';

CREATE INDEX IF NOT EXISTS idx_metric_visualizations_org_metric
    ON public.metric_visualizations (org_id, metric_definition_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_visualizations_org_key
    ON public.metric_visualizations (org_id, key)
    WHERE org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- metric_placements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_placements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    visualization_id uuid NOT NULL REFERENCES public.metric_visualizations (id) ON DELETE CASCADE,
    surface text NOT NULL,
    surface_key text NOT NULL DEFAULT 'default'::text,
    placement_zone text NOT NULL DEFAULT 'overview'::text,
    context_config jsonb NOT NULL DEFAULT '{"version":1}'::jsonb,
    visibility_config jsonb NOT NULL DEFAULT '{"version":1,"visible":true}'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'draft'::text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT metric_placements_status_check CHECK (
        status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text, 'hidden'::text])
    ),
    CONSTRAINT metric_placements_surface_check CHECK (
        surface = ANY (ARRAY[
            'workspace_header'::text, 'business_process_tile'::text, 'work_unit_header'::text,
            'drawer'::text, 'operational_intelligence'::text, 'dashboard'::text,
            'report'::text, 'portal'::text, 'mobile'::text
        ])
    )
);

COMMENT ON TABLE public.metric_placements IS
  'Analytics V2 surface-aware placement config. Does not own computation.';

CREATE INDEX IF NOT EXISTS idx_metric_placements_org_surface
    ON public.metric_placements (org_id, surface, surface_key, placement_zone);

CREATE INDEX IF NOT EXISTS idx_metric_placements_visualization
    ON public.metric_placements (visualization_id);

-- ---------------------------------------------------------------------------
-- metric_platform_snapshots (V2 — distinct from V1 metric_snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_platform_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    metric_definition_id uuid NOT NULL REFERENCES public.metric_definitions (id) ON DELETE CASCADE,
    context_type text NOT NULL DEFAULT 'org'::text,
    context_id uuid NULL,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    granularity text NOT NULL DEFAULT 'day'::text,
    value double precision NULL,
    numerator_value double precision NULL,
    denominator_value double precision NULL,
    dimension_values jsonb NULL,
    health_state text NOT NULL DEFAULT 'unknown'::text,
    computed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT metric_platform_snapshots_health_check CHECK (
        health_state = ANY (ARRAY['healthy'::text, 'warning'::text, 'critical'::text, 'unknown'::text])
    )
);

COMMENT ON TABLE public.metric_platform_snapshots IS
  'Analytics V2 append-only metric snapshots for trends. V1 OIP uses metric_snapshots (key-based).';

CREATE INDEX IF NOT EXISTS idx_metric_platform_snapshots_org_def_period
    ON public.metric_platform_snapshots (org_id, metric_definition_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_metric_platform_snapshots_org_context
    ON public.metric_platform_snapshots (org_id, context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_metric_platform_snapshots_def_computed
    ON public.metric_platform_snapshots (metric_definition_id, computed_at DESC);

-- ---------------------------------------------------------------------------
-- metric_rollups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_rollups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    rollup_type text NOT NULL,
    child_metric_config jsonb NOT NULL DEFAULT '{"version":1,"metrics":[]}'::jsonb,
    context_scope text NOT NULL DEFAULT 'org'::text,
    weight_config jsonb NULL,
    threshold_config jsonb NULL,
    status text NOT NULL DEFAULT 'draft'::text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT metric_rollups_status_check CHECK (
        status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])
    ),
    CONSTRAINT metric_rollups_type_check CHECK (
        rollup_type = ANY (ARRAY[
            'sum'::text, 'avg'::text, 'weighted_avg'::text, 'best'::text,
            'worst'::text, 'composite_score'::text, 'health_score'::text
        ])
    )
);

COMMENT ON TABLE public.metric_rollups IS
  'Analytics V2 rollup definitions combining child metrics.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_rollups_org_key
    ON public.metric_rollups (org_id, key);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_visualizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_platform_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metric_definitions_select_authenticated ON public.metric_definitions;
CREATE POLICY metric_definitions_select_authenticated ON public.metric_definitions
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_definitions_all_service_role ON public.metric_definitions;
CREATE POLICY metric_definitions_all_service_role ON public.metric_definitions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS metric_visualizations_select_authenticated ON public.metric_visualizations;
CREATE POLICY metric_visualizations_select_authenticated ON public.metric_visualizations
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_visualizations_all_service_role ON public.metric_visualizations;
CREATE POLICY metric_visualizations_all_service_role ON public.metric_visualizations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS metric_placements_select_authenticated ON public.metric_placements;
CREATE POLICY metric_placements_select_authenticated ON public.metric_placements
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_placements_all_service_role ON public.metric_placements;
CREATE POLICY metric_placements_all_service_role ON public.metric_placements
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS metric_platform_snapshots_select_authenticated ON public.metric_platform_snapshots;
CREATE POLICY metric_platform_snapshots_select_authenticated ON public.metric_platform_snapshots
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_platform_snapshots_all_service_role ON public.metric_platform_snapshots;
CREATE POLICY metric_platform_snapshots_all_service_role ON public.metric_platform_snapshots
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS metric_rollups_select_authenticated ON public.metric_rollups;
CREATE POLICY metric_rollups_select_authenticated ON public.metric_rollups
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_rollups_all_service_role ON public.metric_rollups;
CREATE POLICY metric_rollups_all_service_role ON public.metric_rollups
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.metric_definitions TO authenticated;
GRANT SELECT ON TABLE public.metric_visualizations TO authenticated;
GRANT SELECT ON TABLE public.metric_placements TO authenticated;
GRANT SELECT ON TABLE public.metric_platform_snapshots TO authenticated;
GRANT SELECT ON TABLE public.metric_rollups TO authenticated;

GRANT ALL ON TABLE public.metric_definitions TO service_role;
GRANT ALL ON TABLE public.metric_visualizations TO service_role;
GRANT ALL ON TABLE public.metric_placements TO service_role;
GRANT ALL ON TABLE public.metric_platform_snapshots TO service_role;
GRANT ALL ON TABLE public.metric_rollups TO service_role;

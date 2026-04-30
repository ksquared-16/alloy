-- KPI Config v0: org-scoped placement rows for adminV2 workspace / department / work_unit surfaces.
-- Registry (metric definitions) lives in TypeScript; this table stores only placement (what appears, order, visibility).

CREATE TABLE IF NOT EXISTS public.workspace_kpi_placement (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    surface text NOT NULL,
    department_id uuid REFERENCES public.departments (id) ON DELETE CASCADE,
    work_unit_id uuid REFERENCES public.work_units (id) ON DELETE CASCADE,
    metric_key text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    is_visible boolean NOT NULL DEFAULT true,
    label_override text,
    format_override text,
    lane_override text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workspace_kpi_placement_surface_check CHECK (
        surface = ANY (ARRAY['workspace'::text, 'department'::text, 'work_unit'::text])
    ),
    CONSTRAINT workspace_kpi_placement_format_check CHECK (
        format_override IS NULL
        OR format_override = ANY (
            ARRAY['count'::text, 'currency'::text, 'percent'::text, 'duration'::text, 'text'::text]
        )
    ),
    CONSTRAINT workspace_kpi_placement_lane_check CHECK (
        lane_override IS NULL OR lane_override = ANY (ARRAY['business'::text, 'ai'::text])
    ),
    CONSTRAINT workspace_kpi_placement_scope_check CHECK (
        (
            surface = 'workspace'::text
            AND department_id IS NULL
            AND work_unit_id IS NULL
        )
        OR (
            surface = 'department'::text
            AND department_id IS NOT NULL
            AND work_unit_id IS NULL
        )
        OR (
            surface = 'work_unit'::text
            AND department_id IS NOT NULL
            AND work_unit_id IS NOT NULL
        )
    )
);

COMMENT ON TABLE public.workspace_kpi_placement IS
  'Configurable KPI placement for adminV2 workspace hierarchy; metric_key references TS registry; metadata is display hints only.';

CREATE INDEX IF NOT EXISTS idx_workspace_kpi_placement_org_surface
    ON public.workspace_kpi_placement (org_id, surface)
    WHERE is_visible = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_kpi_placement_workspace_active
    ON public.workspace_kpi_placement (org_id, metric_key)
    WHERE surface = 'workspace'::text
      AND department_id IS NULL
      AND work_unit_id IS NULL
      AND is_visible = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_kpi_placement_department_active
    ON public.workspace_kpi_placement (org_id, department_id, metric_key)
    WHERE surface = 'department'::text
      AND work_unit_id IS NULL
      AND is_visible = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_kpi_placement_work_unit_active
    ON public.workspace_kpi_placement (org_id, work_unit_id, metric_key)
    WHERE surface = 'work_unit'::text
      AND is_visible = true;

DROP TRIGGER IF EXISTS set_workspace_kpi_placement_updated_at ON public.workspace_kpi_placement;
CREATE TRIGGER set_workspace_kpi_placement_updated_at
    BEFORE UPDATE ON public.workspace_kpi_placement
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workspace_kpi_placement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_kpi_placement_select_authenticated ON public.workspace_kpi_placement;
CREATE POLICY workspace_kpi_placement_select_authenticated ON public.workspace_kpi_placement
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS workspace_kpi_placement_all_service_role ON public.workspace_kpi_placement;
CREATE POLICY workspace_kpi_placement_all_service_role ON public.workspace_kpi_placement
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.workspace_kpi_placement TO authenticated;
GRANT ALL ON TABLE public.workspace_kpi_placement TO service_role;

-- ---------------------------------------------------------------------------
-- Idempotent seeds: childcare industry orgs (matches other childcare migrations)
-- ---------------------------------------------------------------------------
WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
      AND o.deleted_at IS NULL
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
    v.metric_key,
    v.display_order,
    true,
    '{}'::jsonb
FROM childcare_orgs c
CROSS JOIN (
    VALUES
        ('org.structure.departments_count'::text, 1),
        ('org.structure.work_units_count'::text, 2),
        ('org.pipeline.active_in_motion'::text, 3),
        ('org.pipeline.pipeline_value_open'::text, 4),
        ('org.pipeline.closed_outcomes'::text, 5)
) AS v(metric_key, display_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.workspace_kpi_placement p
    WHERE p.org_id = c.org_id
      AND p.surface = 'workspace'::text
      AND p.department_id IS NULL
      AND p.work_unit_id IS NULL
      AND p.metric_key = v.metric_key
      AND p.is_visible = true
);

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'::text
      AND o.deleted_at IS NULL
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
    'dept.wu_queue.total_per_work_unit'::text,
    10,
    true,
    '{}'::jsonb
FROM childcare_orgs c
JOIN public.departments d ON d.org_id = c.org_id AND d.is_active IS NOT FALSE
WHERE lower(trim(d.key)) = 'enrollment'::text
  AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_kpi_placement p
      WHERE p.org_id = c.org_id
        AND p.surface = 'department'::text
        AND p.department_id = d.id
        AND p.work_unit_id IS NULL
        AND p.metric_key = 'dept.wu_queue.total_per_work_unit'::text
        AND p.is_visible = true
  );

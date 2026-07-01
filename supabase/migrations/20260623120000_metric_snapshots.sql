-- Operational Intelligence Phase 1: metric_snapshots for trend reads.
-- Live MetricEngine remains source of truth; snapshots are written explicitly (cron/job Phase 2).

CREATE TABLE IF NOT EXISTS public.metric_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    metric_key text NOT NULL,
    window_key text NOT NULL,
    scope_type text NOT NULL DEFAULT 'org'::text,
    scope_id uuid NULL,
    dimension_key text NULL,
    dimension_value text NULL,
    value_numeric double precision NULL,
    value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT metric_snapshots_scope_type_check CHECK (
        scope_type = ANY (ARRAY['org'::text, 'site'::text, 'department'::text, 'work_unit'::text])
    )
);

COMMENT ON TABLE public.metric_snapshots IS
  'Append-only OIP metric snapshots for trend reads. Live MetricEngine resolvers remain authoritative; snapshots are optional cache/history.';

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_org_metric_computed
    ON public.metric_snapshots (org_id, metric_key, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_org_metric_scope
    ON public.metric_snapshots (org_id, metric_key, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_org_computed
    ON public.metric_snapshots (org_id, computed_at DESC);

ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metric_snapshots_select_authenticated ON public.metric_snapshots;
CREATE POLICY metric_snapshots_select_authenticated ON public.metric_snapshots
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS metric_snapshots_all_service_role ON public.metric_snapshots;
CREATE POLICY metric_snapshots_all_service_role ON public.metric_snapshots
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.metric_snapshots TO authenticated;
GRANT ALL ON TABLE public.metric_snapshots TO service_role;

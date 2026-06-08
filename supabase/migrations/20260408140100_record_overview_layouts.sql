-- Track A Batch 1: org-scoped record overview layout config (fixed templates + ordered bands; no page builder).

CREATE TABLE IF NOT EXISTS public.record_overview_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    surface text NOT NULL DEFAULT 'overview',
    template_key text NOT NULL DEFAULT 'default',
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

COMMENT ON TABLE public.record_overview_layouts IS
  'Per-org record overview layout: template_key + config JSON (bands, ordered keys). Track A / RRS v0.';

COMMENT ON COLUMN public.record_overview_layouts.surface IS
  'Layout surface; v0 uses overview. Reserved for future drawer/full layout keys if needed.';

COMMENT ON COLUMN public.record_overview_layouts.config IS
  'JSON: bands, header_keys, layout hints — validated in application code (overviewLayoutV0).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_record_overview_layouts_org_entity_surface
  ON public.record_overview_layouts (org_id, entity_type, surface);

CREATE INDEX IF NOT EXISTS idx_record_overview_layouts_org_id
  ON public.record_overview_layouts (org_id);

CREATE INDEX IF NOT EXISTS idx_record_overview_layouts_org_entity_active
  ON public.record_overview_layouts (org_id, entity_type)
  WHERE is_active = true;

ALTER TABLE public.record_overview_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "record_overview_layouts_delete_by_org_role" ON public.record_overview_layouts;
CREATE POLICY "record_overview_layouts_delete_by_org_role"
  ON public.record_overview_layouts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_overview_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "record_overview_layouts_insert_by_org_role" ON public.record_overview_layouts;
CREATE POLICY "record_overview_layouts_insert_by_org_role"
  ON public.record_overview_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_overview_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "record_overview_layouts_select_by_org_role" ON public.record_overview_layouts;
CREATE POLICY "record_overview_layouts_select_by_org_role"
  ON public.record_overview_layouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_overview_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text])
    )
  );

DROP POLICY IF EXISTS "record_overview_layouts_update_by_org_role" ON public.record_overview_layouts;
CREATE POLICY "record_overview_layouts_update_by_org_role"
  ON public.record_overview_layouts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_overview_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_overview_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "service role full access record_overview_layouts" ON public.record_overview_layouts;
CREATE POLICY "service role full access record_overview_layouts"
  ON public.record_overview_layouts
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.record_overview_layouts TO authenticated;
GRANT ALL ON TABLE public.record_overview_layouts TO service_role;

-- =============================================================================
-- Org-scoped record drawer layout config (control plane)
-- =============================================================================
-- Purpose:
-- - `record_layouts` currently drives drawer/modal chrome but is GLOBAL (no org).
-- - Some verticals (e.g. childcare) need org-specific drawer section ordering.
-- - Introduce `record_drawer_layouts` as an org-scoped override layer:
--     effective layout = active record_drawer_layouts(org, entity, surface, key) OR fallback to global record_layouts(entity, key)
--
-- Notes:
-- - This migration ONLY adds config infrastructure + childcare seed row.
-- - It does NOT implement new drawer sections (e.g. inquiry_children rendering).
-- - Unknown section keys are safe: UI ignores unknown keys when ordering sections.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.record_drawer_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    surface text NOT NULL DEFAULT 'drawer',
    key text NOT NULL DEFAULT 'default',
    config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz
);

COMMENT ON TABLE public.record_drawer_layouts IS
  'Per-org drawer layout overrides for admin record chrome. Effective layout falls back to global record_layouts.';

-- -----------------------------------------------------------------------------
-- Constraints / indexes
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ux_record_drawer_layouts_org_entity_surface_key'
          AND conrelid = 'public.record_drawer_layouts'::regclass
    ) THEN
        ALTER TABLE public.record_drawer_layouts
            ADD CONSTRAINT ux_record_drawer_layouts_org_entity_surface_key
            UNIQUE (org_id, entity_type, surface, key);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_record_drawer_layouts_org_entity_surface
    ON public.record_drawer_layouts (org_id, entity_type, surface)
    WHERE is_active = true;

-- updated_at trigger (shared helper)
DROP TRIGGER IF EXISTS trg_record_drawer_layouts_updated_at ON public.record_drawer_layouts;
CREATE TRIGGER trg_record_drawer_layouts_updated_at
BEFORE UPDATE ON public.record_drawer_layouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS / policies (align with record_overview_layouts org-role conventions)
-- -----------------------------------------------------------------------------
ALTER TABLE public.record_drawer_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "record_drawer_layouts_delete_by_org_role" ON public.record_drawer_layouts;
CREATE POLICY "record_drawer_layouts_delete_by_org_role"
  ON public.record_drawer_layouts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_drawer_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "record_drawer_layouts_insert_by_org_role" ON public.record_drawer_layouts;
CREATE POLICY "record_drawer_layouts_insert_by_org_role"
  ON public.record_drawer_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_drawer_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "record_drawer_layouts_select_by_org_role" ON public.record_drawer_layouts;
CREATE POLICY "record_drawer_layouts_select_by_org_role"
  ON public.record_drawer_layouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_drawer_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text])
    )
  );

DROP POLICY IF EXISTS "record_drawer_layouts_update_by_org_role" ON public.record_drawer_layouts;
CREATE POLICY "record_drawer_layouts_update_by_org_role"
  ON public.record_drawer_layouts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_drawer_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = record_drawer_layouts.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "service role full access record_drawer_layouts" ON public.record_drawer_layouts;
CREATE POLICY "service role full access record_drawer_layouts"
  ON public.record_drawer_layouts
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.record_drawer_layouts TO authenticated;
GRANT ALL ON TABLE public.record_drawer_layouts TO service_role;

-- -----------------------------------------------------------------------------
-- Seed childcare opportunity drawer layout (org-scoped)
-- -----------------------------------------------------------------------------
-- For childcare orgs only: add inquiry_children to opportunity drawer ordering.
-- Rendering of inquiry_children is intentionally NOT implemented in this migration.
CREATE TEMP TABLE IF NOT EXISTS _childcare_mvp_seed_target_orgs (org_id uuid PRIMARY KEY);

INSERT INTO _childcare_mvp_seed_target_orgs (org_id)
SELECT o.id
FROM public.orgs o
WHERE o.industry_id IN (
    SELECT i.id
    FROM public.industries i
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
)
ON CONFLICT DO NOTHING;

INSERT INTO public.record_drawer_layouts (org_id, entity_type, surface, key, config_json, is_active, created_at, updated_at)
SELECT
    t.org_id,
    'opportunity'::text,
    'drawer'::text,
    'default'::text,
    jsonb_build_object(
        'version', 1,
        'overview_section_order', jsonb_build_array('overview', 'inquiry_children')
    ),
    true,
    now(),
    now()
FROM _childcare_mvp_seed_target_orgs t
ON CONFLICT (org_id, entity_type, surface, key) DO UPDATE SET
    config_json = EXCLUDED.config_json,
    is_active = true,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Verification queries (run manually)
-- -----------------------------------------------------------------------------
-- 1) Confirm effective override row exists for childcare org(s)
--   SELECT org_id, entity_type, surface, key, config_json
--   FROM public.record_drawer_layouts
--   WHERE entity_type='opportunity' AND surface='drawer' AND key='default'
--   ORDER BY created_at DESC;
--
-- 2) Confirm no impact to global templates (should remain unchanged)
--   SELECT entity_type, key, config_json FROM public.record_layouts WHERE entity_type='opportunity';


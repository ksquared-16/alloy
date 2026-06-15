-- =============================================================================
-- Location program categories — per-site configuration (childcare program bands)
-- =============================================================================
-- Doctrine: program category is location-owned config, reused across leads,
-- children, rooms, queues, forms, and layouts. Stable keys align with legacy
-- opportunity_customer_members.desired_program_type text keys.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.location_program_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT location_program_categories_org_location_key_unique
        UNIQUE (org_id, location_id, key)
);

COMMENT ON TABLE public.location_program_categories IS
    'Program categories offered at a site location. Keys align with inquiry child desired_program_type.';

COMMENT ON COLUMN public.location_program_categories.location_id IS
    'Site row (locations.location_type = site).';

CREATE INDEX IF NOT EXISTS idx_location_program_categories_org_location
    ON public.location_program_categories (org_id, location_id);

CREATE INDEX IF NOT EXISTS idx_location_program_categories_org_key
    ON public.location_program_categories (org_id, key);

-- OCM durable reference (optional; desired_program_type retained for compat)
ALTER TABLE public.opportunity_customer_members
    ADD COLUMN IF NOT EXISTS desired_program_category_id uuid
        REFERENCES public.location_program_categories (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.opportunity_customer_members.desired_program_category_id IS
    'Preferred FK to location_program_categories; desired_program_type key kept for backward compatibility.';

CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_desired_program_category
    ON public.opportunity_customer_members (org_id, desired_program_category_id)
    WHERE desired_program_category_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RLS (org-scoped, consistent with location-adjacent config)
-- -----------------------------------------------------------------------------
ALTER TABLE public.location_program_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS location_program_categories_select_org ON public.location_program_categories;
CREATE POLICY location_program_categories_select_org ON public.location_program_categories
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS location_program_categories_insert_org ON public.location_program_categories;
CREATE POLICY location_program_categories_insert_org ON public.location_program_categories
    FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS location_program_categories_update_org ON public.location_program_categories;
CREATE POLICY location_program_categories_update_org ON public.location_program_categories
    FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS location_program_categories_delete_org ON public.location_program_categories;
CREATE POLICY location_program_categories_delete_org ON public.location_program_categories
    FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS location_program_categories_all_service_role ON public.location_program_categories;
CREATE POLICY location_program_categories_all_service_role ON public.location_program_categories
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.location_program_categories TO authenticated;
GRANT ALL ON TABLE public.location_program_categories TO service_role;

-- -----------------------------------------------------------------------------
-- Seed default categories for every active site location
-- -----------------------------------------------------------------------------
INSERT INTO public.location_program_categories (org_id, location_id, key, label, sort_order, is_active)
SELECT
    l.org_id,
    l.id,
    v.key,
    v.label,
    v.sort_order,
    true
FROM public.locations l
CROSS JOIN (
    VALUES
        ('infant'::text, 'Infant'::text, 10::int),
        ('toddler', 'Toddler', 20),
        ('preschool', 'Preschool', 30),
        ('pre_k', 'Pre-K', 40),
        ('school_age', 'School Age', 50)
) AS v (key, label, sort_order)
WHERE l.location_type = 'site'
  AND (l.is_active IS NULL OR l.is_active = true)
ON CONFLICT (org_id, location_id, key) DO NOTHING;

-- Backfill OCM category FK where location + key match an active category row
UPDATE public.opportunity_customer_members ocm
SET desired_program_category_id = lpc.id
FROM public.location_program_categories lpc
WHERE ocm.desired_program_category_id IS NULL
  AND ocm.location_id IS NOT NULL
  AND ocm.desired_program_type IS NOT NULL
  AND trim(ocm.desired_program_type) <> ''
  AND lpc.org_id = ocm.org_id
  AND lpc.location_id = ocm.location_id
  AND lpc.key = trim(ocm.desired_program_type)
  AND lpc.is_active = true;

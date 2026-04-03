-- =============================================================================
-- Configuration consolidation: option sets, native location fields, tier_key
-- =============================================================================
-- - Reusable option_sets / option_set_items (org-scoped)
-- - locations: beds, baths, *_key columns for option-backed attributes
-- - cleaning_job_details: numeric beds/baths + tier/key columns; drop legacy FK cols
-- - pricing_square_footage_tiers: canonical tier_key (matches option_set_items.item_key)
-- - get_quote_pricing: match tiers by tier_key
-- - pricing_dimensions.source_option_set_key for dimension ↔ option set linkage
-- - Seed option sets + system field_definitions for all orgs
-- Clean cutover: minimal production data assumed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) option_sets + option_set_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.option_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    set_key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT option_sets_org_set_key UNIQUE (org_id, set_key)
);

CREATE INDEX IF NOT EXISTS idx_option_sets_org_id ON public.option_sets (org_id);

CREATE TABLE IF NOT EXISTS public.option_set_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    option_set_id uuid NOT NULL REFERENCES public.option_sets (id) ON DELETE CASCADE,
    item_key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT option_set_items_set_item_key UNIQUE (option_set_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_option_set_items_set_id ON public.option_set_items (option_set_id);

ALTER TABLE public.option_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_set_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "option_sets_select_by_org_role" ON public.option_sets;
CREATE POLICY "option_sets_select_by_org_role" ON public.option_sets FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS "option_sets_insert_by_org_role" ON public.option_sets;
CREATE POLICY "option_sets_insert_by_org_role" ON public.option_sets FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS "option_sets_update_by_org_role" ON public.option_sets;
CREATE POLICY "option_sets_update_by_org_role" ON public.option_sets FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS "option_sets_delete_by_org_role" ON public.option_sets;
CREATE POLICY "option_sets_delete_by_org_role" ON public.option_sets FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "option_set_items_select_by_org" ON public.option_set_items;
CREATE POLICY "option_set_items_select_by_org" ON public.option_set_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.option_sets os
    WHERE os.id = option_set_items.option_set_id
      AND public.has_org_role(os.org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text])
  ));

DROP POLICY IF EXISTS "option_set_items_insert_by_org" ON public.option_set_items;
CREATE POLICY "option_set_items_insert_by_org" ON public.option_set_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.option_sets os
    WHERE os.id = option_set_items.option_set_id
      AND public.has_org_role(os.org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
  ));

DROP POLICY IF EXISTS "option_set_items_update_by_org" ON public.option_set_items;
CREATE POLICY "option_set_items_update_by_org" ON public.option_set_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.option_sets os
    WHERE os.id = option_set_items.option_set_id
      AND public.has_org_role(os.org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
  ));

DROP POLICY IF EXISTS "option_set_items_delete_by_org" ON public.option_set_items;
CREATE POLICY "option_set_items_delete_by_org" ON public.option_set_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.option_sets os
    WHERE os.id = option_set_items.option_set_id
      AND public.has_org_role(os.org_id, ARRAY['owner'::text, 'admin'::text])
  ));

GRANT ALL ON TABLE public.option_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.option_sets TO authenticated;
GRANT ALL ON TABLE public.option_set_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.option_set_items TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) locations: native numeric + option keys
-- ---------------------------------------------------------------------------
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS beds numeric(5,1),
  ADD COLUMN IF NOT EXISTS baths numeric(4,1),
  ADD COLUMN IF NOT EXISTS home_type_key text,
  ADD COLUMN IF NOT EXISTS access_method_key text,
  ADD COLUMN IF NOT EXISTS square_footage_tier_key text;

COMMENT ON COLUMN public.locations.beds IS 'Bedroom count (numeric; whole numbers in normal use).';
COMMENT ON COLUMN public.locations.baths IS 'Bathroom count; supports half baths (e.g. 2.5).';
COMMENT ON COLUMN public.locations.home_type_key IS 'Stable key; matches option_set_items.item_key for set_key=home_type.';
COMMENT ON COLUMN public.locations.access_method_key IS 'Stable key; matches option_set_items.item_key for set_key=access_method.';
COMMENT ON COLUMN public.locations.square_footage_tier_key IS 'Stable tier key; matches option_set_items + pricing_square_footage_tiers.tier_key.';

-- ---------------------------------------------------------------------------
-- 3) cleaning_job_details: align with location model (clean cutover)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cleaning_job_details DROP CONSTRAINT IF EXISTS cleaning_job_details_sqft_band_id_fkey;
ALTER TABLE public.cleaning_job_details DROP CONSTRAINT IF EXISTS cleaning_job_details_home_type_id_fkey;
ALTER TABLE public.cleaning_job_details DROP CONSTRAINT IF EXISTS cleaning_job_details_access_method_id_fkey;

ALTER TABLE public.cleaning_job_details
  ADD COLUMN IF NOT EXISTS beds numeric(5,1),
  ADD COLUMN IF NOT EXISTS baths numeric(4,1),
  ADD COLUMN IF NOT EXISTS home_type_key text,
  ADD COLUMN IF NOT EXISTS access_method_key text,
  ADD COLUMN IF NOT EXISTS square_footage_tier_key text;

UPDATE public.cleaning_job_details cjd
SET beds = cjd.bedrooms::numeric
WHERE cjd.beds IS NULL AND cjd.bedrooms IS NOT NULL;

UPDATE public.cleaning_job_details cjd
SET baths = cjd.bathrooms::numeric
WHERE cjd.baths IS NULL AND cjd.bathrooms IS NOT NULL;

ALTER TABLE public.cleaning_job_details DROP COLUMN IF EXISTS sqft_band_id;
ALTER TABLE public.cleaning_job_details DROP COLUMN IF EXISTS home_type_id;
ALTER TABLE public.cleaning_job_details DROP COLUMN IF EXISTS access_method_id;
ALTER TABLE public.cleaning_job_details DROP COLUMN IF EXISTS bedrooms;
ALTER TABLE public.cleaning_job_details DROP COLUMN IF EXISTS bathrooms;

-- ---------------------------------------------------------------------------
-- 4) pricing_square_footage_tiers: tier_key replaces sqft_key / sqft_label
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_square_footage_tiers
  ADD COLUMN IF NOT EXISTS tier_key text;

UPDATE public.pricing_square_footage_tiers st
SET tier_key = CASE trim(st.sqft_key)
  WHEN 'Under 1500 sq ft' THEN '0_1499'
  WHEN '1501–2,000 sq ft' THEN '1500_1999'
  WHEN '1501-2,000 sq ft' THEN '1500_1999'
  WHEN '2,001-2,600 sq ft' THEN '2000_2599'
  WHEN '2,601-3,200 sq ft' THEN '2600_3199'
  WHEN '3,201-4,000 sq ft' THEN '3200_3999'
  WHEN '4,001-5,500 sq ft' THEN '4000_5499'
  WHEN 'Over 5,500 sq ft' THEN '5500_plus'
  ELSE regexp_replace(lower(trim(st.sqft_key)), '[^a-z0-9]+', '_', 'g')
END
WHERE st.tier_key IS NULL;

-- Any remaining nulls: deterministic slug from old key
UPDATE public.pricing_square_footage_tiers
SET tier_key = regexp_replace(lower(trim(sqft_key)), '[^a-z0-9]+', '_', 'g')
WHERE tier_key IS NULL OR trim(tier_key) = '';

ALTER TABLE public.pricing_square_footage_tiers ALTER COLUMN tier_key SET NOT NULL;

DROP INDEX IF EXISTS public.idx_pricing_sqft_unique;

ALTER TABLE public.pricing_square_footage_tiers DROP COLUMN IF EXISTS sqft_key;
ALTER TABLE public.pricing_square_footage_tiers DROP COLUMN IF EXISTS sqft_label;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_tier_unique ON public.pricing_square_footage_tiers (vertical_id, tier_key);

COMMENT ON COLUMN public.pricing_square_footage_tiers.tier_key IS 'Canonical stable key; must match org option_set square_footage_tier items and quote RPC input.';

-- ---------------------------------------------------------------------------
-- 5) pricing_dimensions: optional link to option set semantics
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_dimensions
  ADD COLUMN IF NOT EXISTS source_option_set_key text;

COMMENT ON COLUMN public.pricing_dimensions.source_option_set_key IS 'When set, dimension value_key should match option_set_items.item_key for that set (per org).';

-- ---------------------------------------------------------------------------
-- 6) Replace get_quote_pricing to use tier_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quote_pricing(
  p_vertical_slug text,
  p_service_key text,
  p_sqft_key text,
  p_frequency_key text,
  p_addon_keys text[] DEFAULT '{}'::text[]
) RETURNS TABLE(
  out_vertical_slug text,
  out_service_key text,
  out_sqft_key text,
  out_frequency_key text,
  first_clean_cents integer,
  recurring_cents integer,
  addons_total_cents integer,
  total_first_visit_cents integer,
  price_breakdown text,
  is_manual_quote boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $_$
DECLARE
  v_vertical_id uuid;
  v_service_id uuid;
  v_sqft_tier_id uuid;
  v_frequency_id uuid;
  v_first integer;
  v_recurring integer;
  v_addons integer;
  v_freq_label text;
  v_discount_label text;
BEGIN
  IF lower(p_service_key) IN ('move_out_heavy', 'move-out', 'move_out', 'heavy_clean', 'moveout') THEN
    out_vertical_slug := p_vertical_slug;
    out_service_key := p_service_key;
    out_sqft_key := p_sqft_key;
    out_frequency_key := p_frequency_key;
    first_clean_cents := NULL;
    recurring_cents := NULL;
    addons_total_cents := NULL;
    total_first_visit_cents := NULL;
    price_breakdown := 'Manual quote required';
    is_manual_quote := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT id INTO v_vertical_id
  FROM public.verticals
  WHERE slug = p_vertical_slug AND is_active = true
  LIMIT 1;

  IF v_vertical_id IS NULL THEN
    RAISE EXCEPTION 'Unknown vertical slug: %', p_vertical_slug;
  END IF;

  SELECT ps.id INTO v_service_id
  FROM public.pricing_services ps
  WHERE ps.vertical_id = v_vertical_id
    AND ps.service_key = p_service_key
    AND ps.is_active = true
  LIMIT 1;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Unknown service_key for %: %', p_vertical_slug, p_service_key;
  END IF;

  SELECT st.id INTO v_sqft_tier_id
  FROM public.pricing_square_footage_tiers st
  WHERE st.vertical_id = v_vertical_id
    AND st.tier_key = p_sqft_key
    AND st.is_active = true
  LIMIT 1;

  IF v_sqft_tier_id IS NULL THEN
    RAISE EXCEPTION 'Unknown sqft tier_key for %: %', p_vertical_slug, p_sqft_key;
  END IF;

  SELECT f.amount_cents INTO v_first
  FROM public.pricing_first_clean_prices f
  WHERE f.vertical_id = v_vertical_id
    AND f.service_id = v_service_id
    AND f.sqft_tier_id = v_sqft_tier_id
    AND f.is_active = true
  LIMIT 1;

  IF v_first IS NULL THEN
    RAISE EXCEPTION 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  END IF;

  v_recurring := NULL;
  v_freq_label := NULL;
  v_discount_label := NULL;

  IF coalesce(trim(p_frequency_key), '') <> '' THEN
    SELECT pf.id, pf.frequency_label, pf.discount_label
      INTO v_frequency_id, v_freq_label, v_discount_label
    FROM public.pricing_frequencies pf
    WHERE pf.vertical_id = v_vertical_id
      AND pf.frequency_key = p_frequency_key
      AND pf.is_active = true
    LIMIT 1;

    IF v_frequency_id IS NOT NULL THEN
      SELECT r.amount_cents INTO v_recurring
      FROM public.pricing_recurring_prices r
      WHERE r.vertical_id = v_vertical_id
        AND r.frequency_id = v_frequency_id
        AND r.sqft_tier_id = v_sqft_tier_id
        AND r.is_active = true
      LIMIT 1;
    END IF;
  END IF;

  SELECT coalesce(sum(pa.amount_cents), 0) INTO v_addons
  FROM public.pricing_addons pa
  WHERE pa.vertical_id = v_vertical_id
    AND pa.is_active = true
    AND (coalesce(array_length(p_addon_keys, 1), 0) > 0 AND pa.addon_key = ANY (p_addon_keys));

  out_vertical_slug := p_vertical_slug;
  out_service_key := p_service_key;
  out_sqft_key := p_sqft_key;
  out_frequency_key := p_frequency_key;

  first_clean_cents := v_first;
  recurring_cents := v_recurring;
  addons_total_cents := v_addons;
  total_first_visit_cents := v_first + v_addons;

  price_breakdown :=
    'Sq Ft tier: ' || p_sqft_key ||
    ' | Service: ' || p_service_key ||
    ' | First cleaning (base): $' || to_char(v_first/100.0, 'FM999990.00') ||
    CASE WHEN v_addons > 0 THEN
      ' | Add-ons: $' || to_char(v_addons/100.0, 'FM999990.00')
    ELSE '' END ||
    ' | First visit total: $' || to_char((v_first + v_addons)/100.0, 'FM999990.00') ||
    CASE WHEN v_recurring IS NOT NULL THEN
      ' | Recurring (' || coalesce(v_freq_label,'') || '): $' ||
      to_char(v_recurring/100.0, 'FM999990.00') || ' / visit' ||
      CASE WHEN v_discount_label IS NOT NULL THEN ' (' || v_discount_label || ')' ELSE '' END
    ELSE '' END;

  is_manual_quote := false;
  RETURN NEXT;
END;
$_$;

-- ---------------------------------------------------------------------------
-- 7) Seed option sets + items for every org
-- ---------------------------------------------------------------------------
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, v.set_key, v.label, v.ord
FROM public.orgs o
CROSS JOIN (
  VALUES
    ('home_type'::text, 'Home type'::text, 10::int),
    ('access_method'::text, 'Access method'::text, 20),
    ('square_footage_tier'::text, 'Square footage tier'::text, 30)
) AS v (set_key, label, ord)
ON CONFLICT (org_id, set_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, v.item_key, v.label, v.ord
FROM public.option_sets os
CROSS JOIN (
  VALUES
    ('home_type', 'house', 'House', 10),
    ('home_type', 'condo', 'Condo', 20),
    ('home_type', 'apartment', 'Apartment', 30),
    ('home_type', 'townhome', 'Townhome', 40)
) AS v (set_key, item_key, label, ord)
WHERE os.set_key = v.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, v.item_key, v.label, v.ord
FROM public.option_sets os
CROSS JOIN (
  VALUES
    ('access_method', 'lockbox', 'Lockbox', 10),
    ('access_method', 'front_desk', 'Front desk / concierge', 20),
    ('access_method', 'door_code', 'Door / gate code', 30),
    ('access_method', 'on_file', 'Access on file', 40)
) AS v (set_key, item_key, label, ord)
WHERE os.set_key = v.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT os.id, v.item_key, v.label, v.ord
FROM public.option_sets os
CROSS JOIN (
  VALUES
    ('square_footage_tier', '0_1499', 'Under 1,500 sq ft', 10),
    ('square_footage_tier', '1500_1999', '1,500 – 1,999 sq ft', 20),
    ('square_footage_tier', '2000_2599', '2,000 – 2,599 sq ft', 30),
    ('square_footage_tier', '2600_3199', '2,600 – 3,199 sq ft', 40),
    ('square_footage_tier', '3200_3999', '3,200 – 3,999 sq ft', 50),
    ('square_footage_tier', '4000_5499', '4,000 – 5,499 sq ft', 60),
    ('square_footage_tier', '5500_plus', '5,500+ sq ft', 70)
) AS v (set_key, item_key, label, ord)
WHERE os.set_key = v.set_key
ON CONFLICT (option_set_id, item_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8) System field_definitions for location (all orgs)
-- ---------------------------------------------------------------------------
INSERT INTO public.field_definitions (
  org_id, entity_type, field_key, label, description, field_type,
  is_system, is_required, is_active,
  is_visible_in_form, is_visible_in_drawer, is_visible_in_table,
  is_filterable, is_sortable,
  section_key, sort_order, config,
  is_visible_in_public_booking
)
SELECT
  o.id,
  'location',
  v.field_key,
  v.label,
  v.description,
  v.field_type,
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  v.section_key,
  v.sort_order,
  v.config::jsonb,
  v.is_public
FROM public.orgs o
CROSS JOIN (
  VALUES
    ('beds', 'Beds', 'Number of bedrooms', 'number', 'property', 100, '{}', true),
    ('baths', 'Baths', 'Number of bathrooms (half baths supported)', 'number', 'property', 110, '{}', true),
    ('home_type', 'Home type', NULL, 'select', 'property', 120, '{"option_set_key":"home_type"}', true),
    ('access_method', 'Access method', NULL, 'select', 'access_notes', 130, '{"option_set_key":"access_method"}', true),
    ('square_footage_tier', 'Square footage tier', NULL, 'select', 'quote', 105, '{"option_set_key":"square_footage_tier"}', true)
) AS v (field_key, label, description, field_type, section_key, sort_order, config, is_public)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_system = true,
  is_active = true,
  section_key = EXCLUDED.section_key,
  sort_order = EXCLUDED.sort_order,
  config = EXCLUDED.config,
  is_visible_in_public_booking = EXCLUDED.is_visible_in_public_booking,
  updated_at = now();

-- Retire legacy location field keys superseded by this cutover (not home_type — upserted above)
UPDATE public.field_definitions
SET is_active = false, updated_at = now()
WHERE entity_type = 'location'
  AND field_key IN ('square_footage', 'bedrooms', 'bathrooms')
  AND org_id IN (SELECT id FROM public.orgs);

-- ---------------------------------------------------------------------------
-- 9) Tag square-footage pricing dimensions (best-effort)
-- ---------------------------------------------------------------------------
UPDATE public.pricing_dimensions d
SET source_option_set_key = 'square_footage_tier'
WHERE d.dimension_key IN ('square_footage', 'sqft', 'square_footage_tier', 'pricing_sqft_tiers');

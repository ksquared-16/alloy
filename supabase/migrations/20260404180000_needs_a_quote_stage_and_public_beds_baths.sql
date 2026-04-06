-- =============================================================================
-- Convergence: needs_a_quote pipeline stage + public booking uses beds/baths selects
-- =============================================================================
-- 1) For each org with semantic stage quote_started, add needs_a_quote (same pipeline).
-- 2) Location field_definitions: beds/baths as select + option_set_key (numeric labels from items).
-- 3) Hide legacy bedrooms/bathrooms from public booking; show beds/baths.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Pipeline stage: needs_a_quote
-- -----------------------------------------------------------------------------
-- 1a) Key an existing unkeyed stage (common CRM label) so we do not duplicate rows.
UPDATE public.pipeline_stages ps
SET "key" = 'needs_a_quote'
FROM (
  SELECT DISTINCT ON (ps2.org_id) ps2.id
  FROM public.pipeline_stages ps2
  WHERE ps2.org_id IS NOT NULL
    AND ps2."key" IS NULL
    AND lower(trim(ps2.name)) IN ('needs quote', 'needs a quote')
    AND NOT EXISTS (
      SELECT 1
      FROM public.pipeline_stages x
      WHERE x.org_id = ps2.org_id
        AND x."key" = 'needs_a_quote'
    )
  ORDER BY ps2.org_id, ps2.position NULLS LAST, ps2.id
) pick
WHERE ps.id = pick.id;

-- 1b) Insert only if this org still has no keyed needs_a_quote row.
INSERT INTO public.pipeline_stages (pipeline_id, org_id, name, "key", position, show_in_funnel, show_in_pie_chart)
SELECT DISTINCT ON (ps.org_id)
  ps.pipeline_id,
  ps.org_id,
  'Needs a quote',
  'needs_a_quote',
  ps.position + 1,
  ps.show_in_funnel,
  ps.show_in_pie_chart
FROM public.pipeline_stages ps
WHERE ps.key = 'quote_started'
  AND ps.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages x
    WHERE x.org_id = ps.org_id AND x.key = 'needs_a_quote'
  )
ORDER BY ps.org_id, ps.position;

-- -----------------------------------------------------------------------------
-- 2) beds / baths: dropdowns backed by existing booking option sets
-- -----------------------------------------------------------------------------
UPDATE public.field_definitions fd
SET
  field_type = 'select',
  config = jsonb_build_object('option_set_key', 'bedrooms_booking'),
  is_visible_in_public_booking = true,
  updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key = 'beds';

UPDATE public.field_definitions fd
SET
  field_type = 'select',
  config = jsonb_build_object('option_set_key', 'bathrooms_booking'),
  is_visible_in_public_booking = true,
  updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key = 'baths';

UPDATE public.field_definitions fd
SET
  is_visible_in_public_booking = false,
  updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key IN ('bedrooms', 'bathrooms');

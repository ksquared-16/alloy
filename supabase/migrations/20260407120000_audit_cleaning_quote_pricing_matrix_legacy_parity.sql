-- Staging validation: compare pricing_matrix resolution vs legacy first_clean / recurring
-- for active cleaning standard_cleaning quote slices. Does not change get_quote_pricing.
-- Empty result => parity for the enumerated grid (or no standard_cleaning service / no tiers).

CREATE OR REPLACE FUNCTION public.audit_cleaning_quote_pricing_matrix_legacy_parity()
RETURNS TABLE (
  slice_kind text,
  service_key text,
  tier_key text,
  frequency_key text,
  legacy_cents integer,
  matrix_cents integer,
  detail text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH v AS (
    SELECT id AS vertical_id
    FROM public.verticals
    WHERE slug = 'cleaning' AND is_active = true
    LIMIT 1
  ),
  prereq_vertical AS (
    SELECT
      'prerequisite'::text AS slice_kind,
      NULL::text AS service_key,
      NULL::text AS tier_key,
      NULL::text AS frequency_key,
      NULL::integer AS legacy_cents,
      NULL::integer AS matrix_cents,
      'cleaning_vertical_missing_or_inactive'::text AS detail
    WHERE NOT EXISTS (SELECT 1 FROM public.verticals WHERE slug = 'cleaning' AND is_active = true)
  ),
  prereq_service AS (
    SELECT
      'prerequisite'::text AS slice_kind,
      NULL::text AS service_key,
      NULL::text AS tier_key,
      NULL::text AS frequency_key,
      NULL::integer AS legacy_cents,
      NULL::integer AS matrix_cents,
      'no_active_standard_cleaning_pricing_service'::text AS detail
    WHERE EXISTS (SELECT 1 FROM v)
      AND NOT EXISTS (
        SELECT 1
        FROM public.pricing_services ps
        INNER JOIN v ON v.vertical_id = ps.vertical_id
        WHERE ps.is_active = true AND ps.service_key = 'standard_cleaning'
      )
  ),
  prereq_tiers AS (
    SELECT
      'prerequisite'::text AS slice_kind,
      NULL::text AS service_key,
      NULL::text AS tier_key,
      NULL::text AS frequency_key,
      NULL::integer AS legacy_cents,
      NULL::integer AS matrix_cents,
      'no_active_sqft_tiers_for_cleaning_vertical'::text AS detail
    WHERE EXISTS (SELECT 1 FROM v)
      AND EXISTS (
        SELECT 1
        FROM public.pricing_services ps
        INNER JOIN v ON v.vertical_id = ps.vertical_id
        WHERE ps.is_active = true AND ps.service_key = 'standard_cleaning'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.pricing_square_footage_tiers st
        INNER JOIN v ON v.vertical_id = st.vertical_id
        WHERE st.is_active = true
      )
  ),
  svc AS (
    SELECT
      ps.id AS service_id,
      ps.service_key,
      ps.service_offering_id,
      so.org_id AS org_id,
      ps.vertical_id,
      (
        SELECT pm.id
        FROM public.pricing_modes pm
        WHERE pm.org_id = so.org_id
          AND pm.mode_key = 'initial'
          AND pm.is_active = true
          AND (pm.vertical_id IS NULL OR pm.vertical_id = ps.vertical_id)
        ORDER BY pm.sort_order NULLS LAST, pm.id
        LIMIT 1
      ) AS initial_mode_id,
      (
        SELECT pm.id
        FROM public.pricing_modes pm
        WHERE pm.org_id = so.org_id
          AND pm.mode_key = 'recurring'
          AND pm.is_active = true
          AND (pm.vertical_id IS NULL OR pm.vertical_id = ps.vertical_id)
        ORDER BY pm.sort_order NULLS LAST, pm.id
        LIMIT 1
      ) AS recurring_mode_id
    FROM public.pricing_services ps
    INNER JOIN v ON v.vertical_id = ps.vertical_id
    LEFT JOIN public.service_offerings so ON so.id = ps.service_offering_id
    WHERE ps.is_active = true
      AND ps.service_key = 'standard_cleaning'
  ),
  tier AS (
    SELECT st.id AS tier_id, st.tier_key, st.dimension_value_id, st.vertical_id
    FROM public.pricing_square_footage_tiers st
    INNER JOIN v ON v.vertical_id = st.vertical_id
    WHERE st.is_active = true
  ),
  first_clean AS (
    SELECT
      s.service_key,
      t.tier_key,
      f.amount_cents AS legacy_cents,
      m.amount_cents AS matrix_cents,
      CASE
        WHEN s.service_offering_id IS NULL THEN 'service_missing_offering'
        WHEN s.org_id IS NULL THEN 'service_offering_missing_org'
        WHEN t.dimension_value_id IS NULL THEN 'tier_missing_dimension_value'
        WHEN s.initial_mode_id IS NULL THEN 'missing_initial_pricing_mode'
        WHEN f.amount_cents IS NULL AND m.amount_cents IS NULL THEN 'both_missing'
        WHEN f.amount_cents IS NULL THEN 'missing_legacy'
        WHEN m.amount_cents IS NULL THEN 'missing_matrix'
        WHEN f.amount_cents IS DISTINCT FROM m.amount_cents THEN 'amount_mismatch'
        ELSE NULL
      END AS detail
    FROM svc s
    CROSS JOIN tier t
    LEFT JOIN public.pricing_first_clean_prices f
      ON f.vertical_id = t.vertical_id
     AND f.service_id = s.service_id
     AND f.sqft_tier_id = t.tier_id
     AND f.is_active = true
    LEFT JOIN public.pricing_matrix m
      ON m.org_id = s.org_id
     AND m.vertical_id = t.vertical_id
     AND m.service_offering_id = s.service_offering_id
     AND m.pricing_mode_id = s.initial_mode_id
     AND m.pricing_dimension_value_id = t.dimension_value_id
     AND m.service_plan_template_id IS NULL
     AND m.currency = 'USD'
     AND m.is_active = true
  ),
  recurring AS (
    SELECT
      s.service_key,
      t.tier_key,
      pf.frequency_key,
      r.amount_cents AS legacy_cents,
      m.amount_cents AS matrix_cents,
      CASE
        WHEN s.service_offering_id IS NULL THEN 'service_missing_offering'
        WHEN s.org_id IS NULL THEN 'service_offering_missing_org'
        WHEN t.dimension_value_id IS NULL THEN 'tier_missing_dimension_value'
        WHEN s.recurring_mode_id IS NULL THEN 'missing_recurring_pricing_mode'
        WHEN pf.service_plan_template_id IS NULL THEN 'frequency_missing_plan_template'
        WHEN r.amount_cents IS NULL AND m.amount_cents IS NULL THEN 'both_missing'
        WHEN r.amount_cents IS NULL THEN 'missing_legacy'
        WHEN m.amount_cents IS NULL THEN 'missing_matrix'
        WHEN r.amount_cents IS DISTINCT FROM m.amount_cents THEN 'amount_mismatch'
        ELSE NULL
      END AS detail
    FROM svc s
    CROSS JOIN tier t
    INNER JOIN public.pricing_frequencies pf
      ON pf.vertical_id = t.vertical_id
     AND pf.is_active = true
     AND pf.is_recurring = true
    LEFT JOIN public.pricing_recurring_prices r
      ON r.vertical_id = t.vertical_id
     AND r.service_id = s.service_id
     AND r.frequency_id = pf.id
     AND r.sqft_tier_id = t.tier_id
     AND r.is_active = true
    LEFT JOIN public.pricing_matrix m
      ON m.org_id = s.org_id
     AND m.vertical_id = t.vertical_id
     AND m.service_offering_id = s.service_offering_id
     AND m.pricing_mode_id = s.recurring_mode_id
     AND m.pricing_dimension_value_id = t.dimension_value_id
     AND m.service_plan_template_id = pf.service_plan_template_id
     AND m.currency = 'USD'
     AND m.is_active = true
  )
  SELECT p.slice_kind, p.service_key, p.tier_key, p.frequency_key, p.legacy_cents, p.matrix_cents, p.detail
  FROM prereq_vertical p
  UNION ALL
  SELECT p.slice_kind, p.service_key, p.tier_key, p.frequency_key, p.legacy_cents, p.matrix_cents, p.detail
  FROM prereq_service p
  UNION ALL
  SELECT p.slice_kind, p.service_key, p.tier_key, p.frequency_key, p.legacy_cents, p.matrix_cents, p.detail
  FROM prereq_tiers p
  UNION ALL
  SELECT 'first_clean'::text, fc.service_key, fc.tier_key, NULL::text, fc.legacy_cents, fc.matrix_cents, fc.detail
  FROM first_clean fc
  WHERE fc.detail IS NOT NULL
  UNION ALL
  SELECT 'recurring'::text, r.service_key, r.tier_key, r.frequency_key, r.legacy_cents, r.matrix_cents, r.detail
  FROM recurring r
  WHERE r.detail IS NOT NULL;
$$;

COMMENT ON FUNCTION public.audit_cleaning_quote_pricing_matrix_legacy_parity() IS
  'Staging audit: mismatches between pricing_matrix and legacy first_clean/recurring for cleaning standard_cleaning. Empty = parity.';

REVOKE ALL ON FUNCTION public.audit_cleaning_quote_pricing_matrix_legacy_parity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_cleaning_quote_pricing_matrix_legacy_parity() TO service_role;

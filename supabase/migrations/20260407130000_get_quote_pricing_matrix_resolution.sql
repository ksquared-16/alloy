-- Cutover: resolve standard cleaning quote base prices from pricing_matrix
-- (initial + recurring modes). Legacy pricing_first_clean_prices / pricing_recurring_prices
-- are no longer read by this RPC. Addons, manual-quote branch, signature, and return shape unchanged.

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
  v_org_id uuid;
  v_service_offering_id uuid;
  v_dimension_value_id uuid;
  v_initial_mode_id uuid;
  v_recurring_mode_id uuid;
  v_plan_template_id uuid;
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

  SELECT st.id, st.dimension_value_id INTO v_sqft_tier_id, v_dimension_value_id
  FROM public.pricing_square_footage_tiers st
  WHERE st.vertical_id = v_vertical_id
    AND st.tier_key = p_sqft_key
    AND st.is_active = true
  LIMIT 1;

  IF v_sqft_tier_id IS NULL THEN
    RAISE EXCEPTION 'Unknown sqft tier_key for %: %', p_vertical_slug, p_sqft_key;
  END IF;

  SELECT ps.service_offering_id, so.org_id
    INTO v_service_offering_id, v_org_id
  FROM public.pricing_services ps
  LEFT JOIN public.service_offerings so ON so.id = ps.service_offering_id
  WHERE ps.id = v_service_id
  LIMIT 1;

  IF v_service_offering_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  END IF;

  IF v_dimension_value_id IS NULL THEN
    RAISE EXCEPTION 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  END IF;

  SELECT pm.id INTO v_initial_mode_id
  FROM public.pricing_modes pm
  WHERE pm.org_id = v_org_id
    AND pm.mode_key = 'initial'
    AND pm.is_active = true
    AND (pm.vertical_id IS NULL OR pm.vertical_id = v_vertical_id)
  ORDER BY pm.sort_order NULLS LAST, pm.id
  LIMIT 1;

  IF v_initial_mode_id IS NULL THEN
    RAISE EXCEPTION 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  END IF;

  SELECT pm.id INTO v_recurring_mode_id
  FROM public.pricing_modes pm
  WHERE pm.org_id = v_org_id
    AND pm.mode_key = 'recurring'
    AND pm.is_active = true
    AND (pm.vertical_id IS NULL OR pm.vertical_id = v_vertical_id)
  ORDER BY pm.sort_order NULLS LAST, pm.id
  LIMIT 1;

  SELECT mtx.amount_cents INTO v_first
  FROM public.pricing_matrix mtx
  WHERE mtx.org_id = v_org_id
    AND mtx.vertical_id = v_vertical_id
    AND mtx.service_offering_id = v_service_offering_id
    AND mtx.pricing_mode_id = v_initial_mode_id
    AND mtx.pricing_dimension_value_id = v_dimension_value_id
    AND mtx.service_plan_template_id IS NULL
    AND mtx.currency = 'USD'
    AND mtx.is_active = true
  LIMIT 1;

  IF v_first IS NULL THEN
    RAISE EXCEPTION 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  END IF;

  v_recurring := NULL;
  v_freq_label := NULL;
  v_discount_label := NULL;
  v_plan_template_id := NULL;

  IF coalesce(trim(p_frequency_key), '') <> '' THEN
    SELECT pf.id, pf.frequency_label, pf.discount_label, pf.service_plan_template_id
      INTO v_frequency_id, v_freq_label, v_discount_label, v_plan_template_id
    FROM public.pricing_frequencies pf
    WHERE pf.vertical_id = v_vertical_id
      AND pf.frequency_key = p_frequency_key
      AND pf.is_active = true
    LIMIT 1;

    IF v_frequency_id IS NOT NULL
       AND v_recurring_mode_id IS NOT NULL
       AND v_plan_template_id IS NOT NULL THEN
      SELECT mtx.amount_cents INTO v_recurring
      FROM public.pricing_matrix mtx
      WHERE mtx.org_id = v_org_id
        AND mtx.vertical_id = v_vertical_id
        AND mtx.service_offering_id = v_service_offering_id
        AND mtx.pricing_mode_id = v_recurring_mode_id
        AND mtx.pricing_dimension_value_id = v_dimension_value_id
        AND mtx.service_plan_template_id = v_plan_template_id
        AND mtx.currency = 'USD'
        AND mtx.is_active = true
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

COMMENT ON FUNCTION public.get_quote_pricing(text, text, text, text, text[]) IS
  'Quote pricing: matrix-backed first/recurring base amounts; addons from pricing_addons; manual keys unchanged.';

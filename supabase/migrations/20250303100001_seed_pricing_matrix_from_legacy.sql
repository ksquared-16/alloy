-- Seed pricing_matrix from existing pricing_first_clean_prices and pricing_recurring_prices.
-- Run after 20250303100000_pricing_matrix.sql. Safe to run multiple times (INSERT only where no conflict).
-- Preserves legacy tables; does not modify or drop them.

-- First-clean (initial) rows: vertical + service_offering (via pricing_services) + mode=initial + dimension_value (via sqft_tier)
INSERT INTO public.pricing_matrix (
    vertical_id,
    service_offering_id,
    service_plan_template_id,
    pricing_mode_id,
    pricing_dimension_value_id,
    amount_cents,
    is_active,
    source_table,
    source_id,
    created_at,
    updated_at
)
SELECT
    f.vertical_id,
    ps.service_offering_id,
    NULL::uuid,
    pm.id AS pricing_mode_id,
    pt.dimension_value_id AS pricing_dimension_value_id,
    f.amount_cents,
    COALESCE(f.is_active, true),
    'pricing_first_clean_prices',
    f.id,
    COALESCE(f.created_at, now()),
    COALESCE(f.updated_at, now())
FROM public.pricing_first_clean_prices f
JOIN public.pricing_services ps ON ps.id = f.service_id
JOIN public.pricing_modes pm ON pm.mode_key = 'initial'
LEFT JOIN public.pricing_square_footage_tiers pt ON pt.id = f.sqft_tier_id
WHERE f.vertical_id IS NOT NULL
  AND ps.service_offering_id IS NOT NULL
ON CONFLICT (
    vertical_id,
    service_offering_id,
    COALESCE(service_plan_template_id, '00000000-0000-0000-0000-000000000000'::uuid),
    pricing_mode_id,
    COALESCE(pricing_dimension_value_id, '00000000-0000-0000-0000-000000000000'::uuid)
) DO NOTHING;

-- Recurring rows: vertical + service_offering + plan (via pricing_frequencies) + mode=recurring + dimension_value (via sqft_tier)
INSERT INTO public.pricing_matrix (
    vertical_id,
    service_offering_id,
    service_plan_template_id,
    pricing_mode_id,
    pricing_dimension_value_id,
    amount_cents,
    is_active,
    source_table,
    source_id,
    created_at,
    updated_at
)
SELECT
    r.vertical_id,
    ps.service_offering_id,
    pf.service_plan_template_id,
    pm.id AS pricing_mode_id,
    pt.dimension_value_id AS pricing_dimension_value_id,
    r.amount_cents,
    COALESCE(r.is_active, true),
    'pricing_recurring_prices',
    r.id,
    COALESCE(r.created_at, now()),
    COALESCE(r.updated_at, now())
FROM public.pricing_recurring_prices r
JOIN public.pricing_services ps ON ps.id = r.service_id
JOIN public.pricing_frequencies pf ON pf.id = r.frequency_id
JOIN public.pricing_modes pm ON pm.mode_key = 'recurring'
LEFT JOIN public.pricing_square_footage_tiers pt ON pt.id = r.sqft_tier_id
WHERE r.vertical_id IS NOT NULL
  AND ps.service_offering_id IS NOT NULL
ON CONFLICT (
    vertical_id,
    service_offering_id,
    COALESCE(service_plan_template_id, '00000000-0000-0000-0000-000000000000'::uuid),
    pricing_mode_id,
    COALESCE(pricing_dimension_value_id, '00000000-0000-0000-0000-000000000000'::uuid)
) DO NOTHING;

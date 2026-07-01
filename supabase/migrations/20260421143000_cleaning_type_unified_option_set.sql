-- =============================================================================
-- Unified cleaning type option set (org-scoped): cleaning_type
-- =============================================================================
-- Problem: cleaning type has been split between a hardcoded "standard" and an
-- org option_set "specialty_cleaning_type". This migration seeds a unified
-- option set "cleaning_type" with:
--   - standard
--   - move_out
--   - heavy_clean
-- and metadata to distinguish specialty types.
--
-- Notes:
-- - Idempotent: uses ON CONFLICT DO NOTHING and guards.
-- - System-level: seeds for all orgs (org-scoped config model).
-- - Does NOT delete or modify existing specialty_cleaning_type sets/items.
-- =============================================================================

-- 1) Ensure the option_set exists for each org.
INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, 'cleaning_type', 'Cleaning type', 30
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO NOTHING;

-- 2) Seed items (standard + specialty) with metadata.
WITH os AS (
  SELECT id, org_id
  FROM public.option_sets
  WHERE set_key = 'cleaning_type'
)
INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
SELECT
  os.id,
  v.item_key,
  v.label,
  v.sort_order,
  v.metadata
FROM os
JOIN (
  VALUES
    ('standard',   'Standard cleaning', 0, jsonb_build_object('is_specialty', false, 'category', 'standard')),
    ('move_out',   'Move-out clean',     10, jsonb_build_object('is_specialty', true,  'category', 'specialty')),
    ('heavy_clean','Heavy clean',        20, jsonb_build_object('is_specialty', true,  'category', 'specialty'))
) AS v(item_key, label, sort_order, metadata)
  ON TRUE
ON CONFLICT (option_set_id, item_key) DO NOTHING;


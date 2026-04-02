-- =============================================================================
-- Batch 3.9 — Public booking field config seed (Alloy Bend staging org)
-- =============================================================================
-- Depends on: 20260402140000_field_sections_public_visibility.sql
--   (field_section_definitions + field_definitions.is_visible_in_public_booking)
--
-- Upserts section labels for org 7803388d-cdee-4afb-89cf-23a137f39423 and
-- updates/creates field_definitions to match staging public booking config.
-- Uses ON CONFLICT so existing row ids are preserved; only targeted columns change.
--
-- Verification:
--   SELECT entity_type, section_key, label, sort_order
--   FROM public.field_section_definitions
--   WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
--   ORDER BY entity_type, sort_order, section_key;
--
--   SELECT entity_type, field_key, field_type, section_key, sort_order,
--          is_visible_in_public_booking, config
--   FROM public.field_definitions
--   WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
--     AND field_key IN (
--       'square_footage', 'home_type', 'bedrooms', 'bathrooms',
--       'gate_code', 'parking_notes', 'alarm_notes',
--       'cleaning_frequency', 'promo_campaign', 'sms_consent', 'email_consent'
--     )
--   ORDER BY entity_type, field_key;
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid) THEN
    RAISE EXCEPTION 'Seed org 7803388d-cdee-4afb-89cf-23a137f39423 not found in public.orgs; skip or create org first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- field_section_definitions (upsert by org + entity_type + section_key)
-- -----------------------------------------------------------------------------
INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
VALUES
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'location', 'quote', 'Quote & Sizing', NULL, 10, now()),
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'location', 'property', 'Property Details', NULL, 20, now()),
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'location', 'access_notes', 'Access & Parking', NULL, 30, now()),
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'opportunity', 'quote', 'Service & Schedule', NULL, 10, now()),
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'opportunity', 'promo', 'Promotions', NULL, 20, now()),
  ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid, 'person', 'consent', 'Consent', NULL, 10, now())
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- field_definitions: staging-aligned config (insert missing keys, else update)
-- Unique: (org_id, entity_type, field_key) — see ux_field_definitions_org_entity_key
-- -----------------------------------------------------------------------------
INSERT INTO public.field_definitions (
  org_id,
  entity_type,
  field_key,
  label,
  description,
  field_type,
  is_system,
  is_required,
  is_active,
  is_visible_in_form,
  is_visible_in_drawer,
  is_visible_in_table,
  is_filterable,
  is_sortable,
  section_key,
  sort_order,
  placeholder,
  help_text,
  config,
  is_visible_in_public_booking,
  updated_at
)
VALUES
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'square_footage',
    'Square Footage',
    NULL,
    'select',
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'quote',
    110,
    NULL,
    NULL,
    '{"catalog_key":"pricing_sqft_tiers"}'::jsonb,
    false,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'home_type',
    'Home Type',
    NULL,
    'select',
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'property',
    120,
    NULL,
    NULL,
    '{"catalog_key":"home_types"}'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'bedrooms',
    'Bedrooms',
    NULL,
    'select',
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'property',
    130,
    NULL,
    NULL,
    '[
      {"label":"Studio","value":"studio"},
      {"label":"1 bedroom","value":"1"},
      {"label":"2 bedrooms","value":"2"},
      {"label":"3 bedrooms","value":"3"},
      {"label":"4 bedrooms","value":"4"},
      {"label":"5+ bedrooms","value":"5_plus"}
    ]'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'bathrooms',
    'Bathrooms',
    NULL,
    'select',
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'property',
    140,
    NULL,
    NULL,
    '[
      {"label":"1 bathroom","value":"1"},
      {"label":"1.5 bathrooms","value":"1_5"},
      {"label":"2 bathrooms","value":"2"},
      {"label":"2.5 bathrooms","value":"2_5"},
      {"label":"3 bathrooms","value":"3"},
      {"label":"4+ bathrooms","value":"4_plus"}
    ]'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'gate_code',
    'Gate Code',
    NULL,
    'text',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'access_notes',
    210,
    NULL,
    NULL,
    '{}'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'parking_notes',
    'Parking Notes',
    NULL,
    'text',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'access_notes',
    220,
    NULL,
    NULL,
    '{}'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'location',
    'alarm_notes',
    'Alarm Notes',
    NULL,
    'text',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'access_notes',
    230,
    NULL,
    NULL,
    '{}'::jsonb,
    true,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'opportunity',
    'cleaning_frequency',
    'Cleaning Frequency',
    NULL,
    'select',
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'quote',
    110,
    NULL,
    NULL,
    '[
      {"label":"One time","value":"one_time"},
      {"label":"Weekly","value":"weekly"},
      {"label":"Biweekly","value":"biweekly"},
      {"label":"Monthly","value":"monthly"}
    ]'::jsonb,
    false,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'opportunity',
    'promo_campaign',
    'Promo Campaign',
    NULL,
    'text',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'promo',
    910,
    NULL,
    NULL,
    '{}'::jsonb,
    false,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'person',
    'sms_consent',
    'SMS Consent',
    NULL,
    'boolean',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'consent',
    510,
    NULL,
    NULL,
    '{}'::jsonb,
    false,
    now()
  ),
  (
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'person',
    'email_consent',
    'Email Consent',
    NULL,
    'boolean',
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'consent',
    520,
    NULL,
    NULL,
    '{}'::jsonb,
    false,
    now()
  )
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  is_visible_in_public_booking = EXCLUDED.is_visible_in_public_booking,
  section_key = EXCLUDED.section_key,
  sort_order = EXCLUDED.sort_order,
  config = EXCLUDED.config,
  label = EXCLUDED.label,
  updated_at = now();

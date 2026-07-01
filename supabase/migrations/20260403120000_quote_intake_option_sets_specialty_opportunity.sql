-- =============================================================================
-- Quote intake: option-backed bed/bath, specialty opportunity fields, doc convention
-- =============================================================================
-- 1) option_sets bedrooms_booking + bathrooms_booking (+ items) for every org
-- 2) Reactivate location bedrooms/bathrooms as select + option_set_key; hide beds/baths from public booking (duplicate UI)
-- 3) opportunity field_section specialty_quote + defs: specialty_cleaning_type, preferred_service_date, specialty_quote_notes
-- 4) option_set specialty_cleaning_type (move_out, heavy_clean)
--
-- Document convention (app-enforced; documents.doc_type is free text):
--   doc_type = 'specialty_quote_photo'
--   metadata->>'specialty_quote_photo_slot' in (living_room, kitchen, master_bedroom, master_bathroom)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Bedrooms / bathrooms option sets (all orgs)
-- ---------------------------------------------------------------------------
-- Guard: public.option_sets / option_set_items are first created in the NEXT
-- migration (20260404130000). On a fresh `supabase db reset` they do not yet
-- exist here, so this block no-ops. Behavior is unchanged where the tables exist
-- (these seeds source FROM public.orgs and are 0-row on a fresh DB regardless).
DO $$
BEGIN
  IF to_regclass('public.option_sets') IS NULL OR to_regclass('public.option_set_items') IS NULL THEN
    RAISE NOTICE 'option_sets/option_set_items absent; skipping booking option-set seed (created later in 20260404130000).';
    RETURN;
  END IF;

  INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
  SELECT o.id, v.set_key, v.label, v.ord
  FROM public.orgs o
  CROSS JOIN (
    VALUES
      ('bedrooms_booking'::text, 'Bedrooms (booking)'::text, 40::int),
      ('bathrooms_booking'::text, 'Bathrooms (booking)'::text, 50),
      ('specialty_cleaning_type'::text, 'Specialty cleaning type'::text, 60)
  ) AS v (set_key, label, ord)
  ON CONFLICT (org_id, set_key) DO NOTHING;

  INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
  SELECT os.id, v.item_key, v.label, v.ord
  FROM public.option_sets os
  CROSS JOIN (
    VALUES
      ('bedrooms_booking', 'studio', 'Studio', 10),
      ('bedrooms_booking', '1', '1', 20),
      ('bedrooms_booking', '2', '2', 30),
      ('bedrooms_booking', '3', '3', 40),
      ('bedrooms_booking', '4', '4', 50),
      ('bedrooms_booking', '5_plus', '5+', 60)
  ) AS v (set_key, item_key, label, ord)
  WHERE os.set_key = v.set_key
  ON CONFLICT (option_set_id, item_key) DO NOTHING;

  INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
  SELECT os.id, v.item_key, v.label, v.ord
  FROM public.option_sets os
  CROSS JOIN (
    VALUES
      ('bathrooms_booking', '1', '1', 10),
      ('bathrooms_booking', '1_5', '1.5', 20),
      ('bathrooms_booking', '2', '2', 30),
      ('bathrooms_booking', '2_5', '2.5', 40),
      ('bathrooms_booking', '3', '3', 50),
      ('bathrooms_booking', '4_plus', '4+', 60)
  ) AS v (set_key, item_key, label, ord)
  WHERE os.set_key = v.set_key
  ON CONFLICT (option_set_id, item_key) DO NOTHING;

  INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
  SELECT os.id, v.item_key, v.label, v.ord
  FROM public.option_sets os
  CROSS JOIN (
    VALUES
      ('specialty_cleaning_type', 'move_out', 'Move-out cleaning', 10),
      ('specialty_cleaning_type', 'heavy_clean', 'Heavy / deep cleaning', 20)
  ) AS v (set_key, item_key, label, ord)
  WHERE os.set_key = v.set_key
  ON CONFLICT (option_set_id, item_key) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Location: bedrooms / bathrooms use option sets; avoid duplicate public booking fields
-- ---------------------------------------------------------------------------
UPDATE public.field_definitions fd
SET
  is_active = true,
  is_visible_in_public_booking = true,
  field_type = 'select',
  config = jsonb_build_object('option_set_key', 'bedrooms_booking'),
  updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key = 'bedrooms';

UPDATE public.field_definitions fd
SET
  is_active = true,
  is_visible_in_public_booking = true,
  field_type = 'select',
  config = jsonb_build_object('option_set_key', 'bathrooms_booking'),
  updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key = 'bathrooms';

UPDATE public.field_definitions fd
SET is_visible_in_public_booking = false, updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key IN ('beds', 'baths');

-- ---------------------------------------------------------------------------
-- 3) Opportunity: specialty_quote section + fields (all orgs)
-- ---------------------------------------------------------------------------
INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT o.id, 'opportunity', 'specialty_quote', 'Specialty quote', 'Move-out / heavy clean intake', 25, now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, section_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

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
SELECT
  o.id,
  'opportunity',
  v.field_key,
  v.label,
  v.description,
  v.field_type,
  false,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  'specialty_quote',
  v.sort_order,
  v.placeholder,
  NULL::text,
  v.config::jsonb,
  true,
  now()
FROM public.orgs o
CROSS JOIN (
  VALUES
    (
      'specialty_cleaning_type',
      'Cleaning type',
      'Move-out vs heavy / deep clean',
      'select',
      10,
      NULL::text,
      '{"option_set_key":"specialty_cleaning_type"}'::text
    ),
    (
      'preferred_service_date',
      'Preferred service date',
      'Target date for the specialty clean',
      'date',
      20,
      NULL::text,
      '{}'::text
    ),
    (
      'specialty_quote_notes',
      'Notes',
      'Customer notes for specialty quoting',
      'textarea',
      30,
      'Timing, empty home, focus areas…',
      '{}'::text
    )
) AS v (field_key, label, description, field_type, sort_order, placeholder, config)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  field_type = EXCLUDED.field_type,
  section_key = EXCLUDED.section_key,
  sort_order = EXCLUDED.sort_order,
  placeholder = EXCLUDED.placeholder,
  config = EXCLUDED.config,
  is_active = true,
  is_visible_in_public_booking = true,
  updated_at = now();

COMMENT ON COLUMN public.documents.doc_type IS
  'Logical document type. Specialty quote photos use doc_type = specialty_quote_photo; slot in metadata.specialty_quote_photo_slot.';

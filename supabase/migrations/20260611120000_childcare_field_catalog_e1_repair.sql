-- Childcare field catalog E1 repair — idempotent inserts and catalog class tagging.
-- No deletes; forward-fix operator labels and hide legacy_home_services residue.

-- Canonical Program field on inquiry child (location-scoped category id).
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
    config,
    is_visible_in_public_booking,
    updated_at
)
SELECT
    o.id,
    'inquiry_child',
    'desired_program_category_id',
    'Program',
    'Program offering at the child''s location.',
    'select',
    true,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    'placement',
    20,
    jsonb_build_object(
        'operator_catalog_class', 'operator_configurable',
        'option_source', 'programs_for_location',
        'depends_on_field_key', 'location_id'
    ),
    false,
    now()
FROM public.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_definitions fd
    WHERE fd.org_id = o.id
      AND fd.entity_type = 'inquiry_child'
      AND fd.field_key = 'desired_program_category_id'
);

-- Tag legacy home-services location fields (hide from operator pickers).
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'legacy_home_services'),
    updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key IN (
      'access_method',
      'access_notes',
      'beds',
      'baths',
      'home_type',
      'square_footage',
      'square_footage_tier',
      'bedrooms',
      'bathrooms',
      'external_source',
      'external_id',
      'latitude',
      'longitude',
      'lat',
      'lng',
      'parent_location_id'
  )
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'legacy_home_services';

-- Legacy program key remains system workflow (room cascade compat).
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'system_workflow'),
    label = COALESCE(NULLIF(trim(fd.label), ''), 'Program'),
    description = COALESCE(
        NULLIF(trim(fd.description), ''),
        'Legacy program key — prefer Program when both exist.'
    ),
    updated_at = now()
WHERE fd.entity_type = 'inquiry_child'
  AND fd.field_key = 'desired_program_type'
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'system_workflow';

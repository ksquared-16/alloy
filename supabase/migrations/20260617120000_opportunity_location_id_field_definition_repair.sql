-- =============================================================================
-- Lead Location — expose opportunities.location_id as operator-configurable reference
-- Mirrors inquiry_child.location_id pattern (option_source: locations).
-- Idempotent: UPDATE existing rows + INSERT missing per org.
-- =============================================================================

UPDATE public.field_definitions fd
SET
    field_type = 'select',
    label = COALESCE(NULLIF(trim(fd.label), ''), 'Location'),
    section_key = COALESCE(NULLIF(trim(fd.section_key), ''), 'inquiry_context'),
    sort_order = CASE WHEN fd.sort_order IS NULL OR fd.sort_order = 0 THEN 25 ELSE fd.sort_order END,
    is_system = true,
    is_active = true,
    is_visible_in_drawer = true,
    is_visible_in_form = true,
    config = COALESCE(fd.config, '{}'::jsonb)
        || jsonb_build_object(
            'operator_catalog_class', 'operator_configurable',
            'option_source', 'locations',
            'field_kind', 'entity_reference',
            'target_entity_type', 'location',
            'storage_class', 'native_column',
            'storage_table', 'opportunities',
            'storage_column', 'location_id'
        ),
    updated_at = now()
WHERE fd.entity_type = 'opportunity'
  AND fd.field_key = 'location_id';

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
    config
)
SELECT
    o.id,
    'opportunity',
    'location_id',
    'Location',
    'Lead-level site or campus reference (opportunities.location_id → locations).',
    'select',
    true,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    'inquiry_context',
    25,
    jsonb_build_object(
        'operator_catalog_class', 'operator_configurable',
        'option_source', 'locations',
        'field_kind', 'entity_reference',
        'target_entity_type', 'location',
        'storage_class', 'native_column',
        'storage_table', 'opportunities',
        'storage_column', 'location_id'
    )
FROM public.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_definitions fd
    WHERE fd.org_id = o.id
      AND fd.entity_type = 'opportunity'
      AND fd.field_key = 'location_id'
);

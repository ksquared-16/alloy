-- Person mailing address fields (all orgs) — field_values backed, parent drawer operating surface.

INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT
    o.id,
    'person',
    'address',
    'Address',
    'Mailing address for household and contact operations',
    45,
    now()
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
    config,
    is_visible_in_public_booking,
    updated_at
)
SELECT
    o.id,
    'person',
    v.field_key,
    v.label,
    v.description,
    'text',
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    'address',
    v.sort_order,
    '{}'::jsonb,
    false,
    now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('address_line1', 'Address Line 1', 'Street address line 1', 10),
        ('address_line2', 'Address Line 2', 'Street address line 2', 20),
        ('city', 'City', 'City', 30),
        ('state', 'State', 'State or province', 40),
        ('postal_code', 'Zip Code', 'Postal or ZIP code', 50)
) AS v(field_key, label, description, sort_order)
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    section_key = EXCLUDED.section_key,
    sort_order = EXCLUDED.sort_order,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();

-- Person communication opt-out field (all orgs).
-- DB-backed field_definitions row; values persist via field_values (boolean).

INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT
    o.id,
    'person',
    'consent',
    'Consent',
    'Communication and media consent preferences',
    80,
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
    'communication_opt_out',
    'Communication opt-out',
    'When enabled, this person has opted out of operational communications',
    'boolean',
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    'consent',
    230,
    '{}'::jsonb,
    false,
    now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    section_key = EXCLUDED.section_key,
    sort_order = EXCLUDED.sort_order,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();

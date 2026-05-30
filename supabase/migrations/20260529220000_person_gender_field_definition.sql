-- Person gender field — configurable select via option_set (all orgs).

INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT o.id, 'person_gender', 'Person gender', 50
FROM public.orgs o
ON CONFLICT (org_id, set_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
SELECT os.id, v.item_key, v.label, v.sort_order, '{}'::jsonb
FROM public.option_sets os
CROSS JOIN (
    VALUES
        ('female', 'Female', 10),
        ('male', 'Male', 20),
        ('non_binary', 'Non-binary', 30),
        ('prefer_not_to_say', 'Prefer not to say', 40)
) AS v(item_key, label, sort_order)
WHERE os.set_key = 'person_gender'
ON CONFLICT (option_set_id, item_key) DO UPDATE SET
    label = EXCLUDED.label,
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
    'gender',
    'Gender',
    'Child or person gender identity',
    'select',
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    'child_profile',
    15,
    jsonb_build_object('option_set_key', 'person_gender'),
    false,
    now()
FROM public.orgs o
ON CONFLICT (org_id, entity_type, field_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    section_key = EXCLUDED.section_key,
    sort_order = EXCLUDED.sort_order,
    config = EXCLUDED.config,
    is_visible_in_drawer = true,
    is_active = true,
    updated_at = now();

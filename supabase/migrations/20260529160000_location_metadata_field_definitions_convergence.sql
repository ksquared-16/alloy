-- Location metadata field_definitions convergence (all orgs).
-- Values persist on locations.metadata via config.storage = "metadata".
-- Fix-forward from 20260529153000: labels, capacity type, site fields.

INSERT INTO public.option_sets (org_id, set_key, label, sort_order)
SELECT
    o.id,
    v.set_key,
    v.label,
    v.ord
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('location_age_range_unit'::text, 'Location age range unit'::text, 70::int)
) AS v (set_key, label, ord)
ON CONFLICT (org_id, set_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order)
SELECT
    os.id,
    v.item_key,
    v.label,
    v.ord
FROM public.option_sets os
JOIN (
    VALUES
        ('location_age_range_unit', 'months', 'Months', 10),
        ('location_age_range_unit', 'years', 'Years', 20)
) AS v (set_key, item_key, label, ord)
    ON os.set_key = v.set_key
ON CONFLICT (option_set_id, item_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.field_section_definitions (org_id, entity_type, section_key, label, description, sort_order, updated_at)
SELECT
    o.id,
    v.entity_type,
    v.section_key,
    v.label,
    v.description,
    v.sort_order,
    now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('location', 'site_metadata', 'Site metadata', 'Director and site contact metadata on location records', 40),
        ('location', 'room_metadata', 'Room metadata', 'Classroom/unit metadata stored on location records', 45)
) AS v (entity_type, section_key, label, description, sort_order)
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
    'location',
    v.field_key,
    v.label,
    v.description,
    v.field_type,
    true,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    v.section_key,
    v.sort_order,
    v.config::jsonb,
    false,
    now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        (
            'category',
            'Category',
            'Program or room category',
            'select',
            'room_metadata',
            10,
            '{"option_set_key":"childcare_program_type","storage":"metadata"}'
        ),
        (
            'age_range_from',
            'Age range from',
            'Minimum age served in this room',
            'text',
            'room_metadata',
            20,
            '{"storage":"metadata"}'
        ),
        (
            'age_range_to',
            'Age range to',
            'Maximum age served in this room',
            'text',
            'room_metadata',
            30,
            '{"storage":"metadata"}'
        ),
        (
            'age_range_unit',
            'Age range unit',
            'Unit for age range values (months or years)',
            'select',
            'room_metadata',
            40,
            '{"option_set_key":"location_age_range_unit","storage":"metadata"}'
        ),
        (
            'capacity',
            'Capacity',
            'Licensed or operational capacity',
            'number',
            'room_metadata',
            50,
            '{"storage":"metadata"}'
        ),
        (
            'student_teacher_ratio',
            'Student:Teacher Ratio',
            'Licensed or operational student-to-teacher ratio',
            'text',
            'room_metadata',
            60,
            '{"storage":"metadata"}'
        ),
        (
            'director_name',
            'Director name',
            'Site director or primary contact name',
            'text',
            'site_metadata',
            10,
            '{"storage":"metadata"}'
        ),
        (
            'director_email',
            'Director email',
            'Site director email',
            'text',
            'site_metadata',
            20,
            '{"storage":"metadata"}'
        ),
        (
            'site_phone',
            'Site phone',
            'Primary site phone number',
            'text',
            'site_metadata',
            30,
            '{"storage":"metadata"}'
        )
) AS v (field_key, label, description, field_type, section_key, sort_order, config)
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

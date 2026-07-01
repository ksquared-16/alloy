-- Person (child) lifecycle statuses + enrollment/start date field definitions.

INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    o.id,
    'persons'::text,
    v.status_key,
    v.status_label,
    v.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object('seed_source', 'migration_20260530120000_person_child_lifecycle')
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('active'::text, 'Active'::text, 10::int),
        ('future_start', 'Future Start', 20),
        ('withdrawn', 'Withdrawn', 40),
        ('graduated', 'Graduated', 50),
        ('inactive', 'Inactive', 60),
        ('archived', 'Archived', 70)
) AS v(status_key, status_label, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = o.id
      AND sd.entity_type = 'persons'
      AND sd.status_key = v.status_key
);

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
    'date',
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    'child_profile',
    v.sort_order,
    '{}'::jsonb,
    false,
    now()
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('enrollment_date', 'Enrollment date', 'Date the child was officially enrolled', 25),
        ('start_date', 'Start date', 'Date the child actually started care', 26)
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

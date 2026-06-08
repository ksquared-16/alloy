-- =============================================================================
-- FC-1.5 — Inquiry child native field_definitions parity (all orgs)
-- =============================================================================
-- Ensures every org has all seven canonical inquiry_child native field rows
-- aligned with INQUIRY_CHILD_NATIVE_FIELD_MANIFEST (web/lib/fields/inquiryChildFieldRegistry.ts).
-- Idempotent: INSERT … WHERE NOT EXISTS only; never overwrites operator edits.
-- =============================================================================

INSERT INTO public.field_section_definitions (
    org_id,
    entity_type,
    section_key,
    label,
    description,
    sort_order,
    is_archived
)
SELECT
    o.id,
    'inquiry_child',
    'inquiry_participation',
    'Inquiry participation',
    'Fields for each child linked to an inquiry.',
    50,
    false
FROM public.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_section_definitions fsd
    WHERE fsd.org_id = o.id
      AND fsd.entity_type = 'inquiry_child'
      AND fsd.section_key = 'inquiry_participation'
);

INSERT INTO public.field_definitions (
    org_id,
    entity_type,
    field_key,
    field_type,
    label,
    description,
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
    v.entity_type,
    v.field_key,
    v.field_type,
    v.label,
    v.description,
    true,
    false,
    true,
    v.is_visible_in_form,
    v.is_visible_in_drawer,
    v.is_visible_in_table,
    false,
    false,
    v.section_key,
    v.sort_order,
    '{}'::jsonb
FROM public.orgs o
CROSS JOIN (
    VALUES
        (
            'inquiry_child'::text,
            'desired_start_date'::text,
            'date'::text,
            'Desired start'::text,
            'Per-child target enrollment start date on this inquiry.'::text,
            'inquiry_participation'::text,
            10::int,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'location_id',
            'select',
            'Location',
            'Physical location (site) for this child on the inquiry.',
            'inquiry_participation',
            15,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'desired_program_type',
            'select',
            'Program',
            'Desired program for this child on the inquiry.',
            'inquiry_participation',
            18,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'program_room_cohort_key',
            'select',
            'Room',
            'Room or classroom interest for this child (site-scoped unit).',
            'inquiry_participation',
            22,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'desired_schedule_type',
            'select',
            'Schedule',
            'Desired schedule for this child on the inquiry.',
            'inquiry_participation',
            28,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'outcome_status_key',
            'select',
            'Status',
            'Enrollment status for this child on the inquiry.',
            'inquiry_participation',
            40,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'notes',
            'text',
            'Notes',
            'Notes specific to this child on the inquiry.',
            'inquiry_participation',
            50,
            true,
            true,
            false
        )
) AS v (
    entity_type,
    field_key,
    field_type,
    label,
    description,
    section_key,
    sort_order,
    is_visible_in_form,
    is_visible_in_drawer,
    is_visible_in_table
)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_definitions fd
    WHERE fd.org_id = o.id
      AND fd.entity_type = v.entity_type
      AND fd.field_key = v.field_key
);

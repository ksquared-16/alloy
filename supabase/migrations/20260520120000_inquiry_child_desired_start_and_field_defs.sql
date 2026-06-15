-- =============================================================================
-- Inquiry Child surface — OCM desired_start_date + system field_definitions
-- =============================================================================
-- Product entity_type: inquiry_child (operator UX)
-- Persistence: opportunity_customer_members
-- =============================================================================

ALTER TABLE public.opportunity_customer_members
    ADD COLUMN IF NOT EXISTS desired_start_date date NULL;

COMMENT ON COLUMN public.opportunity_customer_members.desired_start_date IS
    'Per-child desired enrollment start (nullable). When null, UI may inherit opportunity-level desired_start_date without copying.';

-- Catalog section for Settings → Field grouping (per org, idempotent)
-- is_archived added in 20260523120000_field_policy_and_section_v1 (DEFAULT false backfills rows).
INSERT INTO public.field_section_definitions (
    org_id,
    entity_type,
    section_key,
    label,
    description,
    sort_order
)
SELECT
    o.id,
    'inquiry_child',
    'inquiry_participation',
    'Inquiry participation',
    'Fields for each child linked to an inquiry.',
    50
FROM public.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.field_section_definitions fsd
    WHERE fsd.org_id = o.id
      AND fsd.entity_type = 'inquiry_child'
      AND fsd.section_key = 'inquiry_participation'
);

-- Native system field definitions (per org, idempotent)
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
            'desired_program_type',
            'select',
            'Program',
            'Desired program for this child on the inquiry.',
            'inquiry_participation',
            20,
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
            30,
            true,
            true,
            false
        ),
        (
            'inquiry_child',
            'outcome_status_key',
            'select',
            'Outcome',
            'Enrollment outcome for this child on the inquiry.',
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

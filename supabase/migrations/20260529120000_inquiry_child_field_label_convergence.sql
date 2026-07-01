-- =============================================================================
-- Inquiry child field labels — Card 1 UI convergence (operator-facing only)
-- =============================================================================
-- Renames Settings → Fields labels and sort order; does not rename DB columns.
-- =============================================================================

UPDATE public.field_definitions
SET
    label = 'Status',
    description = 'Enrollment status for this child on the inquiry.',
    sort_order = 40
WHERE entity_type = 'inquiry_child'
  AND field_key = 'outcome_status_key'
  AND label = 'Outcome';

UPDATE public.field_definitions
SET sort_order = 18
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_program_type';

UPDATE public.field_definitions
SET sort_order = 28
WHERE entity_type = 'inquiry_child'
  AND field_key = 'desired_schedule_type';

-- location_id / program_room_cohort_key may be missing on orgs seeded before waitlist child-scope card
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
            'location_id'::text,
            'select'::text,
            'Location'::text,
            'Physical location (site) for this child on the inquiry.'::text,
            'inquiry_participation'::text,
            15::int,
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

UPDATE public.field_definitions
SET label = 'Location', sort_order = 15
WHERE entity_type = 'inquiry_child'
  AND field_key = 'location_id'
  AND label IN ('Site', 'site');

UPDATE public.field_definitions
SET label = 'Room', sort_order = 22
WHERE entity_type = 'inquiry_child'
  AND field_key = 'program_room_cohort_key'
  AND label IN ('Room / cohort', 'Room/cohort', 'Cohort');

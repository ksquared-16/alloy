-- Stabilize AdminV2 workspace right_rail: registry-only useful actions for Enrollment.
-- - Deactivate global right_rail placements (unscoped → every workspace fetch).
-- - Deactivate Enrollment right_rail rows we no longer want on dept / work-unit rails.
-- - Add org-scoped `view_needs_attention` + placements alongside create_inquiry + review_automations.

-- -----------------------------------------------------------------------------
-- 1) Global templates: stop unscoped right_rail from appearing on every dept/WU fetch
-- -----------------------------------------------------------------------------
UPDATE public.action_placements p
SET is_active = false,
    updated_at = now()
FROM public.action_definitions d
WHERE p.action_definition_id = d.id
  AND p.org_id IS NULL
  AND d.org_id IS NULL
  AND p.surface = 'right_rail'
  AND p.slot = 'right_rail'
  AND d.key IN ('new_inquiry', 'open_enrollment_work_unit');

-- -----------------------------------------------------------------------------
-- 2) Enrollment orgs: `view_needs_attention` definition (one row per org)
-- -----------------------------------------------------------------------------
INSERT INTO public.action_definitions (org_id, key, label, description, entity_type, action_type, payload_schema, is_active, priority)
SELECT
    ed.org_id,
    'view_needs_attention',
    'View needs attention',
    'Open the needs-attention lane for this enrollment department.',
    'opportunity',
    'ui_intent',
    jsonb_build_object('intent', 'view_needs_attention'),
    true,
    100
FROM (
    SELECT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
) ed
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions ad
    WHERE ad.org_id = ed.org_id
      AND ad.key = 'view_needs_attention'
);

-- Align user-facing label for primary inquiry CTA
UPDATE public.action_definitions ad
SET label = 'Create inquiry',
    updated_at = now()
FROM public.departments d
WHERE lower(coalesce(d.key, '')) = 'enrollment'
  AND ad.org_id = d.org_id
  AND ad.key = 'create_inquiry';

-- Drop legacy / noisy right-rail placements (dept + work-unit scoped)
UPDATE public.action_placements ap
SET is_active = false,
    updated_at = now()
FROM public.action_definitions ad
JOIN public.departments d ON d.org_id = ad.org_id AND lower(coalesce(d.key, '')) = 'enrollment'
WHERE ap.action_definition_id = ad.id
  AND ap.surface = 'right_rail'
  AND ap.slot = 'right_rail'
  AND ad.key IN (
      'open_enrollment_pipeline',
      'send_paperwork_placeholder',
      'add_to_waitlist_placeholder'
  );

-- -----------------------------------------------------------------------------
-- 3) Placements for `view_needs_attention` (department primary WU + each enrollment WU)
-- -----------------------------------------------------------------------------
WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
),
enrollment_wus AS (
    SELECT wu.id AS work_unit_id, wu.department_id, ed.org_id
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
),
primary_wu AS (
    SELECT DISTINCT ON (ed.department_id)
        ed.department_id,
        ed.org_id,
        wu.id AS work_unit_id
    FROM enrollment_depts ed
    LEFT JOIN public.work_units wu ON wu.department_id = ed.department_id
    ORDER BY ed.department_id, wu.created_at NULLS LAST, wu.id
),
def_row AS (
    SELECT ad.id AS action_definition_id, ad.org_id
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key = 'view_needs_attention'
),
desired AS (
    SELECT
        pw.org_id,
        dr.action_definition_id,
        'right_rail'::text AS surface,
        'right_rail'::text AS slot,
        'opportunity'::text AS entity_type,
        pw.department_id,
        pw.work_unit_id,
        NULL::text AS section_key,
        30 AS order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM primary_wu pw
    JOIN def_row dr ON dr.org_id = pw.org_id
    WHERE pw.work_unit_id IS NOT NULL

    UNION ALL

    SELECT
        ew.org_id,
        dr.action_definition_id,
        'right_rail'::text,
        'right_rail'::text,
        'opportunity'::text,
        ew.department_id,
        ew.work_unit_id,
        NULL::text,
        30,
        'button'::text,
        true
    FROM enrollment_wus ew
    JOIN def_row dr ON dr.org_id = ew.org_id
)
INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    section_key,
    order_index,
    display_style,
    is_active
)
SELECT
    d.org_id,
    d.action_definition_id,
    d.surface,
    d.slot,
    d.entity_type,
    d.department_id,
    d.work_unit_id,
    d.section_key,
    d.order_index,
    d.display_style,
    d.is_active
FROM desired d
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id = d.org_id
      AND ap.action_definition_id = d.action_definition_id
      AND ap.surface = d.surface
      AND ap.slot = d.slot
      AND ap.entity_type IS NOT DISTINCT FROM d.entity_type
      AND ap.department_id IS NOT DISTINCT FROM d.department_id
      AND ap.work_unit_id IS NOT DISTINCT FROM d.work_unit_id
      AND ap.section_key IS NOT DISTINCT FROM d.section_key
);

-- Re-activate + normalize order for the three workspace right-rail actions
WITH key_order AS (
    SELECT * FROM (VALUES
        ('create_inquiry', 10),
        ('review_automations', 20),
        ('view_needs_attention', 30)
    ) AS t(key, order_index)
)
UPDATE public.action_placements ap
SET order_index = ko.order_index,
    is_active = true,
    updated_at = now()
FROM public.action_definitions ad
JOIN public.departments d ON d.org_id = ad.org_id AND lower(coalesce(d.key, '')) = 'enrollment'
JOIN key_order ko ON ko.key = ad.key
WHERE ap.action_definition_id = ad.id
  AND ap.surface = 'right_rail'
  AND ap.slot = 'right_rail'
  AND ad.key IN ('create_inquiry', 'review_automations', 'view_needs_attention');

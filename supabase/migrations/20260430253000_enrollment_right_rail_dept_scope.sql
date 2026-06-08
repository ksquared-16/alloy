-- Enrollment workspace right rail: department-scoped placements (work_unit_id NULL) so
-- GET /api/admin/actions?surface=right_rail&department_id=…&work_unit_id=… resolves the same
-- V1 actions for every enrollment work unit (Create inquiry, Review automations, View needs attention).
-- Deactivates per–work-unit duplicates for those keys to avoid resolver noise.

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
),
def_rows AS (
    SELECT ad.id AS action_definition_id, ad.org_id, ad.key
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key IN ('create_inquiry', 'review_automations', 'view_needs_attention')
      AND coalesce(ad.is_active, true) = true
),
key_order AS (
    SELECT * FROM (VALUES
        ('create_inquiry', 10),
        ('review_automations', 20),
        ('view_needs_attention', 30)
    ) AS t(key, order_index)
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
    dr.org_id,
    dr.action_definition_id,
    'right_rail'::text,
    'right_rail'::text,
    'opportunity'::text,
    ed.department_id,
    NULL::uuid,
    NULL::text,
    ko.order_index,
    'button'::text,
    true
FROM def_rows dr
JOIN enrollment_depts ed ON ed.org_id = dr.org_id
JOIN key_order ko ON ko.key = dr.key
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id = dr.org_id
      AND ap.action_definition_id = dr.action_definition_id
      AND ap.surface = 'right_rail'
      AND ap.slot = 'right_rail'
      AND ap.entity_type IS NOT DISTINCT FROM 'opportunity'::text
      AND ap.department_id IS NOT DISTINCT FROM ed.department_id
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);

UPDATE public.action_placements ap
SET is_active = false,
    updated_at = now()
FROM public.action_definitions ad
JOIN public.departments d ON d.org_id = ad.org_id AND lower(coalesce(d.key, '')) = 'enrollment'
WHERE ap.action_definition_id = ad.id
  AND ap.org_id = ad.org_id
  AND ap.surface = 'right_rail'
  AND ap.slot = 'right_rail'
  AND ad.key IN ('create_inquiry', 'review_automations', 'view_needs_attention')
  AND ap.work_unit_id IS NOT NULL;

UPDATE public.action_placements ap
SET is_active = true,
    updated_at = now()
FROM public.action_definitions ad
JOIN public.departments d ON d.org_id = ad.org_id AND lower(coalesce(d.key, '')) = 'enrollment'
JOIN (
    SELECT * FROM (VALUES
        ('create_inquiry', 10),
        ('review_automations', 20),
        ('view_needs_attention', 30)
    ) AS t(key, order_index)
) ko ON ko.key = ad.key
WHERE ap.action_definition_id = ad.id
  AND ap.org_id = ad.org_id
  AND ap.surface = 'right_rail'
  AND ap.slot = 'right_rail'
  AND ap.department_id IS NOT NULL
  AND ap.work_unit_id IS NULL
  AND ad.key IN ('create_inquiry', 'review_automations', 'view_needs_attention');

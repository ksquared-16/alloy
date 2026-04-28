-- Fix: ensure `update_status_add_note` has queue_row placement for Enrollment work-units.
-- Idempotent: INSERT ... WHERE NOT EXISTS. No ON CONFLICT.
-- Scope: Enrollment departments only; applies to all work units in those departments.

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
def_ids AS (
    SELECT ad.id AS action_definition_id, ad.org_id
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key = 'update_status_add_note'
),
desired_placements AS (
    SELECT
        ew.org_id,
        di.action_definition_id,
        'queue_row'::text AS surface,
        'row_inline'::text AS slot,
        'opportunity'::text AS entity_type,
        ew.department_id,
        ew.work_unit_id,
        NULL::text AS section_key,
        10 AS order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM enrollment_wus ew
    JOIN def_ids di ON di.org_id = ew.org_id
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
    dp.org_id,
    dp.action_definition_id,
    dp.surface,
    dp.slot,
    dp.entity_type,
    dp.department_id,
    dp.work_unit_id,
    dp.section_key,
    dp.order_index,
    dp.display_style,
    true
FROM desired_placements dp
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NOT DISTINCT FROM dp.org_id
      AND ap.action_definition_id = dp.action_definition_id
      AND ap.surface = dp.surface
      AND ap.slot = dp.slot
      AND ap.entity_type IS NOT DISTINCT FROM dp.entity_type
      AND ap.department_id IS NOT DISTINCT FROM dp.department_id
      AND ap.work_unit_id IS NOT DISTINCT FROM dp.work_unit_id
      AND ap.section_key IS NOT DISTINCT FROM dp.section_key
);


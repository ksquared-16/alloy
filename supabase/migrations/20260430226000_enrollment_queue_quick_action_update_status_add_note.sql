-- Enrollment V1: queue quick action (registry) — Update status + note.
-- Adds `update_status_add_note` open_form action scoped to Enrollment work-units only.
-- Idempotent: UPDATE existing, INSERT missing; placements use WHERE NOT EXISTS.

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
def AS (
    SELECT
        'update_status_add_note'::text AS key,
        'Update status'::text AS label,
        'opportunity'::text AS entity_type,
        'open_form'::text AS action_type,
        jsonb_build_object(
            'form_key', 'update_status_add_note',
            'required_fields', jsonb_build_array('status_key'),
            'submit_action_type', 'update_status'
        ) AS payload_schema
),
updated_def AS (
    UPDATE public.action_definitions ad
    SET
        label = def.label,
        entity_type = def.entity_type,
        action_type = def.action_type,
        payload_schema = def.payload_schema,
        is_active = true,
        updated_at = now()
    FROM enrollment_depts ed
    JOIN def ON true
    WHERE ad.org_id = ed.org_id
      AND ad.key = def.key
    RETURNING ad.id, ad.org_id, ad.key
),
inserted_def AS (
    INSERT INTO public.action_definitions (org_id, key, label, entity_type, action_type, payload_schema, is_active, priority)
    SELECT ed.org_id, def.key, def.label, def.entity_type, def.action_type, def.payload_schema, true, 90
    FROM enrollment_depts ed
    JOIN def ON true
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.action_definitions ad
        WHERE ad.org_id = ed.org_id
          AND ad.key = def.key
    )
    RETURNING id, org_id, key
),
def_ids AS (
    SELECT ad.id, ad.org_id, ad.key
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key = (SELECT key FROM def)
),
desired_placements AS (
    SELECT
        ew.org_id,
        di.id AS action_definition_id,
        'queue_row'::text AS surface,
        'row_inline'::text AS slot,
        'opportunity'::text AS entity_type,
        ew.department_id,
        ew.work_unit_id,
        NULL::text AS section_key,
        25 AS order_index,
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
    WHERE ap.org_id = dp.org_id
      AND ap.action_definition_id = dp.action_definition_id
      AND ap.surface = dp.surface
      AND ap.slot = dp.slot
      AND ap.entity_type IS NOT DISTINCT FROM dp.entity_type
      AND ap.department_id IS NOT DISTINCT FROM dp.department_id
      AND ap.work_unit_id IS NOT DISTINCT FROM dp.work_unit_id
      AND ap.section_key IS NOT DISTINCT FROM dp.section_key
);


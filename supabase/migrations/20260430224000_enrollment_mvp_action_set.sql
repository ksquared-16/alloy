-- Enrollment V1 MVP action set (registry-driven).
-- Seeds org-scoped action_definitions + action_placements for Enrollment departments/work units.
-- Includes safe placeholders via `ui_intent` (client shows message / routes).

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
defs AS (
    SELECT *
    FROM (
        VALUES
            -- Dept / work-unit rail (Enrollment)
            ('create_inquiry', 'Create inquiry', 'opportunity', 'ui_intent', jsonb_build_object('intent','create_inquiry')),
            ('open_enrollment_pipeline', 'Open enrollment pipeline', 'opportunity', 'ui_intent', jsonb_build_object('intent','open_enrollment_pipeline')),
            ('review_automations', 'Review automations', 'opportunity', 'ui_intent', jsonb_build_object('intent','review_automations')),

            -- Record header (Enrollment) — placeholders (safe)
            ('send_paperwork_placeholder', 'Send paperwork', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Send paperwork.')),
            ('add_to_waitlist_placeholder', 'Add to waitlist', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Add to waitlist.')),
            ('convert_to_enrolled_placeholder', 'Convert to enrolled', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Convert to enrolled.'))
    ) AS v(key, label, entity_type, action_type, payload_schema)
),
updated_defs AS (
    UPDATE public.action_definitions ad
    SET
        label = d.label,
        entity_type = d.entity_type,
        action_type = d.action_type,
        payload_schema = d.payload_schema,
        is_active = true,
        updated_at = now()
    FROM enrollment_depts ed
    JOIN defs d ON true
    WHERE ad.org_id = ed.org_id
      AND ad.key = d.key
    RETURNING ad.id, ad.org_id, ad.key
),
inserted_defs AS (
    INSERT INTO public.action_definitions (org_id, key, label, entity_type, action_type, payload_schema, is_active, priority)
    SELECT ed.org_id, d.key, d.label, d.entity_type, d.action_type, d.payload_schema, true, 100
    FROM enrollment_depts ed
    CROSS JOIN defs d
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.action_definitions ad
        WHERE ad.org_id = ed.org_id
          AND ad.key = d.key
    )
    RETURNING id, org_id, key
),
def_ids AS (
    SELECT ad.id, ad.org_id, ad.key
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key IN (SELECT key FROM defs)
),
desired_placements AS (
    -- Department right rail (scoped to primary work unit, since dept page passes work_unit_id)
    SELECT
        pw.org_id,
        di.id AS action_definition_id,
        'right_rail'::text AS surface,
        'right_rail'::text AS slot,
        'opportunity'::text AS entity_type,
        pw.department_id,
        pw.work_unit_id,
        NULL::text AS section_key,
        o.order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM primary_wu pw
    JOIN def_ids di ON di.org_id = pw.org_id
    JOIN (
        VALUES
            ('create_inquiry', 10),
            ('open_enrollment_pipeline', 20),
            ('review_automations', 30)
    ) AS o(key, order_index) ON o.key = di.key

    UNION ALL

    -- Work-unit right rail (scoped per work unit)
    SELECT
        ew.org_id,
        di.id AS action_definition_id,
        'right_rail'::text AS surface,
        'right_rail'::text AS slot,
        'opportunity'::text AS entity_type,
        ew.department_id,
        ew.work_unit_id,
        NULL::text AS section_key,
        o.order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM enrollment_wus ew
    JOIN def_ids di ON di.org_id = ew.org_id
    JOIN (
        VALUES
            ('create_inquiry', 10),
            ('review_automations', 20),
            ('send_paperwork_placeholder', 30),
            ('add_to_waitlist_placeholder', 40)
    ) AS o(key, order_index) ON o.key = di.key

    UNION ALL

    -- Opportunity record header (scoped per enrollment dept; schedule/reschedule already seeded elsewhere)
    SELECT
        ed.org_id,
        di.id AS action_definition_id,
        'record_header'::text AS surface,
        'secondary'::text AS slot,
        'opportunity'::text AS entity_type,
        ed.department_id,
        NULL::uuid AS work_unit_id,
        NULL::text AS section_key,
        o.order_index,
        'button'::text AS display_style,
        true AS is_active
    FROM enrollment_depts ed
    JOIN def_ids di ON di.org_id = ed.org_id
    JOIN (
        VALUES
            ('send_paperwork_placeholder', 30),
            ('add_to_waitlist_placeholder', 40),
            ('convert_to_enrolled_placeholder', 50)
    ) AS o(key, order_index) ON o.key = di.key
),
updated_placements AS (
    UPDATE public.action_placements ap
    SET
        order_index = dp.order_index,
        display_style = dp.display_style,
        is_active = true,
        updated_at = now()
    FROM desired_placements dp
    WHERE ap.org_id = dp.org_id
      AND ap.action_definition_id = dp.action_definition_id
      AND ap.surface = dp.surface
      AND ap.slot = dp.slot
      AND ap.entity_type IS NOT DISTINCT FROM dp.entity_type
      AND ap.department_id IS NOT DISTINCT FROM dp.department_id
      AND ap.work_unit_id IS NOT DISTINCT FROM dp.work_unit_id
      AND ap.section_key IS NOT DISTINCT FROM dp.section_key
    RETURNING ap.id
)
-- ---------------------------------------------------------------------------
-- Placements
-- ---------------------------------------------------------------------------
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


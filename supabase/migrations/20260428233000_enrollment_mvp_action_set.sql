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
            ('open_enrollment_pipeline', 'Open pipeline', 'opportunity', 'ui_intent', jsonb_build_object('intent','open_enrollment_pipeline')),
            ('review_automations', 'Review automations', 'opportunity', 'ui_intent', jsonb_build_object('intent','review_automations')),

            -- Record header (Enrollment) — placeholders (safe)
            ('send_paperwork_placeholder', 'Send paperwork (coming next)', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Send paperwork.')),
            ('add_to_waitlist_placeholder', 'Add to waitlist (coming next)', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Add to waitlist.')),
            ('convert_to_enrolled_placeholder', 'Convert to enrolled (coming next)', 'opportunity', 'ui_intent', jsonb_build_object('message','Coming next: Convert to enrolled.'))
    ) AS v(key, label, entity_type, action_type, payload_schema)
),
inserted_defs AS (
    INSERT INTO public.action_definitions (org_id, key, label, entity_type, action_type, payload_schema, is_active, priority)
    SELECT ed.org_id, d.key, d.label, d.entity_type, d.action_type, d.payload_schema, true, 100
    FROM enrollment_depts ed
    CROSS JOIN defs d
    ON CONFLICT (org_id, key)
    DO UPDATE SET
        label = EXCLUDED.label,
        entity_type = EXCLUDED.entity_type,
        action_type = EXCLUDED.action_type,
        payload_schema = EXCLUDED.payload_schema,
        is_active = true,
        updated_at = now()
    RETURNING id, org_id, key
),
def_ids AS (
    SELECT ad.id, ad.org_id, ad.key
    FROM public.action_definitions ad
    JOIN enrollment_depts ed ON ed.org_id = ad.org_id
    WHERE ad.key IN (SELECT key FROM defs)
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
-- Department right rail (scoped to primary work unit, since dept page passes work_unit_id)
SELECT
    pw.org_id,
    di.id,
    'right_rail',
    'right_rail',
    'opportunity',
    pw.department_id,
    pw.work_unit_id,
    NULL,
    o.order_index,
    'button',
    true
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
    di.id,
    'right_rail',
    'right_rail',
    'opportunity',
    ew.department_id,
    ew.work_unit_id,
    NULL,
    o.order_index,
    'button',
    true
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
    di.id,
    'record_header',
    'secondary',
    'opportunity',
    ed.department_id,
    NULL,
    NULL,
    o.order_index,
    'button',
    true
FROM enrollment_depts ed
JOIN def_ids di ON di.org_id = ed.org_id
JOIN (
    VALUES
        ('send_paperwork_placeholder', 30),
        ('add_to_waitlist_placeholder', 40),
        ('convert_to_enrolled_placeholder', 50)
) AS o(key, order_index) ON o.key = di.key

ON CONFLICT DO NOTHING;


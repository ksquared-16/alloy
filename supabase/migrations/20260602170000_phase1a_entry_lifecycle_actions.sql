-- =============================================================================
-- Phase 1A: Entry lifecycle actions — create_lead, move_to_qualification, mark_lost
-- =============================================================================
-- Activates canonical catalog actions + scoped placements. Legacy create_inquiry unchanged.
-- Qualification maps to existing status_key contact_attempted (no new status).
-- Docs: docs/sprints/05_2026/canonical_action_catalog_v1.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Activate + configure action definitions (global)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Create lead',
    description = 'Manually create a new enrollment lead with parent identity.',
    action_type = 'open_form',
    priority = 5,
    is_active = true,
    payload_schema = COALESCE(ad.payload_schema, '{}'::jsonb)
        - 'catalog_status'
        - 'intent'
        || jsonb_build_object(
            'form_key', 'create_lead',
            'required_fields', jsonb_build_array('first_name', 'last_name'),
            'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
                || jsonb_build_object('implementation_status', 'existing')
        ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'create_lead';

UPDATE public.action_definitions ad
SET
    label = 'Move to qualification',
    description = 'Advance a new lead to qualification after parent identity is captured.',
    action_type = 'update_status',
    priority = 20,
    is_active = true,
    payload_schema = COALESCE(ad.payload_schema, '{}'::jsonb)
        - 'catalog_status'
        - 'intent'
        || jsonb_build_object(
            'status_key', 'contact_attempted',
            'allowed_from_status_keys', jsonb_build_array('new_inquiry'),
            'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
                || jsonb_build_object('implementation_status', 'existing')
        ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'move_to_qualification';

UPDATE public.action_definitions ad
SET
    label = 'Mark lost',
    description = 'Close lead before enrollment with a required lost reason.',
    action_type = 'open_form',
    priority = 50,
    is_active = true,
    payload_schema = jsonb_build_object(
        'form_key', 'mark_lost',
        'submit_action_type', 'update_status',
        'status_key', 'lost',
        'required_fields', jsonb_build_array('lost_reason'),
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'mark_lost';

-- ---------------------------------------------------------------------------
-- 2) Status transition rule: mark_lost requires lost_reason (enrollment orgs)
-- ---------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
INSERT INTO public.status_transition_rules (
    org_id,
    entity_type,
    department_id,
    work_unit_id,
    action_key,
    from_status_key,
    to_status_key,
    required_metadata_fields,
    required_payload_fields,
    blocked,
    is_active,
    message
)
SELECT
    eo.org_id,
    'opportunities'::text,
    NULL::uuid,
    NULL::uuid,
    'mark_lost'::text,
    NULL::text,
    'lost'::text,
    '[]'::jsonb,
    '["lost_reason"]'::jsonb,
    false,
    true,
    'Lost reason is required.'::text
FROM enrollment_orgs eo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_transition_rules r
    WHERE r.org_id = eo.org_id
      AND r.entity_type = 'opportunities'
      AND r.to_status_key = 'lost'
      AND coalesce(r.action_key, '') = 'mark_lost'
      AND r.from_status_key IS NULL
      AND r.department_id IS NULL
      AND r.work_unit_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 3) Placements — create_lead (enrollment dept right rail, not record header)
-- ---------------------------------------------------------------------------

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
def AS (
    SELECT ad.id, ad.org_id
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'create_lead'
      AND ad.is_active = true
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
    condition_config,
    is_active
)
SELECT
    ed.org_id,
    def.id,
    'right_rail'::text,
    'right_rail'::text,
    'opportunity'::text,
    ed.department_id,
    NULL::uuid,
    NULL::text,
    5,
    'button'::text,
    '{}'::jsonb,
    true
FROM enrollment_depts ed
JOIN def ON true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id = ed.org_id
      AND ap.action_definition_id = def.id
      AND ap.surface = 'right_rail'
      AND ap.slot = 'right_rail'
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NOT DISTINCT FROM ed.department_id
      AND ap.work_unit_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 4) Placements — move_to_qualification (new lead records only)
-- ---------------------------------------------------------------------------

WITH defs AS (
    SELECT id, key
    FROM public.action_definitions
    WHERE org_id IS NULL
      AND key = 'move_to_qualification'
      AND is_active = true
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
    condition_config,
    is_active
)
SELECT
    NULL::uuid,
    d.id,
    v.surface,
    v.slot,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    v.order_index,
    v.display_style,
    jsonb_build_object('status_key_equals', 'new_inquiry'),
    true
FROM defs d
JOIN (
    VALUES
        ('record_header'::text, 'primary'::text, 8, 'button'::text),
        ('queue_row'::text, 'row_inline'::text, 12, 'button'::text)
) AS v(surface, slot, order_index, display_style) ON true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NULL
      AND ap.action_definition_id = d.id
      AND ap.surface = v.surface
      AND ap.slot = v.slot
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NULL
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);

-- ---------------------------------------------------------------------------
-- 5) Placements — mark_lost overflow (pipeline stages; not lost/enrolled)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET
    condition_config = jsonb_build_object(
        'status_key_in',
        jsonb_build_array(
            'new_inquiry',
            'contact_attempted',
            'tour_scheduled',
            'tour_completed',
            'tour_no_show',
            'follow_up_attempted',
            'enrolling',
            'waitlisted'
        )
    ),
    updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ap.org_id IS NULL
  AND ad.org_id IS NULL
  AND ad.key = 'mark_lost'
  AND ap.surface = 'record_header'
  AND ap.slot = 'overflow'
  AND ap.entity_type = 'opportunity';

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
    condition_config,
    is_active
)
SELECT
    NULL::uuid,
    ad.id,
    'record_header'::text,
    'overflow'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    90,
    'menu_item'::text,
    jsonb_build_object(
        'status_key_in',
        jsonb_build_array(
            'new_inquiry',
            'contact_attempted',
            'tour_scheduled',
            'tour_completed',
            'tour_no_show',
            'follow_up_attempted',
            'enrolling',
            'waitlisted'
        )
    ),
    true
FROM public.action_definitions ad
WHERE ad.org_id IS NULL
  AND ad.key = 'mark_lost'
  AND ad.is_active = true
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements p
      WHERE p.org_id IS NULL
        AND p.action_definition_id = ad.id
        AND p.surface = 'record_header'
        AND p.slot = 'overflow'
        AND p.entity_type = 'opportunity'
  );

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
    condition_config,
    is_active
)
SELECT
    NULL::uuid,
    ad.id,
    'queue_row'::text,
    'row_inline'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    45,
    'button'::text,
    jsonb_build_object(
        'status_key_in',
        jsonb_build_array(
            'new_inquiry',
            'contact_attempted',
            'tour_scheduled',
            'tour_completed',
            'tour_no_show',
            'follow_up_attempted',
            'enrolling',
            'waitlisted'
        )
    ),
    true
FROM public.action_definitions ad
WHERE ad.org_id IS NULL
  AND ad.key = 'mark_lost'
  AND ad.is_active = true
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements p
      WHERE p.org_id IS NULL
        AND p.action_definition_id = ad.id
        AND p.surface = 'queue_row'
        AND p.slot = 'row_inline'
        AND p.entity_type = 'opportunity'
  );

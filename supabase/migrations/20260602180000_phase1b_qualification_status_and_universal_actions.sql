-- =============================================================================
-- Phase 1B: Qualification status + universal action activation
-- =============================================================================
-- Part 1: canonical `qualification` lifecycle status; move_to_qualification → qualification
-- Part 2: activate universal actions routing to existing UI (comms, notes, tasks, forms, docs)
-- Docs: docs/sprints/05_2026/canonical_action_catalog_v1.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Status definition: qualification (enrollment orgs)
-- ---------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    eo.org_id,
    'opportunities'::text,
    'qualification'::text,
    'Qualification'::text,
    15,
    true,
    false,
    NULL::text,
    jsonb_build_object('lifecycle_stage', 'qualification')
FROM enrollment_orgs eo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunities'
      AND sd.status_key = 'qualification'
);

-- Mark contact_attempted as legacy compatibility (retain row + historical data)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb)
        || jsonb_build_object(
            'lifecycle_stage', 'intake',
            'legacy_contact_status', true,
            'legacy_note', 'Historical contact-attempt status; use qualification for lifecycle doctrine.'
        ),
    updated_at = now()
FROM (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
) eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key = 'contact_attempted';

-- ---------------------------------------------------------------------------
-- 2) move_to_qualification → qualification (not contact_attempted)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    payload_schema = COALESCE(ad.payload_schema, '{}'::jsonb)
        || jsonb_build_object(
            'status_key', 'qualification',
            'allowed_from_status_keys', jsonb_build_array('new_inquiry'),
            'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
                || jsonb_build_object('implementation_status', 'existing')
        ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'move_to_qualification';

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
    'move_to_qualification'::text,
    'new_inquiry'::text,
    'qualification'::text,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    true,
    NULL::text
FROM enrollment_orgs eo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_transition_rules r
    WHERE r.org_id = eo.org_id
      AND r.entity_type = 'opportunities'
      AND coalesce(r.action_key, '') = 'move_to_qualification'
      AND r.from_status_key = 'new_inquiry'
      AND r.to_status_key = 'qualification'
      AND r.department_id IS NULL
      AND r.work_unit_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 3) mark_lost placements — include qualification (+ legacy contact_attempted)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET
    condition_config = jsonb_build_object(
        'status_key_in',
        jsonb_build_array(
            'new_inquiry',
            'qualification',
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
  AND ap.entity_type = 'opportunity'
  AND ap.surface IN ('record_header', 'queue_row');

-- ---------------------------------------------------------------------------
-- 4) Enrollment pipeline queue: qualification → Follow Up bucket (compat)
-- ---------------------------------------------------------------------------

WITH pipeline_wus AS (
    SELECT wu.id, wu.queue_definition
    FROM public.work_units wu
    JOIN public.departments d ON d.id = wu.department_id
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
      AND wu.queue_definition IS NOT NULL
      AND coalesce(wu.queue_definition->>'version', '') = '2'
),
patched AS (
    SELECT
        pw.id,
        jsonb_set(
            pw.queue_definition,
            '{queues}',
            (
                SELECT coalesce(jsonb_agg(
                    CASE
                        WHEN elem->>'key' = 'communications_followup' THEN
                            jsonb_set(
                                jsonb_set(
                                    elem,
                                    '{filters}',
                                    '[{"type":"case_status","operator":"in","values":["contact_attempted","contacted","qualification"]}]'::jsonb
                                ),
                                '{filters_compat_v1}',
                                '[{"type":"status","operator":"in","values":["contact_attempted","contacted","qualification"]}]'::jsonb
                            )
                        ELSE elem
                    END
                    ORDER BY ord
                ), '[]'::jsonb)
                FROM jsonb_array_elements(pw.queue_definition->'queues') WITH ORDINALITY AS t(elem, ord)
            ),
            true
        ) AS new_qd
    FROM pipeline_wus pw
)
UPDATE public.work_units wu
SET queue_definition = p.new_qd, updated_at = now()
FROM patched p
WHERE wu.id = p.id;

-- ---------------------------------------------------------------------------
-- 5) Activate universal action definitions (reuse existing UI paths)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 61,
    payload_schema = jsonb_build_object(
        'intent', 'send_email',
        'channel', 'email',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'send_email';

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 62,
    payload_schema = jsonb_build_object(
        'intent', 'send_sms',
        'channel', 'sms',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'send_sms';

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 60,
    description = 'Open phone dialer for parent contact (tel: intent when phone on file).',
    payload_schema = jsonb_build_object(
        'intent', 'call_parent',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'call_parent';

UPDATE public.action_definitions ad
SET
    action_type = 'open_form',
    is_active = true,
    priority = 63,
    payload_schema = jsonb_build_object(
        'form_key', 'add_note',
        'submit_action_type', 'append_note',
        'required_fields', jsonb_build_array('note'),
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'add_note';

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 64,
    description = 'Open tasks panel to create a follow-up linked to this record.',
    payload_schema = jsonb_build_object(
        'intent', 'create_task',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'create_task';

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 65,
    description = 'Open documents tab for upload (enrollment+ stages).',
    payload_schema = jsonb_build_object(
        'intent', 'upload_document',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'upload_document';

UPDATE public.action_definitions ad
SET
    payload_schema = COALESCE(ad.payload_schema, '{}'::jsonb)
        || jsonb_build_object(
            'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
                || jsonb_build_object('implementation_status', 'existing')
        ),
    updated_at = now()
WHERE ad.org_id IS NULL AND ad.key = 'send_form' AND ad.is_active = true;

-- ---------------------------------------------------------------------------
-- 6) Universal action placements (lifecycle-aware; no broad reseed)
-- ---------------------------------------------------------------------------

WITH universal_status AS (
    SELECT jsonb_build_array(
        'new_inquiry',
        'qualification',
        'contact_attempted',
        'tour_scheduled',
        'tour_completed',
        'tour_no_show',
        'follow_up_attempted',
        'enrolling',
        'waitlisted',
        'enrolled'
    ) AS keys
),
upload_status AS (
    SELECT jsonb_build_array(
        'tour_completed',
        'tour_no_show',
        'follow_up_attempted',
        'enrolling',
        'waitlisted',
        'enrolled'
    ) AS keys
),
defs AS (
    SELECT ad.id, ad.key
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key IN (
          'send_email',
          'send_sms',
          'call_parent',
          'send_form',
          'add_note',
          'create_task',
          'upload_document'
      )
      AND ad.is_active = true
),
placement_plan AS (
    SELECT d.id AS action_definition_id, d.key, v.surface, v.slot, v.order_index, v.display_style, v.scope
    FROM defs d
    JOIN (
        VALUES
            ('send_email'::text, 'record_header'::text, 'secondary'::text, 62, 'button'::text, 'universal'::text),
            ('send_email', 'queue_row', 'row_inline', 62, 'button', 'universal'),
            ('send_sms', 'record_header', 'secondary', 63, 'button', 'universal'),
            ('send_sms', 'queue_row', 'row_inline', 63, 'button', 'universal'),
            ('call_parent', 'record_header', 'secondary', 64, 'button', 'universal'),
            ('send_form', 'record_header', 'secondary', 66, 'button', 'universal'),
            ('add_note', 'record_header', 'overflow', 63, 'menu_item', 'universal'),
            ('create_task', 'record_header', 'overflow', 64, 'menu_item', 'universal'),
            ('upload_document', 'record_header', 'secondary', 65, 'button', 'upload')
    ) AS v(key, surface, slot, order_index, display_style, scope) ON v.key = d.key
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
    pp.action_definition_id,
    pp.surface,
    pp.slot,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    pp.order_index,
    pp.display_style,
    jsonb_build_object(
        'status_key_in',
        CASE
            WHEN pp.scope = 'upload' THEN (SELECT keys FROM upload_status)
            ELSE (SELECT keys FROM universal_status)
        END
    ),
    true
FROM placement_plan pp
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NULL
      AND ap.action_definition_id = pp.action_definition_id
      AND ap.surface = pp.surface
      AND ap.slot = pp.slot
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NULL
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);

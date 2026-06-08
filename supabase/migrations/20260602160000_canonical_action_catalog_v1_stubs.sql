-- =============================================================================
-- Phase 0A: Canonical Action Catalog v1 — inactive global definition stubs
-- =============================================================================
-- Seeds global (org_id NULL) action_definitions for childcare lifecycle catalog.
-- - New rows: is_active = false (no runtime behavior change)
-- - Existing global rows for partial catalog keys: merge payload_schema.catalog only
-- - No action_placements; no legacy key renames/removals
--
-- Catalog metadata lives in payload_schema.catalog (action_definitions has no config_json).
-- Docs: docs/sprints/05_2026/canonical_action_catalog_v1.md
-- =============================================================================

WITH catalog_seed AS (
    SELECT *
    FROM (VALUES
        -- Universal (7)
        (
            'call_parent'::text,
            'Call parent'::text,
            'Log or initiate parent phone contact for this family.'::text,
            'opportunity'::text,
            'communication'::text,
            'universal'::text,
            NULL::text[],
            true,
            'missing'::text,
            60,
            ARRAY['button', 'bos', 'task', 'api']::text[]
        ),
        (
            'send_email',
            'Send email',
            'Open email composer for this family.',
            'opportunity',
            'communication',
            'universal',
            NULL::text[],
            true,
            'missing',
            61,
            ARRAY['button', 'bos', 'task', 'workflow', 'api']
        ),
        (
            'send_sms',
            'Send SMS',
            'Open SMS composer for this family.',
            'opportunity',
            'communication',
            'universal',
            NULL::text[],
            true,
            'missing',
            62,
            ARRAY['button', 'bos', 'task', 'workflow', 'api']
        ),
        (
            'add_note',
            'Add note',
            'Add an activity note without changing lifecycle status.',
            'opportunity',
            'record',
            'universal',
            NULL::text[],
            true,
            'missing',
            63,
            ARRAY['button', 'task', 'api']
        ),
        (
            'create_task',
            'Create task',
            'Create a follow-up task linked to this record.',
            'opportunity',
            'record',
            'universal',
            NULL::text[],
            true,
            'missing',
            64,
            ARRAY['button', 'bos', 'workflow', 'api']
        ),
        (
            'upload_document',
            'Upload document',
            'Upload a document linked to this family or enrollment.',
            'opportunity',
            'record',
            'universal',
            NULL::text[],
            true,
            'missing',
            65,
            ARRAY['button', 'api']
        ),
        (
            'send_form',
            'Send form',
            'Open the send-form composer for this family.',
            'opportunity',
            'workflow',
            'universal',
            NULL::text[],
            true,
            'partial',
            66,
            ARRAY['button', 'workflow', 'api']
        ),
        -- Entry (1)
        (
            'create_lead',
            'Create lead',
            'Manually create a new enrollment lead.',
            'opportunity',
            'entry',
            'entry',
            NULL::text[],
            false,
            'missing',
            5,
            ARRAY['button', 'api']
        ),
        -- Qualification & early pipeline (4)
        (
            'move_to_qualification',
            'Move to qualification',
            'Advance lead to qualification stage after initial identity capture.',
            'opportunity',
            'lifecycle',
            'new_lead',
            NULL::text[],
            false,
            'missing',
            20,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'schedule_tour',
            'Schedule tour',
            'Schedule a tour date and time for this family.',
            'opportunity',
            'workflow',
            'multi',
            ARRAY['qualification', 'waitlist']::text[],
            false,
            'partial',
            55,
            ARRAY['button', 'bos', 'workflow', 'api']
        ),
        (
            'move_to_waitlist',
            'Move to waitlist',
            'Move family to waitlist parking-lot state.',
            'opportunity',
            'lifecycle',
            'multi',
            ARRAY['qualification', 'tour', 'enrollment']::text[],
            false,
            'missing',
            56,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'mark_lost',
            'Mark lost',
            'Close lead before enrollment with a required lost reason.',
            'opportunity',
            'exit',
            'multi',
            ARRAY['new_lead', 'qualification', 'tour', 'waitlist', 'enrollment']::text[],
            false,
            'partial',
            50,
            ARRAY['button', 'api']
        ),
        -- Tour (4)
        (
            'confirm_tour',
            'Confirm tour',
            'Confirm a scheduled tour booking with the family.',
            'opportunity',
            'workflow',
            'tour',
            NULL::text[],
            false,
            'missing',
            57,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'reschedule_tour',
            'Reschedule tour',
            'Reschedule an existing tour to a new date and time.',
            'opportunity',
            'workflow',
            'tour',
            NULL::text[],
            false,
            'partial',
            58,
            ARRAY['button', 'api']
        ),
        (
            'record_tour_outcome',
            'Record tour outcome',
            'Record tour completion outcome and next enrollment step.',
            'opportunity',
            'lifecycle',
            'tour',
            NULL::text[],
            false,
            'missing',
            59,
            ARRAY['button', 'api']
        ),
        (
            'send_enrollment_packet',
            'Send enrollment packet',
            'Start enrollment packet workflow for this family.',
            'opportunity',
            'workflow',
            'multi',
            ARRAY['tour', 'waitlist', 'enrollment']::text[],
            false,
            'partial',
            78,
            ARRAY['button', 'workflow', 'api']
        ),
        -- Waitlist (4)
        (
            'contact_family',
            'Contact family',
            'Contact waitlisted family about availability or next steps.',
            'opportunity',
            'communication',
            'waitlist',
            NULL::text[],
            false,
            'missing',
            70,
            ARRAY['button', 'bos', 'task', 'workflow']
        ),
        (
            'remove_from_waitlist',
            'Remove from waitlist',
            'Remove family from waitlist without marking lost.',
            'opportunity',
            'lifecycle',
            'waitlist',
            NULL::text[],
            false,
            'missing',
            71,
            ARRAY['button', 'api']
        ),
        (
            'collect_waitlist_fee',
            'Collect waitlist fee',
            'Collect configured waitlist fee for this family.',
            'opportunity',
            'financial',
            'waitlist',
            NULL::text[],
            false,
            'missing',
            72,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'waive_waitlist_fee',
            'Waive waitlist fee',
            'Waive required waitlist fee per policy.',
            'opportunity',
            'financial',
            'waitlist',
            NULL::text[],
            false,
            'missing',
            73,
            ARRAY['button', 'api']
        ),
        -- Enrollment (11)
        (
            'review_enrollment_packet',
            'Review enrollment packet',
            'Review submitted enrollment packet and record decision.',
            'opportunity',
            'workflow',
            'enrollment',
            NULL::text[],
            false,
            'partial',
            80,
            ARRAY['button', 'task', 'api']
        ),
        (
            'request_missing_information',
            'Request missing information',
            'Request missing enrollment information from the family.',
            'opportunity',
            'workflow',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            81,
            ARRAY['button', 'bos', 'task', 'workflow']
        ),
        (
            'approve_enrollment',
            'Approve enrollment',
            'Approve enrollment after paperwork, placement, and policy requirements.',
            'opportunity',
            'lifecycle',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            82,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'reserve_spot',
            'Reserve spot',
            'Reserve enrollment spot for a child on this opportunity.',
            'opportunity_customer_member',
            'placement',
            'enrollment',
            NULL::text[],
            false,
            'partial',
            83,
            ARRAY['button', 'api']
        ),
        (
            'assign_classroom',
            'Assign classroom',
            'Assign classroom or cohort for enrolled child.',
            'opportunity_customer_member',
            'placement',
            'enrollment',
            NULL::text[],
            false,
            'partial',
            84,
            ARRAY['button', 'api']
        ),
        (
            'assign_schedule',
            'Assign schedule',
            'Assign care schedule for enrolled child.',
            'opportunity_customer_member',
            'placement',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            85,
            ARRAY['button', 'api']
        ),
        (
            'set_start_date',
            'Set start date',
            'Set child start date for enrollment.',
            'opportunity_customer_member',
            'placement',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            86,
            ARRAY['button', 'api']
        ),
        (
            'collect_registration_fee',
            'Collect registration fee',
            'Collect registration fee per enrollment policy.',
            'opportunity',
            'financial',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            87,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'waive_registration_fee',
            'Waive registration fee',
            'Waive registration fee per policy.',
            'opportunity',
            'financial',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            88,
            ARRAY['button', 'api']
        ),
        (
            'collect_deposit',
            'Collect deposit',
            'Collect enrollment deposit via payment flow.',
            'opportunity',
            'financial',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            89,
            ARRAY['button', 'workflow', 'api']
        ),
        (
            'record_deposit',
            'Record deposit',
            'Record offline or manual deposit payment.',
            'opportunity',
            'financial',
            'enrollment',
            NULL::text[],
            false,
            'missing',
            90,
            ARRAY['button', 'api']
        ),
        -- Active (1)
        (
            'withdraw_child',
            'Withdraw child',
            'Withdraw active child from care with reason and date.',
            'opportunity_customer_member',
            'lifecycle',
            'active',
            NULL::text[],
            false,
            'missing',
            91,
            ARRAY['button', 'api']
        ),
        -- Exit / re-entry (2)
        (
            'reopen_lead',
            'Reopen lead',
            'Reopen a previously lost lead.',
            'opportunity',
            'exit',
            'lost',
            NULL::text[],
            false,
            'missing',
            92,
            ARRAY['button', 'api']
        ),
        (
            'reenroll_child',
            'Re-enroll child',
            'Re-enroll a withdrawn child when policy allows.',
            'opportunity_customer_member',
            'exit',
            'withdrawn',
            NULL::text[],
            false,
            'missing',
            93,
            ARRAY['button', 'api']
        )
    ) AS v(
        key,
        label,
        description,
        entity_type,
        action_category,
        lifecycle_stage,
        lifecycle_stages,
        universal,
        implementation_status,
        priority,
        expected_triggers
    )
),
catalog_payload AS (
    SELECT
        cs.*,
        jsonb_build_object(
            'catalog_version', 'v1',
            'doctrine_source', 'canonical_action_catalog_v1',
            'implementation_status', cs.implementation_status,
            'lifecycle_stage', cs.lifecycle_stage,
            'lifecycle_stages', COALESCE(to_jsonb(cs.lifecycle_stages), 'null'::jsonb),
            'action_category', cs.action_category,
            'scope', CASE WHEN cs.universal THEN 'universal' ELSE 'lifecycle_specific' END,
            'universal', cs.universal,
            'expected_triggers', to_jsonb(cs.expected_triggers)
        ) AS catalog_json,
        (
            jsonb_build_object(
                'catalog_status', 'stub',
                'intent', 'catalog_stub',
                'catalog', jsonb_build_object(
                    'catalog_version', 'v1',
                    'doctrine_source', 'canonical_action_catalog_v1',
                    'implementation_status', cs.implementation_status,
                    'lifecycle_stage', cs.lifecycle_stage,
                    'lifecycle_stages', COALESCE(to_jsonb(cs.lifecycle_stages), 'null'::jsonb),
                    'action_category', cs.action_category,
                    'scope', CASE WHEN cs.universal THEN 'universal' ELSE 'lifecycle_specific' END,
                    'universal', cs.universal,
                    'expected_triggers', to_jsonb(cs.expected_triggers)
                )
            )
        ) AS stub_payload_schema
    FROM catalog_seed cs
),
inserted AS (
    INSERT INTO public.action_definitions (
        org_id,
        key,
        label,
        description,
        entity_type,
        action_type,
        priority,
        payload_schema,
        is_active
    )
    SELECT
        NULL::uuid,
        cp.key,
        cp.label,
        cp.description,
        cp.entity_type,
        'ui_intent'::text,
        cp.priority,
        cp.stub_payload_schema,
        false
    FROM catalog_payload cp
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.action_definitions ad
        WHERE ad.org_id IS NULL
          AND ad.key = cp.key
    )
    RETURNING key
),
updated AS (
    UPDATE public.action_definitions ad
    SET
        payload_schema = jsonb_set(
            COALESCE(ad.payload_schema, '{}'::jsonb),
            '{catalog}',
            cp.catalog_json,
            true
        ),
        updated_at = now()
    FROM catalog_payload cp
    WHERE ad.org_id IS NULL
      AND ad.key = cp.key
      AND EXISTS (
          SELECT 1
          FROM public.action_definitions x
          WHERE x.org_id IS NULL
            AND x.key = cp.key
      )
      AND NOT EXISTS (
          SELECT 1 FROM inserted i WHERE i.key = cp.key
      )
    RETURNING ad.key
)
SELECT
    (SELECT count(*) FROM inserted) AS inserted_count,
    (SELECT count(*) FROM updated) AS updated_count;

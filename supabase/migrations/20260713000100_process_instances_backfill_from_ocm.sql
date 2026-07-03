-- =============================================================================
-- Backfill process_instances from opportunity_customer_members (Enrollment)
-- =============================================================================
-- One enrollment process_instance per existing OCM row. OCM stays as legacy data;
-- process_instances becomes the runtime owner. Idempotent (ON CONFLICT DO NOTHING on
-- the (org_id, process_key, subject_id, context_id) scope). Safe on empty OCM (no-op).
-- Runs AFTER 20260711000000 (canonical fields) so OCM already has start_date/schedule_type/
-- program_category_id/stage_key/close_reason_key.
-- =============================================================================

INSERT INTO public.process_instances
    (org_id, process_key, subject_type, subject_id, context_type, context_id,
     stage_key, state, close_reason_key, metadata, created_at, updated_at)
SELECT
    ocm.org_id,
    'enrollment',                -- MUST match ENROLLMENT_PROCESS_KEY in lifecycleProcessTypes.ts
    'child',
    ocm.customer_member_id,
    'opportunity',
    ocm.opportunity_id,
    ocm.stage_key,
    ocm.outcome_status_key,      -- durable state → process_instances.state
    ocm.close_reason_key,
    jsonb_strip_nulls(jsonb_build_object(
        'start_date', ocm.start_date,
        'schedule_type', ocm.schedule_type,
        'program_category_id', ocm.program_category_id,
        'location_id', ocm.location_id,
        'program_room_cohort_key', ocm.program_room_cohort_key,
        'notes', ocm.notes,
        'source', 'backfill_from_ocm',
        'migrated_from_ocm_id', ocm.id
    )),
    ocm.created_at,
    ocm.updated_at
FROM public.opportunity_customer_members ocm
WHERE ocm.customer_member_id IS NOT NULL
  AND ocm.opportunity_id IS NOT NULL
ON CONFLICT (org_id, process_key, subject_id, context_id) DO NOTHING;

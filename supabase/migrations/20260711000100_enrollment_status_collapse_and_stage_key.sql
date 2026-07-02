-- =============================================================================
-- Enrollment Alignment S4 — durable status collapse + explicit stage position
-- =============================================================================
-- Doctrine (docs/sprints/07_2026/enrollment_alignment_data_model_audit.md):
--   * Statuses are durable truth only. Operational progress lives on Work.
--   * Stage is explicit process state, written by outcome execution — never
--     derived from status lists.
-- Case  (opportunities.status_key):        open | closed          (+ close_reason_key)
-- Child (OCM.outcome_status_key): null | waitlisted | enrolling | enrolled
--                                 | withdrawn | not_enrolling     (+ close_reason_key)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stage position + close reason columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.opportunities
    ADD COLUMN IF NOT EXISTS stage_key text,
    ADD COLUMN IF NOT EXISTS close_reason_key text;

ALTER TABLE public.opportunity_customer_members
    ADD COLUMN IF NOT EXISTS stage_key text,
    ADD COLUMN IF NOT EXISTS close_reason_key text;

COMMENT ON COLUMN public.opportunities.stage_key IS
    'Current Enrollment Process stage for the family case (process state, written by outcome execution / intake only). Membership owner for stage cohorts.';
COMMENT ON COLUMN public.opportunities.close_reason_key IS
    'Reason recorded when status_key becomes closed (lost | withdrawn | not_a_fit | aged_out | other).';
COMMENT ON COLUMN public.opportunity_customer_members.stage_key IS
    'Current Enrollment Process stage for this child participation (child track; null while the child rides the family track pre-decision).';
COMMENT ON COLUMN public.opportunity_customer_members.close_reason_key IS
    'Reason recorded when outcome_status_key becomes not_enrolling or withdrawn.';

CREATE INDEX IF NOT EXISTS idx_opportunities_org_stage
    ON public.opportunities (org_id, stage_key)
    WHERE stage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_org_stage
    ON public.opportunity_customer_members (org_id, stage_key)
    WHERE stage_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Waitlist pause moves to its single owner (placement candidate state)
--    — must run BEFORE the status collapse erases waitlist_paused.
-- -----------------------------------------------------------------------------

UPDATE public.placement_candidates pc
SET status = 'paused'
FROM public.opportunity_customer_members ocm
WHERE pc.opportunity_customer_member_id = ocm.id
  AND ocm.outcome_status_key = 'waitlist_paused'
  AND pc.status = 'active';

-- -----------------------------------------------------------------------------
-- 3. Backfill stage position from the legacy status → stage map
-- -----------------------------------------------------------------------------

UPDATE public.opportunities
SET stage_key = CASE
        WHEN status_key IN ('new_inquiry', 'needs_qualification', 'open', 'new') THEN 'lead'
        WHEN status_key IN ('qualified', 'tour_requested', 'tour_scheduled',
                            'tour_completed', 'tour_no_show') THEN 'tour'
        WHEN status_key = 'decision_pending' THEN 'decision'
        WHEN status_key IN ('lost', 'withdrawn', 'not_a_fit', 'aged_out',
                            'not_enrolling', 'closed') THEN 'closed'
        ELSE 'lead'
    END
WHERE stage_key IS NULL
  AND status_key IS NOT NULL;

UPDATE public.opportunity_customer_members
SET stage_key = CASE
        WHEN outcome_status_key IN ('waitlisted', 'offer_pending', 'waitlist_paused') THEN 'waitlist'
        WHEN outcome_status_key IN ('enrolling', 'registration_pending',
                                    'paperwork_pending', 'start_date_scheduled') THEN 'enrolling'
        WHEN outcome_status_key = 'enrolled' THEN 'enrolled'
        WHEN outcome_status_key IN ('withdrawn', 'family_withdrew', 'not_moving_forward',
                                    'aged_out', 'not_enrolling') THEN 'closed_withdrawn'
        ELSE NULL
    END
WHERE stage_key IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Close reasons preserved from legacy terminal statuses
-- -----------------------------------------------------------------------------

UPDATE public.opportunities
SET close_reason_key = CASE status_key
        WHEN 'lost' THEN 'lost'
        WHEN 'withdrawn' THEN 'withdrawn'
        WHEN 'not_a_fit' THEN 'not_a_fit'
        WHEN 'aged_out' THEN 'aged_out'
        WHEN 'not_enrolling' THEN 'other'
        ELSE close_reason_key
    END
WHERE status_key IN ('lost', 'withdrawn', 'not_a_fit', 'aged_out', 'not_enrolling')
  AND close_reason_key IS NULL;

UPDATE public.opportunity_customer_members
SET close_reason_key = CASE outcome_status_key
        WHEN 'family_withdrew' THEN 'family_withdrew'
        WHEN 'not_moving_forward' THEN 'not_moving_forward'
        WHEN 'aged_out' THEN 'aged_out'
        WHEN 'not_enrolling' THEN 'other'
        ELSE close_reason_key
    END
WHERE outcome_status_key IN ('family_withdrew', 'not_moving_forward', 'aged_out', 'not_enrolling')
  AND close_reason_key IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Collapse durable status values
-- -----------------------------------------------------------------------------

UPDATE public.opportunities
SET status_key = CASE
        WHEN status_key IN ('lost', 'withdrawn', 'not_a_fit', 'aged_out',
                            'not_enrolling', 'closed') THEN 'closed'
        ELSE 'open'
    END
WHERE status_key IS NOT NULL
  AND status_key NOT IN ('open', 'closed', 'inactive', 'archived');

UPDATE public.opportunity_customer_members
SET outcome_status_key = CASE
        WHEN outcome_status_key IN ('offer_pending', 'waitlist_paused') THEN 'waitlisted'
        WHEN outcome_status_key IN ('registration_pending', 'paperwork_pending',
                                    'start_date_scheduled') THEN 'enrolling'
        WHEN outcome_status_key IN ('family_withdrew', 'not_moving_forward',
                                    'aged_out', 'not_enrolling') THEN 'not_enrolling'
        WHEN outcome_status_key IN ('new_inquiry', 'new', 'open') THEN NULL
        ELSE outcome_status_key
    END
WHERE outcome_status_key IS NOT NULL
  AND outcome_status_key NOT IN ('waitlisted', 'enrolling', 'enrolled', 'withdrawn', 'not_enrolling');

-- -----------------------------------------------------------------------------
-- 6. status_definitions — reseed the collapsed enrollment vocabulary
-- -----------------------------------------------------------------------------

-- Remove every enrollment-process case status that is no longer durable truth.
DELETE FROM public.status_definitions
WHERE entity_type = 'opportunities'
  AND status_key IN ('new_inquiry', 'needs_qualification', 'qualified', 'tour_requested',
                     'tour_scheduled', 'tour_completed', 'tour_no_show', 'decision_pending',
                     'lost', 'withdrawn', 'not_a_fit', 'aged_out', 'not_enrolling',
                     'contact_attempted', 'contacted', 'qualification', 'follow_up',
                     'follow_up_attempted', 'touring', 'ready_to_enroll', 'closed_won');

-- Remove collapsed child enrollment statuses.
DELETE FROM public.status_definitions
WHERE entity_type = 'opportunity_customer_members'
  AND status_key IN ('new_inquiry', 'offer_pending', 'waitlist_paused', 'registration_pending',
                     'paperwork_pending', 'start_date_scheduled', 'family_withdrew',
                     'not_moving_forward', 'aged_out', 'tour_requested', 'tour_scheduled',
                     'tour_completed', 'decision_pending', 'needs_contact', 'contact_attempted');

-- Upsert the collapsed case vocabulary for every org that has enrollment config.
INSERT INTO public.status_definitions
    (org_id, entity_type, status_key, status_label, sort_order, is_active, is_system, metadata)
SELECT o.org_id, v.entity_type, v.status_key, v.status_label, v.sort_order, true, true,
       jsonb_build_object(
           'alloy_layer', v.layer,
           'status_settings_category', 'enrollment_statuses',
           'process_key', 'enrollment_process',
           'entity_scope', v.entity_scope,
           'seed_source', 'enrollment_alignment_status_collapse_v1'
       ) || CASE WHEN v.terminal THEN jsonb_build_object('terminal', true) ELSE '{}'::jsonb END
FROM (
    SELECT DISTINCT org_id FROM public.status_definitions
    WHERE org_id IS NOT NULL
      AND entity_type IN ('opportunities', 'opportunity_customer_members')
) o
CROSS JOIN (VALUES
    ('opportunities', 'open',   'Open',   10, 'enrollment_process', 'family_case', false),
    ('opportunities', 'closed', 'Closed', 20, 'enrollment_process', 'family_case', true),
    ('opportunity_customer_members', 'waitlisted',    'Waitlisted',    10, 'enrollment_disposition', 'enrollment_track', false),
    ('opportunity_customer_members', 'enrolling',     'Enrolling',     20, 'enrollment_disposition', 'enrollment_track', false),
    ('opportunity_customer_members', 'enrolled',      'Enrolled',      30, 'enrollment_disposition', 'enrollment_track', false),
    ('opportunity_customer_members', 'withdrawn',     'Withdrawn',     40, 'enrollment_disposition', 'enrollment_track', true),
    ('opportunity_customer_members', 'not_enrolling', 'Not Enrolling', 50, 'enrollment_disposition', 'enrollment_track', true)
) AS v(entity_type, status_key, status_label, sort_order, layer, entity_scope, terminal)
WHERE NOT EXISTS (
    SELECT 1 FROM public.status_definitions dup
    WHERE dup.org_id = o.org_id
      AND dup.entity_type = v.entity_type
      AND dup.status_key = v.status_key
);

-- Refresh label/metadata on any pre-existing rows for the retained keys.
UPDATE public.status_definitions sd
SET metadata = sd.metadata || jsonb_build_object(
        'alloy_layer',
        CASE WHEN sd.entity_type = 'opportunities' THEN 'enrollment_process' ELSE 'enrollment_disposition' END,
        'process_key', 'enrollment_process',
        'seed_source', 'enrollment_alignment_status_collapse_v1'
    ),
    is_active = true
WHERE (sd.entity_type = 'opportunities' AND sd.status_key IN ('open', 'closed'))
   OR (sd.entity_type = 'opportunity_customer_members'
       AND sd.status_key IN ('waitlisted', 'enrolling', 'enrolled', 'withdrawn', 'not_enrolling'));

-- -----------------------------------------------------------------------------
-- 7. Transition rules over removed vocabulary are void — outcomes own movement.
-- -----------------------------------------------------------------------------

DELETE FROM public.status_transition_rules
WHERE entity_type IN ('opportunities', 'opportunity_customer_members');

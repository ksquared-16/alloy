-- A context-free Enrollment Participation is EPISODE-scoped, not one-per-child-forever.
--
-- THE DEFECT THIS CORRECTS
-- The previous migration protected the context-free case with
-- `(org_id, customer_member_id) WHERE opportunity_id IS NULL`, which asserts one participation per
-- child for all time. The data says otherwise: in the certification tenant 600 children hold two
-- participations and 600 hold three. `opportunity_customer_members` is one participation per
-- enrollment EPISODE — it carries that episode's own `start_date`, `stage_key`,
-- `outcome_status_key` and `close_reason_key`.
--
-- Left as it was, a child who enrolled context-free once could never begin a second episode: the
-- ensurer would hand back the previous participation, still carrying the earlier episode's state.
--
-- THE DISCRIMINATOR IS EXISTING CANONICAL STATE, NOT A NEW COLUMN
-- The risk actually named is duplicate ACTIVE participations. The child track already declares
-- which statuses conclude an episode — `withdrawn` and `not_enrolling` are `terminal: true` in
-- ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY. So uniqueness applies to participations that have not
-- concluded, and a concluded episode releases the slot.
--
-- The terminal keys are repeated here because a partial index needs literal predicates; the
-- vocabulary in lib/lifecycle/enrollmentProcessStatusVocabulary.ts remains the owner. `enrolled` is
-- deliberately NOT terminal there, so an enrolled child still holds an active participation and a
-- second context-free episode is not silently permitted — re-enrollment is a separate decision and
-- is not designed here.
drop index if exists public.uq_ocm_context_free_participation;

create unique index if not exists uq_ocm_active_context_free_participation
    on public.opportunity_customer_members (org_id, customer_member_id)
    where opportunity_id is null
      and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling');

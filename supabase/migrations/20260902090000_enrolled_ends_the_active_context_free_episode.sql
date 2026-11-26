-- =============================================================================
-- ENROLLED ENDS THE ACTIVE CONTEXT-FREE ENROLLMENT EPISODE
-- =============================================================================
-- WHAT WAS WRONG
--
-- `20260827170000` created:
--
--     create unique index uq_ocm_active_context_free_participation
--         on public.opportunity_customer_members (org_id, customer_member_id)
--         where opportunity_id is null
--           and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling');
--
-- and said, in its own comment, that a CONCLUDED episode releases the slot because "reusing a
-- concluded participation would hand a new journey the previous episode's outcome".
--
-- It encoded "concluded" as withdrawn-or-not_enrolling. But the ordinary way an enrollment episode
-- concludes is by ENROLLING. So an `enrolled` context-free participation kept satisfying the
-- predicate and kept occupying the child's one ACTIVE slot, forever:
--
--   * `ensureOpportunityCustomerMemberParticipation` found it and REUSED it, so next year's
--     Start Enrollment resumed last year's episode instead of starting a new one;
--   * and creating a second one was impossible, because this index forbade it.
--
-- The intent and the predicate disagreed. This is the predicate agreeing with the intent.
--
-- WHY THIS IS SAFE TO BUILD WITHOUT MEASURING THE DEPLOYED ROWS FIRST
--
-- The replacement predicate is strictly NARROWER than the one it replaces: it excludes everything
-- the old one excluded, plus `enrolled`. A partial unique index therefore covers a SUBSET of the
-- rows the deployed index already covers. Uniqueness that holds over a set holds over every subset
-- of it, so if the current index exists — and it does — the replacement cannot fail to build. No
-- census is required to know that, which matters because the census is not currently reachable.
--
-- The converse would NOT be safe. Widening a partial unique predicate can fail on rows the old one
-- never examined, and that is the direction that needs a measurement first.
--
-- ORDER, AND WHY THE INVARIANT IS NEVER DOWN
--
-- A migration runs in one transaction, so the drop and the create commit together: no concurrent
-- writer ever observes the table without uniqueness protection. The narrower index is created
-- first regardless, so that even under a non-transactional replay the stricter guarantee is the one
-- that exists alone.
--
-- NULL / INITIAL STATE, DELIBERATELY
--
-- `coalesce(outcome_status_key, '')` keeps a NULL or empty status ACTIVE, exactly as before. A
-- participation that has not been dispositioned yet is the live episode, not a concluded one, and
-- treating an unset status as "over" would make a freshly created participation unreusable by the
-- very journey that just created it.
--
-- WHAT THIS DOES NOT DO
--
-- Nothing is backfilled and no historical row is touched. An `enrolled` participation stays exactly
-- as it is and stays readable as history; it simply stops occupying the active slot. There is no
-- new enrollment-episode table: the episode is still the participation row.
--
-- @see web/lib/lifecycle/enrollmentProcessStatusVocabulary.ts
--      PARTICIPATION_REUSE_CONCLUDED_STATUS_KEYS mirrors this predicate. One rule, expressed twice;
--      change them together.
-- =============================================================================

create unique index if not exists uq_ocm_active_context_free_episode
    on public.opportunity_customer_members (org_id, customer_member_id)
    where opportunity_id is null
      and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling', 'enrolled');

drop index if exists public.uq_ocm_active_context_free_participation;

comment on index public.uq_ocm_active_context_free_episode is
    'One ACTIVE context-free Enrollment Participation per child. An episode that concluded -- by enrolling, withdrawing, or not enrolling -- releases the slot so the next episode can begin, and remains durable history.';

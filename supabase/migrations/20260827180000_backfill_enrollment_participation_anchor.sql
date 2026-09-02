-- Anchor existing Enrollment journeys to their Enrollment Participation.
--
-- Enrollment journeys now anchor to the child's Enrollment Participation rather than to an
-- Opportunity. The code reads both shapes, so nothing breaks without this; what this does is stop
-- the older shape from being load-bearing, so consumers can eventually rely on one answer.
--
-- WHAT THIS DOES NOT DO: it creates no Opportunity, and it invents no acquisition. A journey whose
-- child has no participation gets a CONTEXT-FREE one — the same row Start Enrollment writes today
-- for a family who never came through acquisition. That is recording a fact the open journey
-- already asserts (this child is enrolling), not manufacturing a history they do not have.
--
-- Ambiguous cases are LEFT ALONE. A child with more than one active participation has a question
-- attached to them that a migration must not answer by picking one.

begin;

-- 1. Every OPEN enrollment journey whose child has no active participation gets a context-free one.
--
--    `outcome_status_key` matches `ensureOpportunityCustomerMemberParticipation`'s default exactly
--    (`NEW_LEAD_STATUS_KEY`), so a backfilled participation is indistinguishable from one the
--    runtime would have created. Divergence here would be invisible and permanent.
insert into public.opportunity_customer_members (org_id, customer_member_id, opportunity_id, outcome_status_key)
select distinct pi.org_id, pi.subject_id, null, 'new_inquiry'
from public.process_instances pi
join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
where pi.process_key = 'enrollment'
  and pi.subject_type = 'child'
  and pi.context_id is null
  and coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
  and not exists (
      select 1 from public.opportunity_customer_members o
      where o.org_id = pi.org_id
        and o.customer_member_id = pi.subject_id
        and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
  )
on conflict do nothing;

-- 2. Anchor each OPEN journey to its child's single active participation.
--
--    Restricted to open journeys on purpose: a concluded context-free journey belongs to a past
--    episode, and pointing it at the child's CURRENT participation would silently re-file old
--    history under a new episode.
update public.process_instances pi
set context_type = 'enrollment_participation',
    context_id = anchor.ocm_id,
    updated_at = now()
from (
    select p.id as pi_id, min(o.id::text)::uuid as ocm_id
    from public.process_instances p
    join public.opportunity_customer_members o
      on o.org_id = p.org_id
     and o.customer_member_id = p.subject_id
     and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
    where p.process_key = 'enrollment'
      and p.subject_type = 'child'
      and p.context_id is null
      and coalesce(p.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
    group by p.id
    -- Exactly one candidate, or it is ambiguous and this migration does not decide.
    having count(*) = 1
) as anchor
where pi.id = anchor.pi_id;

commit;

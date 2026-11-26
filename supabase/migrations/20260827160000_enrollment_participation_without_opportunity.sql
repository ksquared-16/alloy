-- Enrollment Participation no longer requires an acquisition Opportunity.
--
-- WHY
-- `opportunity_customer_members` is the canonical CHILD ENROLLMENT PARTICIPATION and the durable
-- owner of a child's Enrollment state (`outcome_status_key`: waitlisted / enrolling / enrolled /
-- withdrawn / not_enrolling). Its `opportunity_id` was NOT NULL, so a participation could only
-- exist inside an acquisition episode.
--
-- Start Enrollment deliberately creates no Opportunity: "absence of a live episode is an ordinary
-- answer... not that one should be manufactured". A family already known to the school enrolling a
-- second child has no acquisition episode and needs none. The two rules together left a legitimate
-- context-free Enrollment with nowhere to record that the child is Enrolled — every one of the 19
-- Enrollment journeys in the certification tenant was in that state.
--
-- The Opportunity stays as OPTIONAL acquisition context, reachable when the child entered that way.
-- It stops being required identity.
alter table public.opportunity_customer_members
    alter column opportunity_id drop not null;

-- IDENTITY FOR A CONTEXT-FREE PARTICIPATION.
--
-- `uq_opportunity_customer_members_unique (org_id, opportunity_id, customer_member_id)` cannot
-- protect the context-free case: Postgres treats NULLs as DISTINCT in a unique constraint, so a
-- nullable column would silently permit unlimited duplicate participations for one child. This
-- partial index restores the same guarantee where the opportunity is absent — one context-free
-- Enrollment Participation per child per org — without touching the acquisition-backed rule.
create unique index if not exists uq_ocm_context_free_participation
    on public.opportunity_customer_members (org_id, customer_member_id)
    where opportunity_id is null;

comment on column public.opportunity_customer_members.opportunity_id is
    'Optional acquisition context. NULL means this Enrollment Participation exists without an acquisition episode; the participation, not the opportunity, is the durable subject of Enrollment.';

-- The consistency trigger must handle ABSENCE explicitly rather than be weakened.
--
-- It unconditionally looked the Opportunity up and raised "opportunity_id <NULL> not found" when the
-- row carried none, so relaxing the column alone would have produced a nullable field the database
-- still refused. Found by attempting a context-free participation, not by reading the constraint
-- list -- a trigger is not a constraint and does not appear in one.
--
-- EVERY existing safety property is preserved. With an Opportunity the checks are unchanged: it must
-- exist, its org must match, and where it names a family the child must belong to that family. The
-- only new behaviour is that a participation with no acquisition episode skips the checks that are
-- ABOUT an acquisition episode, while the child checks -- the ones protecting tenancy -- run exactly
-- as before.
create or replace function public.validate_opportunity_customer_members_consistency()
returns trigger
language plpgsql
as $function$
DECLARE
    opp_org uuid;
    opp_customer uuid;
    mem_org uuid;
    mem_customer uuid;
BEGIN
    IF NEW.opportunity_id IS NOT NULL THEN
        SELECT o.org_id, o.customer_id
        INTO opp_org, opp_customer
        FROM public.opportunities o
        WHERE o.id = NEW.opportunity_id;

        IF opp_org IS NULL THEN
            RAISE EXCEPTION 'opportunity_customer_members: opportunity_id % not found', NEW.opportunity_id;
        END IF;
        IF opp_org <> NEW.org_id THEN
            RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %, opp %)', NEW.org_id, opp_org;
        END IF;
    END IF;

    SELECT cm.org_id, cm.customer_id
    INTO mem_org, mem_customer
    FROM public.customer_members cm
    WHERE cm.id = NEW.customer_member_id;

    IF mem_org IS NULL THEN
        RAISE EXCEPTION 'opportunity_customer_members: customer_member_id % not found', NEW.customer_member_id;
    END IF;
    IF mem_org <> NEW.org_id THEN
        RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %, member %)', NEW.org_id, mem_org;
    END IF;

    IF opp_customer IS NOT NULL AND mem_customer IS NOT NULL AND mem_customer <> opp_customer THEN
        RAISE EXCEPTION 'opportunity_customer_members: customer_member.customer_id % does not match opportunity.customer_id %', mem_customer, opp_customer;
    END IF;

    RETURN NEW;
END;
$function$;

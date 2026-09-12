-- =============================================================================
-- THREAD 11 — WHAT EXACT VALUE KEEPS KURZMAN OUT OF THE WAITLIST QUEUE?
--
-- The mounted proof never reached Financials. The Waitlist lens refused the subject, and its filter
-- is case_status IN ('waitlisted'). The earlier census recorded stage_key = 'waitlist', but stage_key
-- and the status the lens filters on are different fields, so the exclusion is still unexplained.
--
-- This reads the fields themselves rather than inferring status from stage. It deliberately touches
-- ONLY tables this codebase demonstrably queries (opportunities, placement_candidates,
-- opportunity_customer_members) and takes no joins to a work-unit catalog: a previous census failed
-- execution_failed, and a join to a table that may not exist under that name is the likeliest reason.
--
-- Scalars, ids and counts. No names, no contact details, no money.
-- =============================================================================
select json_build_object(
    'case', (
        select json_build_object(
            'id',              o.id,
            'stage_key',       o.stage_key,
            'status_key',      o.status_key,
            'work_unit_id',    o.work_unit_id,
            'customer_id',     o.customer_id,
            'org_id',          o.org_id
        )
        from public.opportunities o
        where o.id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
    ),
    -- Every distinct status this tenant's cases actually carry, so 'waitlisted' can be recognised as
    -- present-but-unused or absent from the vocabulary altogether.
    'case_status_vocabulary', (
        select json_agg(x) from (
            select json_build_object('status_key', o.status_key, 'stage_key', o.stage_key,
                                     'cases', count(*)) as x
            from public.opportunities o
            group by o.status_key, o.stage_key
        ) s
    ),
    -- The candidate-grain side of the Waitlist filter: candidate_status IN ('active','paused').
    'candidates_on_case', (
        select json_agg(y) from (
            select json_build_object('status', pc.status, 'rows', count(*)) as y
            from public.placement_candidates pc
            where pc.opportunity_id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
            group by pc.status
        ) t
    ),
    -- The child-grain side: child_lifecycle_status IN ('waitlisted','offer_pending').
    'member_outcomes_on_case', (
        select json_agg(z) from (
            select json_build_object('outcome_status_key', ocm.outcome_status_key,
                                     'rows', count(*)) as z
            from public.opportunity_customer_members ocm
            where ocm.opportunity_id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
            group by ocm.outcome_status_key
        ) u
    ),
    'totals', (select json_build_object(
        'opportunities', (select count(*) from public.opportunities)
    ))
) as kurzman_lifecycle_state;

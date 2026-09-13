-- =============================================================================
-- THREAD 11 · V3 PHASE 1c — DOES THE CANDIDATE GRAIN CARRY THE HOUSEHOLD AT ALL?
--
-- The Focus Panel loses the household account somewhere between a Waitlist row and the Financials
-- card. The certification stack cannot answer this: it holds zero placement_candidates and no
-- Waitlist work unit. The deployed target holds 37 candidates and one waitlist case.
--
-- This asks the single question the repair turns on, and nothing else:
--
--   of the candidate rows the Waitlist work view pages, how many carry `customer_id` — their own
--   household column — and how many carry only the case and the child?
--
-- If coverage is complete, the household exists at the candidate grain and the loss is in
-- composition. If it is systematically null, the projection has nothing to carry and the loss is
-- upstream of the Focus Panel entirely. Those are different repairs in different files.
--
-- READ-ONLY, and deliberately AGGREGATE: counts and booleans only. No names, no ids of people, no
-- contact details, no money. Nothing identifies a family.
-- =============================================================================
select json_build_object(
    -- Sanity, so an all-zero answer cannot be mistaken for an empty tenant.
    'totals', (select json_build_object(
        'placement_candidates', count(*),
        'waitlist_opportunities', (select count(*) from public.opportunities where stage_key = 'waitlist')
    ) from public.placement_candidates),

    -- THE ANSWER. Coverage of each identity column at the candidate grain.
    'candidate_identity_coverage', (select json_build_object(
        'rows', count(*),
        'with_customer_id', count(pc.customer_id),
        'with_customer_member_id', count(pc.customer_member_id),
        'with_opportunity_id', count(pc.opportunity_id),
        'with_ocm_id', count(pc.opportunity_customer_member_id),
        'with_person_id', count(pc.person_id)
    ) from public.placement_candidates pc),

    -- AND AT THE CASE GRAIN BEHIND THEM, since the product law is stated about the opportunity.
    'case_identity_coverage', (select json_build_object(
        'cases_behind_candidates', count(*),
        'with_customer_id', count(o.customer_id)
    ) from public.opportunities o
      where o.id in (select distinct pc.opportunity_id from public.placement_candidates pc)),

    -- THE DIVERGENCE THAT MATTERS: a candidate whose CASE knows the household while the candidate
    -- row itself does not. That is the exact shape that would strand Financials.
    'case_knows_candidate_does_not', (select count(*)
        from public.placement_candidates pc
        join public.opportunities o on o.id = pc.opportunity_id
        where pc.customer_id is null and o.customer_id is not null),

    -- Work unit keys only, to name the composition path. No org or record identity.
    'work_unit_keys', (select coalesce(json_agg(distinct w.key), '[]'::json) from public.work_units w)
) as candidate_grain_household_coverage;

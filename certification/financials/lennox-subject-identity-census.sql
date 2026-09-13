-- =============================================================================
-- THREAD 11 · V3 PHASE 1 — WHERE DOES LENNOX'S HOUSEHOLD IDENTITY ACTUALLY LIVE?
--
-- The Focus Panel shows "Financial account unavailable" on Lennox Kurzman (Waitlist,
-- Tour Scheduled, North Campus, two children) while the Enrollment and Children cards are fully
-- settled. Financials mounts at settlement unconditionally and then cannot resolve a customer.
--
-- The composition trace is proven in code; what is missing is the DATA at the top of it. This asks
-- one question: for the exact failing record, which identity columns are actually populated, at
-- which grain, so the first PRESENT -> ABSENT transition can be located rather than guessed.
--
-- READ-ONLY. Ids, keys and counts only — no names beyond the ones needed to identify the record,
-- no contact details, no financial values. Nothing here writes.
-- =============================================================================
with lennox as (
    select cm.id, cm.org_id, cm.customer_id, cm.display_name, cm.is_active
    from public.customer_members cm
    where cm.display_name ilike '%lennox%'
       or (cm.first_name ilike '%lennox%')
),
-- Every case the child participates in, at both the legacy OCM grain and the process-instance one.
participations as (
    select ocm.id as ocm_id, ocm.opportunity_id, ocm.customer_member_id, ocm.outcome_status_key
    from public.opportunity_customer_members ocm
    where ocm.customer_member_id in (select id from lennox)
),
cases as (
    select o.id, o.org_id, o.customer_id, o.stage_key, o.status_key,
           o.work_unit_id, o.location_id, o.name
    from public.opportunities o
    where o.id in (select opportunity_id from participations)
),
-- The candidate grain the Waitlist work view actually pages.
candidates as (
    select pc.id, pc.org_id, pc.opportunity_id, pc.customer_id, pc.customer_member_id,
           pc.opportunity_customer_member_id, pc.person_id, pc.site_id, pc.status
    from public.placement_candidates pc
    where pc.opportunity_id in (select id from cases)
)
select json_build_object(
    -- SANITY FIRST: an all-empty answer must be distinguishable from "asked the wrong tenant".
    'tenant_totals', (select json_build_object(
        'orgs', (select count(*) from public.orgs),
        'customer_members', (select count(*) from public.customer_members),
        'placement_candidates', (select count(*) from public.placement_candidates),
        'waitlist_opportunities', (select count(*) from public.opportunities where stage_key = 'waitlist')
    )),
    'lennox_members', (select coalesce(json_agg(row_to_json(l)), '[]'::json) from lennox l),
    'participations', (select coalesce(json_agg(row_to_json(p)), '[]'::json) from participations p),
    'cases', (select coalesce(json_agg(row_to_json(c)), '[]'::json) from cases c),
    'candidates', (select coalesce(json_agg(row_to_json(k)), '[]'::json) from candidates k),
    -- THE LAW UNDER TEST: does the case carry a customer at all?
    'case_customer_present', (select coalesce(json_agg(json_build_object(
        'opportunity_id', c.id, 'customer_id_present', (c.customer_id is not null)
    )), '[]'::json) from cases c),
    -- The work unit whose queue opens this panel, by key — the composition path depends on it.
    'work_units', (select coalesce(json_agg(json_build_object(
        'id', w.id, 'key', w.key, 'name', w.name
    )), '[]'::json) from public.work_units w where w.id in (select work_unit_id from cases)),
    -- Siblings: the screenshot says two children, and the household subject must not depend on
    -- which one is active.
    'household_children', (select coalesce(json_agg(json_build_object(
        'customer_member_id', cm.id, 'customer_id', cm.customer_id, 'is_active', cm.is_active
    )), '[]'::json) from public.customer_members cm
      where cm.customer_id in (select customer_id from cases where customer_id is not null))
) as lennox_subject_identity;

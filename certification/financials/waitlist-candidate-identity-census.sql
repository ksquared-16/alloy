-- =============================================================================
-- THREAD 11 · V3 PHASE 1b — THE CANDIDATE-GRAIN WAITLIST SHAPE, WHEREVER IT LIVES
--
-- The first census reached a real database (2 orgs, 21 customer_members, 37 placement_candidates,
-- 1 waitlist opportunity) and found no Lennox. An empty answer beside non-zero totals means the
-- record is not in THIS target — not that the tenant is empty.
--
-- So this asks two things at once:
--
--   1. WHO is actually here — all 21 members by name, so "no Lennox" is a fact about the tenant
--      rather than about my LIKE pattern.
--   2. WHAT the candidate-grain waitlist shape looks like on the one waitlist case that exists,
--      with every identity column the Focus Panel composition could carry. That shape is the thing
--      the certification stack does not have at all, and it is what the repair must be traced
--      against.
--
-- READ-ONLY. Ids, keys, names-for-identification and counts. No contact details, no money.
-- =============================================================================
select json_build_object(
    'orgs', (select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name)), '[]'::json)
             from public.orgs o),

    -- WHO IS HERE. 21 rows is small enough to enumerate, which settles the "wrong pattern or wrong
    -- tenant" question outright.
    'all_members', (select coalesce(json_agg(json_build_object(
        'id', cm.id, 'org_id', cm.org_id, 'customer_id', cm.customer_id,
        'display_name', cm.display_name, 'is_active', cm.is_active
    ) order by cm.display_name), '[]'::json) from public.customer_members cm),

    -- THE WAITLIST CASE(S), with the household column the product law turns on.
    'waitlist_cases', (select coalesce(json_agg(json_build_object(
        'id', o.id, 'org_id', o.org_id, 'name', o.name,
        'customer_id', o.customer_id,
        'customer_id_present', (o.customer_id is not null),
        'stage_key', o.stage_key, 'status_key', o.status_key,
        'work_unit_id', o.work_unit_id, 'location_id', o.location_id
    )), '[]'::json) from public.opportunities o where o.stage_key = 'waitlist'),

    -- THE CANDIDATE ROWS THE WAITLIST WORK VIEW PAGES. Every identity column, because the question
    -- is precisely which of them survive into composed truth.
    'candidates', (select coalesce(json_agg(json_build_object(
        'id', pc.id, 'org_id', pc.org_id,
        'opportunity_id', pc.opportunity_id,
        'customer_id', pc.customer_id,
        'customer_id_present', (pc.customer_id is not null),
        'customer_member_id', pc.customer_member_id,
        'opportunity_customer_member_id', pc.opportunity_customer_member_id,
        'person_id', pc.person_id,
        'site_id', pc.site_id, 'status', pc.status
    )), '[]'::json) from public.placement_candidates pc),

    -- HOW MANY CANDIDATES CARRY THEIR OWN HOUSEHOLD COLUMN. If the column is systematically null,
    -- the candidate projection has nothing to carry and the loss is upstream of composition.
    'candidate_customer_coverage', (select json_build_object(
        'total', count(*),
        'with_customer_id', count(pc.customer_id),
        'with_member_id', count(pc.customer_member_id)
    ) from public.placement_candidates pc),

    -- THE WORK UNITS, so the composition path (which queue opens the panel) is named.
    'work_units', (select coalesce(json_agg(json_build_object(
        'id', w.id, 'key', w.key, 'name', w.name, 'org_id', w.org_id
    )), '[]'::json) from public.work_units w)
) as waitlist_candidate_identity;

-- =============================================================================
-- THREAD 11 — WHICH WORK UNIT OWNS THE KURZMAN CASE?
--
-- The mounted proof failed before Financials was ever reached. The Waitlist lens refused the
-- subject: "the requested subject is not present in this work unit's evaluated page". That is the
-- standing lifecycle_wu_lead vs lifecycle_wu_waitlist question, and it must be answered from
-- persistence rather than assumed.
--
-- Booleans, ids and counts only. No names, no contact details, no money.
-- =============================================================================
select json_build_object(
    'case_work_unit_id', (
        select work_unit_id from public.opportunities
        where id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
    ),
    'case_stage_key', (
        select stage_key from public.opportunities
        where id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
    ),
    -- The two candidate lenses, by key, so the id above can be named rather than compared by hand.
    'work_units', (select json_agg(json_build_object('id', wu.id, 'key', wu.work_unit_key))
        from public.work_units wu
        where wu.work_unit_key in ('lifecycle_wu_lead','lifecycle_wu_waitlist')),
    -- Does the case sit in the Waitlist lens at all, or only outside its evaluated page?
    'waitlist_case_count', (
        select count(*) from public.opportunities o
        join public.work_units wu on wu.id = o.work_unit_id
        where wu.work_unit_key = 'lifecycle_wu_waitlist'
    ),
    'lead_case_count', (
        select count(*) from public.opportunities o
        join public.work_units wu on wu.id = o.work_unit_id
        where wu.work_unit_key = 'lifecycle_wu_lead'
    ),
    'totals', (select json_build_object(
        'opportunities', (select count(*) from public.opportunities),
        'work_units', (select count(*) from public.work_units)
    ))
) as kurzman_work_unit_routing;

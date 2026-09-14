-- =============================================================================
-- THREAD 11 — DOES THE BROWSER TARGET'S DATABASE HOLD THE FAILING RECORD?
--
-- `alloy_staging_web` serves environment "staging". The toolkit's own routing table maps both
-- `staging` and `alloy_deployed_primary` to TARGET_CLASS.STAGING, so the census target already used
-- IS the database behind that browser target. This confirms the three exact identities the mounted
-- proof depends on, so a merge is not requested on an assumption.
--
-- Existence booleans and counts only. No names, no contact details, no money.
-- =============================================================================
select json_build_object(
    'org_firefly_present', exists (
        select 1 from public.orgs where id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
    ),
    'opportunity_present', exists (
        select 1 from public.opportunities where id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
    ),
    'customer_present', exists (
        select 1 from public.customers where id = '0658832a-48d6-4b80-beae-0b12d573fdf2'
    ),
    -- The case must still be on the Waitlist and still carry that household, or the mounted proof
    -- is about a record that has since moved.
    'case_still_waitlist_with_customer', exists (
        select 1 from public.opportunities
        where id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
          and stage_key = 'waitlist'
          and customer_id = '0658832a-48d6-4b80-beae-0b12d573fdf2'
    ),
    -- Candidate rows behind it, and how many carry the household column the repair now projects.
    'candidates_on_case', (select json_build_object(
        'rows', count(*),
        'with_customer_id', count(pc.customer_id)
    ) from public.placement_candidates pc
      where pc.opportunity_id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'),
    -- Sanity, so an all-false answer cannot be mistaken for a reachable-but-empty database.
    'totals', (select json_build_object(
        'orgs', (select count(*) from public.orgs),
        'opportunities', (select count(*) from public.opportunities)
    ))
) as staging_kurzman_presence;

-- =============================================================================
-- Configuration Discovery V1 — certification fixture teardown (LOCAL CERT STACK ONLY)
--
-- Removes ONLY rows this certification created. Two safety properties:
--   • every fixture-created row carries the id prefix `cdc10000-`
--   • relationship/edge rows are removed by JOINING to those ids, never by role or by date,
--     so no seeded or unrelated record can be caught by this script
--
-- Deliberately NOT removed: the `customer_member_contact_roles` tenant configuration. It is
-- legitimate org config (the seeded tenant simply shipped none), it is harmless to retain, and
-- the fixture re-applies it idempotently.
-- =============================================================================

\set ON_ERROR_STOP on
\set org_id '''00000000-0000-4000-8000-000000000001'''

-- relationship edges written by the certification, scoped to fixture children/persons
delete from public.person_child_relationship_roles r
where r.relationship_id in (
    select pcr.id from public.person_child_relationships pcr
    where pcr.customer_member_id::text like 'cdc10000-%'
       or pcr.person_id::text like 'cdc10000-%'
);

delete from public.person_child_relationships
where customer_member_id::text like 'cdc10000-%'
   or person_id::text like 'cdc10000-%';

delete from public.customer_member_contacts
where customer_member_id::text like 'cdc10000-%';

-- processing cases opened by the certification against the fixture household
delete from public.processing_case_sources
where processing_case_id in (
    select id from public.processing_cases
    where org_id = :org_id::uuid
      and (metadata->>'certification_fixture') = 'configuration-discovery-v1'
);
delete from public.processing_cases
where org_id = :org_id::uuid
  and (metadata->>'certification_fixture') = 'configuration-discovery-v1';

-- household membership + identity
delete from public.customer_persons where customer_id::text like 'cdc10000-%' or person_id::text like 'cdc10000-%';
delete from public.customer_members where id::text like 'cdc10000-%' or customer_id::text like 'cdc10000-%';
-- Fixture persons are id-prefixed; persons created THROUGH the app during certification get
-- random uuids, so they are matched by their namespaced @cdv1.invalid address instead.
delete from public.customer_persons
where person_id in (select id from public.persons where email like '%@cdv1.invalid');
delete from public.persons          where id::text like 'cdc10000-%' or email like '%@cdv1.invalid';
delete from public.customers        where id::text like 'cdc10000-%';

select 'TEARDOWN_COMPLETE' as marker,
       (select count(*) from public.customers where id::text like 'cdc10000-%')        as customers_left,
       (select count(*) from public.customer_members where id::text like 'cdc10000-%') as children_left,
       (select count(*) from public.persons
         where id::text like 'cdc10000-%' or email like '%@cdv1.invalid')              as persons_left;

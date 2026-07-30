-- =============================================================================
-- Configuration Discovery V1 — certification fixture teardown (LOCAL CERT STACK ONLY)
--
-- Removes ONLY rows this certification created. Two safety properties:
--   • every fixture-created row carries the id prefix `cdc10000-`
--   • relationship/edge rows are removed by JOINING to those ids, never by role or by date,
--     so no seeded or unrelated record can be caught by this script
--
-- REPEATABILITY DEFECT (found by running the certification twice): an earlier version deleted
-- persons but never deleted `contacts`. `contacts.person_id` is SET NULL when a person is removed,
-- so the orphaned row kept its address and `contacts_email_unique` then rejected the NEXT run's
-- guardian and authorized-pickup links with "duplicate key value violates unique constraint".
-- The certification passed only because previous runs had already left those rows behind.
--
-- The old completion marker counted customers/children/persons and happily reported 0 while the
-- rows that actually broke the next run were still there. A marker that cannot fail is not a check,
-- so it now counts contacts and app-created persons too.
--
-- Records created THROUGH the app during certification (a respondent-added emergency contact, its
-- contact row) get random uuids and may carry no address at all, so they cannot be matched by
-- prefix or by email. They are collected by TRAVERSAL from the fixture household instead.
--
-- Deliberately NOT removed: the `customer_member_contact_roles` tenant configuration. It is
-- legitimate org config (the seeded tenant simply shipped none), it is harmless to retain, and
-- the fixture re-applies it idempotently.
-- =============================================================================

\set ON_ERROR_STOP on
\set org_id '''00000000-0000-4000-8000-000000000001'''

-- ── collect fixture-scoped identities BEFORE deleting the edges that identify them ───────────
-- Traversal, not guesswork: anything reachable from the fixture household or carrying the
-- fixture namespace. Collected first because the edges are deleted below.
create temporary table _cdv1_persons on commit preserve rows as
select distinct p.id
from public.persons p
where p.id::text like 'cdc10000-%'
   or p.email like '%@cdv1.invalid'
   or p.id in (select pcr.person_id from public.person_child_relationships pcr
               where pcr.customer_member_id::text like 'cdc10000-%'
                  or pcr.customer_id::text like 'cdc10000-%')
   or p.id in (select cp.person_id from public.customer_persons cp
               where cp.customer_id::text like 'cdc10000-%');

create temporary table _cdv1_contacts on commit preserve rows as
select distinct c.id
from public.contacts c
where c.email like '%@cdv1.invalid'
   or c.person_id in (select id from _cdv1_persons)
   or c.id in (select cmc.contact_id from public.customer_member_contacts cmc
               where cmc.customer_member_id::text like 'cdc10000-%'
                  or cmc.customer_id::text like 'cdc10000-%');

-- ── relationship edges written by the certification ──────────────────────────────────────────
delete from public.person_child_relationship_roles r
where r.relationship_id in (
    select pcr.id from public.person_child_relationships pcr
    where pcr.customer_member_id::text like 'cdc10000-%'
       or pcr.person_id in (select id from _cdv1_persons)
);

delete from public.person_child_relationships
where customer_member_id::text like 'cdc10000-%'
   or person_id in (select id from _cdv1_persons);

delete from public.customer_member_contacts
where customer_member_id::text like 'cdc10000-%'
   or contact_id in (select id from _cdv1_contacts);

-- ── processing cases opened by the certification against the fixture household ───────────────
delete from public.processing_case_sources
where processing_case_id in (
    select id from public.processing_cases
    where org_id = :org_id::uuid
      and (metadata->>'certification_fixture') = 'configuration-discovery-v1'
);
delete from public.processing_cases
where org_id = :org_id::uuid
  and (metadata->>'certification_fixture') = 'configuration-discovery-v1';

-- ── household membership + identity ──────────────────────────────────────────────────────────
delete from public.customer_persons
where customer_id::text like 'cdc10000-%'
   or person_id in (select id from _cdv1_persons);
delete from public.customer_members where id::text like 'cdc10000-%' or customer_id::text like 'cdc10000-%';

-- contacts BEFORE persons: the FK nulls person_id on person delete, which would strand the row
-- and re-break the next run through contacts_email_unique.
delete from public.contacts where id in (select id from _cdv1_contacts);
delete from public.persons   where id in (select id from _cdv1_persons);
delete from public.customers where id::text like 'cdc10000-%';

-- ── completion marker — counts EVERY class the fixture creates ───────────────────────────────
-- A teardown that cannot report its own residue is what let the repeatability defect hide.
select 'TEARDOWN_COMPLETE' as marker,
       (select count(*) from public.customers where id::text like 'cdc10000-%')          as customers_left,
       (select count(*) from public.customer_members where id::text like 'cdc10000-%')   as children_left,
       (select count(*) from public.persons
         where id::text like 'cdc10000-%' or email like '%@cdv1.invalid')                as persons_left,
       (select count(*) from public.contacts where email like '%@cdv1.invalid')          as contacts_left,
       (select count(*) from public.person_child_relationships
         where customer_member_id::text like 'cdc10000-%')                               as relationships_left,
       (select count(*) from public.customer_member_contacts
         where customer_member_id::text like 'cdc10000-%')                               as member_contacts_left;

drop table if exists _cdv1_persons;
drop table if exists _cdv1_contacts;

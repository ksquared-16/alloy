-- Documents D9.1 hosted HTTP proof — subject fixture ENSURE (plan: certification/documents-v1/D9-1-HOSTED-QA-PLAN.md §3).
-- PREPARED, NOT RUN, NOT REGISTERED. Intended as the pinned reconciliation `qa_d9_external_fixture_ensure` of the hosted
-- QA plan Host Capacity is asked to register (handoff H2). Applied once per organization by the executor:
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -v org=<qa_shared | qa_secondary> -v qa_run_id=<qar_…> -f <this>
-- It writes PEOPLE and ENROLLMENTS only. The 12 tagged documents are uploaded through the existing audited admin route
-- by the QA persona sessions (plan W4), never inserted here.
--
-- qa_shared:    household H1; child C1 enrolled at QA North; child C2 enrolled at QA South; G1 an ACTIVE `guardian` of
--               C1 (visible as a guardian); E1 only an `emergency_contact` of C1 (must stay invisible).
-- qa_secondary: household HB; child CB enrolled at that org's oldest location (no qa_secondary site is registered in
--               the QA structure — H2 to confirm or name one).
-- Every row id starts with d9000000- and carries metadata.qa_run_id; the reset removes exactly these.
-- Not validated against a real database here: the shared local stack is not at staging parity and no isolated
-- database is available to Documents. The executor's single transaction makes any refusal a no-op.

\if :{?org}
\else
do $$ begin raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>'; end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin raise exception 'this fixture requires psql -v qa_run_id=<qar_…>'; end $$;
\endif

select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared,
       (:'org' = 'ad53fee2-2570-460f-9300-f0e106c473b6') as is_qa_secondary \gset
\if :is_qa_shared
\elif :is_qa_secondary
\else
do $$ begin raise exception 'the D9 external fixture is seeded in QA Shared or QA Secondary only'; end $$;
\endif

select exists (select 1 from public.documents d where d.org_id = :'org'::uuid and d.entity_id::text like 'd9000000-%')
    as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin raise exception 'documents are still attached to D9 fixture subjects; delete them through the audited document delete first'; end $$;
\endif

-- Idempotent: clear this namespace in this org, then write it again.
delete from public.child_enrollment_agreements where org_id = :'org'::uuid and id::text like 'd9000000-%';
delete from public.person_child_relationships where org_id = :'org'::uuid and id::text like 'd9000000-%';
delete from public.customer_persons where org_id = :'org'::uuid and customer_id::text like 'd9000000-%';
delete from public.customer_members where org_id = :'org'::uuid and id::text like 'd9000000-%';
delete from public.persons where org_id = :'org'::uuid and id::text like 'd9000000-%';
delete from public.customers where org_id = :'org'::uuid and id::text like 'd9000000-%';

\if :is_qa_shared
\set h1 'd9000000-0000-4000-8000-000000000101'
\set g1 'd9000000-0000-4000-8000-000000000111'
\set e1 'd9000000-0000-4000-8000-000000000112'
\set c1 'd9000000-0000-4000-8000-000000000121'
\set c2 'd9000000-0000-4000-8000-000000000122'

insert into public.customers (id, org_id, name, status, metadata)
values (:'h1'::uuid, :'org'::uuid, 'QA D9 Household', 'active',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'H1', 'external_source', 'alloy_qa_fixture'));

insert into public.persons (id, org_id, first_name, last_name, full_name, metadata)
values
  (:'g1'::uuid, :'org'::uuid, 'Gale', 'QA-D9', 'Gale QA-D9', jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'G1', 'external_source', 'alloy_qa_fixture')),
  (:'e1'::uuid, :'org'::uuid, 'Emery', 'QA-D9', 'Emery QA-D9', jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'E1', 'external_source', 'alloy_qa_fixture'));

insert into public.customer_persons (org_id, customer_id, person_id, role_type, is_primary, metadata)
values
  (:'org'::uuid, :'h1'::uuid, :'g1'::uuid, 'primary_contact', true, jsonb_build_object('qa_run_id', :'qa_run_id')),
  (:'org'::uuid, :'h1'::uuid, :'e1'::uuid, 'emergency_contact', false, jsonb_build_object('qa_run_id', :'qa_run_id'));

insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
values
  (:'c1'::uuid, :'org'::uuid, :'h1'::uuid, 'Cass QA-D9', 'Cass', 'QA-D9', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'C1', 'external_source', 'alloy_qa_fixture')),
  (:'c2'::uuid, :'org'::uuid, :'h1'::uuid, 'Dale QA-D9', 'Dale', 'QA-D9', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'C2', 'external_source', 'alloy_qa_fixture'));

insert into public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, status, metadata)
values
  ('d9000000-0000-4000-8000-000000000131'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'g1'::uuid, 'guardian', 'active', jsonb_build_object('qa_run_id', :'qa_run_id')),
  ('d9000000-0000-4000-8000-000000000132'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'e1'::uuid, 'emergency_contact', 'active', jsonb_build_object('qa_run_id', :'qa_run_id'));

insert into public.child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key, metadata)
values
  ('d9000000-0000-4000-8000-000000000141'::uuid, :'org'::uuid, :'c1'::uuid, :'h1'::uuid, '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'active', current_date, 'qa_fixture',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'C1@qa_north')),
  ('d9000000-0000-4000-8000-000000000142'::uuid, :'org'::uuid, :'c2'::uuid, :'h1'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid, 'active', current_date, 'qa_fixture',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'C2@qa_south'));
\endif

\if :is_qa_secondary
\set hb 'd9000000-0000-4000-8000-000000000201'
\set cb 'd9000000-0000-4000-8000-000000000221'
select id as cb_site from public.locations where org_id = :'org'::uuid order by created_at, id limit 1 \gset
\if :{?cb_site}
\else
do $$ begin raise exception 'QA Secondary has no location for the CB enrollment'; end $$;
\endif

insert into public.customers (id, org_id, name, status, metadata)
values (:'hb'::uuid, :'org'::uuid, 'QA D9 Household B', 'active',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'HB', 'external_source', 'alloy_qa_fixture'));
insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
values (:'cb'::uuid, :'org'::uuid, :'hb'::uuid, 'Blair QA-D9', 'Blair', 'QA-D9', 'child', true,
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'CB', 'external_source', 'alloy_qa_fixture'));
insert into public.child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key, metadata)
values ('d9000000-0000-4000-8000-000000000241'::uuid, :'org'::uuid, :'cb'::uuid, :'hb'::uuid, :'cb_site'::uuid, 'active', current_date, 'qa_fixture',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'CB@secondary'));
\endif

select 'ensure org=' || :'org' || ' customers=' || (select count(*) from public.customers where org_id = :'org'::uuid and id::text like 'd9000000-%')
    || ' children=' || (select count(*) from public.customer_members where org_id = :'org'::uuid and id::text like 'd9000000-%')
    || ' enrollments=' || (select count(*) from public.child_enrollment_agreements where org_id = :'org'::uuid and id::text like 'd9000000-%') as result;

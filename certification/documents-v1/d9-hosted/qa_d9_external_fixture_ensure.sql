-- Documents D9 hosted HTTP proof — PEOPLE / ENROLLMENT fixture ENSURE (proposed registered reconciliation
-- qa_d9_external_fixture_ensure; plans certification/documents-v1/D9-1-HOSTED-QA-PLAN.md §3 and D9-2-3-HOSTED-QA-PLAN.md §3).
-- PREPARED, NOT RUN, NOT REGISTERED. Supersedes the unregistered draft certification/fixtures/qa-d9-external-fixture-*.sql
-- (it wrote the dropped customers.status column and deleted by id prefix).
--
-- The subjects the /api/v1 Documents authority must see or not see (externalDocumentAuthority.ts): a child is visible
-- when a non-canceled, non-voided child_enrollment_agreements row exists at an in-boundary site
-- (external_child_service_commitment_exists); a household when it anchors a visible child; a person only through an
-- ACTIVE `parent` / `guardian` person_child_relationships edge to a visible child.
--   QA Shared (:org):         H1 household; C1 child of H1 enrolled at QA North; C2 child of H1 enrolled at QA South;
--                             G1 an ACTIVE `parent` of C1; E1 only an ACTIVE `emergency_contact` of C1 (never visible).
--   QA Secondary (:org_b):    HB household; CB child of HB enrolled at the registered QA Secondary site
--                             qa_secondary_site (Director-approved 2026-11-06; created only by the QA structure ensure).
-- Both QA orgs are fixed here; the runner supplies :org (QA Shared only) and :qa_run_id. QA Secondary is never chosen
-- by a caller, and no other organization is ever written.
-- Documents are NOT created here: the harness uploads the tagged (qa-d9r-<qa_run_id> / qa-d9w-<qa_run_id>) documents
-- through the audited admin and /api/v1 routes and removes them through the audited document delete, which removes
-- their versions, subject links and storage objects. SQL could delete document rows but never their stored bytes.
--
-- Namespace: d9000000- is reserved to this fixture (aa000000- authz_q1, ab000000- D4 household, ac000000- R5 shared
-- child / Surfaces c4). Every DELETE names its organization AND this fixture's exact ids — never a prefix.
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; QA North / QA South is
-- missing or not a site; QA Secondary has no active site; a fixture id exists in an organization other than its own; a
-- d9000000- row in a QA org is not this fixture's (fixture_family marker); the rows belong to ANOTHER QA run (reset
-- first: one live tenant at a time); a document, a form submission or an Enrollment journey still references a
-- fixture subject.
-- One transaction (psql ON_ERROR_STOP): a refusal or failure part-way leaves the database as it was.
-- Never touches: documents, document_versions, document_subjects, storage, form rows, process_instances,
-- mutation_events, workflow_events, app installations / credentials, the permanent QA structure (orgs, sites),
-- or any organization other than QA Shared and QA Secondary.
-- Runner owns :org and :qa_run_id. Never assigns them here.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>. It does not choose a tenant for itself.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>. Cross-run contamination is refused.';
end $$;
\endif

-- QA Shared only. Evaluated outside dollar quotes, where psql interpolates variables.
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the D9 external fixture is applied with org = QA Shared; QA Secondary is fixed by the fixture';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

-- QA Secondary (fixed), the permanent QA sites (never created or deleted here) and the fixture ids (d9000000-).
\set org_b 'ad53fee2-2570-460f-9300-f0e106c473b6'
\set qa_north '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'
\set qa_south 'cfb73302-3bbe-49db-b173-876fda776a6d'
\set qa_secondary_site '4f89f324-dbc5-4815-8431-38ffec891398'
\set h1 'd9000000-0000-4000-8000-000000000101'
\set g1 'd9000000-0000-4000-8000-000000000111'
\set e1 'd9000000-0000-4000-8000-000000000112'
\set c1 'd9000000-0000-4000-8000-000000000121'
\set c2 'd9000000-0000-4000-8000-000000000122'
\set rel_g1 'd9000000-0000-4000-8000-000000000131'
\set rel_e1 'd9000000-0000-4000-8000-000000000132'
\set enr_c1 'd9000000-0000-4000-8000-000000000141'
\set enr_c2 'd9000000-0000-4000-8000-000000000142'
\set hb 'd9000000-0000-4000-8000-000000000201'
\set cb 'd9000000-0000-4000-8000-000000000221'
\set enr_cb 'd9000000-0000-4000-8000-000000000241'
\set family 'documents_d9_external'

select not exists (
    select 1 from public.locations l
     where l.org_id = :'org'::uuid
       and l.id in (:'qa_north'::uuid, :'qa_south'::uuid)
       and l.location_type = 'site'
    having count(*) = 2
  ) as d9_permanent_sites_missing \gset
\if :d9_permanent_sites_missing
do $$ begin
  raise exception 'QA North or QA South is missing from QA Shared or is not a site; this fixture never creates QA structure';
end $$;
\endif

select not exists (
    select 1 from public.locations l
     where l.id = :'qa_secondary_site'::uuid
       and l.org_id = :'org_b'::uuid
       and l.location_type = 'site'
       and l.is_active
  ) as d9_secondary_site_missing \gset
\if :d9_secondary_site_missing
do $$ begin
  raise exception 'qa_secondary_site (4f89f324-dbc5-4815-8431-38ffec891398) is missing from QA Secondary, is not a site or is inactive; this fixture never creates QA structure';
end $$;
\endif

-- A fixture id in an organization other than its own is not ours to replace (uuid keys are global).
select exists (select 1 from public.customers x where (x.id = :'h1'::uuid and x.org_id <> :'org'::uuid) or (x.id = :'hb'::uuid and x.org_id <> :'org_b'::uuid))
    or exists (select 1 from public.customer_members x where (x.id in (:'c1'::uuid, :'c2'::uuid) and x.org_id <> :'org'::uuid) or (x.id = :'cb'::uuid and x.org_id <> :'org_b'::uuid))
    or exists (select 1 from public.persons x where x.id in (:'g1'::uuid, :'e1'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.person_child_relationships x where x.id in (:'rel_g1'::uuid, :'rel_e1'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.child_enrollment_agreements x where (x.id in (:'enr_c1'::uuid, :'enr_c2'::uuid) and x.org_id <> :'org'::uuid) or (x.id = :'enr_cb'::uuid and x.org_id <> :'org_b'::uuid))
    as d9_foreign_org \gset
\if :d9_foreign_org
do $$ begin
  raise exception 'a D9 fixture id exists in an organization other than its own; refusing';
end $$;
\endif

-- A row in the reserved namespace that does not carry this fixture's marker is not this fixture's.
select exists (select 1 from public.customers x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.customer_members x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.persons x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.person_child_relationships x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    as d9_foreign_rows \gset
\if :d9_foreign_rows
do $$ begin
  raise exception 'a row in the d9000000- namespace is not a D9 external fixture row; refusing';
end $$;
\endif

-- Another QA run's rows: refuse rather than take them over (the reset is the recovery path).
select exists (select 1 from public.customers x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'h1'::uuid, :'hb'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.customer_members x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'c1'::uuid, :'c2'::uuid, :'cb'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.persons x where x.org_id = :'org'::uuid and x.id in (:'g1'::uuid, :'e1'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.person_child_relationships x where x.org_id = :'org'::uuid and x.id in (:'rel_g1'::uuid, :'rel_e1'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'enr_c1'::uuid, :'enr_c2'::uuid, :'enr_cb'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    as d9_other_run \gset
\if :d9_other_run
do $$ begin
  raise exception 'the D9 external fixture rows belong to another QA run; run qa_d9_external_fixture_reset first';
end $$;
\endif

-- Documents of a fixture subject leave through the audited document delete (row, versions, links AND stored objects).
select exists (
    select 1 from public.documents d
     where d.org_id in (:'org'::uuid, :'org_b'::uuid)
       and d.entity_id in (:'h1'::uuid, :'g1'::uuid, :'e1'::uuid, :'c1'::uuid, :'c2'::uuid, :'hb'::uuid, :'cb'::uuid)
  )
    or exists (
    select 1 from public.document_subjects s
     where s.org_id in (:'org'::uuid, :'org_b'::uuid)
       and s.subject_id in (:'h1'::uuid, :'g1'::uuid, :'e1'::uuid, :'c1'::uuid, :'c2'::uuid, :'hb'::uuid, :'cb'::uuid)
  ) as d9_documents_remaining \gset
\if :d9_documents_remaining
do $$ begin
  raise exception 'documents still reference D9 fixture subjects; delete them through the audited document delete first';
end $$;
\endif

select exists (
    select 1 from public.form_submissions s
     where s.org_id in (:'org'::uuid, :'org_b'::uuid)
       and (s.customer_id in (:'h1'::uuid, :'hb'::uuid)
            or s.customer_member_id in (:'c1'::uuid, :'c2'::uuid, :'cb'::uuid))
  ) as d9_submissions_remaining \gset
\if :d9_submissions_remaining
do $$ begin
  raise exception 'form submissions still reference D9 fixture subjects; refusing';
end $$;
\endif

-- An Enrollment journey retains its child (refuse_delete_under_enrollment_journey); say so first.
select exists (
    select 1 from public.process_instances p
     where p.subject_type = 'child'
       and p.subject_id in (:'c1'::uuid, :'c2'::uuid, :'cb'::uuid)
  ) as d9_journey_remaining \gset
\if :d9_journey_remaining
do $$ begin
  raise exception 'an Enrollment journey references a D9 fixture child; refusing';
end $$;
\endif

begin;

-- Idempotent: remove this run's previous fixture rows by organization and exact id, dependents first.
delete from public.child_enrollment_agreements
 where org_id = :'org'::uuid
   and id in (:'enr_c1'::uuid, :'enr_c2'::uuid);
delete from public.child_enrollment_agreements
 where org_id = :'org_b'::uuid
   and id in (:'enr_cb'::uuid);
delete from public.person_child_relationships
 where org_id = :'org'::uuid
   and id in (:'rel_g1'::uuid, :'rel_e1'::uuid);
delete from public.customer_members
 where org_id = :'org'::uuid
   and id in (:'c1'::uuid, :'c2'::uuid);
delete from public.customer_members
 where org_id = :'org_b'::uuid
   and id in (:'cb'::uuid);
delete from public.persons
 where org_id = :'org'::uuid
   and id in (:'g1'::uuid, :'e1'::uuid);
delete from public.customers
 where org_id = :'org'::uuid
   and id in (:'h1'::uuid);
delete from public.customers
 where org_id = :'org_b'::uuid
   and id in (:'hb'::uuid);

insert into public.customers (id, org_id, name, status_key, metadata)
values
  (:'h1'::uuid, :'org'::uuid, 'QA D9 Household', 'active',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'H1', 'external_source', 'alloy_qa_fixture')),
  (:'hb'::uuid, :'org_b'::uuid, 'QA D9 Household B', 'active',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'HB', 'external_source', 'alloy_qa_fixture'));

insert into public.persons (id, org_id, first_name, last_name, full_name, metadata)
values
  (:'g1'::uuid, :'org'::uuid, 'Gale', 'QA-D9', 'Gale QA-D9',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'G1', 'external_source', 'alloy_qa_fixture')),
  (:'e1'::uuid, :'org'::uuid, 'Emery', 'QA-D9', 'Emery QA-D9',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'E1', 'external_source', 'alloy_qa_fixture'));

insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
values
  (:'c1'::uuid, :'org'::uuid, :'h1'::uuid, 'Cass QA-D9', 'Cass', 'QA-D9', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'C1', 'external_source', 'alloy_qa_fixture')),
  (:'c2'::uuid, :'org'::uuid, :'h1'::uuid, 'Dale QA-D9', 'Dale', 'QA-D9', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'C2', 'external_source', 'alloy_qa_fixture')),
  (:'cb'::uuid, :'org_b'::uuid, :'hb'::uuid, 'Blair QA-D9', 'Blair', 'QA-D9', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'CB', 'external_source', 'alloy_qa_fixture'));

insert into public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, status, metadata)
values
  (:'rel_g1'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'g1'::uuid, 'parent', 'active',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'G1_parent_of_C1')),
  (:'rel_e1'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'e1'::uuid, 'emergency_contact', 'active',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'E1_emergency_contact_of_C1'));

insert into public.child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key, metadata)
values
  (:'enr_c1'::uuid, :'org'::uuid, :'c1'::uuid, :'h1'::uuid, :'qa_north'::uuid, 'active', current_date, 'qa_fixture',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'C1_at_qa_north')),
  (:'enr_c2'::uuid, :'org'::uuid, :'c2'::uuid, :'h1'::uuid, :'qa_south'::uuid, 'active', current_date, 'qa_fixture',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'C2_at_qa_south')),
  (:'enr_cb'::uuid, :'org_b'::uuid, :'cb'::uuid, :'hb'::uuid,
   :'qa_secondary_site'::uuid,
   'active', current_date, 'qa_fixture',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'CB_at_qa_secondary'));

commit;

select json_build_object(
    'd9_external_fixture_ensure', json_build_object(
        'qa_run_id', :'qa_run_id',
        'document_tag_read', 'qa-d9r-' || :'qa_run_id',
        'document_tag_write', 'qa-d9w-' || :'qa_run_id',
        'qa_shared', :'org',
        'qa_secondary', :'org_b',
        'H1', :'h1',
        'C1', :'c1',
        'C2', :'c2',
        'G1', :'g1',
        'E1', :'e1',
        'HB', :'hb',
        'CB', :'cb',
        'qa_north', :'qa_north',
        'qa_south', :'qa_south',
        'cb_site', (select a.site_location_id from public.child_enrollment_agreements a where a.id = :'enr_cb'::uuid),
        'enrollments', 3,
        'relationships', 2
    )
)::text as d9_external_fixture_ensure_result;

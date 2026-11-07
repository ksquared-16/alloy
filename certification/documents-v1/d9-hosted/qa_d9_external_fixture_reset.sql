-- Documents D9 hosted HTTP proof — PEOPLE / ENROLLMENT fixture RESET (proposed registered reconciliation
-- qa_d9_external_fixture_reset; pairs with qa_d9_external_fixture_ensure.sql in this directory).
-- PREPARED, NOT RUN, NOT REGISTERED.
--
-- Removes whatever is left of the ensure's rows, by organization and exact id: H1, C1, C2, G1, E1 and their two
-- relationships and two enrollments in QA Shared; HB, CB and CB's enrollment in QA Secondary. Any subset may remain —
-- a run that failed before writing anything, after a product deletion of some subjects, or after a previous partial
-- reset — and each is cleaned the same way; a second reset removes nothing and still succeeds. This is the recovery
-- path for a run that never reached its reset, so it is not limited to the open run's rows: it removes this fixture's
-- ids whatever run seeded them and returns those run ids, so the governed result records whose rows it took.
--
-- DOCUMENTS ARE RESET ELSEWHERE, BY DESIGN (the authz_q1 / R5 pattern). The D9 tagged documents (qa-d9r-<run>,
-- qa-d9w-<run>) leave through the audited document delete the harness runs first (plan D9.1 §6 step 2, D9.2/3 §6.3),
-- which records document_delete_authorized and then removes the stored objects, every version, the subject links and
-- the row. SQL could delete document / document_versions rows but never their stored bytes, and deleting
-- storage.objects rows directly orphans the bytes in the bucket. So this reset deletes no document, version, link or
-- object: it REFUSES while any document still references a fixture subject, and the residue census
-- (d9-residue-census.sql: d9_zr_tagged_documents / d9_zr_tagged_objects / d9w_zr_*) proves the documents are gone.
-- The aged API upload and its Processing case are qa_d9_aged_upload_reset's (not this file).
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; a fixture id exists in
-- an organization other than its own; a d9000000- row in a QA org is not this fixture's (fixture_family marker); a
-- document, a form submission or an Enrollment journey still references a fixture subject.
-- One transaction: after the deletes it asserts the namespace is empty in EVERY organization and raises (rolling
-- everything back) if not.
-- Never touches: documents, document_versions, document_subjects, storage, form rows, process_instances,
-- mutation_events, workflow_events, app installations / credentials, the permanent QA structure (orgs, sites),
-- or any organization other than QA Shared and QA Secondary.
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

select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the D9 external fixture is reset with org = QA Shared; QA Secondary is fixed by the fixture';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

\set org_b 'ad53fee2-2570-460f-9300-f0e106c473b6'
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

-- Whose rows this reset takes (reported, never used to widen or narrow the deletes).
select coalesce((
    select string_agg(distinct r, ',' order by r) from (
        select x.metadata->>'qa_run_id' as r from public.customers x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'h1'::uuid, :'hb'::uuid)
        union all select x.metadata->>'qa_run_id' from public.customer_members x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'c1'::uuid, :'c2'::uuid, :'cb'::uuid)
        union all select x.metadata->>'qa_run_id' from public.persons x where x.org_id = :'org'::uuid and x.id in (:'g1'::uuid, :'e1'::uuid)
        union all select x.metadata->>'qa_run_id' from public.child_enrollment_agreements x where x.org_id in (:'org'::uuid, :'org_b'::uuid) and x.id in (:'enr_c1'::uuid, :'enr_c2'::uuid, :'enr_cb'::uuid)
    ) q where r is not null), '') as removed_run_ids \gset

begin;

delete from public.child_enrollment_agreements
 where org_id = :'org'::uuid
   and id in (:'enr_c1'::uuid, :'enr_c2'::uuid);
\set n_enrollments_a :ROW_COUNT
delete from public.child_enrollment_agreements
 where org_id = :'org_b'::uuid
   and id in (:'enr_cb'::uuid);
\set n_enrollments_b :ROW_COUNT
delete from public.person_child_relationships
 where org_id = :'org'::uuid
   and id in (:'rel_g1'::uuid, :'rel_e1'::uuid);
\set n_relationships :ROW_COUNT
delete from public.customer_members
 where org_id = :'org'::uuid
   and id in (:'c1'::uuid, :'c2'::uuid);
\set n_children_a :ROW_COUNT
delete from public.customer_members
 where org_id = :'org_b'::uuid
   and id in (:'cb'::uuid);
\set n_children_b :ROW_COUNT
delete from public.persons
 where org_id = :'org'::uuid
   and id in (:'g1'::uuid, :'e1'::uuid);
\set n_persons :ROW_COUNT
delete from public.customers
 where org_id = :'org'::uuid
   and id in (:'h1'::uuid);
\set n_households_a :ROW_COUNT
delete from public.customers
 where org_id = :'org_b'::uuid
   and id in (:'hb'::uuid);
\set n_households_b :ROW_COUNT

-- Zero residue, measured inside the same transaction: the reserved namespace is empty in every organization.
select ((select count(*) from public.customers where id::text like 'd9000000-%')
      + (select count(*) from public.customer_members where id::text like 'd9000000-%')
      + (select count(*) from public.persons where id::text like 'd9000000-%')
      + (select count(*) from public.person_child_relationships where id::text like 'd9000000-%')
      + (select count(*) from public.child_enrollment_agreements where id::text like 'd9000000-%')) as d9_fixture_residue \gset
select (:d9_fixture_residue = 0) as d9_fixture_zero \gset
\if :d9_fixture_zero
\else
do $$ begin
  raise exception 'D9 external fixture namespace is not empty after the reset; rolled back';
end $$;
\endif

commit;

select json_build_object(
    'd9_external_fixture_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'removed_run_ids', :'removed_run_ids',
        'child_enrollment_agreements', :n_enrollments_a + :n_enrollments_b,
        'person_child_relationships', :n_relationships,
        'customer_members', :n_children_a + :n_children_b,
        'persons', :n_persons,
        'customers', :n_households_a + :n_households_b,
        'residue', :d9_fixture_residue,
        'documents', 0,
        'storage_objects', 0,
        'audit_rows', 0
    )
)::text as d9_external_fixture_reset_result;

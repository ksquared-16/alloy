-- Documents R5 — SHARED-CHILD subject fixture RESET (QA Shared only; proposed registered reconciliation
-- qa_documents_shared_child_reset, contract certification/qa-shared/documents-r5-shared-child-fixture-contract.json).
--
-- Removes whatever is left of the qa-documents-shared-child-ensure.sql rows, by exact id, after the hosted driver's
-- product teardown (lead deletion normally takes all of them). Any subset may remain — a run that failed part-way
-- after deleting lead A, or after deleting both leads, or before writing anything — and each is cleaned the same
-- way; a second reset removes nothing and still succeeds. This is the recovery path for a run that never reached
-- its reset, so it is not limited to the open run's rows: it removes this fixture's ids whatever run seeded them
-- and returns those run ids, so the governed result records whose rows it took.
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; a fixture id exists in
-- another organization; a fixture-namespace row is not this fixture's (fixture_family marker); a document, a form
-- submission or an Enrollment journey still references a fixture subject.
-- One transaction: after the deletes it asserts the namespace is empty and raises (rolling everything back) if not.
-- Never touches: documents, storage, form rows, person_health_facts, mutation_events, workflow_events,
-- process_instances, the permanent QA structure, QA Secondary or any other organization.
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
  raise exception 'the shared-child fixture is reset in QA Shared only';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

\set household 'ac000000-0000-4000-8000-000000000501'
\set child_shared 'ac000000-0000-4000-8000-000000000521'
\set child_only_a 'ac000000-0000-4000-8000-000000000522'
\set wu_d1 'ac000000-0000-4000-8000-000000000531'
\set lead_a 'ac000000-0000-4000-8000-000000000541'
\set lead_b 'ac000000-0000-4000-8000-000000000542'
\set ocm_a_shared 'ac000000-0000-4000-8000-000000000551'
\set ocm_a_only 'ac000000-0000-4000-8000-000000000552'
\set ocm_b_shared 'ac000000-0000-4000-8000-000000000553'
\set family 'documents_r5_shared_child'

select exists (select 1 from public.customers x where x.id in (:'household'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.customer_members x where x.id in (:'child_shared'::uuid, :'child_only_a'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.work_units x where x.id in (:'wu_d1'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.opportunities x where x.id in (:'lead_a'::uuid, :'lead_b'::uuid) and x.org_id <> :'org'::uuid)
    or exists (select 1 from public.opportunity_customer_members x where x.id in (:'ocm_a_shared'::uuid, :'ocm_a_only'::uuid, :'ocm_b_shared'::uuid) and x.org_id <> :'org'::uuid)
    as shared_child_foreign_org \gset
\if :shared_child_foreign_org
do $$ begin
  raise exception 'a shared-child fixture id exists in another organization; refusing';
end $$;
\endif

select exists (select 1 from public.customers x where x.org_id = :'org'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.customer_members x where x.org_id = :'org'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.work_units x where x.org_id = :'org'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    or exists (select 1 from public.opportunities x where x.org_id = :'org'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> :'family')
    as shared_child_foreign_rows \gset
\if :shared_child_foreign_rows
do $$ begin
  raise exception 'a row in the ac000000- namespace is not a shared-child fixture row; refusing';
end $$;
\endif

select exists (
    select 1 from public.documents d
     where d.org_id = :'org'::uuid
       and d.entity_id in (:'household'::uuid, :'child_shared'::uuid, :'child_only_a'::uuid, :'lead_a'::uuid, :'lead_b'::uuid)
  ) as shared_child_documents_remaining \gset
\if :shared_child_documents_remaining
do $$ begin
  raise exception 'documents are still attached to shared-child fixture subjects; delete them through the audited document delete first';
end $$;
\endif

select exists (
    select 1 from public.form_submissions s
     where s.org_id = :'org'::uuid
       and (s.customer_id = :'household'::uuid
            or s.customer_member_id in (:'child_shared'::uuid, :'child_only_a'::uuid)
            or s.opportunity_id in (:'lead_a'::uuid, :'lead_b'::uuid))
  ) as shared_child_submissions_remaining \gset
\if :shared_child_submissions_remaining
do $$ begin
  raise exception 'form submissions still reference shared-child fixture subjects; remove them through the product or qa_documents_forms_residue_reset first';
end $$;
\endif

select exists (
    select 1 from public.process_instances p
     where (p.subject_type = 'child' and p.subject_id in (:'child_shared'::uuid, :'child_only_a'::uuid))
        or (p.context_type = 'enrollment_participation' and p.context_id in (:'ocm_a_shared'::uuid, :'ocm_a_only'::uuid, :'ocm_b_shared'::uuid))
  ) as shared_child_journey_remaining \gset
\if :shared_child_journey_remaining
do $$ begin
  raise exception 'an Enrollment journey references a shared-child fixture subject; refusing';
end $$;
\endif

-- Whose rows this reset takes (reported, never used to widen or narrow the deletes).
select coalesce((
    select string_agg(distinct r, ',' order by r) from (
        select x.metadata->>'qa_run_id' as r from public.customers x where x.org_id = :'org'::uuid and x.id = :'household'::uuid
        union all select x.metadata->>'qa_run_id' from public.customer_members x where x.org_id = :'org'::uuid and x.id in (:'child_shared'::uuid, :'child_only_a'::uuid)
        union all select x.metadata->>'qa_run_id' from public.work_units x where x.org_id = :'org'::uuid and x.id = :'wu_d1'::uuid
        union all select x.metadata->>'qa_run_id' from public.opportunities x where x.org_id = :'org'::uuid and x.id in (:'lead_a'::uuid, :'lead_b'::uuid)
    ) q where r is not null), '') as removed_run_ids \gset

begin;

delete from public.opportunity_customer_members
 where org_id = :'org'::uuid
   and id in (:'ocm_a_shared'::uuid, :'ocm_a_only'::uuid, :'ocm_b_shared'::uuid);
\set n_participations :ROW_COUNT
delete from public.customer_members
 where org_id = :'org'::uuid
   and id in (:'child_shared'::uuid, :'child_only_a'::uuid);
\set n_children :ROW_COUNT
delete from public.opportunities
 where org_id = :'org'::uuid
   and id in (:'lead_a'::uuid, :'lead_b'::uuid);
\set n_leads :ROW_COUNT
delete from public.work_units
 where org_id = :'org'::uuid
   and id in (:'wu_d1'::uuid);
\set n_work_units :ROW_COUNT
delete from public.customers
 where org_id = :'org'::uuid
   and id in (:'household'::uuid);
\set n_households :ROW_COUNT

-- Zero residue, measured inside the same transaction: the reserved namespace is empty in every organization.
select ((select count(*) from public.customers where id::text like 'ac000000-%')
      + (select count(*) from public.customer_members where id::text like 'ac000000-%')
      + (select count(*) from public.work_units where id::text like 'ac000000-%')
      + (select count(*) from public.opportunities where id::text like 'ac000000-%')
      + (select count(*) from public.opportunity_customer_members where id::text like 'ac000000-%')) as shared_child_residue \gset
select (:shared_child_residue = 0) as shared_child_zero \gset
\if :shared_child_zero
\else
do $$ begin
  raise exception 'shared-child namespace is not empty after the reset; rolled back';
end $$;
\endif

commit;

select json_build_object(
    'shared_child_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'removed_run_ids', :'removed_run_ids',
        'opportunity_customer_members', :n_participations,
        'customer_members', :n_children,
        'opportunities', :n_leads,
        'work_units', :n_work_units,
        'customers', :n_households,
        'residue', :shared_child_residue,
        'person_health_facts', 0,
        'audit_rows', 0
    )
)::text as shared_child_reset_result;

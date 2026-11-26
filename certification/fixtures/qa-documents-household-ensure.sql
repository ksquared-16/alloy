-- Documents V1 D4 — household library SUBJECT fixture ENSURE (QA Shared only).
-- One household with two adults (primary contact + second parent) and two children, plus one enrollment case on
-- the permanent QA D1 work unit's department structure, so the department-restricted persona has an in-scope case.
-- Documents are NOT created here: the hosted driver uploads them through the product API onto these subjects, and
-- removes them through the audited document delete before the reset.
-- Runner owns :org and :qa_run_id. Never assigns them here. Ids use the ab000000- namespace (distinct from the
-- authz_q1 aa000000- subjects, whose ensure/reset never touch these rows).
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
  raise exception 'the household library fixture is seeded in QA Shared only';
end $$;
\endif

\set household 'ab000000-0000-4000-8000-000000000401'
\set adult_1 'ab000000-0000-4000-8000-000000000411'
\set adult_2 'ab000000-0000-4000-8000-000000000412'
\set child_1 'ab000000-0000-4000-8000-000000000421'
\set child_2 'ab000000-0000-4000-8000-000000000422'
\set wu_h 'ab000000-0000-4000-8000-000000000431'
\set case_1 'ab000000-0000-4000-8000-000000000441'

-- A subject may not be re-created while a document is still attached to it (its storage object would be orphaned).
select exists (
    select 1 from public.documents d
     where d.org_id = :'org'::uuid
       and d.entity_id::text like 'ab000000-%'
  ) as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin
  raise exception 'documents are still attached to household fixture subjects; delete them through the audited document delete first';
end $$;
\endif

-- Idempotent: remove prior fixture rows (links before people, the case before its work unit).
delete from public.customer_persons where org_id = :'org'::uuid and customer_id::text like 'ab000000-%';
delete from public.customer_members where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.opportunities where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.work_units where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.persons where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.customers where org_id = :'org'::uuid and id::text like 'ab000000-%';

insert into public.customers (id, org_id, name, status, metadata)
values (:'household'::uuid, :'org'::uuid, 'QA D4 Household', 'active',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'household', 'external_source', 'alloy_qa_fixture'));

insert into public.persons (id, org_id, first_name, last_name, full_name, metadata)
values
  (:'adult_1'::uuid, :'org'::uuid, 'Avery', 'QA-D4', 'Avery QA-D4',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'adult_1', 'external_source', 'alloy_qa_fixture')),
  (:'adult_2'::uuid, :'org'::uuid, 'Blake', 'QA-D4', 'Blake QA-D4',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'adult_2', 'external_source', 'alloy_qa_fixture'));

insert into public.customer_persons (org_id, customer_id, person_id, role_type, is_primary, metadata)
values
  (:'org'::uuid, :'household'::uuid, :'adult_1'::uuid, 'primary_contact', true, jsonb_build_object('qa_run_id', :'qa_run_id')),
  (:'org'::uuid, :'household'::uuid, :'adult_2'::uuid, 'parent', false, jsonb_build_object('qa_run_id', :'qa_run_id'));

insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
values
  (:'child_1'::uuid, :'org'::uuid, :'household'::uuid, 'Casey QA-D4', 'Casey', 'QA-D4', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'child_1', 'external_source', 'alloy_qa_fixture')),
  (:'child_2'::uuid, :'org'::uuid, :'household'::uuid, 'Devon QA-D4', 'Devon', 'QA-D4', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'child_2', 'external_source', 'alloy_qa_fixture'));

-- The case sits on a fixture work unit under the PERMANENT QA D1 department (never created or deleted here).
insert into public.work_units (id, org_id, department_id, key, name, metadata)
values (:'wu_h'::uuid, :'org'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'qa_d4_household_wu', 'QA D4 Household WU (D1)',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'wu_h', 'external_source', 'alloy_qa_fixture'));

insert into public.opportunities (id, org_id, work_unit_id, customer_id, name, title, external_source, external_id, metadata)
values (:'case_1'::uuid, :'org'::uuid, :'wu_h'::uuid, :'household'::uuid, 'QA D4 Household Case', 'QA D4 Household Case',
        'alloy_qa_fixture', 'qa_d4_case1', jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'case_1'));

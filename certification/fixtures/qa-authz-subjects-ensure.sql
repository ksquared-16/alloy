-- Documents authz_q1 — department-linked SUBJECT fixture ENSURE (G1, contract Revision 2 §5).
-- QA Shared:    work unit WU1 in permanent department QA D1 and WU2 in QA D2, one opportunity in each
--               (the in-scope / out-of-scope document subjects for the department-restricted persona).
-- QA Secondary: one fixture department, work unit and opportunity (the cross-organization subject).
-- Runner owns :org and :qa_run_id. Never assigns them here. Ids use the aa000000- fixture namespace.
-- Documents are NOT created here: they are uploaded through the product API onto these subjects.
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

-- Whitelist registered QA orgs only. Evaluated outside dollar quotes, where psql interpolates variables.
select (:'org' in (
    '4acc9386-c485-486f-aa1f-05d83499d142',
    'ad53fee2-2570-460f-9300-f0e106c473b6'
  )) as qa_org_registered \gset
\if :qa_org_registered
\else
do $$ begin
  raise exception 'organization is not a registered QA org';
end $$;
\endif
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset

-- Fixture ids (aa000000- namespace).
\set wu_1 'aa000000-0000-4000-8000-000000000101'
\set wu_2 'aa000000-0000-4000-8000-000000000102'
\set opp_1 'aa000000-0000-4000-8000-000000000111'
\set opp_2 'aa000000-0000-4000-8000-000000000112'
\set dept_x 'aa000000-0000-4000-8000-000000000201'
\set wu_x 'aa000000-0000-4000-8000-000000000202'
\set opp_x 'aa000000-0000-4000-8000-000000000211'

-- A subject may not be re-created while a document is still attached to it: its storage object would
-- be orphaned by the delete below. Documents leave through the audited document delete first.
select exists (
    select 1 from public.documents d
     where d.org_id = :'org'::uuid
       and d.entity_id::text like 'aa000000-%'
  ) as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin
  raise exception 'documents are still attached to QA fixture subjects; delete them through the audited document delete first';
end $$;
\endif

-- Idempotent: remove prior fixture subjects in this org (opportunities before work units, which they
-- reference without ON DELETE; the fixture department last, which cascades its work units).
delete from public.opportunities
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';
delete from public.work_units
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';
delete from public.departments
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';

\if :is_qa_shared
-- QA Shared: subjects under the PERMANENT QA structure departments D1 / D2 (never created or deleted here).
insert into public.work_units (id, org_id, department_id, key, name, metadata)
values
  (:'wu_1'::uuid, :'org'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'qa_authz_wu1', 'QA Authz WU1 (D1)',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'wu1', 'external_source', 'alloy_qa_fixture')),
  (:'wu_2'::uuid, :'org'::uuid, '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid, 'qa_authz_wu2', 'QA Authz WU2 (D2)',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'wu2', 'external_source', 'alloy_qa_fixture'));

insert into public.opportunities (id, org_id, work_unit_id, name, title, external_source, external_id, metadata)
values
  (:'opp_1'::uuid, :'org'::uuid, :'wu_1'::uuid, 'QA Authz Subject D1', 'QA Authz Subject D1', 'alloy_qa_fixture', 'qa_authz_opp1',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'opp1')),
  (:'opp_2'::uuid, :'org'::uuid, :'wu_2'::uuid, 'QA Authz Subject D2', 'QA Authz Subject D2', 'alloy_qa_fixture', 'qa_authz_opp2',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'opp2'));
\else
-- QA Secondary: it has no permanent structure, so the cross-organization subject brings its own.
insert into public.departments (id, org_id, key, name, metadata)
values
  (:'dept_x'::uuid, :'org'::uuid, 'qa_authz_cross_org', 'QA Authz Cross-Org',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'dept_x', 'external_source', 'alloy_qa_fixture'));

insert into public.work_units (id, org_id, department_id, key, name, metadata)
values
  (:'wu_x'::uuid, :'org'::uuid, :'dept_x'::uuid, 'qa_authz_wux', 'QA Authz WU Cross-Org',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'wu_x', 'external_source', 'alloy_qa_fixture'));

insert into public.opportunities (id, org_id, work_unit_id, name, title, external_source, external_id, metadata)
values
  (:'opp_x'::uuid, :'org'::uuid, :'wu_x'::uuid, 'QA Authz Cross-Org Subject', 'QA Authz Cross-Org Subject', 'alloy_qa_fixture', 'qa_authz_oppx',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', 'opp_x'));
\endif

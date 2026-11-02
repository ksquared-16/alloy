-- Documents R5 — SHARED-CHILD subject fixture ENSURE (QA Shared only; proposed registered reconciliation
-- qa_documents_shared_child_ensure, contract certification/qa-shared/documents-r5-shared-child-fixture-contract.json).
--
-- The shape no product route can build (measured on qar_8fb0e1ffabcf: create_lead with an existing household makes a
-- NEW household, and opportunity-customer-members links a child only within the opportunity's own household):
--   one household H with two children, SHARED and ONLY_A, and two leads A and B on H, both on a fixture work unit
--   under the PERMANENT QA D1 department;
--   A carries SHARED and ONLY_A, B carries SHARED: SHARED is the child linked to two leads.
-- Deleting lead A through the product must take ONLY_A and its child-only submissions and keep SHARED, its own
-- submissions, H and lead B. Submissions and documents are NOT created here: the hosted driver writes them through
-- the product API (the run form is keyed qa_<run>_ and leaves through qa_documents_forms_residue_reset).
--
-- Namespace: ac000000- is reserved to this fixture. It is distinct from the authz_q1 subjects (aa000000-, whose
-- ensure/reset delete every aa000000- opportunity and work unit) and the D4 household fixture (ab000000-, which
-- deletes every ab000000- customer and member), so neither of those can reach these rows, and these never reach
-- theirs: every DELETE below names this fixture's exact ids.
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; the permanent
-- QA D1 department is missing; a fixture id exists in another organization; a fixture-namespace row is not this
-- fixture's (fixture_family marker); the rows belong to ANOTHER QA run (reset first: one live tenant at a time);
-- a document, a form submission or an Enrollment journey still references a fixture subject.
-- One transaction (psql ON_ERROR_STOP): a refusal or failure part-way leaves the database as it was.
-- Never touches: documents, storage, form rows, person_health_facts, mutation_events, workflow_events,
-- process_instances, the permanent QA structure, QA Secondary or any other organization.
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
  raise exception 'the shared-child fixture is seeded in QA Shared only';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

-- Fixture ids (ac000000- namespace) and the permanent QA D1 department (never created or deleted here).
\set household 'ac000000-0000-4000-8000-000000000501'
\set child_shared 'ac000000-0000-4000-8000-000000000521'
\set child_only_a 'ac000000-0000-4000-8000-000000000522'
\set wu_d1 'ac000000-0000-4000-8000-000000000531'
\set lead_a 'ac000000-0000-4000-8000-000000000541'
\set lead_b 'ac000000-0000-4000-8000-000000000542'
\set ocm_a_shared 'ac000000-0000-4000-8000-000000000551'
\set ocm_a_only 'ac000000-0000-4000-8000-000000000552'
\set ocm_b_shared 'ac000000-0000-4000-8000-000000000553'
\set dept_d1 '0704e72c-f73d-44b2-87d9-89924e222464'
\set family 'documents_r5_shared_child'

select not exists (
    select 1 from public.departments dp
     where dp.org_id = :'org'::uuid
       and dp.id = :'dept_d1'::uuid
  ) as permanent_d1_missing \gset
\if :permanent_d1_missing
do $$ begin
  raise exception 'the permanent QA D1 department is missing; this fixture never creates QA structure';
end $$;
\endif

-- A fixture id in another organization is not ours to replace (uuid keys are global).
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

-- A row in the reserved namespace that does not carry this fixture's marker is not this fixture's.
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

-- Another QA run's rows: refuse rather than take them over (the reset is the recovery path).
select exists (select 1 from public.customers x where x.org_id = :'org'::uuid and x.id = :'household'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.customer_members x where x.org_id = :'org'::uuid and x.id in (:'child_shared'::uuid, :'child_only_a'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.work_units x where x.org_id = :'org'::uuid and x.id = :'wu_d1'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    or exists (select 1 from public.opportunities x where x.org_id = :'org'::uuid and x.id in (:'lead_a'::uuid, :'lead_b'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> :'qa_run_id')
    as shared_child_other_run \gset
\if :shared_child_other_run
do $$ begin
  raise exception 'the shared-child fixture rows belong to another QA run; apply qa_documents_shared_child_reset first';
end $$;
\endif

-- Documents leave through the audited document delete, never through SQL (their storage objects would be orphaned).
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

-- Form submissions are product data of the run form; they leave with the lead deletion or the Forms residue reset.
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

-- An Enrollment journey retains its child and participation (refuse_delete_under_enrollment_journey); say so first.
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

begin;

-- Idempotent: remove this run's previous fixture rows by exact id (participations, members, leads, work unit, household).
delete from public.opportunity_customer_members
 where org_id = :'org'::uuid
   and id in (:'ocm_a_shared'::uuid, :'ocm_a_only'::uuid, :'ocm_b_shared'::uuid);
delete from public.customer_members
 where org_id = :'org'::uuid
   and id in (:'child_shared'::uuid, :'child_only_a'::uuid);
delete from public.opportunities
 where org_id = :'org'::uuid
   and id in (:'lead_a'::uuid, :'lead_b'::uuid);
delete from public.work_units
 where org_id = :'org'::uuid
   and id in (:'wu_d1'::uuid);
delete from public.customers
 where org_id = :'org'::uuid
   and id in (:'household'::uuid);

insert into public.customers (id, org_id, name, status, metadata)
values (:'household'::uuid, :'org'::uuid, 'QA R5 Shared-Child Household', 'active',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'household', 'external_source', 'alloy_qa_fixture'));

insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
values
  (:'child_shared'::uuid, :'org'::uuid, :'household'::uuid, 'Sam QA-R5', 'Sam', 'QA-R5', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'child_shared', 'external_source', 'alloy_qa_fixture')),
  (:'child_only_a'::uuid, :'org'::uuid, :'household'::uuid, 'Ari QA-R5', 'Ari', 'QA-R5', 'child', true,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'child_only_a', 'external_source', 'alloy_qa_fixture'));

insert into public.work_units (id, org_id, department_id, key, name, metadata)
values (:'wu_d1'::uuid, :'org'::uuid, :'dept_d1'::uuid, 'qa_r5_shared_child_wu', 'QA R5 Shared-Child WU (D1)',
        jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'wu_d1', 'external_source', 'alloy_qa_fixture'));

insert into public.opportunities (id, org_id, work_unit_id, customer_id, name, title, external_source, external_id, metadata)
values
  (:'lead_a'::uuid, :'org'::uuid, :'wu_d1'::uuid, :'household'::uuid, 'QA R5 Lead A', 'QA R5 Lead A', 'alloy_qa_fixture', 'qa_r5_lead_a',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'lead_a')),
  (:'lead_b'::uuid, :'org'::uuid, :'wu_d1'::uuid, :'household'::uuid, 'QA R5 Lead B', 'QA R5 Lead B', 'alloy_qa_fixture', 'qa_r5_lead_b',
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'lead_b'));

insert into public.opportunity_customer_members (id, org_id, opportunity_id, customer_member_id, metadata)
values
  (:'ocm_a_shared'::uuid, :'org'::uuid, :'lead_a'::uuid, :'child_shared'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'ocm_a_shared')),
  (:'ocm_a_only'::uuid, :'org'::uuid, :'lead_a'::uuid, :'child_only_a'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'ocm_a_only')),
  (:'ocm_b_shared'::uuid, :'org'::uuid, :'lead_b'::uuid, :'child_shared'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'ocm_b_shared'));

commit;

select json_build_object(
    'shared_child_ensure', json_build_object(
        'qa_run_id', :'qa_run_id',
        'household', :'household',
        'child_shared', :'child_shared',
        'child_only_a', :'child_only_a',
        'work_unit', :'wu_d1',
        'lead_a', :'lead_a',
        'lead_b', :'lead_b',
        'participations', 3
    )
)::text as shared_child_ensure_result;

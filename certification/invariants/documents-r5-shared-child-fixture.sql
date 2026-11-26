-- Documents R5 — shared-child subject fixture (qa_documents_shared_child_ensure / _reset), rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment (certenv-*):
-- the executor owns the transaction and always discards it. Each fixture statement below is the fixture's statement
-- with its psql variables substituted (org = QA Shared, qa_run_id = 'qar_00000000c5e0', ids = the fixture's \set values); the
-- binding test web/tests/certification/qaDocumentsSharedChildFixture.test.ts proves that, statement by statement.
-- psql meta-commands (\if / \gset) are refused by this harness, so each guard predicate is asserted as a plain
-- condition: false on clean state, true on the state it exists to refuse. Any invariant that fails RAISEs.
DO $$
BEGIN
  -- Isolated environment: QA Shared, its permanent QA D1 department, and UNRELATED rows the fixture must never reach —
  -- an authz_q1 aa000000- subject, a D4 ab000000- household and case, and an ordinary household with a child.
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) THEN
    INSERT INTO public.orgs (id, name, slug) VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ZZ Alloy QA', 'zz-alloy-qa');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) THEN
    INSERT INTO public.orgs (id, name, slug) VALUES ('ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'ZZ Alloy QA — Cross-Org', 'zz-alloy-qa-cross-org');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid) THEN
    INSERT INTO public.departments (id, org_id, key, name, metadata)
    VALUES ('0704e72c-f73d-44b2-87d9-89924e222464'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_d1', 'QA D1', '{"qa_structure": true}'::jsonb);
  END IF;
  INSERT INTO public.work_units (id, org_id, department_id, key, name)
  VALUES ('aa000000-0000-4000-8000-000000000101'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'inv_wu1', 'inv WU1')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.opportunities (id, org_id, work_unit_id, name, title)
  VALUES ('aa000000-0000-4000-8000-000000000111'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'aa000000-0000-4000-8000-000000000101'::uuid, 'inv opp1', 'inv opp1')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.customers (id, org_id, name, status_key) VALUES
    ('ab000000-0000-4000-8000-000000000401'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv D4 household', 'active'),
    ('c5000000-0000-4000-8000-0000000000c1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv unrelated household', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.work_units (id, org_id, department_id, key, name)
  VALUES ('ab000000-0000-4000-8000-000000000431'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'inv_wu_h', 'inv WU H')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.opportunities (id, org_id, work_unit_id, customer_id, name, title)
  VALUES ('ab000000-0000-4000-8000-000000000441'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ab000000-0000-4000-8000-000000000431'::uuid, 'ab000000-0000-4000-8000-000000000401'::uuid, 'inv case', 'inv case')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.customer_members (id, org_id, customer_id, display_name, relationship)
  VALUES ('c5000000-0000-4000-8000-0000000000c2'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'c5000000-0000-4000-8000-0000000000c1'::uuid, 'inv unrelated child', 'child')
  ON CONFLICT (id) DO NOTHING;
  RAISE NOTICE 'SETUP QA Shared, permanent QA D1 and unrelated rows present';
END $$;

-- CASE 1 — on clean state every refusal guard is false and the permanent-structure guard passes.
DO $$
BEGIN
  IF (exists (select 1 from public.customers x where x.id in ('ac000000-0000-4000-8000-000000000501'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.customer_members x where x.id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.work_units x where x.id in ('ac000000-0000-4000-8000-000000000531'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunities x where x.id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunity_customer_members x where x.id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_foreign_org should be false'; END IF;
  IF (exists (select 1 from public.customers x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.customer_members x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.work_units x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.opportunities x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_foreign_rows should be false'; END IF;
  IF (exists (select 1 from public.customers x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id = 'ac000000-0000-4000-8000-000000000501'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e0')
    or exists (select 1 from public.customer_members x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e0')
    or exists (select 1 from public.work_units x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id = 'ac000000-0000-4000-8000-000000000531'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e0')
    or exists (select 1 from public.opportunities x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e0')) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_other_run should be false'; END IF;
  IF (exists (
    select 1 from public.documents d
     where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and d.entity_id in ('ac000000-0000-4000-8000-000000000501'::uuid, 'ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid, 'ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_documents_remaining should be false'; END IF;
  IF (exists (
    select 1 from public.form_submissions s
     where s.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and (s.customer_id = 'ac000000-0000-4000-8000-000000000501'::uuid
            or s.customer_member_id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid)
            or s.opportunity_id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_submissions_remaining should be false'; END IF;
  IF (exists (
    select 1 from public.process_instances p
     where (p.subject_type = 'child' and p.subject_id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid))
        or (p.context_type = 'enrollment_participation' and p.context_id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard shared_child_journey_remaining should be false'; END IF;
  IF (not exists (
    select 1 from public.departments dp
     where dp.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and dp.id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard permanent_d1_missing should be false'; END IF;
  RAISE NOTICE 'CASE 1 PASS clean state: no ensure guard fires';
END $$;

-- CASE 2 — ENSURE twice (idempotent): H, SHARED + ONLY_A, WU in QA D1, leads A and B on H, SHARED on both leads.
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..2 LOOP
    delete from public.opportunity_customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid);
    delete from public.opportunities
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid);
    delete from public.work_units
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000531'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000501'::uuid);
    insert into public.customers (id, org_id, name, status_key, metadata)
    values ('ac000000-0000-4000-8000-000000000501'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'QA R5 Shared-Child Household', 'active',
            jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'household', 'external_source', 'alloy_qa_fixture'));
    insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
    values
      ('ac000000-0000-4000-8000-000000000521'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000501'::uuid, 'Sam QA-R5', 'Sam', 'QA-R5', 'child', true,
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'child_shared', 'external_source', 'alloy_qa_fixture')),
      ('ac000000-0000-4000-8000-000000000522'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000501'::uuid, 'Ari QA-R5', 'Ari', 'QA-R5', 'child', true,
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'child_only_a', 'external_source', 'alloy_qa_fixture'));
    insert into public.work_units (id, org_id, department_id, key, name, metadata)
    values ('ac000000-0000-4000-8000-000000000531'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'qa_r5_shared_child_wu', 'QA R5 Shared-Child WU (D1)',
            jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'wu_d1', 'external_source', 'alloy_qa_fixture'));
    insert into public.opportunities (id, org_id, work_unit_id, customer_id, name, title, external_source, external_id, metadata)
    values
      ('ac000000-0000-4000-8000-000000000541'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000531'::uuid, 'ac000000-0000-4000-8000-000000000501'::uuid, 'QA R5 Lead A', 'QA R5 Lead A', 'alloy_qa_fixture', 'qa_r5_lead_a',
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'lead_a')),
      ('ac000000-0000-4000-8000-000000000542'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000531'::uuid, 'ac000000-0000-4000-8000-000000000501'::uuid, 'QA R5 Lead B', 'QA R5 Lead B', 'alloy_qa_fixture', 'qa_r5_lead_b',
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'lead_b'));
    insert into public.opportunity_customer_members (id, org_id, opportunity_id, customer_member_id, metadata)
    values
      ('ac000000-0000-4000-8000-000000000551'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000521'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'ocm_a_shared')),
      ('ac000000-0000-4000-8000-000000000552'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'ocm_a_only')),
      ('ac000000-0000-4000-8000-000000000553'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid, 'ac000000-0000-4000-8000-000000000521'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000c5e0', 'fixture_family', 'documents_r5_shared_child', 'fixture_key', 'ocm_b_shared'));
  END LOOP;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.work_units WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunities WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunity_customer_members WHERE id::text like 'ac000000-%')) <> 9 THEN RAISE EXCEPTION 'CASE 2 FAILED: expected 9 fixture rows'; END IF;
  IF (SELECT count(*) FROM public.opportunity_customer_members WHERE customer_member_id = 'ac000000-0000-4000-8000-000000000521'::uuid) <> 2 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: SHARED is not on two leads'; END IF;
  IF (SELECT count(*) FROM public.opportunities o JOIN public.work_units w ON w.id = o.work_unit_id
       WHERE o.id::text like 'ac000000-%' AND o.customer_id = 'ac000000-0000-4000-8000-000000000501'::uuid
         AND w.department_id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid) <> 2 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: leads are not both on H in QA D1'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities WHERE id::text like 'ac000000-%' AND opportunity_number IS NULL) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: record number not assigned'; END IF;
  IF (SELECT count(*) FROM public.opportunities WHERE id IN ('aa000000-0000-4000-8000-000000000111'::uuid, 'ab000000-0000-4000-8000-000000000441'::uuid)) <> 2
     OR (SELECT count(*) FROM public.customers WHERE id IN ('ab000000-0000-4000-8000-000000000401'::uuid, 'c5000000-0000-4000-8000-0000000000c1'::uuid)) <> 2
     OR (SELECT count(*) FROM public.customer_members WHERE id = 'c5000000-0000-4000-8000-0000000000c2'::uuid) <> 1
     OR (SELECT count(*) FROM public.departments WHERE id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid) <> 1 THEN
    RAISE EXCEPTION 'CASE % FAILED: an unrelated row was touched', '2'; END IF;
  RAISE NOTICE 'CASE 2 PASS ensure: 9 rows, SHARED on two leads, idempotent over two runs, unrelated rows untouched';
END $$;

-- CASE 3 — each refusal guard is TRUE on the state it refuses (ensure and reset share the predicates).
DO $$
BEGIN
  -- another QA run owns the rows: the ensure refuses to take them over
  IF NOT (exists (select 1 from public.customers x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id = 'ac000000-0000-4000-8000-000000000501'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e1')
    or exists (select 1 from public.customer_members x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e1')
    or exists (select 1 from public.work_units x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id = 'ac000000-0000-4000-8000-000000000531'::uuid and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e1')
    or exists (select 1 from public.opportunities x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000c5e1')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_other_run should be true'; END IF;
  -- a form submission still names a fixture child
  INSERT INTO public.form_definitions (id, org_id, key, name, kind) VALUES ('c5000000-0000-4000-8000-0000000000f1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv_r5_form', 'inv r5 form', 'center');
  INSERT INTO public.form_definition_versions (id, org_id, form_definition_id, version_number, status, schema_json)
  VALUES ('c5000000-0000-4000-8000-0000000000f2'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'c5000000-0000-4000-8000-0000000000f1'::uuid, 1, 'draft', '{}'::jsonb);
  INSERT INTO public.form_submissions (id, org_id, form_definition_id, form_definition_version_id, customer_member_id, status, payload)
  VALUES ('c5000000-0000-4000-8000-0000000000f3'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'c5000000-0000-4000-8000-0000000000f1'::uuid, 'c5000000-0000-4000-8000-0000000000f2'::uuid,
          'ac000000-0000-4000-8000-000000000522'::uuid, 'draft', '{}'::jsonb);
  IF NOT (exists (
    select 1 from public.form_submissions s
     where s.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and (s.customer_id = 'ac000000-0000-4000-8000-000000000501'::uuid
            or s.customer_member_id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid)
            or s.opportunity_id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_submissions_remaining should be true'; END IF;
  DELETE FROM public.form_submissions WHERE id = 'c5000000-0000-4000-8000-0000000000f3'::uuid;
  -- a row in the reserved namespace that is not this fixture's
  UPDATE public.customers SET metadata = metadata - 'fixture_family' WHERE id = 'ac000000-0000-4000-8000-000000000501'::uuid;
  IF NOT (exists (select 1 from public.customers x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.customer_members x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.work_units x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.opportunities x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_foreign_rows should be true'; END IF;
  UPDATE public.customers SET metadata = metadata || '{"fixture_family": "documents_r5_shared_child"}'::jsonb WHERE id = 'ac000000-0000-4000-8000-000000000501'::uuid;
  IF (exists (select 1 from public.customers x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.customer_members x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.work_units x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')
    or exists (select 1 from public.opportunities x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id::text like 'ac000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_r5_shared_child')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_foreign_rows (restored) should be false'; END IF;
  IF (exists (
    select 1 from public.documents d
     where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and d.entity_id in ('ac000000-0000-4000-8000-000000000501'::uuid, 'ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid, 'ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_documents_remaining should be false'; END IF;
  IF (exists (
    select 1 from public.process_instances p
     where (p.subject_type = 'child' and p.subject_id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid))
        or (p.context_type = 'enrollment_participation' and p.context_id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_journey_remaining should be false'; END IF;
  IF (exists (select 1 from public.customers x where x.id in ('ac000000-0000-4000-8000-000000000501'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.customer_members x where x.id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.work_units x where x.id in ('ac000000-0000-4000-8000-000000000531'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunities x where x.id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunity_customer_members x where x.id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard shared_child_foreign_org should be false'; END IF;
  RAISE NOTICE 'CASE 3 PASS guards: other run, bound submission and foreign namespace row each refuse; clean again after';
END $$;

-- CASE 4 — PARTIAL product teardown (lead A deleted the way the product does it: its participations, ONLY_A, the lead),
-- then RESET twice: the namespace is empty, the second reset removes nothing, unrelated rows are untouched.
DO $$
DECLARE i int;
BEGIN
  DELETE FROM public.opportunity_customer_members WHERE opportunity_id = 'ac000000-0000-4000-8000-000000000541'::uuid;
  DELETE FROM public.customer_members WHERE id = 'ac000000-0000-4000-8000-000000000522'::uuid;
  DELETE FROM public.opportunities WHERE id = 'ac000000-0000-4000-8000-000000000541'::uuid;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.work_units WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunities WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunity_customer_members WHERE id::text like 'ac000000-%')) <> 5 THEN RAISE EXCEPTION 'CASE 4 FAILED: partial state is not 5 rows'; END IF;
  FOR i IN 1..2 LOOP
    delete from public.opportunity_customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid);
    delete from public.opportunities
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid);
    delete from public.work_units
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000531'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000501'::uuid);
  END LOOP;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.work_units WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunities WHERE id::text like 'ac000000-%')
       + (SELECT count(*) FROM public.opportunity_customer_members WHERE id::text like 'ac000000-%')) <> 0 THEN RAISE EXCEPTION 'CASE 4 FAILED: residue after reset'; END IF;
  IF (SELECT count(*) FROM public.opportunities WHERE id IN ('aa000000-0000-4000-8000-000000000111'::uuid, 'ab000000-0000-4000-8000-000000000441'::uuid)) <> 2
     OR (SELECT count(*) FROM public.customers WHERE id IN ('ab000000-0000-4000-8000-000000000401'::uuid, 'c5000000-0000-4000-8000-0000000000c1'::uuid)) <> 2
     OR (SELECT count(*) FROM public.customer_members WHERE id = 'c5000000-0000-4000-8000-0000000000c2'::uuid) <> 1
     OR (SELECT count(*) FROM public.departments WHERE id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid) <> 1 THEN
    RAISE EXCEPTION 'CASE % FAILED: an unrelated row was touched', '4'; END IF;
  RAISE NOTICE 'CASE 4 PASS reset after a partial teardown: zero residue, idempotent, unrelated rows untouched';
END $$;

-- CASE 5 — a fixture id in ANOTHER organization is refused (the reset never reaches it: every delete names the org).
DO $$
BEGIN
  INSERT INTO public.customers (id, org_id, name, status_key)
  VALUES ('ac000000-0000-4000-8000-000000000501'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'inv foreign', 'active');
  IF NOT (exists (select 1 from public.customers x where x.id in ('ac000000-0000-4000-8000-000000000501'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.customer_members x where x.id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.work_units x where x.id in ('ac000000-0000-4000-8000-000000000531'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunities x where x.id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.opportunity_customer_members x where x.id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)) THEN RAISE EXCEPTION 'CASE 5 FAILED: guard shared_child_foreign_org should be true'; END IF;
    delete from public.opportunity_customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000551'::uuid, 'ac000000-0000-4000-8000-000000000552'::uuid, 'ac000000-0000-4000-8000-000000000553'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000521'::uuid, 'ac000000-0000-4000-8000-000000000522'::uuid);
    delete from public.opportunities
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000541'::uuid, 'ac000000-0000-4000-8000-000000000542'::uuid);
    delete from public.work_units
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000531'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('ac000000-0000-4000-8000-000000000501'::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = 'ac000000-0000-4000-8000-000000000501'::uuid AND org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) THEN
    RAISE EXCEPTION 'CASE 5 FAILED: the reset reached another organization'; END IF;
  RAISE NOTICE 'CASE 5 PASS another organization: refused by the guard, and out of reach of every delete';
END $$;

-- Documents Q1 G1 — department-linked subject fixtures and vendor fixtures, rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment
-- (certenv-*): the executor owns the transaction and always discards it.
-- Each fixture statement below is the registered fixture's statement with its psql variables substituted
-- (org = the QA org literal, qa_run_id = 'qar_invariant0001', ids = the fixture's \set values); the
-- binding test web/tests/certification/qaAuthzFixtureInvariantBinding.test.ts proves that, statement by
-- statement. psql meta-commands (\if / \gset) are refused by this harness, so their guarded predicates
-- are asserted here as plain queries. Any invariant that does not hold RAISEs (ASSERTION_FAILED).
DO $$
BEGIN
  -- The isolated environment carries no hosted data: create the two frozen QA orgs and QA Shared's
  -- permanent structure (QA D1 / QA D2) exactly as ensureSharedQaTenant does, inside this transaction.
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
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid) THEN
    INSERT INTO public.departments (id, org_id, key, name, metadata)
    VALUES ('609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_d2', 'QA D2', '{"qa_structure": true}'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendor_statuses WHERE key = 'active') THEN
    INSERT INTO public.vendor_statuses (key, label) VALUES ('active', 'Active');
  END IF;
  RAISE NOTICE 'SETUP QA orgs and permanent structure present';
END $$;

-- CASE 1 — QA Shared subject ENSURE (run twice: idempotent).
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..2 LOOP
    delete from public.opportunities
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id::text like 'aa000000-%';
    delete from public.work_units
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id::text like 'aa000000-%';
    delete from public.departments
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id::text like 'aa000000-%';
    insert into public.work_units (id, org_id, department_id, key, name, metadata)
    values
      ('aa000000-0000-4000-8000-000000000101'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'qa_authz_wu1', 'QA Authz WU1 (D1)',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'wu1', 'external_source', 'alloy_qa_fixture')),
      ('aa000000-0000-4000-8000-000000000102'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid, 'qa_authz_wu2', 'QA Authz WU2 (D2)',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'wu2', 'external_source', 'alloy_qa_fixture'));
    insert into public.opportunities (id, org_id, work_unit_id, name, title, external_source, external_id, metadata)
    values
      ('aa000000-0000-4000-8000-000000000111'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'aa000000-0000-4000-8000-000000000101'::uuid, 'QA Authz Subject D1', 'QA Authz Subject D1', 'alloy_qa_fixture', 'qa_authz_opp1',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'opp1')),
      ('aa000000-0000-4000-8000-000000000112'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'aa000000-0000-4000-8000-000000000102'::uuid, 'QA Authz Subject D2', 'QA Authz Subject D2', 'alloy_qa_fixture', 'qa_authz_opp2',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'opp2'));
  END LOOP;
  IF (SELECT count(*) FROM public.work_units WHERE id::text like 'aa000000-%' AND org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) <> 2 THEN RAISE EXCEPTION 'CASE 1 FAILED: work unit count'; END IF;
  IF (SELECT count(*) FROM public.opportunities WHERE id::text like 'aa000000-%' AND org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) <> 2 THEN RAISE EXCEPTION 'CASE 1 FAILED: opportunity count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.opportunities o JOIN public.work_units w ON w.id = o.work_unit_id
                  WHERE o.id = 'aa000000-0000-4000-8000-000000000111'::uuid AND w.department_id = '0704e72c-f73d-44b2-87d9-89924e222464'::uuid) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: OPP1 is not in QA D1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.opportunities o JOIN public.work_units w ON w.id = o.work_unit_id
                  WHERE o.id = 'aa000000-0000-4000-8000-000000000112'::uuid AND w.department_id = '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: OPP2 is not in QA D2'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities WHERE id::text like 'aa000000-%' AND opportunity_number IS NULL) THEN RAISE EXCEPTION 'CASE 1 FAILED: record number not assigned'; END IF;
  IF (SELECT count(*) FROM public.departments WHERE id IN ('0704e72c-f73d-44b2-87d9-89924e222464'::uuid, '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid)) <> 2 THEN RAISE EXCEPTION 'CASE 1 FAILED: permanent structure touched'; END IF;
  RAISE NOTICE 'CASE 1 PASS QA Shared subjects: WU1/OPP1 in QA D1, WU2/OPP2 in QA D2, idempotent over two ensures, structure intact';
END $$;

-- CASE 2 — QA Secondary cross-organization subject ENSURE (run twice: idempotent).
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..2 LOOP
    delete from public.opportunities
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id::text like 'aa000000-%';
    delete from public.work_units
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id::text like 'aa000000-%';
    delete from public.departments
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id::text like 'aa000000-%';
    insert into public.departments (id, org_id, key, name, metadata)
    values
      ('aa000000-0000-4000-8000-000000000201'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'qa_authz_cross_org', 'QA Authz Cross-Org',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'dept_x', 'external_source', 'alloy_qa_fixture'));
    insert into public.work_units (id, org_id, department_id, key, name, metadata)
    values
      ('aa000000-0000-4000-8000-000000000202'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'aa000000-0000-4000-8000-000000000201'::uuid, 'qa_authz_wux', 'QA Authz WU Cross-Org',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'wu_x', 'external_source', 'alloy_qa_fixture'));
    insert into public.opportunities (id, org_id, work_unit_id, name, title, external_source, external_id, metadata)
    values
      ('aa000000-0000-4000-8000-000000000211'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'aa000000-0000-4000-8000-000000000202'::uuid, 'QA Authz Cross-Org Subject', 'QA Authz Cross-Org Subject', 'alloy_qa_fixture', 'qa_authz_oppx',
       jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', 'opp_x'));
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.opportunities o JOIN public.work_units w ON w.id = o.work_unit_id JOIN public.departments d ON d.id = w.department_id
                  WHERE o.id = 'aa000000-0000-4000-8000-000000000211'::uuid AND o.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid AND d.org_id = o.org_id) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: cross-org subject chain not in QA Secondary'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities WHERE id = 'aa000000-0000-4000-8000-000000000211'::uuid AND org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: cross-org subject leaked into QA Shared'; END IF;
  RAISE NOTICE 'CASE 2 PASS QA Secondary subject: department, work unit and opportunity in QA Secondary only, idempotent';
END $$;

-- CASE 3 — the work-unit org integrity trigger refuses a subject pointing across organizations.
DO $$
DECLARE v_msg text := '';
BEGIN
  BEGIN
    INSERT INTO public.opportunities (id, org_id, work_unit_id, name)
    VALUES ('aa000000-0000-4000-8000-0000000003ff'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'aa000000-0000-4000-8000-000000000202'::uuid, 'cross-org misbinding');
    v_msg := 'inserted';
  EXCEPTION WHEN OTHERS THEN v_msg := 'refused';
  END;
  IF v_msg <> 'refused' THEN RAISE EXCEPTION 'CASE 3 FAILED: a QA Shared opportunity bound to a QA Secondary work unit was accepted'; END IF;
  RAISE NOTICE 'CASE 3 PASS cross-organization subject binding refused by the work-unit integrity trigger';
END $$;

-- CASE 4 — the subject reset REFUSES while a document is attached (its storage object would be orphaned).
DO $$
DECLARE v_attached boolean;
BEGIN
  INSERT INTO public.documents (org_id, entity_type, entity_id, title, original_filename, bucket, storage_path)
  VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
          'qa-authz-qar_invariant0001 in-scope', 'qa-authz-qar_invariant0001.pdf', 'org_documents',
          '4acc9386-c485-486f-aa1f-05d83499d142/opportunity/aa000000-0000-4000-8000-000000000111/x-qa-authz-qar_invariant0001.pdf');
  SELECT exists (
    select 1 from public.documents d
     where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and d.entity_id::text like 'aa000000-%'
  ) INTO v_attached;
  IF NOT v_attached THEN RAISE EXCEPTION 'CASE 4 FAILED: the reset guard did not see the attached document'; END IF;
  DELETE FROM public.documents WHERE org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid AND entity_id = 'aa000000-0000-4000-8000-000000000111'::uuid;
  SELECT exists (
    select 1 from public.documents d
     where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and d.entity_id::text like 'aa000000-%'
  ) INTO v_attached;
  IF v_attached THEN RAISE EXCEPTION 'CASE 4 FAILED: guard still true after the document left'; END IF;
  RAISE NOTICE 'CASE 4 PASS subject reset guard: true while a document is attached (reset refuses), false once it is deleted';
END $$;

-- CASE 5 — subject RESET removes every aa000000- subject, in both orgs, in FK order; structure survives.
DO $$
BEGIN
  delete from public.opportunities
   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
     and id::text like 'aa000000-%';
  delete from public.work_units
   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
     and id::text like 'aa000000-%';
  delete from public.departments
   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
     and id::text like 'aa000000-%';
  delete from public.opportunities
   where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
     and id::text like 'aa000000-%';
  delete from public.work_units
   where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
     and id::text like 'aa000000-%';
  delete from public.departments
   where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
     and id::text like 'aa000000-%';
  IF EXISTS (SELECT 1 FROM public.opportunities WHERE id::text like 'aa000000-%')
     OR EXISTS (SELECT 1 FROM public.work_units WHERE id::text like 'aa000000-%')
     OR EXISTS (SELECT 1 FROM public.departments WHERE id::text like 'aa000000-%') THEN
    RAISE EXCEPTION 'CASE 5 FAILED: subject residue after reset'; END IF;
  IF (SELECT count(*) FROM public.departments WHERE id IN ('0704e72c-f73d-44b2-87d9-89924e222464'::uuid, '609d088b-0446-4a7f-b529-f971fb5d73c8'::uuid)) <> 2 THEN
    RAISE EXCEPTION 'CASE 5 FAILED: reset removed permanent QA structure'; END IF;
  RAISE NOTICE 'CASE 5 PASS subject reset: zero aa000000- subjects in both orgs; QA D1/D2 retained';
END $$;

-- CASE 6 — vendor ENSURE (corrected bytes) and RESET, including the attached-document refusal.
DO $$
DECLARE v_attached boolean;
BEGIN
  delete from public.vendors
   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
     and id in ('aa000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid);
  insert into public.vendors (
    id, org_id, name, status, status_key, vendor_status_id,
    external_source, external_id, metadata
  )
  select
    v.id,
    '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
    v.name,
    vs.key,
    vs.key,
    vs.id,
    'alloy_qa_fixture',
    v.external_id,
    jsonb_build_object('qa_run_id', 'qar_invariant0001', 'fixture_key', v.fixture_key)
  from (
    values
      ('aa000000-0000-4000-8000-000000000001'::uuid, 'QA Vendor V1', 'qa_authz_v1', 'v1'),
      ('aa000000-0000-4000-8000-000000000002'::uuid, 'QA Vendor V2', 'qa_authz_v2', 'v2')
  ) as v(id, name, external_id, fixture_key)
  cross join lateral (
    select id, key from public.vendor_statuses where key = 'active' limit 1
  ) vs;
  IF (SELECT count(*) FROM public.vendors WHERE id::text like 'aa000000-%') <> 2 THEN RAISE EXCEPTION 'CASE 6 FAILED: vendor ensure'; END IF;
  INSERT INTO public.documents (org_id, entity_type, entity_id, title, original_filename, bucket, storage_path)
  VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'vendor', 'aa000000-0000-4000-8000-000000000001'::uuid,
          'qa-authz-qar_invariant0001 vendor', 'qa-authz-qar_invariant0001.png', 'org_documents',
          '4acc9386-c485-486f-aa1f-05d83499d142/vendor/aa000000-0000-4000-8000-000000000001/x-qa-authz-qar_invariant0001.png');
  SELECT exists (
      select 1 from public.documents d
       where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
         and d.entity_type in ('vendor', 'vendors')
         and d.entity_id::text like 'aa000000-%'
    ) INTO v_attached;
  IF NOT v_attached THEN RAISE EXCEPTION 'CASE 6 FAILED: vendor reset guard did not see the attached document'; END IF;
  DELETE FROM public.documents WHERE entity_id = 'aa000000-0000-4000-8000-000000000001'::uuid;
  delete from public.vendors
   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
     and external_source = 'alloy_qa_fixture'
     and (
       metadata ->> 'qa_run_id' = 'qar_invariant0001'
       or id in ('aa000000-0000-4000-8000-000000000001'::uuid, 'aa000000-0000-4000-8000-000000000002'::uuid)
     );
  IF EXISTS (SELECT 1 FROM public.vendors WHERE id::text like 'aa000000-%') THEN RAISE EXCEPTION 'CASE 6 FAILED: vendor residue after reset'; END IF;
  RAISE NOTICE 'CASE 6 PASS vendors: ensure creates V1/V2; reset guard true while a document is attached; reset leaves zero';
END $$;

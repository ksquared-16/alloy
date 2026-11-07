-- Documents D9 hosted proof — people / enrollment fixture (qa_d9_external_fixture_ensure / _reset), rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment (certenv-*):
-- the executor owns the transaction and always discards it. Each fixture statement below is the fixture's statement
-- (certification/documents-v1/d9-hosted/qa_d9_external_fixture_*.sql) with its psql variables substituted
-- (org = QA Shared, org_b = QA Secondary, qa_run_id = 'qar_00000000d9e0', ids = the fixture's \set values); the binding
-- test web/tests/certification/qaD9ExternalFixture.test.ts proves that, statement by statement.
-- psql meta-commands (\if / \gset) are refused by this harness, so each guard predicate is asserted as a plain
-- condition: false on clean state, true on the state it exists to refuse. Any invariant that fails RAISEs.
DO $$
BEGIN
  -- Isolated environment: both QA orgs, the permanent QA North / QA South sites, a QA Secondary site, a THIRD
  -- organization, and UNRELATED people the fixture must never reach (e9000000-): in QA Shared a household, child,
  -- enrollment at QA North, parent and relationship; in QA Secondary a household, child and enrollment; in the third
  -- organization a household.
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) THEN
    INSERT INTO public.orgs (id, name, slug) VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ZZ Alloy QA', 'zz-alloy-qa');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) THEN
    INSERT INTO public.orgs (id, name, slug) VALUES ('ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'ZZ Alloy QA — Cross-Org', 'zz-alloy-qa-cross-org');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = 'e9000000-0000-4000-8000-0000000000a0'::uuid) THEN
    INSERT INTO public.orgs (id, name, slug) VALUES ('e9000000-0000-4000-8000-0000000000a0'::uuid, 'ZZ D9 invariant other org', 'zz-d9-invariant-other-org');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid) THEN
    INSERT INTO public.locations (id, org_id, label, location_type)
    VALUES ('21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'QA North', 'site');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid) THEN
    INSERT INTO public.locations (id, org_id, label, location_type)
    VALUES ('cfb73302-3bbe-49db-b173-876fda776a6d'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'QA South', 'site');
  END IF;
  -- The registered QA structure row qa_secondary_site, exactly as the QA structure ensure creates it (the fixture never does).
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = '4f89f324-dbc5-4815-8431-38ffec891398'::uuid) THEN
    INSERT INTO public.locations (id, org_id, label, location_type, is_active, external_source, metadata)
    VALUES ('4f89f324-dbc5-4815-8431-38ffec891398'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'ZZ Alloy QA — Cross-Org Site', 'site', true, 'alloy_qa_structure', '{"qa_structure": true}'::jsonb);
  END IF;
  INSERT INTO public.customers (id, org_id, name, status_key) VALUES
    ('e9000000-0000-4000-8000-0000000000c1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv unrelated household', 'active'),
    ('e9000000-0000-4000-8000-0000000000d1'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'inv unrelated household B', 'active'),
    ('e9000000-0000-4000-8000-0000000000a1'::uuid, 'e9000000-0000-4000-8000-0000000000a0'::uuid, 'inv other-org household', 'active');
  INSERT INTO public.customer_members (id, org_id, customer_id, display_name, relationship) VALUES
    ('e9000000-0000-4000-8000-0000000000c2'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'e9000000-0000-4000-8000-0000000000c1'::uuid, 'inv unrelated child', 'child'),
    ('e9000000-0000-4000-8000-0000000000d2'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'e9000000-0000-4000-8000-0000000000d1'::uuid, 'inv unrelated child B', 'child');
  INSERT INTO public.persons (id, org_id, first_name, last_name)
  VALUES ('e9000000-0000-4000-8000-0000000000c4'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv', 'unrelated parent');
  INSERT INTO public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, status)
  VALUES ('e9000000-0000-4000-8000-0000000000c5'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'e9000000-0000-4000-8000-0000000000c1'::uuid,
          'e9000000-0000-4000-8000-0000000000c2'::uuid, 'e9000000-0000-4000-8000-0000000000c4'::uuid, 'parent', 'active');
  INSERT INTO public.child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key) VALUES
    ('e9000000-0000-4000-8000-0000000000c3'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'e9000000-0000-4000-8000-0000000000c2'::uuid,
     'e9000000-0000-4000-8000-0000000000c1'::uuid, '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'active', current_date, 'inv'),
    ('e9000000-0000-4000-8000-0000000000d3'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'e9000000-0000-4000-8000-0000000000d2'::uuid,
     'e9000000-0000-4000-8000-0000000000d1'::uuid,
     '4f89f324-dbc5-4815-8431-38ffec891398'::uuid,
     'active', current_date, 'inv');
  RAISE NOTICE 'SETUP QA orgs, QA sites, a third organization and unrelated people present';
END $$;

-- CASE 1 — on clean state every refusal guard is false and both structure guards pass.
DO $$
BEGIN
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.persons WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.person_child_relationships WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.child_enrollment_agreements WHERE id::text like 'd9000000-%')) <> 0 THEN RAISE EXCEPTION 'CASE 1 FAILED: the d9000000- namespace is not empty'; END IF;
  IF (exists (select 1 from public.customers x where (x.id = 'd9000000-0000-4000-8000-000000000101'::uuid and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000201'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.customer_members x where (x.id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000221'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.persons x where x.id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.person_child_relationships x where x.id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.child_enrollment_agreements x where (x.id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000241'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_foreign_org should be false'; END IF;
  IF (exists (select 1 from public.customers x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.customer_members x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.persons x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.person_child_relationships x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_foreign_rows should be false'; END IF;
  IF (exists (select 1 from public.customers x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e0')
    or exists (select 1 from public.customer_members x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e0')
    or exists (select 1 from public.persons x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e0')
    or exists (select 1 from public.person_child_relationships x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e0')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid, 'd9000000-0000-4000-8000-000000000241'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e0')) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_other_run should be false'; END IF;
  IF (exists (
    select 1 from public.documents d
     where d.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and d.entity_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )
    or exists (
    select 1 from public.document_subjects s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and s.subject_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_documents_remaining should be false'; END IF;
  IF (exists (
    select 1 from public.form_submissions s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and (s.customer_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid)
            or s.customer_member_id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_submissions_remaining should be false'; END IF;
  IF (exists (
    select 1 from public.process_instances p
     where p.subject_type = 'child'
       and p.subject_id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_journey_remaining should be false'; END IF;
  IF (not exists (
    select 1 from public.locations l
     where l.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and l.id in ('21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid)
       and l.location_type = 'site'
    having count(*) = 2
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_permanent_sites_missing should be false'; END IF;
  IF (not exists (
    select 1 from public.locations l
     where l.id = '4f89f324-dbc5-4815-8431-38ffec891398'::uuid
       and l.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and l.location_type = 'site'
       and l.is_active
  )) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard d9_secondary_site_missing should be false'; END IF;
  RAISE NOTICE 'CASE 1 PASS clean state: no ensure guard fires';
END $$;

-- CASE 2 — ENSURE twice (idempotent): 12 rows; C1 visible at QA North, C2 only at QA South, H1 an anchor, G1 a parent
-- and E1 only an emergency contact of C1, CB visible in QA Secondary only; unrelated rows untouched.
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..2 LOOP
    delete from public.child_enrollment_agreements
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid);
    delete from public.child_enrollment_agreements
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000241'::uuid);
    delete from public.person_child_relationships
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid);
    delete from public.customer_members
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000221'::uuid);
    delete from public.persons
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000101'::uuid);
    delete from public.customers
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000201'::uuid);
    insert into public.customers (id, org_id, name, status_key, metadata)
    values
      ('d9000000-0000-4000-8000-000000000101'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'QA D9 Household', 'active',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'H1', 'external_source', 'alloy_qa_fixture')),
      ('d9000000-0000-4000-8000-000000000201'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'QA D9 Household B', 'active',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'HB', 'external_source', 'alloy_qa_fixture'));
    insert into public.persons (id, org_id, first_name, last_name, full_name, metadata)
    values
      ('d9000000-0000-4000-8000-000000000111'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'Gale', 'QA-D9', 'Gale QA-D9',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'G1', 'external_source', 'alloy_qa_fixture')),
      ('d9000000-0000-4000-8000-000000000112'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'Emery', 'QA-D9', 'Emery QA-D9',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'E1', 'external_source', 'alloy_qa_fixture'));
    insert into public.customer_members (id, org_id, customer_id, display_name, first_name, last_name, relationship, is_active, metadata)
    values
      ('d9000000-0000-4000-8000-000000000121'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, 'Cass QA-D9', 'Cass', 'QA-D9', 'child', true,
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'C1', 'external_source', 'alloy_qa_fixture')),
      ('d9000000-0000-4000-8000-000000000122'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, 'Dale QA-D9', 'Dale', 'QA-D9', 'child', true,
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'C2', 'external_source', 'alloy_qa_fixture')),
      ('d9000000-0000-4000-8000-000000000221'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'Blair QA-D9', 'Blair', 'QA-D9', 'child', true,
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'CB', 'external_source', 'alloy_qa_fixture'));
    insert into public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, status, metadata)
    values
      ('d9000000-0000-4000-8000-000000000131'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'parent', 'active',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'G1_parent_of_C1')),
      ('d9000000-0000-4000-8000-000000000132'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'emergency_contact', 'active',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'E1_emergency_contact_of_C1'));
    insert into public.child_enrollment_agreements (id, org_id, customer_member_id, customer_id, site_location_id, status, start_date, source_key, metadata)
    values
      ('d9000000-0000-4000-8000-000000000141'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, '21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'active', current_date, 'qa_fixture',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'C1_at_qa_north')),
      ('d9000000-0000-4000-8000-000000000142'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000101'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid, 'active', current_date, 'qa_fixture',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'C2_at_qa_south')),
      ('d9000000-0000-4000-8000-000000000241'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid,
       '4f89f324-dbc5-4815-8431-38ffec891398'::uuid,
       'active', current_date, 'qa_fixture',
       jsonb_build_object('qa_run_id', 'qar_00000000d9e0', 'fixture_family', 'documents_d9_external', 'fixture_key', 'CB_at_qa_secondary'));
  END LOOP;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.persons WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.person_child_relationships WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.child_enrollment_agreements WHERE id::text like 'd9000000-%')) <> 12 THEN RAISE EXCEPTION 'CASE 2 FAILED: expected 12 fixture rows'; END IF;
  IF (SELECT count(*) FROM public.list_external_children(p_org_id => '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, p_installation_id => NULL::uuid,
        p_boundary_mode => 'locations', p_site_ids => ARRAY['21c9be10-f6e9-4048-ab4c-939ddbe0f0b7']::uuid[], p_limit => 50,
        p_child_ids => ARRAY['d9000000-0000-4000-8000-000000000121', 'd9000000-0000-4000-8000-000000000122']::uuid[])) <> 1 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: a qa_north boundary does not see exactly C1'; END IF;
  IF NOT public.external_child_service_commitment_exists('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'locations', ARRAY['21c9be10-f6e9-4048-ab4c-939ddbe0f0b7']::uuid[])
     OR public.external_child_service_commitment_exists('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'locations', ARRAY['21c9be10-f6e9-4048-ab4c-939ddbe0f0b7']::uuid[])
     OR NOT public.external_child_service_commitment_exists('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'locations', ARRAY['cfb73302-3bbe-49db-b173-876fda776a6d']::uuid[])
     OR NOT public.external_child_service_commitment_exists('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'org_wide', ARRAY[]::uuid[]) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: C1 / C2 site visibility is not North-only / South-only'; END IF;
  IF NOT public.external_child_service_commitment_exists('ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid, 'org_wide', ARRAY[]::uuid[])
     OR public.external_child_service_commitment_exists('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid, 'org_wide', ARRAY[]::uuid[]) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: CB is not visible in QA Secondary only'; END IF;
  IF (SELECT count(*) FROM public.list_external_households(p_org_id => '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, p_boundary_mode => 'org_wide',
        p_site_ids => ARRAY[]::uuid[], p_limit => 50, p_household_ids => ARRAY['d9000000-0000-4000-8000-000000000101']::uuid[])) <> 1 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: H1 is not a visible household anchor'; END IF;
  IF (SELECT count(*) FROM public.person_child_relationships
       WHERE id = 'd9000000-0000-4000-8000-000000000131'::uuid AND person_id = 'd9000000-0000-4000-8000-000000000111'::uuid
         AND customer_member_id = 'd9000000-0000-4000-8000-000000000121'::uuid AND relationship_type = 'parent' AND status = 'active') <> 1
     OR (SELECT count(*) FROM public.person_child_relationships
          WHERE person_id = 'd9000000-0000-4000-8000-000000000112'::uuid AND relationship_type IN ('parent', 'guardian')) <> 0
     OR (SELECT count(*) FROM public.person_child_relationships
          WHERE person_id = 'd9000000-0000-4000-8000-000000000112'::uuid AND relationship_type = 'emergency_contact' AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: G1 is not the active parent of C1, or E1 is more than an emergency contact'; END IF;
  IF (SELECT site_location_id FROM public.child_enrollment_agreements WHERE id = 'd9000000-0000-4000-8000-000000000241'::uuid)
     IS DISTINCT FROM '4f89f324-dbc5-4815-8431-38ffec891398'::uuid THEN
    RAISE EXCEPTION 'CASE 2 FAILED: CB is not enrolled at qa_secondary_site'; END IF;
  IF (SELECT count(*) FROM public.customers WHERE id IN ('e9000000-0000-4000-8000-0000000000c1'::uuid, 'e9000000-0000-4000-8000-0000000000d1'::uuid, 'e9000000-0000-4000-8000-0000000000a1'::uuid)) <> 3
     OR (SELECT count(*) FROM public.customer_members WHERE id IN ('e9000000-0000-4000-8000-0000000000c2'::uuid, 'e9000000-0000-4000-8000-0000000000d2'::uuid)) <> 2
     OR (SELECT count(*) FROM public.persons WHERE id = 'e9000000-0000-4000-8000-0000000000c4'::uuid) <> 1
     OR (SELECT count(*) FROM public.person_child_relationships WHERE id = 'e9000000-0000-4000-8000-0000000000c5'::uuid) <> 1
     OR (SELECT count(*) FROM public.child_enrollment_agreements WHERE id IN ('e9000000-0000-4000-8000-0000000000c3'::uuid, 'e9000000-0000-4000-8000-0000000000d3'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id IN ('21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id = '4f89f324-dbc5-4815-8431-38ffec891398'::uuid AND org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid AND location_type = 'site' AND is_active
           AND label = 'ZZ Alloy QA — Cross-Org Site' AND external_source = 'alloy_qa_structure' AND metadata = '{"qa_structure": true}'::jsonb) <> 1 THEN
    RAISE EXCEPTION 'CASE % FAILED: an unrelated row was touched', '2'; END IF;
  RAISE NOTICE 'CASE 2 PASS ensure: 12 rows, D9.1 visibility shape, idempotent over two runs, unrelated rows untouched';
END $$;

-- CASE 3 — each refusal guard is TRUE on the state it refuses (ensure and reset share the predicates).
DO $$
BEGIN
  -- another QA run owns the rows: the ensure refuses to take them over
  IF NOT (exists (select 1 from public.customers x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e1')
    or exists (select 1 from public.customer_members x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e1')
    or exists (select 1 from public.persons x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e1')
    or exists (select 1 from public.person_child_relationships x where x.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and x.id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e1')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid, 'd9000000-0000-4000-8000-000000000241'::uuid) and coalesce(x.metadata->>'qa_run_id', '') <> 'qar_00000000d9e1')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_other_run should be true'; END IF;
  -- a document still names a fixture child (the legacy writer also records its owner in document_subjects)
  INSERT INTO public.documents (id, org_id, entity_type, entity_id, title, original_filename, mime_type, status)
  VALUES ('e9000000-0000-4000-8000-0000000000f1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'customer_member',
          'd9000000-0000-4000-8000-000000000121'::uuid, 'inv qa-d9r-qar_00000000d9e0 doc', 'inv-qa-d9r-qar_00000000d9e0.pdf', 'application/pdf', 'uploaded');
  IF NOT (exists (
    select 1 from public.documents d
     where d.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and d.entity_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )
    or exists (
    select 1 from public.document_subjects s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and s.subject_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_documents_remaining should be true'; END IF;
  DELETE FROM public.documents WHERE id = 'e9000000-0000-4000-8000-0000000000f1'::uuid;
  IF (exists (
    select 1 from public.documents d
     where d.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and d.entity_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )
    or exists (
    select 1 from public.document_subjects s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and s.subject_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid, 'd9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_documents_remaining (deleted) should be false'; END IF;
  -- a form submission still names a fixture child
  INSERT INTO public.form_definitions (id, org_id, key, name, kind) VALUES ('e9000000-0000-4000-8000-0000000000f2'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'inv_d9_form', 'inv d9 form', 'center');
  INSERT INTO public.form_definition_versions (id, org_id, form_definition_id, version_number, status, schema_json)
  VALUES ('e9000000-0000-4000-8000-0000000000f3'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'e9000000-0000-4000-8000-0000000000f2'::uuid, 1, 'draft', '{}'::jsonb);
  INSERT INTO public.form_submissions (id, org_id, form_definition_id, form_definition_version_id, customer_member_id, status, payload)
  VALUES ('e9000000-0000-4000-8000-0000000000f4'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'e9000000-0000-4000-8000-0000000000f2'::uuid, 'e9000000-0000-4000-8000-0000000000f3'::uuid,
          'd9000000-0000-4000-8000-000000000122'::uuid, 'draft', '{}'::jsonb);
  IF NOT (exists (
    select 1 from public.form_submissions s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and (s.customer_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid)
            or s.customer_member_id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_submissions_remaining should be true'; END IF;
  DELETE FROM public.form_submissions WHERE id = 'e9000000-0000-4000-8000-0000000000f4'::uuid;
  -- a row in the reserved namespace that is not this fixture's
  UPDATE public.customer_members SET metadata = metadata - 'fixture_family' WHERE id = 'd9000000-0000-4000-8000-000000000221'::uuid;
  IF NOT (exists (select 1 from public.customers x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.customer_members x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.persons x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.person_child_relationships x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_foreign_rows should be true'; END IF;
  UPDATE public.customer_members SET metadata = metadata || '{"fixture_family": "documents_d9_external"}'::jsonb WHERE id = 'd9000000-0000-4000-8000-000000000221'::uuid;
  IF (exists (select 1 from public.customers x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.customer_members x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.persons x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.person_child_relationships x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')
    or exists (select 1 from public.child_enrollment_agreements x where x.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and x.id::text like 'd9000000-%' and coalesce(x.metadata->>'fixture_family', '') <> 'documents_d9_external')) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_foreign_rows (restored) should be false'; END IF;
  IF (exists (
    select 1 from public.form_submissions s
     where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
       and (s.customer_id in ('d9000000-0000-4000-8000-000000000101'::uuid, 'd9000000-0000-4000-8000-000000000201'::uuid)
            or s.customer_member_id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid))
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_submissions_remaining (removed) should be false'; END IF;
  IF (exists (
    select 1 from public.process_instances p
     where p.subject_type = 'child'
       and p.subject_id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid, 'd9000000-0000-4000-8000-000000000221'::uuid)
  )) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_journey_remaining should be false'; END IF;
  IF (exists (select 1 from public.customers x where (x.id = 'd9000000-0000-4000-8000-000000000101'::uuid and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000201'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.customer_members x where (x.id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000221'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.persons x where x.id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.person_child_relationships x where x.id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.child_enrollment_agreements x where (x.id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000241'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))) THEN RAISE EXCEPTION 'CASE 3 FAILED: guard d9_foreign_org should be false'; END IF;
  RAISE NOTICE 'CASE 3 PASS guards: other run, bound document, bound submission and foreign namespace row each refuse; clean again after';
END $$;

-- CASE 4 — PARTIAL teardown (C2 and its enrollment deleted the way the product does it, CB's enrollment ended by
-- deletion), then RESET twice: the namespace is empty, the second reset removes nothing, unrelated rows are untouched.
DO $$
DECLARE i int;
BEGIN
  DELETE FROM public.child_enrollment_agreements WHERE id IN ('d9000000-0000-4000-8000-000000000142'::uuid, 'd9000000-0000-4000-8000-000000000241'::uuid);
  DELETE FROM public.customer_members WHERE id = 'd9000000-0000-4000-8000-000000000122'::uuid;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.persons WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.person_child_relationships WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.child_enrollment_agreements WHERE id::text like 'd9000000-%')) <> 9 THEN RAISE EXCEPTION 'CASE 4 FAILED: partial state is not 9 rows'; END IF;
  FOR i IN 1..2 LOOP
    delete from public.child_enrollment_agreements
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid);
    delete from public.child_enrollment_agreements
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000241'::uuid);
    delete from public.person_child_relationships
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid);
    delete from public.customer_members
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000221'::uuid);
    delete from public.persons
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000101'::uuid);
    delete from public.customers
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000201'::uuid);
  END LOOP;
  IF ((SELECT count(*) FROM public.customers WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.customer_members WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.persons WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.person_child_relationships WHERE id::text like 'd9000000-%')
       + (SELECT count(*) FROM public.child_enrollment_agreements WHERE id::text like 'd9000000-%')) <> 0 THEN RAISE EXCEPTION 'CASE 4 FAILED: residue after reset'; END IF;
  IF (SELECT count(*) FROM public.customers WHERE id IN ('e9000000-0000-4000-8000-0000000000c1'::uuid, 'e9000000-0000-4000-8000-0000000000d1'::uuid, 'e9000000-0000-4000-8000-0000000000a1'::uuid)) <> 3
     OR (SELECT count(*) FROM public.customer_members WHERE id IN ('e9000000-0000-4000-8000-0000000000c2'::uuid, 'e9000000-0000-4000-8000-0000000000d2'::uuid)) <> 2
     OR (SELECT count(*) FROM public.persons WHERE id = 'e9000000-0000-4000-8000-0000000000c4'::uuid) <> 1
     OR (SELECT count(*) FROM public.person_child_relationships WHERE id = 'e9000000-0000-4000-8000-0000000000c5'::uuid) <> 1
     OR (SELECT count(*) FROM public.child_enrollment_agreements WHERE id IN ('e9000000-0000-4000-8000-0000000000c3'::uuid, 'e9000000-0000-4000-8000-0000000000d3'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id IN ('21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id = '4f89f324-dbc5-4815-8431-38ffec891398'::uuid AND org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid AND location_type = 'site' AND is_active
           AND label = 'ZZ Alloy QA — Cross-Org Site' AND external_source = 'alloy_qa_structure' AND metadata = '{"qa_structure": true}'::jsonb) <> 1 THEN
    RAISE EXCEPTION 'CASE % FAILED: an unrelated row was touched', '4'; END IF;
  RAISE NOTICE 'CASE 4 PASS reset after a partial teardown: zero residue, idempotent, unrelated rows untouched';
END $$;

-- CASE 5 — a fixture id in ANOTHER organization is refused, and the reset never reaches it: every delete names
-- QA Shared or QA Secondary and an exact id.
DO $$
BEGIN
  INSERT INTO public.customers (id, org_id, name, status_key)
  VALUES ('d9000000-0000-4000-8000-000000000101'::uuid, 'e9000000-0000-4000-8000-0000000000a0'::uuid, 'inv foreign', 'active');
  IF NOT (exists (select 1 from public.customers x where (x.id = 'd9000000-0000-4000-8000-000000000101'::uuid and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000201'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.customer_members x where (x.id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000221'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
    or exists (select 1 from public.persons x where x.id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.person_child_relationships x where x.id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
    or exists (select 1 from public.child_enrollment_agreements x where (x.id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid) and x.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) or (x.id = 'd9000000-0000-4000-8000-000000000241'::uuid and x.org_id <> 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))) THEN RAISE EXCEPTION 'CASE 5 FAILED: guard d9_foreign_org should be true'; END IF;
    delete from public.child_enrollment_agreements
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000141'::uuid, 'd9000000-0000-4000-8000-000000000142'::uuid);
    delete from public.child_enrollment_agreements
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000241'::uuid);
    delete from public.person_child_relationships
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000131'::uuid, 'd9000000-0000-4000-8000-000000000132'::uuid);
    delete from public.customer_members
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000121'::uuid, 'd9000000-0000-4000-8000-000000000122'::uuid);
    delete from public.customer_members
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000221'::uuid);
    delete from public.persons
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000111'::uuid, 'd9000000-0000-4000-8000-000000000112'::uuid);
    delete from public.customers
     where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
       and id in ('d9000000-0000-4000-8000-000000000101'::uuid);
    delete from public.customers
     where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
       and id in ('d9000000-0000-4000-8000-000000000201'::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = 'd9000000-0000-4000-8000-000000000101'::uuid AND org_id = 'e9000000-0000-4000-8000-0000000000a0'::uuid) THEN
    RAISE EXCEPTION 'CASE 5 FAILED: the reset reached another organization'; END IF;
  IF (SELECT count(*) FROM public.customers WHERE id IN ('e9000000-0000-4000-8000-0000000000c1'::uuid, 'e9000000-0000-4000-8000-0000000000d1'::uuid, 'e9000000-0000-4000-8000-0000000000a1'::uuid)) <> 3
     OR (SELECT count(*) FROM public.customer_members WHERE id IN ('e9000000-0000-4000-8000-0000000000c2'::uuid, 'e9000000-0000-4000-8000-0000000000d2'::uuid)) <> 2
     OR (SELECT count(*) FROM public.persons WHERE id = 'e9000000-0000-4000-8000-0000000000c4'::uuid) <> 1
     OR (SELECT count(*) FROM public.person_child_relationships WHERE id = 'e9000000-0000-4000-8000-0000000000c5'::uuid) <> 1
     OR (SELECT count(*) FROM public.child_enrollment_agreements WHERE id IN ('e9000000-0000-4000-8000-0000000000c3'::uuid, 'e9000000-0000-4000-8000-0000000000d3'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id IN ('21c9be10-f6e9-4048-ab4c-939ddbe0f0b7'::uuid, 'cfb73302-3bbe-49db-b173-876fda776a6d'::uuid)) <> 2
     OR (SELECT count(*) FROM public.locations WHERE id = '4f89f324-dbc5-4815-8431-38ffec891398'::uuid AND org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid AND location_type = 'site' AND is_active
           AND label = 'ZZ Alloy QA — Cross-Org Site' AND external_source = 'alloy_qa_structure' AND metadata = '{"qa_structure": true}'::jsonb) <> 1 THEN
    RAISE EXCEPTION 'CASE % FAILED: an unrelated row was touched', '5'; END IF;
  RAISE NOTICE 'CASE 5 PASS another organization: refused by the guard, and out of reach of every delete';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'tests passed=% failed=0', 5;
END $$;

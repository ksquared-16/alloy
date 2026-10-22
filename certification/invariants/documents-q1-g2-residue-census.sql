-- Documents Q1 G2 — the extended zero-residue census DETECTS each residue class, rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment
-- (certenv-*): the executor owns the transaction and always discards it.
-- The census is embedded below VERBATIM as a temporary view (generated from
-- certification/qa-shared/documents-zero-residue-census.sql; the binding test proves the bytes match).
-- Each case seeds ONE residue class inside a subtransaction, requires exactly its check to turn false,
-- then undoes itself. A negative control proves another plan's untagged artifacts in shared QA Shared
-- are never counted. Any invariant that does not hold RAISEs (ASSERTION_FAILED).
DO $$
BEGIN
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
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'org_documents') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('org_documents', 'org_documents', false);
  END IF;
  RAISE NOTICE 'SETUP QA orgs, QA D1 and the org_documents bucket present';
END $$;

CREATE TEMP VIEW v_doc_census AS
-- Documents authz_q1 — ZERO_RESIDUE census (B2 + Activation Safety, read-only).
-- After qa_run_close + fixture reset:
--   ZERO (contract Revision 2 §6): alloy_qa_fixture / aa000000- vendors and subjects (opportunities,
--         work units, fixture departments) in QA orgs; in QA Shared, documents and storage objects tagged
--         qa-authz- or attached to aa000000- subjects, and Processing-case sources left without their
--         document; in QA Secondary (authz_q1-only) ALL documents, storage objects and Processing cases;
--         sessions of the seven QA identities;
--   ZERO (B2): alloy_qa_fixture / aa000000- vendors in QA orgs; qa_* custom role grants;
--         non-actor memberships in either QA org; provider-sent communication_messages.
--   RETAINED BY DESIGN: access audit history (mutation_events) and the D1a document audit (workflow_events)
--   — reported as data, never as residue. QA Shared is shared with bp_v2: no check counts its artifacts.
-- Persistent orgs/users/actors are retained.
select question_id, kind, payload
from (
    select 'doc_zr_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'qa_secondary', 'ad53fee2-2570-460f-9300-f0e106c473b6',
               'cleanup', 'zero_residue',
               'retained_by_design', array[
                 'access audit history (mutation_events) written by the audited functions'
               ]
           )::text as payload,
           '00'::text as sort_key
    union all
    select 'doc_zr_vendors', 'check',
           'vendors ~ alloy_qa_fixture ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.vendors v
                where v.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and (
                    v.external_source = 'alloy_qa_fixture'
                    or v.id::text like 'aa000000-%'
                  )
              ), 'false'),
           '01'
    union all
    select 'doc_zr_qa_role_grants', 'check',
           'role_permission_grants ~ qa_custom_roles ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_permission_grants g
                where g.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and g.role_key like 'qa_%'
                  and g.allowed = true
              ), 'true'),
           '02'
    union all
    -- Pool-access equivalent: exclude only each org's frozen provisioning administrator.
    select 'doc_zr_pool_access', 'check',
           'user_roles ~ qa_orgs_non_actor ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.user_roles ur
                where ur.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and not (
                    (
                      ur.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                      and exists (
                        select 1 from auth.users u
                        where u.id = ur.user_id
                          and lower(u.email) = lower('qa-shared-actor@example.com')
                      )
                    )
                    or (
                      ur.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      and exists (
                        select 1 from auth.users u
                        where u.id = ur.user_id
                          and lower(u.email) = lower('qa-secondary-admin@example.com')
                      )
                    )
                  )
              ), 'false'),
           '03'
    union all
    select 'doc_zr_zero_sent', 'check',
           'communication_messages ~ status_sent ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.communication_messages cm
                where cm.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and cm.status = 'sent'
              ), 'false'),
           '04'
    union all
    select 'doc_zr_subjects', 'check',
           'opportunities_work_units_departments ~ aa000000_fixture ~ zero ~ '
           || coalesce((
                select ((select count(*) from public.opportunities o
                          where o.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and o.id::text like 'aa000000-%')
                      + (select count(*) from public.work_units w
                          where w.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and w.id::text like 'aa000000-%')
                      + (select count(*) from public.departments dp
                          where dp.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) and dp.id::text like 'aa000000-%')) = 0)::text
              ), 'false'),
           '06'
    union all
    select 'doc_zr_shared_documents', 'check',
           'documents ~ qa_shared_qa_authz_tagged_or_on_fixture ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.documents d
                where d.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and (d.title ilike '%qa-authz-%'
                    or d.original_filename ilike '%qa-authz-%'
                    or d.storage_path ilike '%qa-authz-%'
                    or d.entity_id::text like 'aa000000-%')
              ), 'false'),
           '07'
    union all
    select 'doc_zr_shared_objects', 'check',
           'storage_objects ~ qa_shared_qa_authz_tagged ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from storage.objects so
                where so.name like '4acc9386-c485-486f-aa1f-05d83499d142/%'
                  and so.name ilike '%qa-authz-%'
              ), 'false'),
           '08'
    union all
    select 'doc_zr_shared_dangling_case_sources', 'check',
           'processing_case_sources ~ qa_shared_document_source_without_document ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.processing_case_sources pcs
                where pcs.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and pcs.source_kind in ('document', 'upload', 'recreated_document')
                  and not exists (select 1 from public.documents d where d.id = pcs.source_id)
              ), 'false'),
           '09'
    union all
    select 'doc_zr_secondary_documents', 'check',
           'documents ~ qa_secondary_all ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text from public.documents d where d.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
              ), 'false'),
           '10'
    union all
    select 'doc_zr_secondary_objects', 'check',
           'storage_objects ~ qa_secondary_all ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text from storage.objects so
                where so.name like 'ad53fee2-2570-460f-9300-f0e106c473b6/%'
              ), 'false'),
           '11'
    union all
    select 'doc_zr_secondary_cases', 'check',
           'processing_cases ~ qa_secondary_all ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text from public.processing_cases pc where pc.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
              ), 'false'),
           '12'
    union all
    select 'doc_zr_qa_sessions', 'check',
           'auth_sessions ~ seven_qa_identities ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from auth.sessions s
                join auth.users u on u.id = s.user_id
                where lower(u.email) in (
                  'qa-shared-actor@example.com', 'qa-secondary-admin@example.com',
                  'qa-pool-01@example.com', 'qa-pool-02@example.com', 'qa-pool-03@example.com',
                  'qa-pool-04@example.com', 'qa-pool-05@example.com'
                )
              ), 'false'),
           '13'
    union all
    select 'doc_zr_retained_d1a_audit', 'data',
           json_build_object(
               'artifact', 'D1a document audit (workflow_events)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_org_rows', coalesce((
                 select count(*)::int
                 from public.workflow_events we
                 where we.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                   and we.event_type in ('document_link_issued', 'document_delete_authorized', 'document_delete_failed',
                                         'document_uploaded', 'person_profile_photo_set', 'person_profile_photo_cleared')
               ), 0)
           )::text,
           '14'
    union all
    select 'doc_zr_retained_audit', 'data',
           json_build_object(
               'artifact', 'access audit history (mutation_events)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_mutation_event_rows', coalesce((
                 select count(*)::int
                 from public.mutation_events me
                 where me.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
               ), 0)
           )::text,
           '05'
) q
order by sort_key
;

CREATE TEMP TABLE t_expect (residue text, check_id text);
INSERT INTO t_expect (residue, check_id) VALUES
  ('subject', 'doc_zr_subjects'), ('shared_document', 'doc_zr_shared_documents'),
  ('shared_object', 'doc_zr_shared_objects'), ('shared_dangling', 'doc_zr_shared_dangling_case_sources'),
  ('secondary_document', 'doc_zr_secondary_documents'), ('secondary_object', 'doc_zr_secondary_objects'),
  ('secondary_case', 'doc_zr_secondary_cases'), ('session', 'doc_zr_qa_sessions');

-- CASE 1 — baseline: every check answers true; the census registers the twelve expected checks.
DO $$
DECLARE v_failing text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM v_doc_census WHERE kind = 'check';
  IF v_n <> 12 THEN RAISE EXCEPTION 'CASE 1 FAILED: % check rows, expected 12', v_n; END IF;
  SELECT string_agg(question_id, ',') INTO v_failing FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
  IF v_failing IS NOT NULL THEN RAISE EXCEPTION 'CASE 1 FAILED: baseline not clean: %', v_failing; END IF;
  RAISE NOTICE 'CASE 1 PASS baseline: 12 checks, all true';
END $$;

-- CASE 2 — each residue class, seeded alone, turns exactly its own check false.
DO $$
DECLARE r record; v_msg text; v_false text; v_user uuid := 'c0ffee00-0000-4000-8000-00000000a001'::uuid; v_case uuid;
BEGIN
  FOR r IN SELECT residue, check_id FROM t_expect ORDER BY residue LOOP
    BEGIN
      IF r.residue = 'subject' THEN
        INSERT INTO public.work_units (id, org_id, department_id, key, name)
        VALUES ('aa000000-0000-4000-8000-0000000009a1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, '0704e72c-f73d-44b2-87d9-89924e222464'::uuid, 'qa_authz_residue', 'residue');
      ELSIF r.residue = 'shared_document' THEN
        INSERT INTO public.documents (org_id, title, original_filename, bucket, storage_path)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-authz-qar_invariant0001 leftover', 'leftover.pdf', 'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142/pos_intake/x-leftover.pdf');
      ELSIF r.residue = 'shared_object' THEN
        INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', '4acc9386-c485-486f-aa1f-05d83499d142/pos_intake/x-qa-authz-qar_invariant0001.txt');
      ELSIF r.residue = 'shared_dangling' THEN
        INSERT INTO public.processing_cases (org_id) VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid) RETURNING id INTO v_case;
        INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_case, 'document', 'aa000000-0000-4000-8000-0000000009d1'::uuid);
      ELSIF r.residue = 'secondary_document' THEN
        INSERT INTO public.documents (org_id, title, bucket, storage_path)
        VALUES ('ad53fee2-2570-460f-9300-f0e106c473b6'::uuid, 'cross-org target', 'org_documents', 'ad53fee2-2570-460f-9300-f0e106c473b6/opportunity/x/y.pdf');
      ELSIF r.residue = 'secondary_object' THEN
        INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', 'ad53fee2-2570-460f-9300-f0e106c473b6/opportunity/x/y.pdf');
      ELSIF r.residue = 'secondary_case' THEN
        INSERT INTO public.processing_cases (org_id) VALUES ('ad53fee2-2570-460f-9300-f0e106c473b6'::uuid);
      ELSIF r.residue = 'session' THEN
        INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                                confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at)
        VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'qa-pool-01@example.com', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now());
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at) VALUES (gen_random_uuid(), v_user, now(), now());
      END IF;
      SELECT string_agg(question_id, ',' ORDER BY question_id) INTO v_false FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
      IF v_false IS DISTINCT FROM r.check_id THEN
        RAISE EXCEPTION 'CASE 2 FAILED: residue % turned [%] false, expected [%]', r.residue, coalesce(v_false, 'nothing'), r.check_id;
      END IF;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;
    IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
    RAISE NOTICE 'CASE 2 PASS residue % detected by % alone', r.residue, r.check_id;
  END LOOP;
END $$;

-- CASE 3 — negative control: another plan's UNTAGGED artifacts in shared QA Shared are not residue.
DO $$
DECLARE v_msg text; v_false text; v_doc uuid; v_case uuid;
BEGIN
  BEGIN
    INSERT INTO public.documents (org_id, title, original_filename, bucket, storage_path)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'bp_v2 retained enrollment packet', 'packet.pdf', 'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142/customer_member/x/packet.pdf')
    RETURNING id INTO v_doc;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', '4acc9386-c485-486f-aa1f-05d83499d142/customer_member/x/packet.pdf');
    INSERT INTO public.processing_cases (org_id) VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid) RETURNING id INTO v_case;
    INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_case, 'document', v_doc);
    SELECT string_agg(question_id, ',') INTO v_false FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
    IF v_false IS NOT NULL THEN RAISE EXCEPTION 'CASE 3 FAILED: untagged QA Shared artifacts counted as residue: %', v_false; END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
  RAISE NOTICE 'CASE 3 PASS another plan''s untagged document, object and live case source in QA Shared are not counted';
END $$;

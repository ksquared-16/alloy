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
--   ZERO (Documents R3/R4, D8 Forms): run-keyed (qa_<12 hex>_) form definitions, their versions, public links,
--         submissions and packet definitions / sessions in QA orgs — archived run forms and the child-only
--         submissions a deleted child leaves are residue until qa_documents_forms_residue_reset removes them —
--         and any ACTIVE health fact on a QA child that no longer exists.
--   RETAINED BY DESIGN (D8): ended health facts on deleted QA children (append-only; ending is the only disposal).
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
                select (((select count(*) from public.opportunities o
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
    -- D6: QA fixture requirements are purged by the audited requirement DELETE (archived qa_ keys only).
    select 'doc_zr_d6_requirements', 'check',
           'document_requirements ~ qa_fixture_keys ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.document_requirements r
                where r.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and r.key like 'qa\_%'
              ), 'false'),
           '15'
    union all
    select 'doc_zr_d6_requirement_versions', 'check',
           'document_requirement_versions ~ qa_fixture_or_orphan ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.document_requirement_versions v
                left join public.document_requirements r on r.id = v.requirement_id
                where v.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and (r.id is null or r.key like 'qa\_%')
              ), 'false'),
           '16'
    union all
    -- No waiver of a fixture requirement, and no waiver whose record no longer exists.
    select 'doc_zr_d6_waivers', 'check',
           'document_requirement_waivers ~ qa_fixture_or_unresolved_subject ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.document_requirement_waivers w
                left join public.document_requirements r on r.id = w.requirement_id
                where w.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and (r.key like 'qa\_%' or not public.document_subject_resolves(w.org_id, w.subject_type, w.subject_id))
              ), 'false'),
           '17'
    union all
    -- D8 Forms: what a Documents run creates is keyed qa_<run hex>_ (the drivers' KEY_PREFIX). QA Shared is shared
    -- with bp_v2, so nothing broader than that run-key shape is counted.
    select 'doc_zr_forms_definitions', 'check',
           'form_definitions ~ qa_run_keys ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.form_definitions f
                where f.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and f.key ~ '^qa_[0-9a-f]{12}_'
              ), 'false'),
           '18'
    union all
    select 'doc_zr_forms_definition_versions', 'check',
           'form_definition_versions ~ qa_run_keys ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.form_definition_versions v
                join public.form_definitions f on f.id = v.form_definition_id
                where v.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and f.key ~ '^qa_[0-9a-f]{12}_'
              ), 'false'),
           '19'
    union all
    -- Includes the child-only submissions left subjectless when their child was deleted.
    select 'doc_zr_forms_submissions', 'check',
           'form_submissions ~ qa_run_forms ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.form_submissions s
                join public.form_definitions f on f.id = s.form_definition_id
                where s.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and f.key ~ '^qa_[0-9a-f]{12}_'
              ), 'false'),
           '20'
    union all
    select 'doc_zr_forms_links_and_packets', 'check',
           'form_public_links_form_packet_definitions_sessions ~ qa_run_keys ~ zero ~ '
           || coalesce((((select count(*)
                           from public.form_public_links l
                           join public.form_definitions f on f.id = l.form_definition_id
                          where l.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                            and f.key ~ '^qa_[0-9a-f]{12}_')
                      + (select count(*)
                           from public.form_packet_definitions pd
                          where pd.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                            and coalesce(pd.key, '') ~ '^qa_[0-9a-f]{12}_')
                      + (select count(*)
                           from public.form_packet_sessions ps
                           join public.form_packet_definitions pd on pd.id = ps.packet_definition_id
                          where ps.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                            and coalesce(pd.key, '') ~ '^qa_[0-9a-f]{12}_')) = 0)::text, 'false'),
           '21'
    union all
    -- A health fact is never deleted (enforce_person_health_fact_immutability); ending it is the disposal, so an
    -- ACTIVE fact on a child that no longer exists is the defect, and ended ones are reported as data below.
    select 'doc_zr_health_facts_active_on_missing_subject', 'check',
           'person_health_facts ~ active_on_missing_qa_child ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.person_health_facts h
                where h.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                  and h.status = 'active'
                  and h.subject_entity_type = 'customer_member'
                  and not exists (select 1 from public.customer_members m where m.id = h.subject_entity_id)
              ), 'false'),
           '22'
    union all
    select 'doc_zr_retained_health_facts', 'data',
           json_build_object(
               'artifact', 'person_health_facts on deleted QA children (append-only)',
               'status', 'retained_by_design',
               'not_residue', true,
               'by_status', coalesce((
                 select json_object_agg(t.status, t.n)
                 from (
                   select h.status, count(*)::int as n
                   from public.person_health_facts h
                   where h.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                     and h.subject_entity_type = 'customer_member'
                     and not exists (select 1 from public.customer_members m where m.id = h.subject_entity_id)
                   group by h.status
                 ) t
               ), '{}'::json)
           )::text,
           '23'
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
                                         'document_uploaded', 'person_profile_photo_set', 'person_profile_photo_cleared',
                                         'document_requirement_changed', 'document_requirement_waiver_granted',
                                         'document_requirement_waiver_revoked', 'document_version_reviewed')
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
  ('secondary_case', 'doc_zr_secondary_cases'), ('session', 'doc_zr_qa_sessions'),
  -- D6 / D8: a row that cannot exist without its parent names the parent's check too (comma list, any order).
  ('d6_requirement', 'doc_zr_d6_requirements'),
  ('d6_requirement_version', 'doc_zr_d6_requirements,doc_zr_d6_requirement_versions'),
  ('d6_waiver', 'doc_zr_d6_waivers'),
  ('forms_definition', 'doc_zr_forms_definitions'),
  ('forms_version', 'doc_zr_forms_definitions,doc_zr_forms_definition_versions'),
  ('forms_submission', 'doc_zr_forms_definitions,doc_zr_forms_definition_versions,doc_zr_forms_submissions'),
  ('forms_link', 'doc_zr_forms_definitions,doc_zr_forms_links_and_packets'),
  ('forms_packet', 'doc_zr_forms_links_and_packets'),
  ('health_active_missing', 'doc_zr_health_facts_active_on_missing_subject');

-- CASE 1 — baseline: every check answers true; the census registers the twenty expected checks.
DO $$
DECLARE v_failing text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM v_doc_census WHERE kind = 'check';
  IF v_n <> 20 THEN RAISE EXCEPTION 'CASE 1 FAILED: % check rows, expected 20', v_n; END IF;
  SELECT string_agg(question_id, ',') INTO v_failing FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
  IF v_failing IS NOT NULL THEN RAISE EXCEPTION 'CASE 1 FAILED: baseline not clean: %', v_failing; END IF;
  RAISE NOTICE 'CASE 1 PASS baseline: 20 checks, all true';
END $$;

-- CASE 2 — each residue class, seeded alone, turns exactly its own check false (and its parent's, where it needs one).
DO $$
DECLARE r record; v_msg text; v_false text; v_want text; v_user uuid := 'c0ffee00-0000-4000-8000-00000000a001'::uuid; v_case uuid;
  v_req uuid; v_ver uuid; v_form uuid; v_fver uuid;
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
      ELSIF r.residue IN ('d6_requirement', 'd6_requirement_version') THEN
        INSERT INTO public.document_requirements (org_id, key, status)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_inv_residue_requirement', 'archived') RETURNING id INTO v_req;
        IF r.residue = 'd6_requirement_version' THEN
          INSERT INTO public.document_requirement_versions (org_id, requirement_id, version_number, status, label, document_type_key, subject_type, scope, timing, policy, waivable)
          VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_req, 1, 'draft', 'Residue', 'immunization_record', 'child', '{"kind": "all"}', '{"kind": "immediate"}', 'required', true);
        END IF;
      ELSIF r.residue = 'd6_waiver' THEN
        -- A non-fixture requirement, so only the waiver's unresolved subject is residue.
        INSERT INTO public.document_requirements (org_id, key, status)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'zz_inv_waived_requirement', 'active') RETURNING id INTO v_req;
        INSERT INTO public.document_requirement_versions (org_id, requirement_id, version_number, status, label, document_type_key, subject_type, scope, timing, policy, waivable)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_req, 1, 'draft', 'Waived', 'immunization_record', 'child', '{"kind": "all"}', '{"kind": "immediate"}', 'required', true)
        RETURNING id INTO v_ver;
        PERFORM set_config('alloy.document_requirement_waiver', 'on', true);
        INSERT INTO public.document_requirement_waivers (org_id, requirement_id, requirement_version_id, subject_type, subject_id, reason, granted_by)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_req, v_ver, 'child', 'aa000000-0000-4000-8000-0000000009e1'::uuid, 'residue invariant', v_user);
      ELSIF r.residue IN ('forms_definition', 'forms_version', 'forms_submission', 'forms_link') THEN
        INSERT INTO public.form_definitions (org_id, key, name, kind, is_active)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_0123456789ab_residue_form', 'Residue form', 'center', false) RETURNING id INTO v_form;
        IF r.residue IN ('forms_version', 'forms_submission') THEN
          INSERT INTO public.form_definition_versions (org_id, form_definition_id, version_number, status, published_at, schema_json)
          VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_form, 1, 'published', now(), '{"schema_version":1,"title":"Residue","sections":[],"fields":[]}'::jsonb)
          RETURNING id INTO v_fver;
        END IF;
        IF r.residue = 'forms_submission' THEN
          -- Child-only and subjectless: what a deleted child leaves behind.
          INSERT INTO public.form_submissions (org_id, form_definition_id, form_definition_version_id, status, submitted_at, payload)
          VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_form, v_fver, 'submitted', now(), '{}'::jsonb);
        ELSIF r.residue = 'forms_link' THEN
          INSERT INTO public.form_public_links (org_id, token_hash, form_definition_id)
          VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-residue-invariant-' || gen_random_uuid(), v_form);
        END IF;
      ELSIF r.residue = 'forms_packet' THEN
        INSERT INTO public.form_packet_definitions (org_id, key, name)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_0123456789ab_residue_packet', 'Residue packet');
      ELSIF r.residue = 'health_active_missing' THEN
        INSERT INTO public.person_health_facts (org_id, subject_entity_type, subject_entity_id, fact_kind, status, source_kind)
        VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'customer_member', 'aa000000-0000-4000-8000-0000000009f1'::uuid, 'allergy', 'active', 'operator');
      END IF;
      SELECT string_agg(question_id, ',' ORDER BY question_id) INTO v_false FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
      SELECT string_agg(c, ',' ORDER BY c) INTO v_want FROM unnest(string_to_array(r.check_id, ',')) AS c;
      IF v_false IS DISTINCT FROM v_want THEN
        RAISE EXCEPTION 'CASE 2 FAILED: residue % turned [%] false, expected [%]', r.residue, coalesce(v_false, 'nothing'), v_want;
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
    -- bp_v2's own qa_ forms and packets do not carry a Documents run key (qa_<12 hex>_).
    INSERT INTO public.form_definitions (org_id, key, name, kind)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_bp_v2_enrollment_form', 'bp_v2 enrollment form', 'center');
    INSERT INTO public.form_packet_definitions (org_id, key, name)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa_bp_v2_enrollment_packet', 'bp_v2 enrollment packet');
    -- An ENDED health fact on a deleted child is retained by design (append-only), reported as data.
    INSERT INTO public.person_health_facts (org_id, subject_entity_type, subject_entity_id, fact_kind, status, effective_to, source_kind)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'customer_member', 'aa000000-0000-4000-8000-0000000009f2'::uuid, 'allergy', 'ended', current_date, 'operator');
    SELECT string_agg(question_id, ',') INTO v_false FROM v_doc_census WHERE kind = 'check' AND payload NOT LIKE '%~ true';
    IF v_false IS NOT NULL THEN RAISE EXCEPTION 'CASE 3 FAILED: untagged QA Shared artifacts counted as residue: %', v_false; END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
  RAISE NOTICE 'CASE 3 PASS another plan''s untagged document, object, live case source and qa_ form/packet, and an ended health fact on a deleted child, are not counted';
END $$;

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
order by sort_key;

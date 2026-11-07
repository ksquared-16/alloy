-- Documents D9 hosted HTTP proof — ZERO_RESIDUE and cross-org census (supplementary, read-only).
-- Plans: certification/documents-v1/D9-1-HOSTED-QA-PLAN.md §5 / §6.3 and D9-2-3-HOSTED-QA-PLAN.md §6.2–§6.3.
-- PREPARED, NOT RUN. Read with database.read_census (alloy_deployed_primary) from a NEW execution run (the census dedupe
-- is run-scoped), alongside the registered authz_q1 20-check documents-zero-residue-census.sql, until the plan owner
-- folds these checks into a re-pinned registered census.
--   BEFORE WRITES: every d9_zr_* / d9w_zr_* check is already true (nothing tagged, no D9 installation, no fixture
--         people) and d9_zr_qa_orgs_resolve is true.
--   AFTER THE TESTS (before cleanup): the d9_xo_* cross-org checks are true — every tagged document is in a QA org,
--         every document_link_issued of a D9 application names a tagged document, and no audit or event row of a D9
--         application or installation names an organization outside the two QA orgs.
--   AFTER CLEANUP (verdict ZERO_RESIDUE): every check is true.
--   RETAINED BY DESIGN: the D9 developer_applications catalog rows, revoked installations / credentials (history), and
--         audit (workflow_events document_*, app_security_audit installation.* / credential.*) — reported as data.
-- Selects only by tag (qa-d9r- / qa-d9w-), the d9000000- fixture namespace, the two QA org ids or the D9 application
-- slugs. Counts only; no PII column is returned. Only tables that exist on staging before any D9 write.
select question_id, kind, payload
from (
    select 'd9_zr_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'fixture', 'qa_d9_external_fixture',
               'namespace', 'd9000000-',
               'document_tags', array['qa-d9r-', 'qa-d9w-'],
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'qa_secondary', 'ad53fee2-2570-460f-9300-f0e106c473b6',
               'read_applications', array['d9-documents-read-cert', 'd9-documents-scope-cert'],
               'write_applications', array['d9-documents-write-cert', 'd9-documents-review-cert', 'd9-documents-write-scope-cert'],
               'cleanup', 'zero_residue'
           )::text as payload,
           '00'::text as sort_key
    union all
    select 'd9_zr_qa_orgs_resolve', 'check',
           'orgs ~ qa_shared_and_qa_secondary ~ both_present ~ '
           || ((select count(*) from public.orgs o
                 where o.id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)) = 2)::text,
           '01'
    union all
    -- D9.1 §6.3
    select 'd9_zr_tagged_documents', 'check',
           'documents ~ qa_d9r_tagged_or_on_d9000000_subject ~ zero ~ '
           || ((select count(*) from public.documents d
                 where d.title ilike '%qa-d9r-%'
                    or d.original_filename ilike '%qa-d9r-%'
                    or d.storage_path ilike '%qa-d9r-%'
                    or d.entity_id::text like 'd9000000-%') = 0)::text,
           '02'
    union all
    select 'd9_zr_tagged_objects', 'check',
           'storage_objects ~ qa_d9r_tagged_or_under_d9000000_subject ~ zero ~ '
           || ((select count(*) from storage.objects so
                 where so.name ilike '%qa-d9r-%'
                    or so.name like '%/d9000000-%') = 0)::text,
           '03'
    union all
    select 'd9_zr_active_installations', 'check',
           'app_installations ~ d9_read_applications_not_revoked ~ zero ~ '
           || ((select count(*) from public.app_installations i
                 join public.developer_applications a on a.id = i.application_id
                 where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert')
                   and i.status <> 'revoked') = 0)::text,
           '04'
    union all
    select 'd9_zr_active_credentials', 'check',
           'app_credentials ~ d9_read_applications_active ~ zero ~ '
           || ((select count(*) from public.app_credentials c
                 join public.app_installations i on i.id = c.installation_id
                 join public.developer_applications a on a.id = i.application_id
                 where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert')
                   and c.status = 'active') = 0)::text,
           '05'
    union all
    select 'd9_zr_fixture_people', 'check',
           'customers_members_persons_relationships_enrollments ~ d9000000_fixture ~ zero ~ '
           || (((select count(*) from public.customers x where x.id::text like 'd9000000-%')
              + (select count(*) from public.customer_members x where x.id::text like 'd9000000-%')
              + (select count(*) from public.persons x where x.id::text like 'd9000000-%')
              + (select count(*) from public.person_child_relationships x
                  where x.id::text like 'd9000000-%'
                     or x.customer_id::text like 'd9000000-%'
                     or x.customer_member_id::text like 'd9000000-%'
                     or x.person_id::text like 'd9000000-%')
              + (select count(*) from public.child_enrollment_agreements x
                  where x.id::text like 'd9000000-%'
                     or x.customer_member_id::text like 'd9000000-%')) = 0)::text,
           '06'
    union all
    -- D9.2 / D9.3 §6.3
    select 'd9w_zr_tagged_documents', 'check',
           'documents ~ qa_d9w_tagged_or_api_v1_upload_in_qa_orgs ~ zero ~ '
           || ((select count(*) from public.documents d
                 where d.title ilike '%qa-d9w-%'
                    or d.original_filename ilike '%qa-d9w-%'
                    or d.storage_path ilike '%qa-d9w-%'
                    or (d.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                        and d.metadata->>'source' = 'api_v1_upload')) = 0)::text,
           '07'
    union all
    select 'd9w_zr_tagged_objects', 'check',
           'storage_objects ~ qa_d9w_tagged_or_qa_org_api_uploads_or_filed ~ zero ~ '
           || ((select count(*) from storage.objects so
                 where so.name ilike '%qa-d9w-%'
                    or so.name like '4acc9386-c485-486f-aa1f-05d83499d142/api_uploads/%'
                    or so.name like 'ad53fee2-2570-460f-9300-f0e106c473b6/api_uploads/%'
                    or so.name like '4acc9386-c485-486f-aa1f-05d83499d142/filed/d9000000-%'
                    or so.name like 'ad53fee2-2570-460f-9300-f0e106c473b6/filed/d9000000-%') = 0)::text,
           '08'
    union all
    select 'd9w_zr_active_installations', 'check',
           'app_installations ~ d9_write_applications_not_revoked ~ zero ~ '
           || ((select count(*) from public.app_installations i
                 join public.developer_applications a on a.id = i.application_id
                 where a.slug in ('d9-documents-write-cert', 'd9-documents-review-cert', 'd9-documents-write-scope-cert')
                   and i.status <> 'revoked') = 0)::text,
           '09'
    union all
    select 'd9w_zr_active_credentials', 'check',
           'app_credentials ~ d9_write_applications_active ~ zero ~ '
           || ((select count(*) from public.app_credentials c
                 join public.app_installations i on i.id = c.installation_id
                 join public.developer_applications a on a.id = i.application_id
                 where a.slug in ('d9-documents-write-cert', 'd9-documents-review-cert', 'd9-documents-write-scope-cert')
                   and c.status = 'active') = 0)::text,
           '10'
    union all
    select 'd9w_zr_escalation_cases', 'check',
           'processing_cases ~ qa_orgs_api_upload_escalation_or_qa_d9w ~ zero ~ '
           || ((select count(*) from public.processing_cases pc
                 where pc.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                   and (pc.metadata->'api_upload_escalation' is not null
                        or pc.metadata->>'source_document_filename' ilike '%qa-d9w-%'
                        or pc.metadata->>'source_document_display_name' ilike '%qa-d9w-%')) = 0)::text,
           '11'
    union all
    -- D9.1 §5 cross-org safety (true before cleanup and after it)
    select 'd9_xo_tagged_documents_outside_qa', 'check',
           'documents ~ qa_d9_tagged_outside_qa_orgs ~ zero ~ '
           || ((select count(*) from public.documents d
                 where d.org_id not in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                   and (d.title ilike '%qa-d9r-%' or d.original_filename ilike '%qa-d9r-%'
                        or d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%'
                        or d.entity_id::text like 'd9000000-%')) = 0)::text,
           '12'
    union all
    select 'd9_xo_link_audit_untagged', 'check',
           'workflow_events ~ d9_document_link_issued_on_untagged_document ~ zero ~ '
           || ((select count(*) from public.workflow_events we
                 join public.documents d on d.id = we.entity_id
                 where we.event_type = 'document_link_issued'
                   and we.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                   and we.payload->>'actor_application_id' in (
                         select a.id::text from public.developer_applications a
                          where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert', 'd9-documents-write-cert',
                                           'd9-documents-review-cert', 'd9-documents-write-scope-cert'))
                   and not (d.title ilike '%qa-d9r-%' or d.original_filename ilike '%qa-d9r-%'
                            or d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%')) = 0)::text,
           '13'
    union all
    select 'd9_xo_events_outside_qa', 'check',
           'workflow_events ~ d9_application_actor_outside_qa_orgs ~ zero ~ '
           || ((select count(*) from public.workflow_events we
                 where we.org_id not in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                   and we.payload->>'actor_application_id' in (
                         select a.id::text from public.developer_applications a
                          where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert', 'd9-documents-write-cert',
                                           'd9-documents-review-cert', 'd9-documents-write-scope-cert'))) = 0)::text,
           '14'
    union all
    select 'd9_xo_security_audit_outside_qa', 'check',
           'app_security_audit_installations ~ d9_applications_outside_qa_orgs ~ zero ~ '
           || (((select count(*) from public.app_security_audit sa
                  join public.developer_applications a on a.id = sa.application_id
                  where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert', 'd9-documents-write-cert',
                                   'd9-documents-review-cert', 'd9-documents-write-scope-cert')
                    and sa.org_id is not null
                    and sa.org_id not in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))
              + (select count(*) from public.app_installations i
                  join public.developer_applications a on a.id = i.application_id
                  where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert', 'd9-documents-write-cert',
                                   'd9-documents-review-cert', 'd9-documents-write-scope-cert')
                    and i.org_id not in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid))) = 0)::text,
           '15'
    union all
    select 'd9_zr_retained_catalog_and_audit', 'data',
           json_build_object(
               'artifact', 'D9 application catalog rows, revoked installations / credentials, audit history',
               'status', 'retained_by_design',
               'not_residue', true,
               'd9_applications', (select count(*)::int from public.developer_applications a
                                    where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert', 'd9-documents-write-cert',
                                                     'd9-documents-review-cert', 'd9-documents-write-scope-cert')),
               'd9_installations_revoked', (select count(*)::int from public.app_installations i
                                             join public.developer_applications a on a.id = i.application_id
                                             where a.slug like 'd9-documents-%-cert' and i.status = 'revoked'),
               'd9_security_audit_rows', (select count(*)::int from public.app_security_audit sa
                                           join public.developer_applications a on a.id = sa.application_id
                                           where a.slug like 'd9-documents-%-cert'),
               'd9_document_link_issued_rows', (select count(*)::int from public.workflow_events we
                                                 where we.event_type = 'document_link_issued'
                                                   and we.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
                                                   and we.payload->>'actor_application_id' in (
                                                         select a.id::text from public.developer_applications a
                                                          where a.slug like 'd9-documents-%-cert'))
           )::text,
           '16'
) q
order by sort_key;

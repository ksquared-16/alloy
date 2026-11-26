-- Documents D2 — database evidence for authz_q1 run qar_32891f09f872 (opened 2026-10-23T19:03Z). READ-ONLY.
-- The run's own documents (title tagged qa-authz-qar_32891f09f872) in the QA organizations: their versions, subjects,
-- legacy projection and sensitivity; that no physical file is shared or duplicated; and the D2 audit events. Ids and
-- counts only: no titles, names, paths or contents.
-- One statement; question_id | row_kind | payload(json).
with qa as (select '4acc9386-c485-486f-aa1f-05d83499d142'::uuid as shared, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid as secondary),
d as (select doc.* from public.documents doc, qa where doc.org_id in (qa.shared, qa.secondary) and doc.title like 'qa-authz-qar_32891f09f872%'),
ev as (select we.* from public.workflow_events we, qa where we.created_at >= '2026-10-23T19:03:00Z' and we.org_id in (qa.shared, qa.secondary)
         and we.event_type in ('document_version_added', 'document_subject_changed', 'document_sensitivity_raised', 'document_link_issued',
                               'document_uploaded', 'document_delete_authorized', 'document_quarantined', 'document_released'))
select question_id, 'data' as row_kind, payload
from (
    select 'a00_run_documents'::text as question_id,
           json_build_object('measured_at', now(), 'documents', (select count(*) from d),
               'with_current_version', (select count(*) from d where current_version_id is not null),
               'current_matches_file', (select count(*) from d join public.document_versions v on v.id = d.current_version_id
                    where v.document_id = d.id and v.storage_path = d.storage_path and v.checksum_sha256 is not distinct from d.checksum_sha256),
               'with_checksum', (select count(*) from d where checksum_sha256 is not null),
               'outside_qa_orgs_documents_created_since_open', (select count(*) from public.documents x, qa where x.created_at >= '2026-10-23T19:03:00Z'
                    and x.org_id not in (qa.shared, qa.secondary) and x.title like 'qa-authz-%'))::text as payload
    union all
    select 'a01_document',
           json_build_object('document_id', d.id, 'sensitivity', d.sensitivity, 'legacy_entity_type', d.entity_type, 'legacy_entity_id', d.entity_id,
               'versions', (select count(*) from public.document_versions v where v.document_id = d.id),
               'version_sources', (select json_agg(json_build_object('n', v.version_number, 'source', v.source, 'supersedes_set', v.supersedes_version_id is not null,
                    'reason_set', v.replacement_reason is not null, 'checksum_set', v.checksum_sha256 is not null, 'current', v.id = d.current_version_id) order by v.version_number)
                    from public.document_versions v where v.document_id = d.id),
               'active_associations', (select json_agg(json_build_object('type', s.subject_type, 'subject_id', s.subject_id, 'association', s.association, 'primary', s.is_primary) order by s.is_primary desc, s.created_at)
                    from public.document_subjects s where s.document_id = d.id and s.ended_at is null),
               'ended_associations', (select count(*) from public.document_subjects s where s.document_id = d.id and s.ended_at is not null),
               'primary_equals_legacy', exists (select 1 from public.document_subjects s where s.document_id = d.id and s.is_primary and s.ended_at is null
                    and s.subject_id = d.entity_id and public.document_subject_type_for_legacy(d.entity_type) = s.subject_type))::text
    from d
    union all
    select 'a02_physical_files',
           json_build_object(
               'version_objects', (select count(*) from public.document_versions v join d on d.id = v.document_id),
               'distinct_version_objects', (select count(distinct (v.bucket, v.storage_path)) from public.document_versions v join d on d.id = v.document_id),
               'objects_shared_with_other_versions', (select count(*) from public.document_versions v join d on d.id = v.document_id
                    where exists (select 1 from public.document_versions o where o.bucket = v.bucket and o.storage_path = v.storage_path and o.id <> v.id)),
               'version_objects_present', (select count(*) from public.document_versions v join d on d.id = v.document_id
                    where exists (select 1 from storage.objects o where o.bucket_id = v.bucket and o.name = v.storage_path)),
               'qa_tagged_objects_in_storage', (select count(*) from storage.objects o, qa where o.bucket_id = 'org_documents'
                    and (split_part(o.name, '/', 1) = qa.shared::text or split_part(o.name, '/', 1) = qa.secondary::text) and o.name like '%qa-authz-qar_32891f09f872%'))::text
    union all
    select 'a03_audit_count',
           json_build_object('event', event_type, 'route', payload ->> 'route', 'events', count(*),
               'with_version_id', count(*) filter (where payload ? 'version_id'))::text
    from ev group by event_type, payload ->> 'route'
    union all
    select 'a04_audit_d2_detail',
           json_build_object('event', event_type, 'document_id', entity_id, 'action', payload ->> 'action', 'subject_type', payload ->> 'subject_type',
               'from', payload ->> 'from', 'to', payload ->> 'to', 'reason_present', coalesce(length(payload ->> 'reason'), 0) >= 10,
               'checksum_present', (payload ->> 'checksum_sha256') is not null, 'actor_present', (payload ->> 'actor_user_id') is not null, 'at', created_at)::text
    from ev where event_type in ('document_version_added', 'document_subject_changed', 'document_sensitivity_raised')
) census
order by question_id, payload

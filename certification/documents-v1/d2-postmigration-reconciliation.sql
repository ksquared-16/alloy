-- Documents D2.6 — post-migration reconciliation of the deployed primary. READ-ONLY. Aggregates and hashes only.
-- Reconciles against the pre-migration baseline (gar_f07be7fed84c0f, 2026-10-23T15:13Z): 378 documents, identity hash
-- 6e7ff5693393b627d22d0a39ec0ae8f1 over (id, org, bucket, path, checksum, size), 172 resolvable legacy parents
-- (168 customer_member + 4 person), 158 unresolved, 48 unattached, 35 immunization records.
-- One statement; question_id | row_kind | payload(json).
with d as (select * from public.documents),
legacy as (
    select d.id, d.org_id, d.entity_id, public.document_subject_type_for_legacy(d.entity_type) as st,
           public.document_subject_type_for_legacy(d.entity_type) is not null and d.entity_id is not null
             and public.document_subject_resolves(d.org_id, public.document_subject_type_for_legacy(d.entity_type), d.entity_id) as resolves
    from d
)
select question_id, 'data' as row_kind, payload
from (
    select 'r00_ledger'::text as question_id,
           json_build_object('measured_at', now(),
               'ledger_20261208090000', (select count(*) from supabase_migrations.schema_migrations where version = '20261208090000'),
               'document_subjects_table', to_regclass('public.document_subjects') is not null,
               'links_view', to_regclass('public.document_subject_links') is not null,
               'd2_triggers', (select count(*) from pg_trigger where tgname in ('trg_document_versions_guard_update', 'trg_document_versions_guard_delete',
                    'trg_documents_before_insert_d2', 'trg_documents_after_insert_d2', 'trg_documents_before_update_d2',
                    'trg_documents_after_update_d2', 'trg_document_subjects_guard') and not tgisinternal),
               'client_privilege_on_d2', (select count(*) from (values ('anon'), ('authenticated')) r(role)
                    where has_table_privilege(r.role, 'public.document_subjects', 'SELECT,INSERT,UPDATE,DELETE')
                       or has_table_privilege(r.role, 'public.document_subject_links', 'SELECT')
                       or has_table_privilege(r.role, 'public.document_versions', 'SELECT,INSERT,UPDATE,DELETE')
                       or has_table_privilege(r.role, 'public.documents', 'SELECT,INSERT,UPDATE,DELETE')))::text as payload
    union all
    select 'r01_identity',
           json_build_object('documents', (select count(*) from d),
               'identity_hash', (select md5(string_agg(id::text || ':' || org_id::text || ':' || coalesce(bucket, '') || ':' || coalesce(storage_path, '') || ':' || coalesce(checksum_sha256, '') || ':' || coalesce(byte_size::text, ''), ',' order by id)) from d),
               'baseline_identity_hash', '6e7ff5693393b627d22d0a39ec0ae8f1')::text
    union all
    select 'r02_versions',
           json_build_object('versions', (select count(*) from public.document_versions),
               'by_source', (select json_object_agg(source, n) from (select source, count(*) n from public.document_versions group by source) s),
               'documents_with_current', (select count(*) from d where current_version_id is not null),
               'stored_documents', (select count(*) from d where storage_path is not null),
               'current_matches_file', (select count(*) from d join public.document_versions v on v.id = d.current_version_id
                    where v.document_id = d.id and v.bucket = d.bucket and v.storage_path = d.storage_path
                      and v.mime_type is not distinct from d.mime_type and v.byte_size is not distinct from d.byte_size
                      and v.checksum_sha256 is not distinct from d.checksum_sha256),
               'versions_with_checksum', (select count(*) from public.document_versions where checksum_sha256 is not null),
               'versions_with_etag', (select count(*) from public.document_versions where content_etag is not null),
               'version_objects_present', (select count(*) from public.document_versions v where exists (select 1 from storage.objects o where o.bucket_id = v.bucket and o.name = v.storage_path)),
               'documents_with_more_than_one_version', (select count(*) from (select document_id from public.document_versions group by 1 having count(*) > 1) x))::text
    union all
    select 'r03_subjects',
           json_build_object(
               'resolvable_legacy_parents', (select count(*) from legacy where resolves),
               'unresolved_legacy_parents', (select count(*) from legacy where st is not null and entity_id is not null and not resolves),
               'unattached', (select count(*) from legacy where entity_id is null),
               'primary_by_type', (select json_object_agg(subject_type, n) from (select subject_type, count(*) n from public.document_subjects where is_primary and ended_at is null group by 1) s),
               'resolvable_without_primary', (select count(*) from legacy l where l.resolves and not exists (select 1 from public.document_subjects s where s.document_id = l.id and s.is_primary and s.ended_at is null and s.subject_id = l.entity_id and s.subject_type = l.st)),
               'unresolved_with_owner', (select count(*) from legacy l where not l.resolves and exists (select 1 from public.document_subjects s where s.document_id = l.id)),
               'primary_disagrees_with_legacy', (select count(*) from public.document_subjects s join d on d.id = s.document_id where s.is_primary and s.ended_at is null
                    and (d.entity_id is distinct from s.subject_id or public.document_subject_type_for_legacy(d.entity_type) is distinct from s.subject_type)),
               'associations_cross_org', (select count(*) from public.document_subjects s join d on d.id = s.document_id where s.org_id <> d.org_id),
               'derived_context_links', (select count(*) from public.document_subject_links where derived_from <> 'document_subjects'))::text
    union all
    select 'r04_sensitivity',
           json_build_object('by_class', (select json_object_agg(sensitivity, n) from (select sensitivity, count(*) n from d group by 1) s),
               'medical_type_declared_standard', (select count(*) from d where sensitivity = 'standard' and doc_type in ('physical', 'immunization_record', 'health_care_plan', 'medication_authorization')),
               'medical_form_linked', (select count(distinct f.document_id) from public.form_submission_documents f where public.is_medical_form_submission(f.form_submission_id)),
               'medical_form_linked_declared_medical', (select count(distinct f.document_id) from public.form_submission_documents f join d on d.id = f.document_id
                    where public.is_medical_form_submission(f.form_submission_id) and d.sensitivity = 'medical'),
               'legal_holds', (select count(*) from d where legal_hold),
               'retention_until', (select count(*) from d where retention_until is not null))::text
    union all
    select 'r05_references_intact',
           json_build_object(
               'form_submission_documents', (select count(*) from public.form_submission_documents),
               'drawn_signature_refs', (select count(*) from public.form_submission_signatures where drawn_asset_document_id is not null),
               'processing_document_sources', (select count(*) from public.processing_case_sources where source_kind in ('document', 'recreated_document')),
               'staff_qualification_evidence', (select count(*) from public.staff_qualification_evidence),
               'medical_consent_evidence', (select count(*) from public.person_medical_consents where evidence_document_id is not null),
               'profile_photo_pointers', (select count(*) from public.persons where metadata ? 'profile_photo_document_id'),
               'org_documents_objects', (select count(*) from storage.objects where bucket_id = 'org_documents'))::text
) census
order by question_id, payload

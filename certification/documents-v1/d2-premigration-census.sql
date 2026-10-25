-- Documents D2.0 — pre-migration census of the deployed primary. READ-ONLY. Aggregates and hashes only: no titles, names,
-- file names, paths or contents. The baseline the D2.6 backfill reconciles against.
-- One statement; question_id | row_kind | payload(json).
with d as (select * from public.documents),
subj as (
    select d.id, d.org_id, lower(coalesce(d.entity_type, '<null>')) as et, d.entity_id,
           case lower(coalesce(d.entity_type, ''))
               when 'customer_member' then exists (select 1 from public.customer_members x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'customer_members' then exists (select 1 from public.customer_members x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'person' then exists (select 1 from public.persons x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'persons' then exists (select 1 from public.persons x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'customer' then exists (select 1 from public.customers x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'customers' then exists (select 1 from public.customers x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'opportunity' then exists (select 1 from public.opportunities x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'opportunities' then exists (select 1 from public.opportunities x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'vendor' then exists (select 1 from public.vendors x where x.id = d.entity_id and x.org_id = d.org_id)
               when 'vendors' then exists (select 1 from public.vendors x where x.id = d.entity_id and x.org_id = d.org_id)
               else null
           end as subject_resolves
    from d
)
select question_id, 'data' as row_kind, payload
from (
    select 'p00_totals'::text as question_id,
           json_build_object('measured_at', now(),
               'documents', (select count(*) from d),
               'orgs', (select count(distinct org_id) from d),
               'document_versions', (select count(*) from public.document_versions),
               'documents_with_versions', (select count(distinct document_id) from public.document_versions),
               'document_field_values', (select count(*) from public.document_field_values),
               'null_storage_path', (select count(*) from d where storage_path is null),
               'null_bucket', (select count(*) from d where bucket is null),
               'null_mime', (select count(*) from d where mime_type is null),
               'null_byte_size', (select count(*) from d where byte_size is null),
               'with_checksum', (select count(*) from d where checksum_sha256 is not null),
               'path_outside_org_prefix', (select count(*) from d where storage_path is not null and split_part(storage_path, '/', 1) <> org_id::text),
               'duplicate_storage_path', (select count(*) from (select bucket, storage_path from d where storage_path is not null group by 1, 2 having count(*) > 1) x),
               'generated_from_set', (select count(*) from d where generated_from_document_id is not null),
               'owner_contact_set', (select count(*) from d where owner_contact_id is not null),
               'identity_hash', (select md5(string_agg(id::text || ':' || org_id::text || ':' || coalesce(bucket, '') || ':' || coalesce(storage_path, '') || ':' || coalesce(checksum_sha256, '') || ':' || coalesce(byte_size::text, ''), ',' order by id)) from d))::text as payload
    union all
    select 'p01_entity_type',
           json_build_object('entity_type', et, 'documents', count(*), 'entity_id_null', count(*) filter (where entity_id is null),
               'subject_resolves_in_org', count(*) filter (where subject_resolves), 'subject_missing', count(*) filter (where subject_resolves = false),
               'unmapped_type', count(*) filter (where subject_resolves is null and et <> '<null>'))::text
    from subj group by et
    union all
    select 'p02_status', json_build_object('status', status, 'documents', count(*))::text from d group by status
    union all
    select 'p03_doc_type', json_build_object('doc_type', coalesce(doc_type, '<null>'), 'documents', count(*))::text from d group by doc_type
    union all
    select 'p04_mime', json_build_object('mime_type', coalesce(mime_type, '<null>'), 'documents', count(*))::text from d group by mime_type
    union all
    select 'p05_references',
           json_build_object(
               'form_submission_documents', (select count(*) from public.form_submission_documents),
               'form_submission_documents_by_role', (select json_object_agg(role, n) from (select role, count(*) n from public.form_submission_documents group by role) r),
               'drawn_signature_refs', (select count(*) from public.form_submission_signatures where drawn_asset_document_id is not null),
               'processing_document_sources', (select count(*) from public.processing_case_sources where source_kind in ('document', 'recreated_document')),
               'processing_sources_dangling', (select count(*) from public.processing_case_sources s where s.source_kind in ('document', 'recreated_document') and not exists (select 1 from d where d.id = s.source_id)),
               'staff_qualification_evidence', (select count(*) from public.staff_qualification_evidence),
               'safeguarding_evidence', (select count(*) from public.child_safeguarding_restrictions where evidence_document_id is not null),
               'medical_consent_evidence', (select count(*) from public.person_medical_consents where evidence_document_id is not null),
               'medical_consent_evidence_dangling', (select count(*) from public.person_medical_consents c where c.evidence_document_id is not null and not exists (select 1 from d where d.id = c.evidence_document_id)),
               'subsidy_authorization_sources', (select count(*) from public.financial_subsidy_authorizations where source_document_id is not null),
               'subsidy_remittance_sources', (select count(*) from public.financial_subsidy_remittances where source_document_id is not null),
               'vendor_doc_file_ids', (select count(*) from public.vendors where insurance_doc_file_id is not null or drivers_license_doc_file_id is not null),
               'profile_photo_pointers', (select count(*) from public.persons where metadata ? 'profile_photo_document_id'),
               'profile_photo_dangling', (select count(*) from public.persons p where p.metadata ? 'profile_photo_document_id' and not exists (select 1 from d where d.id::text = p.metadata ->> 'profile_photo_document_id')))::text
    union all
    select 'p06_storage',
           json_build_object(
               'documents_with_object', (select count(*) from d where exists (select 1 from storage.objects o where o.bucket_id = d.bucket and o.name = d.storage_path)),
               'documents_missing_object', (select count(*) from d where d.storage_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = d.bucket and o.name = d.storage_path)),
               'org_documents_objects', (select count(*) from storage.objects where bucket_id = 'org_documents'),
               'object_size_mismatch', (select count(*) from d join storage.objects o on o.bucket_id = d.bucket and o.name = d.storage_path
                                        where d.byte_size is not null and (o.metadata ->> 'size') is not null and (o.metadata ->> 'size')::bigint <> d.byte_size))::text
    union all
    select 'p07_metadata_markers',
           json_build_object(
               'legal_hold', (select count(*) from d where metadata ? 'legal_hold'),
               'retention_until', (select count(*) from d where metadata ? 'retention_until'),
               'screening', (select count(*) from d where metadata ? 'screening'),
               'version_role', (select count(*) from d where metadata ? 'version_role'))::text
    union all
    select 'p08_status_definitions',
           json_build_object('status_key', status_key, 'definitions', count(*), 'active', count(*) filter (where is_active))::text
    from public.status_definitions where entity_type = 'documents' group by status_key
) census
order by question_id, payload

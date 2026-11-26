-- Documents V1 / D1b.5 -- classification of stored objects with no documents row. READ-ONLY.
--
-- Director authorization: "D1b.5 — Legacy object reconciliation ... Classify each as recoverable,
-- legitimately unreferenced or orphaned ... Do not delete or relocate objects" (2026-10-23).
--
-- One row per unreferenced object, keyed by its storage.objects.id (a UUID, not a name). Every
-- reference the platform can hold to a stored path is tested:
--   * documents.storage_path (that is what "unreferenced" means here) and documents.public_url;
--   * document_versions.storage_path;
--   * vendors.insurance_doc_path / drivers_license_doc_path;
--   * persons.metadata and documents.metadata text (profile-photo and provenance pointers);
-- plus whether the subject the path names still exists (the opportunity or vendor in the second or
-- third segment), and whether that subject still has documents rows.
--
-- Emits NO object names, file names, titles or contents. Path segments only as structural words or
-- '<uuid>'. One statement; question_id | row_kind | payload(json).
with unref as (
    select o.id, o.bucket_id, o.name, o.created_at, o.metadata
    from storage.objects o
    where o.bucket_id = 'org_documents'
      and not exists (select 1 from public.documents d where d.bucket = o.bucket_id and d.storage_path = o.name)
),
shaped as (
    select u.*,
           split_part(u.name, '/', 1) as s1,
           split_part(u.name, '/', 2) as s2,
           split_part(u.name, '/', 3) as s3,
           regexp_replace(u.name, '^.*/', '') as basename
    from unref u
)
select question_id, 'data' as row_kind, payload
from (
    select 'o00_identity'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'objects_total', (select count(*) from storage.objects where bucket_id = 'org_documents'),
               'unreferenced', (select count(*) from unref)
           )::text as payload

    union all

    select 'o01_object',
           json_build_object(
               'object_id', s.id,
               'seg1', case when s.s1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '<uuid>'
                            when s.s1 ~ '^[a-z_]{1,40}$' then s.s1 else '<other>' end,
               'seg2', case when s.s2 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '<uuid>'
                            when s.s2 ~ '^[a-z_]{1,40}$' then s.s2 else '<other>' end,
               'seg3', case when s.s3 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '<uuid>'
                            when s.s3 ~ '^[a-z_]{1,40}$' then s.s3 when s.s3 = '' then '<none>' else '<other>' end,
               'org_prefix_is_org', exists (select 1 from public.orgs g where g.id::text = s.s1),
               'created', s.created_at::date,
               'bytes', case when (s.metadata ->> 'size') ~ '^[0-9]+$' then (s.metadata ->> 'size')::bigint end,
               'mimetype', case when (s.metadata ->> 'mimetype') ~ '^[a-z0-9.+/-]{1,80}$' then s.metadata ->> 'mimetype' else '<other>' end,
               -- the subject named by the path
               'opportunity_exists', case when s.s2 = 'opportunity' then exists (select 1 from public.opportunities op where op.id::text = s.s3) end,
               'opportunity_docs_remaining', case when s.s2 = 'opportunity' then (select count(*) from public.documents d where d.entity_id::text = s.s3) end,
               'vendor_exists', case when s.s1 = 'vendors' then exists (select 1 from public.vendors v where v.id::text = s.s2)
                                     when s.s2 = 'vendors' then exists (select 1 from public.vendors v where v.id::text = s.s3) end,
               -- every place a path can be referenced
               'ref_document_public_url', exists (select 1 from public.documents d where d.public_url like '%' || s.name),
               'ref_document_version', exists (select 1 from public.document_versions dv where dv.storage_path = s.name),
               'ref_vendor_path', exists (select 1 from public.vendors v where v.insurance_doc_path = s.name or v.drivers_license_doc_path = s.name),
               'ref_person_metadata', exists (select 1 from public.persons p where p.metadata::text like '%' || s.name || '%'),
               'ref_document_metadata', exists (select 1 from public.documents d where d.metadata::text like '%' || s.name || '%'),
               -- a documents row elsewhere that carries the same stored basename (a moved copy)
               'same_basename_document', exists (select 1 from public.documents d where d.storage_path like '%/' || s.basename),
               -- lead deletion leaves storage behind: is there a recorded deletion of the named opportunity?
               'opportunity_delete_event', case when s.s2 = 'opportunity' then exists (
                   select 1 from public.workflow_events we
                   where we.entity_id::text = s.s3 and we.event_type ~* '(deleted|delete|archived)')
               end
           )::text
    from shaped s
) census
order by question_id, payload

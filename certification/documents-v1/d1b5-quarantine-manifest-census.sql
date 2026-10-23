-- Documents V1 / D1b.5 (S3) -- exact manifest of the stored objects with no documents row. READ-ONLY.
-- The quarantine plan's manifest, keyed by storage.objects.id. It carries size, ETag (the storage content hash),
-- MIME type, timestamps and object class, and never a name. A future execution resolves names from ids and refuses on any
-- ETag or size drift. One statement; question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'm00_identity'::text as question_id,
           json_build_object('measured_at', now(), 'objects_total', (select count(*) from storage.objects where bucket_id = 'org_documents'))::text as payload
    union all
    select 'm01_object',
           json_build_object(
               'object_id', o.id,
               'class', case when split_part(o.name, '/', 2) = 'opportunity' then 'opportunity'
                             when split_part(o.name, '/', 1) = 'vendors' then 'legacy_vendor' else 'other' end,
               'subfolder', case when split_part(o.name, '/', 3) in ('insurance', 'drivers_license') then split_part(o.name, '/', 3) end,
               'bytes', o.metadata ->> 'size',
               'etag', o.metadata ->> 'eTag',
               'mimetype', o.metadata ->> 'mimetype',
               'created_at', o.created_at,
               'updated_at', o.updated_at,
               'last_accessed_at', to_jsonb(o) ->> 'last_accessed_at'
           )::text
    from storage.objects o
    where o.bucket_id = 'org_documents'
      and not exists (select 1 from public.documents d where d.bucket = o.bucket_id and d.storage_path = o.name)
) census
order by question_id, payload

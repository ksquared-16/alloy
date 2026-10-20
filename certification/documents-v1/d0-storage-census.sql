-- Documents V1 / D0 -- deployed storage census. READ-ONLY, catalog + aggregate counts only.
--
-- Director authorization: "AUTHORIZE GOVERNED READ-ONLY CENSUS" (D0 closure, 2026-10-20).
-- Answers D0.6 item 5: the repository never creates a storage bucket in a migration and declares
-- no storage.objects policy, so bucket privacy, size/MIME limits and object-level policy on the
-- deployed primary were UNKNOWN. Repository definitions to compare against:
--   data.sql:2286 (seed: org_documents + vendor_documents, public=f, no limits)
--   certification/environment-buckets.sql (cert env: org_documents, public=false)
--
-- Emits NO object names, file names, document titles, file contents or OCR text. Path segments
-- are reported only when they are structural words (^[a-z_]{1,40}$) or UUID-shaped; anything else
-- collapses to '<other>'. Bucket ids, policy names and policy predicates are configuration.
--
-- s00 is unconditional, so an empty bucket list cannot be mistaken for a wrong database.
-- Output obeys the trusted-host parser: question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 's00_identity'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'ledger_rows', (select count(*) from supabase_migrations.schema_migrations),
               'buckets_total', (select count(*) from storage.buckets),
               'org_documents_exists', (select count(*) from storage.buckets where id = 'org_documents'),
               'vendor_documents_exists', (select count(*) from storage.buckets where id = 'vendor_documents'),
               'objects_total', (select count(*) from storage.objects),
               'storage_policies_total', (select count(*) from pg_policies where schemaname = 'storage'),
               'storage_objects_policies', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects')
           )::text as payload

    union all

    select 's01_bucket'::text,
           json_build_object(
               'id', b.id,
               'public', to_jsonb(b) -> 'public',
               'file_size_limit', to_jsonb(b) -> 'file_size_limit',
               'allowed_mime_types', to_jsonb(b) -> 'allowed_mime_types',
               'type', to_jsonb(b) -> 'type',
               'created_at', to_jsonb(b) -> 'created_at',
               'updated_at', to_jsonb(b) -> 'updated_at'
           )::text
    from storage.buckets b

    union all

    select 's02_rls'::text,
           json_build_object(
               'table', n.nspname || '.' || c.relname,
               'rls_enabled', c.relrowsecurity,
               'rls_forced', c.relforcerowsecurity
           )::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and ((n.nspname = 'storage' and c.relname in ('objects', 'buckets'))
        or (n.nspname = 'public' and c.relname in ('documents', 'document_versions', 'document_field_definitions', 'document_field_values', 'form_submission_documents')))

    union all

    select 's03_policy'::text,
           json_build_object(
               'table', p.schemaname || '.' || p.tablename,
               'policy', p.policyname,
               'cmd', p.cmd,
               'roles', p.roles,
               'permissive', p.permissive,
               'qual', left(coalesce(p.qual, ''), 400),
               'with_check', left(coalesce(p.with_check, ''), 400)
           )::text
    from pg_policies p
    where p.schemaname = 'storage'
       or (p.schemaname = 'public' and p.tablename in ('documents', 'document_versions', 'form_submission_documents'))

    union all

    select 's04_privilege'::text,
           json_build_object(
               'table', t.nspname || '.' || t.relname,
               'role', r.rolname,
               'select', has_table_privilege(r.rolname, t.oid, 'SELECT'),
               'insert', has_table_privilege(r.rolname, t.oid, 'INSERT'),
               'update', has_table_privilege(r.rolname, t.oid, 'UPDATE'),
               'delete', has_table_privilege(r.rolname, t.oid, 'DELETE')
           )::text
    from (
        select c.oid, n.nspname, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and ((n.nspname = 'storage' and c.relname in ('objects', 'buckets'))
            or (n.nspname = 'public' and c.relname in ('documents', 'document_versions', 'form_submission_documents')))
    ) t
    cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r

    union all

    select 's05_objects_by_bucket'::text,
           json_build_object(
               'bucket', g.bucket_id,
               'objects', g.n,
               'bytes', g.bytes,
               'max_bytes', g.max_bytes,
               'seg1_uuid', g.seg1_uuid,
               'seg1_not_uuid', g.seg1_not_uuid,
               'oldest', g.oldest,
               'newest', g.newest
           )::text
    from (
        select o.bucket_id,
               count(*) as n,
               sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end) as bytes,
               max(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end) as max_bytes,
               count(*) filter (where split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as seg1_uuid,
               count(*) filter (where split_part(o.name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as seg1_not_uuid,
               min(o.created_at)::date as oldest,
               max(o.created_at)::date as newest
        from storage.objects o
        group by o.bucket_id
    ) g

    union all

    select 's06_path_shape'::text,
           json_build_object(
               'bucket', g.bucket_id,
               'seg1', g.seg1,
               'seg2', g.seg2,
               'objects', g.n
           )::text
    from (
        select o.bucket_id,
               case when split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '<uuid>'
                    when split_part(o.name, '/', 1) ~ '^[a-z_]{1,40}$' then split_part(o.name, '/', 1)
                    else '<other>' end as seg1,
               case when split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '<uuid>'
                    when split_part(o.name, '/', 2) ~ '^[a-z_]{1,40}$' then split_part(o.name, '/', 2)
                    when split_part(o.name, '/', 2) = '' then '<none>'
                    else '<other>' end as seg2,
               count(*) as n
        from storage.objects o
        where o.bucket_id in ('org_documents', 'vendor_documents')
        group by 1, 2, 3
    ) g

    union all

    select 's07_mime_by_bucket'::text,
           json_build_object(
               'bucket', g.bucket_id,
               'mimetype', g.mimetype,
               'objects', g.n
           )::text
    from (
        select o.bucket_id,
               case when (o.metadata ->> 'mimetype') ~ '^[a-z0-9.+/-]{1,80}$' then o.metadata ->> 'mimetype' else '<other>' end as mimetype,
               count(*) as n
        from storage.objects o
        where o.bucket_id in ('org_documents', 'vendor_documents')
        group by 1, 2
    ) g
) census
order by question_id, payload

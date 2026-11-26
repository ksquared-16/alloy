-- Documents V1 / D1b.1 -- deployed authorization baseline census. READ-ONLY.
--
-- Director authorization: "ALLOY DOCUMENTS V1 — D1b ... D1b.1 Baseline and mutation-path census" (2026-10-23).
-- Re-measures, on the deployed primary, what D0 measured on 2026-10-20 and widens it:
--   * every public table that is document-owned by NAME (%document%) or by CONTENT (a storage_path,
--     extracted_text or ocr_text column), not a hand-picked list;
--   * table AND column privileges for anon / authenticated (column grants are how OCR text can leak
--     even when a table-level grant looks narrow);
--   * RLS flags, policies, triggers;
--   * SECURITY DEFINER functions whose body references document tables or storage, with who may EXECUTE;
--   * buckets, storage.objects policies, and stored objects with no documents row, by bucket and
--     structural path shape only.
--
-- Emits NO object names, file names, titles, file contents or OCR text. Path segments are reported
-- only when structural (^[a-z_]{1,40}$) or UUID-shaped; anything else collapses to '<other>'.
-- b00 is unconditional, so an empty result cannot be mistaken for a wrong database.
-- One statement; output obeys the trusted-host parser: question_id | row_kind | payload(json).
with doc_tables as (
    select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname = 'public'
      and (c.relname like '%document%'
           or exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                        and a.attname in ('storage_path', 'extracted_text', 'ocr_text')))
),
roles as (
    select rolname from pg_roles where rolname in ('anon', 'authenticated')
)
select question_id, 'data' as row_kind, payload
from (
    select 'b00_identity'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'ledger_rows', (select count(*) from supabase_migrations.schema_migrations),
               'doc_tables', (select count(*) from doc_tables),
               'buckets_total', (select count(*) from storage.buckets),
               'objects_total', (select count(*) from storage.objects),
               'storage_objects_policies', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
               'documents_rows', (select count(*) from public.documents),
               'documents_with_extracted_text', (select count(*) from public.documents where coalesce(length(extracted_text), 0) > 0)
           )::text as payload

    union all

    select 'b01_doc_table',
           json_build_object(
               'table', t.relname,
               'rls_enabled', t.relrowsecurity,
               'rls_forced', t.relforcerowsecurity,
               'sensitive_columns', (select json_agg(a.attname order by a.attname)
                                     from pg_attribute a
                                     where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
                                       and (a.attname in ('storage_path', 'extracted_text', 'ocr_text', 'bucket', 'metadata', 'file_name', 'original_filename')
                                            or a.attname like '%text%')),
               'has_org_id', exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = 'org_id' and not a.attisdropped)
           )::text
    from doc_tables t

    union all

    select 'b02_table_privilege',
           json_build_object(
               'table', t.relname,
               'role', r.rolname,
               'select', has_table_privilege(r.rolname, t.oid, 'SELECT'),
               'insert', has_table_privilege(r.rolname, t.oid, 'INSERT'),
               'update', has_table_privilege(r.rolname, t.oid, 'UPDATE'),
               'delete', has_table_privilege(r.rolname, t.oid, 'DELETE'),
               'truncate', has_table_privilege(r.rolname, t.oid, 'TRUNCATE')
           )::text
    from doc_tables t cross join roles r

    union all

    select 'b03_sensitive_column_privilege',
           json_build_object(
               'table', t.relname,
               'column', a.attname,
               'role', r.rolname,
               'select', has_column_privilege(r.rolname, t.oid, a.attname, 'SELECT'),
               'update', has_column_privilege(r.rolname, t.oid, a.attname, 'UPDATE')
           )::text
    from doc_tables t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
                        and a.attname in ('storage_path', 'extracted_text', 'ocr_text', 'bucket')
    cross join roles r

    union all

    select 'b04_policy',
           json_build_object(
               'table', p.schemaname || '.' || p.tablename,
               'policy', p.policyname,
               'cmd', p.cmd,
               'roles', p.roles,
               'permissive', p.permissive,
               'qual', left(coalesce(p.qual, ''), 600),
               'with_check', left(coalesce(p.with_check, ''), 600)
           )::text
    from pg_policies p
    where (p.schemaname = 'storage' and p.tablename in ('objects', 'buckets'))
       or (p.schemaname = 'public' and p.tablename in (select relname from doc_tables))

    union all

    select 'b05_trigger',
           json_build_object(
               'table', c.relname,
               'trigger', tg.tgname,
               'function', pn.nspname || '.' || pr.proname,
               'security_definer', pr.prosecdef,
               'enabled', tg.tgenabled
           )::text
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc pr on pr.oid = tg.tgfoid
    join pg_namespace pn on pn.oid = pr.pronamespace
    where not tg.tgisinternal
      and c.oid in (select oid from doc_tables)

    union all

    select 'b06_definer_function',
           json_build_object(
               'function', n.nspname || '.' || p.proname,
               'args', pg_get_function_identity_arguments(p.oid),
               'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
               'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
               'touches', (select json_agg(t.relname order by t.relname) from doc_tables t
                           where p.prosrc ~* ('\m' || t.relname || '\M')),
               'touches_storage', p.prosrc ~* 'storage\.(objects|buckets)'
           )::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname = 'public'
      and (p.prosrc ~* 'storage\.(objects|buckets)'
           or exists (select 1 from doc_tables t where p.prosrc ~* ('\m' || t.relname || '\M')))

    union all

    select 'b07_bucket',
           json_build_object(
               'id', b.id,
               'public', to_jsonb(b) -> 'public',
               'file_size_limit', to_jsonb(b) -> 'file_size_limit',
               'allowed_mime_types', to_jsonb(b) -> 'allowed_mime_types',
               'objects', (select count(*) from storage.objects o where o.bucket_id = b.id)
           )::text
    from storage.buckets b

    union all

    select 'b08_storage_table_privilege',
           json_build_object(
               'table', 'storage.' || c.relname,
               'role', r.rolname,
               'rls_enabled', c.relrowsecurity,
               'select', has_table_privilege(r.rolname, c.oid, 'SELECT'),
               'insert', has_table_privilege(r.rolname, c.oid, 'INSERT'),
               'update', has_table_privilege(r.rolname, c.oid, 'UPDATE'),
               'delete', has_table_privilege(r.rolname, c.oid, 'DELETE')
           )::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'storage'
    cross join roles r
    where c.relname in ('objects', 'buckets')

    union all

    select 'b09_unreferenced_object',
           json_build_object(
               'bucket', g.bucket_id,
               'seg1', g.seg1,
               'seg2', g.seg2,
               'seg1_is_existing_org', g.seg1_is_org,
               'objects', g.n,
               'bytes', g.bytes,
               'oldest', g.oldest,
               'newest', g.newest
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
               exists (select 1 from public.orgs org where org.id::text = split_part(o.name, '/', 1)) as seg1_is_org,
               count(*) as n,
               sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end) as bytes,
               min(o.created_at)::date as oldest,
               max(o.created_at)::date as newest
        from storage.objects o
        where not exists (select 1 from public.documents d where d.bucket = o.bucket_id and d.storage_path = o.name)
        group by 1, 2, 3, 4
    ) g
) census
order by question_id, payload

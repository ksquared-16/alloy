-- Documents V1 / D1b -- deployed ledger CONTENT and physical-state check for the two D1b versions. READ-ONLY.
--
-- Follows d1b-ledger-identity-census (gar_3aa50710c4baef). That census found both versions recorded as
-- multi-statement rows (2 and 3 statements) that no governed apply of this lane wrote. This one asks:
--   * every recorded column, as JSON keys only, plus per-statement length and sha256, and the sha256 of the
--     statements joined (raw, and whitespace/comment-normalized), so they can be compared to the files;
--   * whether the migrations' EFFECTS are present: client privileges on the six document tables, and the
--     org_documents bucket's posture.
-- No statement text is emitted. One statement; question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'c01_row'::text as question_id,
           json_build_object(
               'version', m.version,
               'columns', (select json_agg(k order by k) from jsonb_object_keys(to_jsonb(m)) k),
               'created_by', to_jsonb(m) ->> 'created_by',
               'idempotency_key_present', (to_jsonb(m) ->> 'idempotency_key') is not null,
               'statement_lengths', (select json_agg(length(s) order by o) from unnest(m.statements) with ordinality t(s, o)),
               'statement_sha256', (select json_agg(left(encode(sha256(convert_to(s, 'UTF8')), 'hex'), 16) order by o) from unnest(m.statements) with ordinality t(s, o)),
               'joined_normalized_sha256', encode(sha256(convert_to(
                   regexp_replace(regexp_replace(array_to_string(m.statements, ' '), '--[^\n]*', '', 'g'), '[\s;]+', '', 'g'), 'UTF8')), 'hex')
           )::text as payload
    from supabase_migrations.schema_migrations m
    where m.version in ('20261207181500', '20261207181600')

    union all

    select 'c02_privilege',
           json_build_object(
               'table', t,
               'anon_any', has_table_privilege('anon', ('public.' || t)::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
               'authenticated_any', has_table_privilege('authenticated', ('public.' || t)::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
               'service_role_crud', has_table_privilege('service_role', ('public.' || t)::regclass, 'SELECT,INSERT,UPDATE,DELETE')
           )::text
    from unnest(array['documents', 'document_versions', 'document_field_values', 'document_field_definitions',
                      'form_submission_documents', 'form_submission_signatures']) as t

    union all

    select 'c03_bucket',
           json_build_object(
               'id', b.id,
               'public', b.public,
               'file_size_limit', b.file_size_limit,
               'allowed_mime_types', b.allowed_mime_types,
               'storage_objects_rls', (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
               'client_object_policies', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                                           and roles && array['anon', 'authenticated', 'public']::name[])
           )::text
    from storage.buckets b
) census
order by question_id, payload

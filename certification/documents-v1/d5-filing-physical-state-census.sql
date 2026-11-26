-- Read-only, catalog-only census: did 20261210093500_documents_d5_filing take on the target?
--
-- The Supabase integration applies a PR's migrations on merge (PR #1604, 81556597838b). This proves it from
-- the catalog AND the ledger in ONE statement, so the two cannot disagree about when they were observed.
-- Every check names an object only THIS migration defines; document_add_version (CREATE OR REPLACE of an
-- earlier function) is deliberately not used as a presence proof. The last field is the verdict.
select question_id, kind, payload
from (
    select 'm093500'::text as question_id, 'check'::text as kind,
           ('schema_migrations ~ ledger_row ~ 20261210093500 ~ '
            || (exists (select 1 from supabase_migrations.schema_migrations where version = '20261210093500'))::text) as payload,
           '1'::text as sort_key
    union all
    select 'm093500', 'check',
           'document_file ~ exists ~ ' || (to_regprocedure('public.document_file(uuid, uuid, text, text, uuid, jsonb, text, text, text, uuid, uuid, uuid)') is not null)::text, '2'
    union all
    select 'm093500', 'check',
           'document_file_as_version ~ exists ~ ' || (to_regprocedure('public.document_file_as_version(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid)') is not null)::text, '3'
    union all
    select 'm093500', 'check',
           'document_filing_type ~ exists ~ ' || (to_regprocedure('public.document_filing_type(uuid, text)') is not null)::text, '4'
    union all
    select 'm093500', 'check',
           'document_filing_subject_in_household ~ exists ~ ' || (to_regprocedure('public.document_filing_subject_in_household(uuid, text, uuid, uuid)') is not null)::text, '5'
    union all
    select 'm093500', 'check',
           'document_filing_related ~ exists ~ ' || (to_regprocedure('public.document_filing_related(uuid, text, uuid, text, uuid)') is not null)::text, '6'
    union all
    select 'm093500', 'check',
           'document_filing_existing_of_type ~ exists ~ ' || (to_regprocedure('public.document_filing_existing_of_type(uuid, text, text, uuid, uuid)') is not null)::text, '7'
    union all
    select 'm093500', 'check',
           'document_format_for_mime ~ exists ~ ' || (to_regprocedure('public.document_format_for_mime(text)') is not null)::text, '8'
    union all
    select 'm093500', 'check',
           'document_version_require_review ~ exists ~ ' || (to_regprocedure('public.document_version_require_review(uuid, uuid)') is not null)::text, '9'
    union all
    select 'm093500', 'check',
           'document_file ~ service_role_only ~ '
           || coalesce((select (has_function_privilege('service_role', p, 'EXECUTE')
                                and not has_function_privilege('authenticated', p, 'EXECUTE')
                                and not has_function_privilege('anon', p, 'EXECUTE'))::text
                        from (select to_regprocedure('public.document_file(uuid, uuid, text, text, uuid, jsonb, text, text, text, uuid, uuid, uuid)') as p) x
                        where p is not null), 'false'), '10'
    union all
    select 'm093500', 'check',
           'document_file_as_version ~ service_role_only ~ '
           || coalesce((select (has_function_privilege('service_role', p, 'EXECUTE')
                                and not has_function_privilege('authenticated', p, 'EXECUTE')
                                and not has_function_privilege('anon', p, 'EXECUTE'))::text
                        from (select to_regprocedure('public.document_file_as_version(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid)') as p) x
                        where p is not null), 'false'), '11'
) checks
order by sort_key::int;

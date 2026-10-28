-- Read-only, catalog-only census: did 20261212090000_documents_d6_requirements take on the target, and is it the
-- org/run-bound revision (dfa2fc79837a, slice 6)? Ledger row, the three tables (RLS on, no anon/authenticated privilege,
-- guard trigger), every D6 function service-role only, the unbound two-argument purge absent, the purge SECURITY
-- DEFINER and bound to the QA organizations / qar_ run / archived, and the guards' bypass bound to the function owner.
-- Catalog-only: no FROM on a D6 table, so it answers false (not an error) where the migration has not taken.
-- Existing Documents identities are counted from pre-D6 tables (integrity, compare with the D5 readings).
-- The last field of each check is the verdict.
select question_id, kind, payload
from (
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('schema_migrations ~ ledger_row ~ 20261212090000 ~ ' || (exists (select 1 from supabase_migrations.schema_migrations where version = '20261212090000'))::text) as payload, 1 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirements ~ exists_rls ~ ' || (coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.document_requirements')), false))::text) as payload, 2 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirements ~ no_client_privilege ~ ' || (to_regclass('public.document_requirements') is not null and not exists (select 1 from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public.document_requirements', p)))::text) as payload, 3 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirements ~ guard_trigger ~ ' || (exists (select 1 from pg_trigger where tgrelid = to_regclass('public.document_requirements') and tgname = 'trg_document_requirements_guard' and not tgisinternal))::text) as payload, 4 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_versions ~ exists_rls ~ ' || (coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.document_requirement_versions')), false))::text) as payload, 5 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_versions ~ no_client_privilege ~ ' || (to_regclass('public.document_requirement_versions') is not null and not exists (select 1 from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public.document_requirement_versions', p)))::text) as payload, 6 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_versions ~ guard_trigger ~ ' || (exists (select 1 from pg_trigger where tgrelid = to_regclass('public.document_requirement_versions') and tgname = 'trg_document_requirement_versions_guard' and not tgisinternal))::text) as payload, 7 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_waivers ~ exists_rls ~ ' || (coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.document_requirement_waivers')), false))::text) as payload, 8 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_waivers ~ no_client_privilege ~ ' || (to_regclass('public.document_requirement_waivers') is not null and not exists (select 1 from unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public.document_requirement_waivers', p)))::text) as payload, 9 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_waivers ~ guard_trigger ~ ' || (exists (select 1 from pg_trigger where tgrelid = to_regclass('public.document_requirement_waivers') and tgname = 'trg_document_requirement_waivers_guard' and not tgisinternal))::text) as payload, 10 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_version_problems ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_version_problems(uuid)') as p) x where p is not null), false))::text) as payload, 11 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_validate ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_validate(uuid, uuid, uuid)') as p) x where p is not null), false))::text) as payload, 12 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_publish ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_publish(uuid, uuid, uuid, uuid, uuid)') as p) x where p is not null), false))::text) as payload, 13 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_waiver_grant ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_waiver_grant(uuid, uuid, text, uuid, text, date, uuid)') as p) x where p is not null), false))::text) as payload, 14 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_waiver_revoke ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_waiver_revoke(uuid, uuid, text, uuid)') as p) x where p is not null), false))::text) as payload, 15 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_purge ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_purge(uuid, uuid, text)') as p) x where p is not null), false))::text) as payload, 16 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_purge_active ~ service_role_only ~ ' || (coalesce((select has_function_privilege('service_role', p, 'EXECUTE') and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE') from (select to_regprocedure('public.document_requirement_purge_active()') as p) x where p is not null), false))::text) as payload, 17 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_purge ~ unbound_two_arg_absent ~ ' || (to_regprocedure('public.document_requirement_purge(uuid, uuid)') is null)::text) as payload, 18 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_purge ~ security_definer_org_run_bound ~ ' || (coalesce((select prosecdef and prosrc like '%4acc9386-c485-486f-aa1f-05d83499d142%' and prosrc like '%qar_%' and prosrc like '%archived%' from pg_proc where oid = to_regprocedure('public.document_requirement_purge(uuid, uuid, text)')), false))::text) as payload, 19 as sort_key
    union all
    select 'm090000'::text as question_id, 'check'::text as kind,
           ('document_requirement_purge_active ~ owner_bound ~ ' || (coalesce((select prosrc like '%proowner%' and prosrc like '%current_user%' from pg_proc where oid = to_regprocedure('public.document_requirement_purge_active()')), false))::text) as payload, 20 as sort_key
    union all
    select 'm090000', 'count', 'documents ~ rows ~ ' || (select count(*) from public.documents)::text, 21
    union all
    select 'm090000', 'count', 'document_versions ~ rows ~ ' || (select count(*) from public.document_versions)::text, 22
    union all
    select 'm090000', 'count', 'document_subjects ~ rows ~ ' || (select count(*) from public.document_subjects)::text, 23
) checks
order by sort_key;

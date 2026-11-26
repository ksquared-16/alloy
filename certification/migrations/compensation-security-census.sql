-- Catalog-only. Not one FROM against employment_compensation_terms itself: a census
-- that reads the new table fails at parse time wherever it has not been applied, and
-- the whole point is to ask whether it is there.
select 'c1_table_exists' as question_id, 'count' as kind, count(*)::text as payload
from pg_tables where schemaname='public' and tablename='employment_compensation_terms'
union all
select 'c2_rls_enabled', 'text', coalesce((select relrowsecurity::text from pg_class
  where relname='employment_compensation_terms' and relnamespace='public'::regnamespace), 'absent')
union all
select 'c3_authenticated_grants', 'count', count(*)::text
from information_schema.role_table_grants
where table_schema='public' and table_name='employment_compensation_terms' and grantee='authenticated'
union all
select 'c4_policy_names', 'text', coalesce(string_agg(polname, ',' order by polname), 'none')
from pg_policy where polrelid = to_regclass('public.employment_compensation_terms')
union all
select 'c5_capability_keys', 'text', coalesce(string_agg(key, ',' order by key), 'none')
from public.permission_definitions where key like 'staff.compensation%'
union all
select 'c6_roles_granted', 'text', coalesce(string_agg(distinct role_key, ','), 'none')
from public.role_permission_grants where permission_key like 'staff.compensation%';

-- RLS TENANCY REPAIR V1 — is the app_users predicate table live on the DEPLOYED database?
--
-- 51 tables carry a write policy of the shape
--   EXISTS (SELECT 1 FROM app_users au WHERE au.id = auth.uid() AND au.role = ANY(ARRAY['admin','ops']))
-- with NO org predicate, though the target tables and app_users both have org_id.
--
-- Whether that is a LIVE cross-tenant permit or a LATENT one turns entirely on whether app_users is
-- populated. On the certification database it holds ZERO rows and the product references it in ZERO
-- files, which would mean the policies currently DENY everyone. I must not generalise a local
-- emptiness to the deployed estate — a populated app_users there would make this live today, and the
-- two readings call for different urgency in the same repair.
--
-- Read-only. Output contract: question_id | kind | payload.
select question_id, kind, payload from (
    select 'a1_app_users'::text as question_id, 'total_rows'::text as kind,
           count(*)::text as payload, '1a'::text as sort_key from public.app_users
    union all select 'a1_app_users','rows_with_admin_or_ops',
           count(*)::text,'1b' from public.app_users where role in ('admin','ops')
    union all select 'a1_app_users','distinct_orgs',
           count(distinct org_id)::text,'1c' from public.app_users
    union all select 'a1_app_users','rows_whose_auth_user_exists',
           count(*)::text,'1d' from public.app_users au where exists (select 1 from auth.users u where u.id = au.id)

    -- The live identity table, for contrast.
    union all select 'a2_user_roles','total_rows', count(*)::text,'2a' from public.user_roles
    union all select 'a2_user_roles','distinct_orgs', count(distinct org_id)::text,'2b' from public.user_roles
    union all select 'a2_user_roles','admin_or_ops', count(*)::text,'2c' from public.user_roles where role in ('admin','ops')

    -- Scale of the defect shape as deployed, re-derived rather than inherited.
    union all select 'a3_shape','tables_with_app_users_write_policy_no_org',
           count(distinct tablename)::text,'3a'
      from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%app_users%'
        and (coalesce(qual,'')||coalesce(with_check,'')) not like '%org_id%'
        and (coalesce(qual,'')||coalesce(with_check,'')) not like '%has_org_role%'
    union all select 'a3_shape','of_those_with_direct_org_id_column', count(*)::text,'3b' from (
        select distinct p.tablename from pg_policies p
          join information_schema.columns c on c.table_name=p.tablename and c.column_name='org_id' and c.table_schema='public'
         where p.schemaname='public' and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
           and (coalesce(p.qual,'')||coalesce(p.with_check,'')) like '%app_users%'
           and (coalesce(p.qual,'')||coalesce(p.with_check,'')) not like '%org_id%'
           and (coalesce(p.qual,'')||coalesce(p.with_check,'')) not like '%has_org_role%') x

    -- The two tautologies, confirmed as deployed.
    union all select 'a4_tautology','work_units_policies_with_self_comparison', count(*)::text,'4a'
      from pg_policies where schemaname='public' and tablename='work_units'
        and (qual ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)' or with_check ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)')
    union all select 'a4_tautology','estate_wide_self_comparison_policies', count(*)::text,'4b'
      from pg_policies where schemaname='public'
        and (qual ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)' or with_check ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)')

    -- payment_provider_disputes, re-proved as deployed (separate slice, discovery only).
    union all select 'a5_disputes','rls_enabled',
           coalesce((select relrowsecurity::text from pg_class where relname='payment_provider_disputes'),'absent'),'5a'
    union all select 'a5_disputes','policy_count',
           (select count(*)::text from pg_policies where tablename='payment_provider_disputes'),'5b'
    union all select 'a5_disputes','authenticated_privileges',
           coalesce((select string_agg(distinct privilege_type,',') from information_schema.role_table_grants
                     where table_name='payment_provider_disputes' and grantee='authenticated'),'none'),'5c'
    union all select 'a5_disputes','distinct_orgs_in_table',
           coalesce((select count(distinct org_id)::text from public.payment_provider_disputes),'0'),'5d'

    union all select 'a6_population','orgs', count(*)::text,'6a' from public.orgs
) rows order by sort_key;

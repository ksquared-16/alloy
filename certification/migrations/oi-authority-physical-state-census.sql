-- Read-only census: is 20260915120000 PHYSICALLY present, and does the ledger still lack it?
--
-- The promoted apply reported migration_applied_ledger_incomplete - the split state PR #930 designed
-- for. This census is the evidence the governed ledger repair reads, so it is shaped to that reader:
-- every m<last six> row ends in " ~ true" (any other final segment counts as a mismatch), and
-- ledger_version rows shaped "<version> ~ registered ~ present|absent ~ <bool>" are what make parity
-- report BEHIND. ledger_head and ledger_total ride in the same read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
with src as (
    select case when exists (
             select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname='public' and p.proname='seed_default_rbac')
           then pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) else '' end as def
),
regions as (
    select def,
           case when position('W12:ADMIN-GRANTS:BEGIN' in def) > 0
                then substr(def, position('W12:ADMIN-GRANTS:BEGIN' in def),
                            position('W12:ADMIN-GRANTS:END' in def) - position('W12:ADMIN-GRANTS:BEGIN' in def))
                else '' end as admin_region,
           case when position('W12:OPS-GRANTS:BEGIN' in def) > 0
                then substr(def, position('W12:OPS-GRANTS:BEGIN' in def),
                            position('W12:OPS-GRANTS:END' in def) - position('W12:OPS-GRANTS:BEGIN' in def))
                else '' end as ops_region
    from src
)
select question_id, kind, payload
from (
    select 'm120000'::text, 'physical'::text,
           ('seed installed with both sentinel regions ~ expected true ~ got '
            || (def <> '' and admin_region <> '' and ops_region <> '')::text
            || ' ~ ' || (def <> '' and admin_region <> '' and ops_region <> '')::text)::text, 'a1'::text
    from regions
    union all
    select 'm120000'::text, 'physical'::text,
           ('ops enumeration no longer grants reports.write ~ expected true ~ got '
            || (position('''reports.write''' in ops_region) = 0)::text
            || ' ~ ' || (position('''reports.write''' in ops_region) = 0)::text)::text, 'a2'::text
    from regions
    union all
    select 'm120000'::text, 'physical'::text,
           ('ops enumeration keeps reports.read ~ expected true ~ got '
            || (position('''reports.read''' in ops_region) > 0)::text
            || ' ~ ' || (position('''reports.read''' in ops_region) > 0)::text)::text, 'a3'::text
    from regions
    union all
    select 'm120000'::text, 'physical'::text,
           ('admin enumeration keeps both reports keys ~ expected true ~ got '
            || ((position('''reports.read''' in admin_region) > 0)
            and (position('''reports.write''' in admin_region) > 0))::text
            || ' ~ ' || ((position('''reports.read''' in admin_region) > 0)
            and (position('''reports.write''' in admin_region) > 0))::text)::text, 'a4'::text
    from regions
    union all
    -- The existing-org correction: no class-A ops grant of reports.write may survive.
    select 'm120000'::text, 'physical'::text,
           ('class_A ops reports.write grants remaining ~ expected 0 ~ got '
            || (select count(*) from public.role_permission_grants g
                 where g.role_key='ops' and g.permission_key='reports.write' and g.allowed
                   and not exists (select 1 from public.mutation_events m
                        join public.role_definitions rd on rd.id=m.subject_id and rd.org_id=m.org_id
                       where m.org_id=g.org_id and m.subject_type='role' and rd.role_key='ops'
                         and (coalesce(m.new_state,'') like '%reports.write%'
                           or coalesce(m.previous_state,'') like '%reports.write%')))::text
            || ' ~ ' || ((select count(*) from public.role_permission_grants g
                 where g.role_key='ops' and g.permission_key='reports.write' and g.allowed
                   and not exists (select 1 from public.mutation_events m
                        join public.role_definitions rd on rd.id=m.subject_id and rd.org_id=m.org_id
                       where m.org_id=g.org_id and m.subject_type='role' and rd.role_key='ops'
                         and (coalesce(m.new_state,'') like '%reports.write%'
                           or coalesce(m.previous_state,'') like '%reports.write%'))) = 0)::text)::text,
           'a5'::text
    union all
    select 'm120000'::text, 'physical'::text,
           ('orgs trigger still calls seed_default_rbac ~ expected >=1 ~ got '
            || (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                 join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='orgs' and not t.tgisinternal
                  and pg_get_triggerdef(t.oid) like '%seed_default_rbac%')::text
            || ' ~ ' || ((select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                 join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='orgs' and not t.tgisinternal
                  and pg_get_triggerdef(t.oid) like '%seed_default_rbac%') >= 1)::text)::text, 'a6'::text

    union all
    select 'ledger_version'::text, 'ledger'::text,
           (v || ' ~ registered ~ '
            || case when exists (select 1 from supabase_migrations.schema_migrations m where m.version=v)
                    then 'present' else 'absent' end
            || ' ~ ' || exists (select 1 from supabase_migrations.schema_migrations m where m.version=v)::text)::text,
           'y_' || v
    from (values ('20260915120000')) as t(v)
    union all
    select 'ledger_head'::text,'max'::text, coalesce(max(m.version)::text,'none'),'zzzz1'::text
    from supabase_migrations.schema_migrations m
    union all
    select 'ledger_total'::text,'count'::text, count(*)::text,'zzzz2'::text
    from supabase_migrations.schema_migrations m
    union all
    select 'nonvacuity'::text,'guard'::text,
           ('grants_total=' || (select count(*) from public.role_permission_grants)::text
            || ' ops_roles=' || (select count(*) from public.role_definitions where role_key='ops')::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;

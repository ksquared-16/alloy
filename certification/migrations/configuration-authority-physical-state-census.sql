-- Read-only census: are 20260914183000 and 20260914184000 PHYSICALLY present on the deployed primary?
--
-- The Department slice's merge refused with `hosted_migration_behind`: the deployed primary's ledger
-- does not report the two migrations the Option Sets + Layouts + Fields slice promoted in PR #959.
-- That slice reported COMPLETE_PROMOTED, so the likeliest state is the one PR #930 designed for —
-- schema applied, ledger identity absent — and the governed recovery is to prove the effects and
-- repair the ledger, never to re-apply.
--
-- This census does NOT assume that. It asks the database, and a `false` here means the promotion is
-- genuinely incomplete rather than merely unrecorded, which is a different problem with a different
-- owner.
--
-- Question ids are `m<last six of version>` because that is what the ledger repair reads.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
with src as (
    select case
             when exists (
               select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'seed_default_rbac'
             )
             then pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure)
             else ''
           end as def
),
regions as (
    select def,
           case when position('W12:ADMIN-GRANTS:BEGIN' in def) > 0 and position('W12:ADMIN-GRANTS:END' in def) > 0
                then substr(def, position('W12:ADMIN-GRANTS:BEGIN' in def),
                            position('W12:ADMIN-GRANTS:END' in def) - position('W12:ADMIN-GRANTS:BEGIN' in def))
                else '' end as admin_region,
           case when position('W12:OPS-GRANTS:BEGIN' in def) > 0 and position('W12:OPS-GRANTS:END' in def) > 0
                then substr(def, position('W12:OPS-GRANTS:BEGIN' in def),
                            position('W12:OPS-GRANTS:END' in def) - position('W12:OPS-GRANTS:BEGIN' in def))
                else '' end as ops_region
    from src
)
select question_id, kind, payload
from (
    -- m183000 — three sensitive configuration keys catalogued, granted to admin, withheld from ops.
    -- The ops exclusion is the half a key count would miss, and it is the half that matters: those
    -- six operations answered ops 403 before that slice.
    select 'm183000'::text as question_id, 'physical'::text as kind,
           ('catalog=' || (select count(*) from public.permission_definitions
                            where key in ('option_sets.delete','layouts.lifecycle','fields.delete') and is_active)::text
            || ' admin_roles_short=' || (
                 select count(*) from public.role_definitions rd
                  where rd.role_key = 'admin' and rd.is_active
                    and (select count(distinct g.permission_key) from public.role_permission_grants g
                          where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                            and g.permission_key in ('option_sets.manage','option_sets.delete',
                                                     'layouts.manage','layouts.lifecycle',
                                                     'fields.manage','fields.delete')) <> 6)::text
            || ' ops_sensitive=' || (select count(*) from public.role_permission_grants
                                      where role_key = 'ops'
                                        and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete'))::text
            || ' director_sensitive=' || (select count(*) from public.role_permission_grants
                                           where role_key in ('school_director','regional_lead')
                                             and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete'))::text
           )::text as payload, 'a1'::text as sort_key

    union all
    -- m184000 — the INSTALLED seed carries the three keys for admin and for nobody else, and still
    -- grants ops the manage keys it exercises through Config Layout Assist.
    select 'm184000'::text, 'physical'::text,
           ('fn_installed=' || (case when def = '' then 'false' else 'true' end)
            || ' sentinels=' || (case when admin_region <> '' and ops_region <> '' then 'true' else 'false' end)
            || ' admin_has_option_sets_delete=' || (position('''option_sets.delete''' in admin_region) > 0)::text
            || ' admin_has_layouts_lifecycle=' || (position('''layouts.lifecycle''' in admin_region) > 0)::text
            || ' admin_has_fields_delete=' || (position('''fields.delete''' in admin_region) > 0)::text
            || ' ops_has_any_sensitive=' || ((position('''option_sets.delete''' in ops_region) > 0)
                                          or (position('''layouts.lifecycle''' in ops_region) > 0)
                                          or (position('''fields.delete''' in ops_region) > 0))::text
            || ' ops_keeps_manage=' || ((position('''option_sets.manage''' in ops_region) > 0)
                                    and (position('''layouts.manage''' in ops_region) > 0)
                                    and (position('''fields.manage''' in ops_region) > 0))::text
           )::text, 'a2'::text
    from regions

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('catalog_total=' || (select count(*) from public.permission_definitions)::text
            || ' admin_roles=' || (select count(*) from public.role_definitions where role_key='admin' and is_active)::text
            || ' grants_total=' || (select count(*) from public.role_permission_grants)::text)::text,
           'z1'::text
) q
order by sort_key;

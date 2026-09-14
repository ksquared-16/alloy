-- Read-only census: are 20260915090000 and 20260915091000 PHYSICALLY present on the deployed primary?
--
-- The promoted apply reported `migration_applied_ledger_incomplete` — the designed split state
-- recorded in PR #930: the schema change lands and the ledger identity does not. The governed
-- recovery is to prove the EFFECTS and then repair the ledger, never to re-apply.
--
-- Question ids are named `m<last six of version>` because that is what the ledger repair reads; a
-- physical check under any other name is invisible to it and the repair treats the version as
-- unproven.
--
-- What counts as proof for each:
--
--   20260915090000 catalogues two capabilities and grants both to every administrator. A key count
--                  alone would call a half-applied migration applied, so the shape is asserted too:
--                  admin holds both, and ops and the director roles hold NEITHER. The ops exclusion
--                  is the half that matters — all eight converged routes answered ops 403 before
--                  this slice, and a migration that quietly widened ops would be invisible to a
--                  count. It must also be true that no `departments.*` capability exists: the whole
--                  point of the slice is that the retired product gains no vocabulary.
--
--   20260915091000 redefines `seed_default_rbac` so a NEW organization is born with both keys. Its
--                  evidence is the INSTALLED function's own text and the trigger that calls it.
--                  Reading `pg_get_functiondef` is what makes this a statement about the database
--                  rather than about the repository.
--
-- Output contract: question_id | kind | payload. The parser takes the first two columns as identity,
-- so the answer must be third. One statement, no DDL, no writes.
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
    -- m090000 — the capabilities exist, and the grant SHAPE is the one the migration promised.
    select 'm090000'::text as question_id, 'physical'::text as kind,
           ('catalog=' || (select count(*) from public.permission_definitions
                            where key in ('business_process.configure','business_process.activate') and is_active)::text
            || ' admin_roles_missing_a_key=' || (
                 select count(*) from public.role_definitions rd
                  where rd.role_key = 'admin' and rd.is_active
                    and (select count(distinct g.permission_key) from public.role_permission_grants g
                          where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                            and g.permission_key in ('business_process.configure','business_process.activate')) <> 2)::text
            || ' ops_grants=' || (select count(*) from public.role_permission_grants
                                   where role_key = 'ops'
                                     and permission_key in ('business_process.configure','business_process.activate'))::text
            || ' director_grants=' || (select count(*) from public.role_permission_grants
                                        where role_key in ('school_director','regional_lead')
                                          and permission_key in ('business_process.configure','business_process.activate'))::text
            || ' departments_keys=' || (select count(*) from public.permission_definitions where key like 'departments.%')::text
           )::text as payload,
           'a1'::text as sort_key

    union all
    -- m091000 — the INSTALLED seed carries both keys for admin, for nobody else, and the trigger
    -- that calls it is still wired. A redefinition nobody calls changes nothing for a new tenant.
    select 'm091000'::text, 'physical'::text,
           ('fn_installed=' || (case when def = '' then 'false' else 'true' end)
            || ' sentinels=' || (case when admin_region <> '' and ops_region <> '' then 'true' else 'false' end)
            || ' admin_has_configure=' || (position('''business_process.configure''' in admin_region) > 0)::text
            || ' admin_has_activate=' || (position('''business_process.activate''' in admin_region) > 0)::text
            || ' ops_has_either=' || ((position('''business_process.configure''' in ops_region) > 0)
                                   or (position('''business_process.activate''' in ops_region) > 0))::text
            || ' fn_names_departments_key=' || (position('''departments.' in def) > 0)::text
            || ' trigger=' || (select count(*) from pg_trigger t
                                join pg_class c on c.oid = t.tgrelid
                                join pg_namespace n on n.oid = c.relnamespace
                               where n.nspname = 'public' and c.relname = 'orgs'
                                 and not t.tgisinternal
                                 and pg_get_triggerdef(t.oid) like '%seed_default_rbac%')::text
           )::text, 'a2'::text
    from regions

    union all
    -- Non-vacuity. A zero above must be distinguishable from an empty or wrong-tenant read.
    select 'nonvacuity'::text, 'guard'::text,
           ('catalog_total=' || (select count(*) from public.permission_definitions)::text
            || ' admin_roles=' || (select count(*) from public.role_definitions where role_key = 'admin' and is_active)::text
            || ' grants_total=' || (select count(*) from public.role_permission_grants)::text)::text,
           'z1'::text
) q
order by sort_key;

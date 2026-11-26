-- Read-only census: did 20260915140000_access_administration_split actually take
-- on the target, or does the ledger merely say so?
--
-- WHY THIS EXISTS. `database.apply_migration` reported Succeeded for staging. That
-- is a statement about the runner, not about the database: a version collision can
-- produce a silent FALSE SKIP, and `apply.ok = true` has been observed beside an
-- unmoved ledger before (G5). The stake here is unusually high in ONE direction —
-- the application code shipped first. Staging is already serving handlers that
-- demand `admin.users.read`, `admin.roles.write` and friends. If this migration did
-- not run, no role holds any of them and the Access workspace is closed to every
-- operator in every organization, with no product path back.
--
-- WHAT IT MUST NOT BE. Proof that the migration ran, inferred from someone having
-- run it. Every row below asserts a property THIS migration defines and that no
-- other migration in the tree produces, so a database that never received it
-- cannot answer `true`:
--
--   * the two capabilities it catalogues, and that they are ACTIVE;
--   * the umbrella pair deactivated — this file is the only thing that sets
--     `is_active = false` on them;
--   * not one surviving grant of the umbrella, anywhere;
--   * the provisioning function it defines, which exists nowhere else;
--   * both sentinel regions rewritten: admin naming all six authorities, ops
--     naming both reads and NEITHER write;
--   * the re-keyed self-lockout guard inside `replace_role_permission_grants`,
--     and the W-18 ceiling surviving that rewrite;
--   * the tenant outcome itself — every org's admin holding all six, every org's
--     ops holding the two reads and none of the four writes.
--
-- Deliberately NOT "the admin enumeration covers every active catalog key". That
-- is the assertion the migration ABORTS on, and it is unusable as a presence
-- proof: the next lane to catalogue a key makes it false without touching this
-- migration. A presence proof must not be answerable by someone else's work.
--
-- The last field of every row is the verdict. Anything that is not `true` is a
-- mismatch, and one mismatch means the split is not live on the target.
select question_id, kind, payload
from (
    -- 1. THE TWO NEW CAPABILITIES, catalogued and active. Only this file inserts them.
    select 'm915140000'::text as question_id, 'check'::text as kind,
           ('permission_definitions ~ catalogued_active ~ the_two_new_authorities ~ '
            || coalesce((select (count(*) = 2)::text
                         from public.permission_definitions pd
                         where pd.key in ('admin.access_scope.write','attendance.devices.manage')
                           and pd.is_active), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. THE UMBRELLA IS RETIRED. Catalogued (history stays readable) and inactive.
    select 'm915140000', 'check',
           'permission_definitions ~ retired ~ umbrella_pair_inactive ~ '
           || coalesce((select (count(*) = 2)::text
                        from public.permission_definitions pd
                        where pd.key in ('settings.users_roles','settings.users_roles.read')
                          and pd.is_active = false), 'false'),
           '1b'
    union all

    -- 3. NOT ONE SURVIVING GRANT of the umbrella, in any organization.
    select 'm915140000', 'check',
           'role_permission_grants ~ retired ~ no_umbrella_grant_survives ~ '
           || coalesce((select (count(*) = 0)::text
                        from public.role_permission_grants g
                        where g.permission_key like 'settings.users_roles%'), 'false'),
           '1c'
    union all

    -- 4. THE PROVISIONING FUNCTION this migration defines. It exists nowhere else.
    select 'm915140000', 'check',
           'seed_access_administration_split ~ function ~ exists ~ '
           || coalesce((select (count(*) = 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'seed_access_administration_split'), 'false'),
           '1d'
    union all

    -- 5. THE ADMIN REGION names all six authorities, read from the INSTALLED source.
    select 'm915140000', 'check',
           'seed_default_rbac ~ admin_enumeration ~ names_all_six_authorities ~ '
           || coalesce((
                select (count(*) = 6)::text
                from unnest(array['admin.users.read','admin.users.write',
                                  'admin.roles.read','admin.roles.write',
                                  'admin.access_scope.write','attendance.devices.manage']) as k
                where strpos(
                        substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN'),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:END')
                                 - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN')),
                        '''' || k || '''') > 0), 'false'),
           '1e'
    union all

    -- 6. THE OPS REGION keeps both reads. The narrowing removes writing, never reading.
    select 'm915140000', 'check',
           'seed_default_rbac ~ ops_enumeration ~ keeps_both_reads ~ '
           || coalesce((
                select (count(*) = 2)::text
                from unnest(array['admin.users.read','admin.roles.read']) as k
                where strpos(
                        substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN'),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:END')
                                 - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN')),
                        '''' || k || '''') > 0), 'false'),
           '1f'
    union all

    -- 7. AND NONE OF THE FOUR WRITES. This is the Director-approved narrowing.
    select 'm915140000', 'check',
           'seed_default_rbac ~ ops_enumeration ~ withholds_all_four_writes ~ '
           || coalesce((
                select (count(*) = 0)::text
                from unnest(array['admin.users.write','admin.roles.write',
                                  'admin.access_scope.write','attendance.devices.manage']) as k
                where strpos(
                        substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN'),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:END')
                                 - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN')),
                        '''' || k || '''') > 0), 'false'),
           '1g'
    union all

    -- 8. THE RE-KEYED LOCKOUT GUARD. The umbrella was the key it watched; it is
    --    `admin.roles.write` now, and the wording moved with it.
    select 'm915140000', 'check',
           'replace_role_permission_grants ~ guard ~ lockout_rekeyed_to_role_administration ~ '
           || coalesce((select (pg_get_functiondef('public.replace_role_permission_grants(uuid,text,text[],text,text,text)'::regprocedure)
                                like '%removing role administration from%')::text), 'false'),
           '1h'
    union all

    -- 9. THE W-18 CEILING SURVIVED THE REWRITE. This migration does CREATE OR
    --    REPLACE on that function, so its absence here would mean the split had
    --    silently deleted the delegation bound the previous slice installed.
    select 'm915140000', 'check',
           'replace_role_permission_grants ~ guard ~ delegation_ceiling_survives ~ '
           || coalesce((select (pg_get_functiondef('public.replace_role_permission_grants(uuid,text,text[],text,text,text)'::regprocedure)
                                like '%delegation_ceiling:%')::text), 'false'),
           '1i'
    union all

    -- 10. THE TENANT OUTCOME. Every active admin role holds all six — this is what
    --     decides whether a real operator can open the workspace the code now gates.
    select 'm915140000', 'check',
           'role_permission_grants ~ tenants ~ every_admin_holds_all_six ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_definitions rd
                cross join unnest(array['admin.users.read','admin.users.write',
                                        'admin.roles.read','admin.roles.write',
                                        'admin.access_scope.write','attendance.devices.manage']) as k
                where rd.is_active and rd.role_key = 'admin'
                  and not exists (select 1 from public.role_permission_grants g
                                   where g.org_id = rd.org_id and g.role_key = rd.role_key
                                     and g.permission_key = k and g.allowed)), 'false'),
           '1j'
    union all

    -- 11. AND EVERY OPS ROLE holds the two reads.
    select 'm915140000', 'check',
           'role_permission_grants ~ tenants ~ every_ops_holds_both_reads ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_definitions rd
                cross join unnest(array['admin.users.read','admin.roles.read']) as k
                where rd.is_active and rd.role_key = 'ops'
                  and not exists (select 1 from public.role_permission_grants g
                                   where g.org_id = rd.org_id and g.role_key = rd.role_key
                                     and g.permission_key = k and g.allowed)), 'false'),
           '1k'
    union all

    -- 12. AND NO OPS ROLE holds any of the four writes.
    select 'm915140000', 'check',
           'role_permission_grants ~ tenants ~ no_ops_holds_any_write ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_permission_grants g
                where g.role_key = 'ops' and g.allowed
                  and g.permission_key in ('admin.users.write','admin.roles.write',
                                           'admin.access_scope.write','attendance.devices.manage')), 'false'),
           '1l'

    union all

    -- ── Ledger truth, in the same reading ───────────────────────────────────
    -- One census, so the physical state and the ledger state cannot disagree
    -- about WHEN they were observed. A `present` ledger row beside a `false`
    -- physical check is the silent FALSE SKIP this census exists to catch.
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260915130000'), ('20260915140000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '5'
) rows
order by sort_key;

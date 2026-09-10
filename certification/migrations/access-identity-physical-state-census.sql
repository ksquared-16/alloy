-- Read-only census: physical state AND ledger truth for the Access & Identity
-- migration 20260910183000, in the shape `ledgerRepairEvidenceFromCensus` reads.
--
-- WHY THIS EXISTS. `database.apply_promoted_migration` applied this migration to
-- the deployed primary and reported `apply.ok = true`, and the post-apply re-read
-- found the ledger unchanged at 20260910130000. That is G5, named in
-- `trusted-host-ledger-repair.mjs`: the apply runner executes psql and nothing
-- writes `supabase_migrations.schema_migrations`, so the SCHEMA moves and the
-- LEDGER does not. The sanctioned remedy is a ledger repair, and a ledger repair
-- will not register a version on inference — it re-gathers evidence at execution
-- from a completed governed census of the target. This is that census.
--
-- WHAT IT MUST NOT BE. Proof that the migration RAN, inferred from the fact that
-- somebody ran it. Every row below asserts a property THIS migration defines, so
-- a database that never received it cannot answer `true` to them:
--
--   * the trigger that was the whole point — grants now follow an org the way
--     roles already did;
--   * the function that trigger calls, and its security posture;
--   * the three sentinel regions the migration installs into `seed_default_rbac`,
--     read out of the INSTALLED function source rather than from a file;
--   * the administrator contract itself — every active catalog key named in the
--     admin enumeration, which is the assertion the migration aborts on;
--   * the nine keys withheld from ops, likewise read from the installed source;
--   * the repair's own outcome — no active system role left holding nothing,
--     which is the state the initiating defect consisted of;
--   * both director roles holding `fin.read`.
--
-- The last field of every row is the verdict. The reader counts anything that is
-- not `true` as a mismatch, and one mismatch refuses the repair.
select question_id, kind, payload
from (
    -- ── 20260910183000_access_v2_default_role_package_completeness ──────────

    -- 1. THE TRIGGER. The grants half of org seeding, wired to `public.orgs` at
    --    last. Its absence IS the initiating defect.
    select 'm183000'::text as question_id, 'check'::text as kind,
           ('orgs ~ trigger ~ orgs_seed_default_rbac_after_insert_row ~ '
            || coalesce((select (t.tgtype & 4 > 0 and t.tgtype & 1 > 0)::text
                         from pg_trigger t
                         where t.tgrelid = 'public.orgs'::regclass
                           and not t.tgisinternal
                           and t.tgname = 'orgs_seed_default_rbac'), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. THE FUNCTION IT CALLS, and the security posture the migration declares.
    --    A trigger pointing at nothing would satisfy check 1 alone.
    select 'm183000', 'check',
           'orgs_seed_default_rbac ~ function ~ security_definer_search_path ~ '
           || coalesce((select (p.prosecdef
                                and array_to_string(coalesce(p.proconfig, array[]::text[]), ',')
                                    like '%search_path=public, pg_temp%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'orgs_seed_default_rbac'), 'false'),
           '1b'
    union all
    select 'm183000', 'check',
           'orgs_seed_default_rbac ~ function ~ calls_seed_default_rbac ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%seed_default_rbac(new.id)%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'orgs_seed_default_rbac'), 'false'),
           '1c'
    union all

    -- 3. THE SENTINELS, read out of the INSTALLED definition. The director region
    --    is this migration's own; the two W12 regions must survive its rewrite.
    select 'm183000', 'check',
           'seed_default_rbac ~ sentinels ~ admin_ops_director_regions ~ '
           || coalesce((select (pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure)
                                  like '%ACCESSV2:DIRECTOR-GRANTS:BEGIN%'
                                and pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure)
                                  like '%W12:ADMIN-GRANTS:BEGIN%'
                                and pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure)
                                  like '%W12:OPS-GRANTS:BEGIN%')::text), 'false'),
           '1d'
    union all

    -- 4. THE ADMINISTRATOR ENUMERATION GREW. The nine keys catalogued after the
    --    enumeration froze at 57 are now named in it — this migration is the only
    --    thing that put them there, so their presence is a fingerprint of it and
    --    not a global invariant that some later migration could flip.
    --
    --    Deliberately NOT "the enumeration covers every active catalog key". That
    --    is the assertion the migration ABORTS on, and it was the right check at
    --    apply time; as evidence of PRESENCE it is unusable, because the next
    --    lane to catalogue a key makes it false without touching this migration.
    --    A presence proof must not be answerable by someone else's work.
    select 'm183000', 'check',
           'seed_default_rbac ~ admin_enumeration ~ names_the_nine_post_freeze_keys ~ '
           || coalesce((
                select (count(*) = 9)::text
                from unnest(array['fin.adjust','fin.responsibility','fin.subsidy',
                                  'health.view','health.manage',
                                  'attendance.read','attendance.record',
                                  'enrollment.pricing.override','enrollment.requirement_exception.manage']) as k
                where strpos(
                        substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN'),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:END')
                                 - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN')),
                        '''' || k || '''') > 0), 'false'),
           '1e'
    union all

    -- 5. THE OPS EXCLUSIONS, likewise from the installed source. Each of the nine
    --    was withheld by the migration that introduced that key; an enumeration
    --    that grants any of them to ops would be a widening, not a repair.
    select 'm183000', 'check',
           'seed_default_rbac ~ ops_enumeration ~ withholds_the_nine ~ '
           || coalesce((
                select (count(*) = 0)::text
                from unnest(array['admin.users.write','admin.roles.write',
                                  'enrollment.pricing.override','enrollment.requirement_exception.manage',
                                  'fin.adjust','fin.responsibility','fin.subsidy',
                                  'health.view','health.manage']) as k
                where strpos(
                        substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN'),
                               strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:END')
                                 - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN')),
                        '''' || k || '''') > 0), 'false'),
           '1f'
    union all

    -- 6. THE REPAIR'S OUTCOME. An active system role holding no capability at all
    --    is exactly the state the operator reported: admitted to the shell by a
    --    role literal, refused by every surface that checks one.
    select 'm183000', 'check',
           'role_permission_grants ~ repair ~ no_active_system_role_holds_nothing ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_definitions rd
                where rd.is_active
                  and rd.role_key in ('admin','ops','school_director','regional_lead')
                  and not exists (select 1 from public.role_permission_grants g
                                   where g.org_id = rd.org_id and g.role_key = rd.role_key and g.allowed)), 'false'),
           '1g'
    union all

    -- 7. THE DIRECTOR ROLES. `fin.read` for both, everywhere they are defined —
    --    the grant this migration moved from a one-shot into the seed.
    select 'm183000', 'check',
           'role_permission_grants ~ directors ~ fin_read_everywhere_defined ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_definitions rd
                where rd.is_active
                  and rd.role_key in ('school_director','regional_lead')
                  and not exists (select 1 from public.role_permission_grants g
                                   where g.org_id = rd.org_id and g.role_key = rd.role_key
                                     and g.permission_key = 'fin.read' and g.allowed)), 'false'),
           '1h'

    union all

    -- ── Ledger truth, in the same reading ───────────────────────────────────
    -- One census, so the physical state and the ledger state cannot disagree
    -- about WHEN they were observed.
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260910183000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '5'
) rows
order by sort_key;

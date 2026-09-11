-- Read-only census: physical state AND ledger truth for 20260911140000, in the
-- exact shape `ledgerRepairEvidenceFromCensus` reads.
--
-- WHY THIS EXISTS. `database.apply_promoted_migration` reported apply.ok = true
-- with ledger "applied" (tha_995acea0e062da), and the post-apply re-read found
-- the hosted head unchanged at 20260911130000:
--
--   "Applied 20260911140000 but the hosted ledger still does not report those
--    identities. Two measurements disagree; this needs a person."
--
-- That is G5, named in `trusted-host-ledger-repair.mjs`: the apply runner
-- executes psql and nothing writes `supabase_migrations.schema_migrations`, so
-- the SCHEMA moves and the LEDGER does not. It is the same failure this effort
-- hit on 20260910183000. The sanctioned remedy is a ledger repair, and a repair
-- will not register a version on inference -- it re-gathers evidence at
-- execution from a completed governed census of the target. This is that census.
--
-- WHY NOT THE EXISTING W-13 CENSUS. `w13-portal-access-hosted-state-census.sql`
-- answers the human question and reports counts in its verdict position. The
-- repair reader treats anything that is not the literal `true` as a mismatch,
-- and one mismatch refuses the repair, so a count row would read as damage. Same
-- subject, different contract: this file is the machine-readable one, and its
-- question_id is `m140000` because the reader keys on the last six digits of the
-- version.
--
-- WHAT IT MUST NOT BE. Proof that the migration RAN, inferred from the fact that
-- somebody ran it. Every row below asserts a property THIS migration defines, so
-- a database that never received it cannot answer `true`:
--
--   * the catalog row, with the group and label the migration writes;
--   * the preservation grants, asserted as "no admin/ops role_definition lacks
--     it" rather than as a count, because the denominator differs per tenant;
--   * the exclusion the migration promises -- no OTHER system role gained it;
--   * `portal.access` named in BOTH enumerated regions of the installed
--     `seed_default_rbac`, read out of the function source rather than a file;
--   * the frozen historical catalog literal left UNEDITED, which is the one
--     property a careless re-implementation would get wrong.
--
-- The last field of every row is the verdict. One census, so "the schema has it"
-- and "the ledger does not" cannot be read from two different moments.
select question_id, kind, payload
from (
    -- ── 20260911140000_w13_portal_access_capability_admission ───────────────

    -- 1. THE CATALOG ROW. Section 1 of the migration writes it first, and the
    --    group is what gives the key an operator-facing home in the role editor.
    select 'm140000'::text as question_id, 'check'::text as kind,
           ('permission_definitions ~ portal.access ~ active_in_group_portal ~ '
            || coalesce((select (pd.is_active and pd.group_key = 'portal')::text
                         from public.permission_definitions pd
                         where pd.key = 'portal.access'), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. The label the migration wrote. A row created by some other hand would
    --    satisfy check 1 and fail this one.
    select 'm140000', 'check',
           'permission_definitions ~ portal.access ~ label_access_operator_portal ~ '
           || coalesce((select (pd.label = 'Access operator portal')::text
                        from public.permission_definitions pd
                        where pd.key = 'portal.access'), 'false'),
           '1b'
    union all

    -- 3. THE PRESERVATION GRANT, admin. Stated as an absence of gaps rather than
    --    as a count: the denominator is however many organizations this tenant
    --    defines, and a count would have to be known in advance to be read.
    select 'm140000', 'check',
           'role_permission_grants ~ admin ~ every_org_granted ~ '
           || (not exists (
                  select 1
                  from public.role_definitions rd
                  where rd.role_key = 'admin'
                    and not exists (
                        select 1 from public.role_permission_grants g
                        where g.org_id = rd.org_id and g.role_key = rd.role_key
                          and g.permission_key = 'portal.access' and g.allowed
                    )
              ))::text,
           '2a'
    union all

    -- 4. The same for ops. Both roles were admitted by the deleted literal, so
    --    both must hold the capability or the code change is a lockout.
    select 'm140000', 'check',
           'role_permission_grants ~ ops ~ every_org_granted ~ '
           || (not exists (
                  select 1
                  from public.role_definitions rd
                  where rd.role_key = 'ops'
                    and not exists (
                        select 1 from public.role_permission_grants g
                        where g.org_id = rd.org_id and g.role_key = rd.role_key
                          and g.permission_key = 'portal.access' and g.allowed
                    )
              ))::text,
           '2b'
    union all

    -- 5. AND NOBODY ELSE. The migration promises preservation, not widening, and
    --    aborts rather than leave another system role holding admission.
    select 'm140000', 'check',
           'role_permission_grants ~ other_system_roles ~ none_granted ~ '
           || (not exists (
                  select 1
                  from public.role_permission_grants g
                  join public.role_definitions rd
                    on rd.org_id = g.org_id and rd.role_key = g.role_key
                  where g.permission_key = 'portal.access' and g.allowed
                    and rd.is_system = true
                    and g.role_key not in ('admin', 'ops')
              ))::text,
           '2c'
    union all

    -- 6/7. THE SEED, so a NEW organization is born admissible. Read out of the
    --      INSTALLED function between the sentinels the function itself carries,
    --      never from a file -- a file says what the repository intends and this
    --      has to say what the database holds.
    select 'm140000', 'check',
           'seed_default_rbac ~ admin_region ~ names_portal_access ~ '
           || coalesce((
                select (strpos(
                          substr(src,
                                 strpos(src, 'W12:ADMIN-GRANTS:BEGIN'),
                                 greatest(strpos(src, 'W12:ADMIN-GRANTS:END') - strpos(src, 'W12:ADMIN-GRANTS:BEGIN'), 0)),
                          '''portal.access''') > 0)::text
                from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) s
              ), 'false'),
           '3a'
    union all
    select 'm140000', 'check',
           'seed_default_rbac ~ ops_region ~ names_portal_access ~ '
           || coalesce((
                select (strpos(
                          substr(src,
                                 strpos(src, 'W12:OPS-GRANTS:BEGIN'),
                                 greatest(strpos(src, 'W12:OPS-GRANTS:END') - strpos(src, 'W12:OPS-GRANTS:BEGIN'), 0)),
                          '''portal.access''') > 0)::text
                from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) s
              ), 'false'),
           '3b'
    union all

    -- 8. THE FROZEN LITERAL, LEFT ALONE. The catalog INSERT inside the function
    --    is a reproduction of what the catalog held on 2026-07-29 and this
    --    migration deliberately does not touch it -- `permission_definitions` is
    --    global, so section 1 already put the row there. A re-implementation that
    --    "helpfully" added the key to that list would pass every check above and
    --    fail this one, which is why it is here.
    select 'm140000', 'check',
           'seed_default_rbac ~ historical_catalog_literal ~ unedited ~ '
           || coalesce((
                select (strpos(
                          substr(src, 1, greatest(strpos(src, 'W12:ADMIN-GRANTS:BEGIN') - 1, 0)),
                          '''portal.access''') = 0)::text
                from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) s
              ), 'false'),
           '3c'
    union all

    -- ── Ledger truth, in the same reading ───────────────────────────────────
    -- One census, so the physical state and the ledger state cannot disagree
    -- about WHEN they were observed. This is the pair the repair exists to
    -- reconcile: rows above saying present, the row below saying absent.
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '4' || v.version
    from (values ('20260911140000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '5'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '6'
) rows
order by sort_key;

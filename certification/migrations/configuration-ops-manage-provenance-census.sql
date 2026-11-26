-- Read-only census: WHICH ops roles fail the CONFIGAUTH self-test, and did they ever hold the key?
--
-- A governed apply of 20260914183000 refused inside its own PL/pgSQL with
--   "CONFIGAUTH SELF-TEST: 2 ops role(s) lost a manage key they already exercised through
--    Config Layout Assist"
-- The predicate counts ACTIVE ops roles that do not currently hold all three of
-- option_sets.manage, layouts.manage and fields.manage. It does not establish that any of them ever
-- held the key it reports as lost, and the migration grants ops nothing, so it cannot be the cause
-- of a loss. This census asks the database to tell the difference between three very different
-- states that the one assertion cannot distinguish:
--
--   NEVER_GRANTED      no grant row at all — the role was created before the key existed, or by a
--                      seed that did not enumerate it. Nothing was lost.
--   EXPLICITLY_DENIED  a row with allowed = false — an organization deliberately revoked it. That is
--                      configuration working, and a migration must not silently reinstate it.
--   REVOKED_AFTER_USE  granted once, later removed, with an audit trail saying so. That is the only
--                      state the assertion's wording actually describes.
--
-- The decision between preserving, removing, or correcting the assertion depends entirely on which
-- of those three it is, so naming them is the whole point.
--
-- Org ids are opaque internal identifiers; no user identity is read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
with ops_roles as (
    select rd.org_id, rd.role_key, rd.is_active
    from public.role_definitions rd
    where rd.role_key = 'ops'
),
manage_keys as (
    select k from (values ('option_sets.manage'),('layouts.manage'),('fields.manage')) as t(k)
),
holdings as (
    select r.org_id, r.is_active, m.k,
           g.permission_key is not null as has_row,
           coalesce(g.allowed, false)   as allowed
    from ops_roles r
    cross join manage_keys m
    left join public.role_permission_grants g
           on g.org_id = r.org_id and g.role_key = 'ops' and g.permission_key = m.k
),
failing as (
    -- Exactly the self-test's own population: active ops roles short of all three.
    select org_id
    from holdings
    where is_active
    group by org_id
    having count(*) filter (where allowed) <> 3
)
select question_id, kind, payload
from (
    -- Does the deployed state still reproduce the refusal at all?
    select 'selftest_population'::text, 'decisive'::text,
           ('active_ops_roles=' || (select count(*) from ops_roles where is_active)::text
            || ' failing_the_assertion=' || (select count(*) from failing)::text
            || ' total_ops_roles=' || (select count(*) from ops_roles)::text)::text,
           'a1'::text

    union all
    -- Per failing org: which key is missing, and in WHICH of the three states.
    select 'failing_role'::text, 'provenance'::text,
           (h.org_id::text || ' ~ ' || h.k || ' ~ '
            || case when h.allowed then 'held'
                    when h.has_row then 'EXPLICITLY_DENIED'
                    else 'NEVER_GRANTED' end
            || ' ~ ' || h.allowed::text)::text,
           'b_' || h.org_id::text || '_' || h.k
    from holdings h
    join failing f on f.org_id = h.org_id
    where h.is_active and not h.allowed

    union all
    -- The audit answer. Did any event ever mention this key for this org's ops role? If the key was
    -- never in an event, "lost" is not a description of anything that happened.
    select 'audit_trace'::text, 'provenance'::text,
           (f.org_id::text || ' ~ events_mentioning_a_manage_key ~ '
            || (select count(*) from public.mutation_events m
                 join public.role_definitions rd on rd.id = m.subject_id and rd.org_id = m.org_id
                where m.org_id = f.org_id and m.subject_type = 'role' and rd.role_key = 'ops'
                  and (coalesce(m.new_state,'') like '%manage%' or coalesce(m.previous_state,'') like '%manage%'))::text
            || ' ~ ' || ((select count(*) from public.mutation_events m
                 join public.role_definitions rd on rd.id = m.subject_id and rd.org_id = m.org_id
                where m.org_id = f.org_id and m.subject_type = 'role' and rd.role_key = 'ops'
                  and (coalesce(m.new_state,'') like '%manage%' or coalesce(m.previous_state,'') like '%manage%')) > 0)::text)::text,
           'c_' || f.org_id::text
    from failing f

    union all
    -- Is the admin role in those same orgs whole? An org short on BOTH roles reads as never-seeded
    -- rather than as a revocation.
    select 'admin_in_failing_orgs'::text, 'context'::text,
           (f.org_id::text || ' ~ admin_manage_keys_held ~ '
            || (select count(distinct g.permission_key) from public.role_permission_grants g
                 where g.org_id = f.org_id and g.role_key = 'admin' and g.allowed
                   and g.permission_key in ('option_sets.manage','layouts.manage','fields.manage'))::text
            || ' ~ of3')::text,
           'd_' || f.org_id::text
    from failing f

    union all
    -- Ledger truth for the two versions this mission is about.
    select 'ledger_version'::text, 'ledger'::text,
           (v || ' ~ registered ~ '
            || case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)
                    then 'present' else 'absent' end
            || ' ~ ' || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)::text)::text,
           'y_' || v
    from (values ('20260914183000'),('20260914184000')) as t(v)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text,'none'), 'zzzz1'::text
    from supabase_migrations.schema_migrations m
    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zzzz2'::text
    from supabase_migrations.schema_migrations m

    union all
    -- Did the migration's own effects land? Distinguishes "never applied" from "applied, and the
    -- assertion now fires on drift that arrived afterwards".
    select 'migration_effects'::text, 'physical'::text,
           ('sensitive_keys_catalogued=' || (select count(*) from public.permission_definitions
              where key in ('option_sets.delete','layouts.lifecycle','fields.delete') and is_active)::text
            || ' admin_roles_short_of_six=' || (select count(*) from public.role_definitions rd
              where rd.role_key='admin' and rd.is_active
                and (select count(distinct g.permission_key) from public.role_permission_grants g
                      where g.org_id=rd.org_id and g.role_key='admin' and g.allowed
                        and g.permission_key in ('option_sets.manage','option_sets.delete','layouts.manage',
                                                 'layouts.lifecycle','fields.manage','fields.delete')) <> 6)::text
            || ' ops_holding_sensitive=' || (select count(*) from public.role_permission_grants
              where role_key='ops' and allowed
                and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete'))::text)::text,
           'e1'::text

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('orgs_with_roles=' || (select count(distinct org_id) from public.role_definitions)::text
            || ' grants_total=' || (select count(*) from public.role_permission_grants)::text
            || ' mutation_events=' || (select count(*) from public.mutation_events)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;

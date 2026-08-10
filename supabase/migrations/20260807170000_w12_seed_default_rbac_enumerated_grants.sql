-- =============================================================================
-- W-12 / M6 — seed_default_rbac() enumerates its grants
--
-- Plan of record: docs/platform/planning/vacilando-os/qa/access-identity-v2/
--                 03-implementation-qa-sequence.md §7 (W-12), §11 (M6)
-- Closes:         G5 — "a grant seed must not be a SELECT over the catalog"
-- Lock:           RL-8 (web/tests/access/grantSeedEnumeration.test.ts)
--
-- WHAT IS WRONG TODAY
-- -------------------
-- `seed_default_rbac()` — as rewritten by the Access & Roles V2 Phase 0 migration
-- (20260729120000, §6) — ends with two blanket statements:
--
--     insert into public.role_permission_grants (...)
--     select p_org_id, 'admin', pd.key, true
--     from public.permission_definitions pd
--     where pd.is_active = true;
--
--     ... the same for 'ops', minus admin.users.write / admin.roles.write.
--
-- The default grant set is therefore *derived from the catalog's contents*. Any
-- migration that seeds a key silently widens what every future organization's
-- `admin` and `ops` receive, and nothing states that widening anywhere. That is
-- G5. It is also why the catalog and the grant set cannot be reasoned about
-- separately: W-11 measured 57 catalog keys of which 36 are enforced by nothing,
-- and all 57 are granted to every org's admin, by this SELECT.
--
-- WHAT THIS MIGRATION CHANGES — AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------
-- §11's M6 row requires this migration to state which half of the function it is
-- changing, because Phase 0 made `seed_default_rbac` a *catalog writer* as well
-- as a grant writer.
--
--   * CHANGED — the grant half. The two blanket SELECTs become two literal
--     enumerations: 57 rows for `admin`, 55 for `ops`. Adding a catalog key now
--     grants nothing until someone adds it to a list here, on purpose.
--   * UNCHANGED — the catalog half. The 57-key `permission_definitions` literal
--     is reproduced byte-for-byte from 20260729120000. Editing it belongs to
--     W-11/M5, whose deletion list is still awaiting operator review. A worker
--     narrowing it here would pre-empt that review.
--
-- BEHAVIOUR
-- ---------
-- Behaviour-preserving *against this repository's migration tree*: the enumerated
-- sets are exactly the sets the blanket SELECTs produce over the 57 keys the tree
-- seeds. `admin` = all 57; `ops` = 57 less `admin.users.write` and
-- `admin.roles.write`, which is the same exclusion the blanket carried. The
-- blanket's `is_active = true` predicate survives as a narrowing `EXISTS` guard on
-- the enumeration — it can only remove a key from the list, never add one, so the
-- key set is still decided by the list and not by the catalog.
--
-- Behaviour-preserving *against the target database* is asserted, not assumed —
-- see the guard below. §11's stated preflight focus for M6 is "catalog width vs
-- live — a new tenant must not silently get a thinner set", and W-11 recorded
-- (precondition P3) that no live measurement has been taken: the trusted host
-- action `database.read_census` is the channel and no worker can reach it. So
-- the check that would have been a preflight is carried *inside the migration*
-- as a fail-closed assertion, in the manner of Phase 0's own §0 preflight. If
-- the target's catalog holds one active key this enumeration does not name, the
-- migration aborts and the transaction rolls the function back. The thinner set
-- §11 warns about cannot land silently, because it cannot land at all.
--
-- Safety (shared apply): idempotent (CREATE OR REPLACE + assertions only). No
-- data is written, no grant row is created or removed, and no existing
-- organization is touched — this changes what *future* calls do. Rollback is
-- re-applying 20260729120000 §6.
--
-- NOT IN THIS MIGRATION, and raised in §7 instead:
--   * `EXECUTE` on this SECURITY DEFINER function is still held by
--     `authenticated` (the 2026-08-04 anon revocation deliberately touched only
--     `anon`). Any signed-in principal can call it by RPC for an arbitrary
--     org id. Enumeration shrinks what such a call can do; revoking the grant is
--     a privilege change, needs its own register row, and is not a worker's to
--     mint.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace the function: catalog literal unchanged, grants enumerated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_rbac("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- Permission catalog (canonical table; legacy names are views over this).
  -- UNCHANGED BY W-12 — reproduced from 20260729120000 §6. Narrowing this list
  -- is W-11/M5's, and is gated on operator review of its deletion list.
  insert into public.permission_definitions (key, label, group_key, description)
  values
    ('ai.enrichment.use', 'Use AI enrichment', 'ai', null),
    ('ai.provider.config.manage', 'Manage AI provider configuration', 'ai', null),
    ('ai.telemetry.review', 'Review AI usage telemetry', 'ai', null),
    ('billing.read', 'View billing / payments', 'billing', null),
    ('billing.write', 'Manage billing / payments', 'billing', null),
    ('communications.read', 'View communications', 'communications', null),
    ('communications.send', 'Send communications', 'communications', null),
    ('config_assist.apply', 'Apply approved config/layout proposals', 'config', null),
    ('config_assist.generate', 'Generate config/layout proposals', 'config', null),
    ('config_assist.review', 'Review config/layout proposals', 'config', null),
    ('data_quality.view', 'View config/layout data quality', 'config', null),
    ('crm.customers.read', 'View customers / families', 'crm', null),
    ('crm.customers.write', 'Manage customers / families', 'crm', null),
    ('crm.opportunities.read', 'View opportunities / inquiries', 'crm', null),
    ('crm.opportunities.write', 'Manage opportunities / inquiries', 'crm', null),
    ('documents.read', 'View documents', 'documents', null),
    ('documents.write', 'Manage documents', 'documents', null),
    ('fields.editability.manage', 'Manage field editability policies', 'fields', null),
    ('fields.manage', 'Manage field definitions', 'fields', null),
    ('fields.requirements.manage', 'Manage field requirement policies', 'fields', null),
    ('fin.read', 'View financials', 'financials', null),
    ('fin.write', 'Manage financials', 'financials', null),
    ('layouts.manage', 'Manage record layouts', 'layouts', null),
    ('operational_expectations.author', 'Author operational expectations', 'operations', null),
    ('operational_expectations.authority.assign', 'Assign operational authorities', 'operations', null),
    ('operational_expectations.authority.manage', 'Manage operational authorities', 'operations', null),
    ('operational_expectations.ratify', 'Ratify operational expectations', 'operations', null),
    ('ops.contacts.read', 'View contacts', 'operations', null),
    ('ops.contacts.write', 'Manage contacts', 'operations', null),
    ('ops.customers.read', 'View customers', 'operations', null),
    ('ops.customers.write', 'Manage customers', 'operations', null),
    ('ops.jobs.read', 'View jobs', 'operations', null),
    ('ops.jobs.write', 'Manage jobs', 'operations', null),
    ('ops.locations.read', 'View locations', 'operations', null),
    ('ops.locations.write', 'Manage locations', 'operations', null),
    ('ops.messaging.read', 'View messaging/outbox', 'operations', null),
    ('ops.messaging.write', 'Send/manage messages', 'operations', null),
    ('ops.opportunities.read', 'View opportunities', 'operations', null),
    ('ops.opportunities.write', 'Manage opportunities', 'operations', null),
    ('ops.schedules.read', 'View schedules', 'operations', null),
    ('ops.schedules.write', 'Manage schedules', 'operations', null),
    ('ops.workflows.read', 'View workflows', 'operations', null),
    ('ops.workflows.write', 'Manage workflows', 'operations', null),
    ('option_sets.manage', 'Manage option sets', 'option_sets', null),
    ('reports.read', 'View reports / analytics', 'reports', null),
    ('reports.write', 'Manage reports / analytics', 'reports', null),
    ('scheduling.read', 'View scheduling', 'scheduling', null),
    ('scheduling.write', 'Manage scheduling', 'scheduling', null),
    ('sections.manage', 'Manage field sections', 'sections', null),
    ('settings.manage', 'Manage settings', 'settings', null),
    ('settings.read', 'View settings', 'settings', null),
    ('settings.users_roles', 'Manage users and roles', 'settings', null),
    ('settings.users_roles.read', 'View users & roles', 'settings', null),
    ('admin.roles.read', 'View roles & permissions', 'system', null),
    ('admin.roles.write', 'Manage roles & permissions', 'system', null),
    ('admin.users.read', 'View users', 'system', null),
    ('admin.users.write', 'Manage users', 'system', null)
  on conflict (key) do nothing;

  -- Default roles for the org.
  perform public.seed_default_role_definitions(p_org_id);

  -- W12:ADMIN-GRANTS:BEGIN
  -- Default grants for `admin`, enumerated. This list is the whole of what the
  -- admin role of a new organization receives. It is not derived from the catalog,
  -- and adding a catalog key does not extend it.
  -- (No apostrophes in this region, deliberately: a lone quote inside a comment
  --  desynchronises every naive SQL string-literal pairing that reads it.)
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'admin', enumerated.permission_key, true
  from (values
      ('ai.enrichment.use'::text),
      ('ai.provider.config.manage'),
      ('ai.telemetry.review'),
      ('billing.read'),
      ('billing.write'),
      ('communications.read'),
      ('communications.send'),
      ('config_assist.apply'),
      ('config_assist.generate'),
      ('config_assist.review'),
      ('data_quality.view'),
      ('crm.customers.read'),
      ('crm.customers.write'),
      ('crm.opportunities.read'),
      ('crm.opportunities.write'),
      ('documents.read'),
      ('documents.write'),
      ('fields.editability.manage'),
      ('fields.manage'),
      ('fields.requirements.manage'),
      ('fin.read'),
      ('fin.write'),
      ('layouts.manage'),
      ('operational_expectations.author'),
      ('operational_expectations.authority.assign'),
      ('operational_expectations.authority.manage'),
      ('operational_expectations.ratify'),
      ('ops.contacts.read'),
      ('ops.contacts.write'),
      ('ops.customers.read'),
      ('ops.customers.write'),
      ('ops.jobs.read'),
      ('ops.jobs.write'),
      ('ops.locations.read'),
      ('ops.locations.write'),
      ('ops.messaging.read'),
      ('ops.messaging.write'),
      ('ops.opportunities.read'),
      ('ops.opportunities.write'),
      ('ops.schedules.read'),
      ('ops.schedules.write'),
      ('ops.workflows.read'),
      ('ops.workflows.write'),
      ('option_sets.manage'),
      ('reports.read'),
      ('reports.write'),
      ('scheduling.read'),
      ('scheduling.write'),
      ('sections.manage'),
      ('settings.manage'),
      ('settings.read'),
      ('settings.users_roles'),
      ('settings.users_roles.read'),
      ('admin.roles.read'),
      ('admin.roles.write'),
      ('admin.users.read'),
      ('admin.users.write')
  ) as enumerated(permission_key)
  -- Narrowing guard, not a source. The blanket this replaces carried `is_active = true`, and
  -- `is_active` shapes nothing else at runtime: the resolver reads grant rows without joining the
  -- catalog at all (resolveAdminAccessCore.fetchPermissionKeys). Dropping the predicate would
  -- therefore be a real widening — a deactivated key would start reaching new organizations. This
  -- can only remove keys from the list above; it can never add one, which is the whole of what G5
  -- asks. It also degrades correctly rather than aborting if W-11/M5 deletes a key before this list
  -- is updated; the lock, not the FK, is what makes that drift loud.
  where exists (
      select 1
      from public.permission_definitions pd
      where pd.key = enumerated.permission_key
        and pd.is_active = true
  )
  on conflict (org_id, role_key, permission_key) do nothing;

  -- W12:ADMIN-GRANTS:END

  -- W12:OPS-GRANTS:BEGIN
  -- Default grants for `ops`. The blanket expressed this as "everything except
  -- admin.users.write and admin.roles.write". Stated positively, the exclusion is
  -- visible as an absence from a list rather than as a NOT IN nobody reads.
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'ops', enumerated.permission_key, true
  from (values
      ('ai.enrichment.use'::text),
      ('ai.provider.config.manage'),
      ('ai.telemetry.review'),
      ('billing.read'),
      ('billing.write'),
      ('communications.read'),
      ('communications.send'),
      ('config_assist.apply'),
      ('config_assist.generate'),
      ('config_assist.review'),
      ('data_quality.view'),
      ('crm.customers.read'),
      ('crm.customers.write'),
      ('crm.opportunities.read'),
      ('crm.opportunities.write'),
      ('documents.read'),
      ('documents.write'),
      ('fields.editability.manage'),
      ('fields.manage'),
      ('fields.requirements.manage'),
      ('fin.read'),
      ('fin.write'),
      ('layouts.manage'),
      ('operational_expectations.author'),
      ('operational_expectations.authority.assign'),
      ('operational_expectations.authority.manage'),
      ('operational_expectations.ratify'),
      ('ops.contacts.read'),
      ('ops.contacts.write'),
      ('ops.customers.read'),
      ('ops.customers.write'),
      ('ops.jobs.read'),
      ('ops.jobs.write'),
      ('ops.locations.read'),
      ('ops.locations.write'),
      ('ops.messaging.read'),
      ('ops.messaging.write'),
      ('ops.opportunities.read'),
      ('ops.opportunities.write'),
      ('ops.schedules.read'),
      ('ops.schedules.write'),
      ('ops.workflows.read'),
      ('ops.workflows.write'),
      ('option_sets.manage'),
      ('reports.read'),
      ('reports.write'),
      ('scheduling.read'),
      ('scheduling.write'),
      ('sections.manage'),
      ('settings.manage'),
      ('settings.read'),
      ('settings.users_roles'),
      ('settings.users_roles.read'),
      ('admin.roles.read'),
      ('admin.users.read')
  ) as enumerated(permission_key)
  -- Same narrowing guard as above, and for the same reason.
  where exists (
      select 1
      from public.permission_definitions pd
      where pd.key = enumerated.permission_key
        and pd.is_active = true
  )
  on conflict (org_id, role_key, permission_key) do nothing;
  -- W12:OPS-GRANTS:END
end;
$$;

ALTER FUNCTION public.seed_default_rbac("p_org_id" "uuid") OWNER TO "postgres";

-- ---------------------------------------------------------------------------
-- 2. The preflight §11 asks for, executed as a fail-closed assertion.
--
--    §11's M6 row: "Catalog width vs live — a new tenant must not silently get a
--    thinner set." W-11's P3 records that no live measurement has been taken and
--    that no worker-reachable channel to `database.read_census` exists. So the
--    check runs here, against the database being migrated, and aborts rather
--    than narrowing anything silently.
--
--    The enumeration is read back out of the function's own installed source
--    (`pg_get_functiondef`) between the sentinels above, rather than repeated a
--    third time in this block. A third copy of the list would be a third thing
--    that can drift, and this workstream has already recorded (W-4) that "the
--    register's reasons are unbound prose — nothing binds a citation to the line
--    it names". This binds it: the assertion cannot disagree with the function,
--    because it reads the function.
-- ---------------------------------------------------------------------------

-- The dollar-quote tag is alphabetic on purpose: the migration-tree parsers this
-- workstream relies on (`web/tests/access/permissionCatalogDiscovery.ts`, and the
-- RL-8 instrument below) recognise `$tag$` bodies by `[a-zA-Z_]*`, so a tag
-- containing a digit would leave this block unrecognised as a dollar-quoted region.
DO $w_twelve$
DECLARE
    v_src           text;
    v_admin_from    int;
    v_admin_to      int;
    v_ops_from      int;
    v_ops_to        int;
    v_admin_region  text;
    v_ops_region    text;
    v_missing       text[];
    v_leaked        text[];
    v_active        int;
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);

    v_admin_from := strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN');
    v_admin_to   := strpos(v_src, 'W12:ADMIN-GRANTS:END');
    v_ops_from   := strpos(v_src, 'W12:OPS-GRANTS:BEGIN');
    v_ops_to     := strpos(v_src, 'W12:OPS-GRANTS:END');

    IF v_admin_from = 0 OR v_admin_to <= v_admin_from
       OR v_ops_from = 0 OR v_ops_to <= v_ops_from THEN
        RAISE EXCEPTION
            'W-12/M6 ABORT: the installed seed_default_rbac does not carry the W-12 grant-enumeration sentinels. Nothing can be asserted about what it grants, so the migration refuses to leave it installed.';
    END IF;

    v_admin_region := substr(v_src, v_admin_from, v_admin_to - v_admin_from);
    v_ops_region   := substr(v_src, v_ops_from, v_ops_to - v_ops_from);

    SELECT count(*) INTO v_active
    FROM public.permission_definitions
    WHERE is_active = true;

    -- (a) No active catalog key may be absent from the admin enumeration. This is
    --     the "thinner set" check: before this migration, admin received every
    --     active key by construction.
    SELECT array_agg(pd.key ORDER BY pd.key) INTO v_missing
    FROM public.permission_definitions pd
    WHERE pd.is_active = true
      AND strpos(v_admin_region, '''' || pd.key || '''') = 0;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            'W-12/M6 ABORT: % of % active catalog key(s) on this database are not in the enumerated admin grant list, so a new organization would receive a thinner set than today: %. Add them to the enumeration deliberately, or establish why the target carries keys this repository does not seed (W-11 precondition P3), before re-applying.',
            array_length(v_missing, 1), v_active, v_missing;
    END IF;

    -- (b) The one exclusion the blanket carried must survive the rewrite. Stated
    --     as an assertion because it is now an absence from a list, and an
    --     absence is exactly the kind of thing an editor restores by accident.
    SELECT array_agg(k ORDER BY k) INTO v_leaked
    FROM unnest(ARRAY['admin.users.write', 'admin.roles.write']) AS k
    WHERE strpos(v_ops_region, '''' || k || '''') > 0;

    IF v_leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'W-12/M6 ABORT: the ops enumeration grants %, which the blanket it replaces explicitly withheld. This would widen ops, not preserve it.',
            v_leaked;
    END IF;

    RAISE NOTICE 'W-12/M6: seed_default_rbac now enumerates its grants. % active catalog key(s) on this database, all named in the admin enumeration; ops withholds admin.users.write and admin.roles.write. No grant row was written by this migration.', v_active;
END
$w_twelve$;

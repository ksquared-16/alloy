-- =============================================================================
-- WHICH PERMISSIONS AN ORGANIZATION'S ADMINISTRATOR HOLDS DEPENDED ON THE DATE THE ORG ROW
-- WAS CREATED. AND AN ORGANIZATION CREATED BY ANY ROUTE BUT THE LOCAL SEED HELD NONE AT ALL.
--
-- ── THE OPERATOR REPORT ──
--
-- An operator who is an administrator opens the promoted Financials Workspace and is told
-- "You don't have access to view financial information for this organization." Financials is
-- enforcing `fin.read` correctly. The administrator genuinely does not hold it.
--
-- ── WHY, EXACTLY ──
--
-- Two seeding halves, and only one of them is wired to anything.
--
--   * `seed_default_role_definitions` — the four system ROLES — runs from an AFTER INSERT trigger
--     on `public.orgs` (`orgs_seed_default_role_definitions`, installed by the Phase 0 migration).
--     Every organization gets `admin`, `ops`, `regional_lead`, `school_director` automatically.
--
--   * `seed_default_rbac` — the GRANTS — has no trigger and NO CALLER ANYWHERE IN THE TREE. W-12's
--     own inventory recorded this: "a full-tree census finds no trigger, no application call and no
--     script that invokes seed_default_rbac. Its only reachable caller is PostgREST RPC." The one
--     exception is `supabase/seed/local_representative_seed.sql`, which calls it by hand.
--
-- So an organization created by any path but that seed receives four roles and zero grants. And
-- portal admission (`portalEligible`) is a ROLE LITERAL test over `user_roles.role` that consults
-- no grant at all — so the administrator is admitted to the shell, sees the navigation, and is then
-- refused by every surface that actually checks a capability. Financials is simply the first one
-- that says so out loud instead of rendering an empty list.
--
-- Measured on the certification database before this migration: of four organizations, THREE had
-- `admin` and `ops` role definitions and not one grant row between them.
--
-- ── AND A SECOND, QUIETER ONE ──
--
-- `seed_default_rbac`'s enumeration was frozen at 57 keys by W-12 on 2026-08-07. The catalog now
-- holds 66. Every migration that added one of the nine — `attendance.read`, `attendance.record`,
-- `enrollment.pricing.override`, `enrollment.requirement_exception.manage`, `fin.adjust`,
-- `fin.responsibility`, `fin.subsidy`, `health.view`, `health.manage` — backfilled the orgs that
-- existed AT THAT MOMENT and did not touch this function. So an organization inherits a key if and
-- only if it existed on the day that key was catalogued. The representative tenant was created on
-- 2026-09-06 and is missing exactly the three whose migrations ran before it: `health.view`,
-- `health.manage`, `enrollment.requirement_exception.manage`. It holds the six that came after.
--
-- W-12 anticipated this and left a fail-closed assertion for it — but that assertion runs once, at
-- W-12's own apply. Nothing re-ran it, and the local seed's comment still asserts the property it
-- was supposed to keep true: "that migration REFUSES to install if its enumeration omits any active
-- catalog key. So this stays correct as the catalog grows." It did not stay correct.
--
-- ── WHAT THIS MIGRATION DOES ──
--
--   1. Re-enumerates `seed_default_rbac` over the whole active catalog, and adds the two director
--      roles the function never mentioned.
--   2. Installs the missing trigger, so grants follow role definitions the way roles already follow
--      the org.
--   3. Repairs the existing population, under two rules that CANNOT re-grant a capability an
--      organization deliberately removed. That constraint is load-bearing: `replace_role_permission_grants`
--      revokes by DELETE, so "no row" means either "never seeded" or "revoked on purpose", and a
--      blanket backfill would silently restore the second. Each rule below is a case where the two
--      are distinguishable from the data.
--   4. Re-runs the fail-closed assertion, against this database, now.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ──
--
-- It does not invent authority for `school_director` or `regional_lead` beyond `fin.read`. Those two
-- roles hold one capability today, granted by `20260909240000` with its reasons stated; that they
-- are otherwise empty across ~65 keys is a real finding and it spans domains this migration has no
-- standing to speak for. It is returned to the Access owner as a product decision, not guessed at
-- here. What this migration does fix for them is that a NEW org's directors now receive `fin.read`
-- from the seed rather than depending on a one-shot that has already run.
--
-- It does not change `ops`. The nine keys are withheld from `ops` exactly as each key's own
-- migration decided: D-H6 withheld health ("an operator who already works Attendance or Financials
-- must not acquire allergies, conditions and medications merely because a Health card was placed on
-- a Surface"), the enrollment exception migration withheld its key for the same reason in its own
-- words, and the three financial mutation keys were granted to `admin` alone. Attendance was
-- granted to both. This function now states that settled shape instead of leaving it to the order in
-- which migrations happened to run.
--
-- Idempotent. Safe to re-apply. Grants only; revokes nothing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight. Refuse rather than half-repair.
-- ---------------------------------------------------------------------------

DO $preflight$
BEGIN
    IF to_regclass('public.role_permission_grants') IS NULL
       OR to_regclass('public.role_definitions') IS NULL
       OR to_regclass('public.permission_definitions') IS NULL
       OR to_regclass('public.orgs') IS NULL THEN
        RAISE EXCEPTION 'ACCESS-V2 ABORT: the RBAC tables this migration repairs are not all present.';
    END IF;

    IF to_regprocedure('public.seed_default_role_definitions(uuid)') IS NULL THEN
        RAISE EXCEPTION 'ACCESS-V2 ABORT: seed_default_role_definitions(uuid) is absent; seed_default_rbac delegates to it.';
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The seed, re-enumerated.
--
--    STILL A LITERAL LIST, and that is the point of G5/RL-8: adding a catalog key must grant
--    nothing implicitly. The catalog read below can only REMOVE a key from the list; it can never
--    add one, so the key set is decided here and not by the catalog's contents. What changes is
--    that the list is now the whole catalog rather than a two-year-old photograph of it, and that
--    a lock (`web/tests/access/grantSeedEnumeration.test.ts`) holds the two together from the
--    repository side, where it will fail on the next key added without one — which is the only
--    place that failure can be noticed before a tenant is created without it.
--
--    The catalog literal is UNCHANGED and reproduced from W-12, which reproduced it from Phase 0.
--    Narrowing it is W-11/M5 and belongs to the operator review that owns the deletion list; a
--    worker rewriting it here would pre-empt that review. Keys catalogued by later migrations are
--    seeded by those migrations and are not repeated here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_rbac("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- Permission catalog (canonical table; legacy names are views over this).
  -- UNCHANGED — reproduced from 20260807170000 (W-12) §1, which reproduced it from 20260729120000 §6.
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
  -- The whole of what a new organization's ADMINISTRATOR receives.
  --
  -- The contract this states: Organization Administrator administers the tenant. Every ordinary
  -- organizational capability the platform defines, with no deliberate platform-owner exclusion —
  -- the only role in the vocabulary for which that is the intended answer, and the reason the nine
  -- keys added since W-12 belong here rather than waiting for another one-shot backfill.
  --
  -- (No apostrophes in this region, deliberately: a lone quote inside a comment desynchronises
  --  every naive SQL string-literal pairing that reads it.)
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'admin', enumerated.permission_key, true
  from (values
      ('admin.roles.read'::text),
      ('admin.roles.write'),
      ('admin.users.read'),
      ('admin.users.write'),
      ('ai.enrichment.use'),
      ('ai.provider.config.manage'),
      ('ai.telemetry.review'),
      ('attendance.read'),
      ('attendance.record'),
      ('billing.read'),
      ('billing.write'),
      ('communications.read'),
      ('communications.send'),
      ('config_assist.apply'),
      ('config_assist.generate'),
      ('config_assist.review'),
      ('crm.customers.read'),
      ('crm.customers.write'),
      ('crm.opportunities.read'),
      ('crm.opportunities.write'),
      ('data_quality.view'),
      ('documents.read'),
      ('documents.write'),
      ('enrollment.pricing.override'),
      ('enrollment.requirement_exception.manage'),
      ('fields.editability.manage'),
      ('fields.manage'),
      ('fields.requirements.manage'),
      ('fin.adjust'),
      ('fin.read'),
      ('fin.responsibility'),
      ('fin.subsidy'),
      ('fin.write'),
      ('health.manage'),
      ('health.view'),
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
      ('settings.users_roles.read')
  ) as enumerated(permission_key)
  -- Narrowing guard, not a source. It can only remove a key from the list above; it can never add
  -- one, which is the whole of what G5 asks. `is_active` shapes nothing else at runtime — the
  -- resolver reads grant rows without joining the catalog — so dropping the predicate would be a
  -- real widening: a deactivated key would start reaching new organizations.
  where exists (
      select 1
      from public.permission_definitions pd
      where pd.key = enumerated.permission_key
        and pd.is_active = true
  )
  on conflict (org_id, role_key, permission_key) do nothing;

  -- W12:ADMIN-GRANTS:END

  -- W12:OPS-GRANTS:BEGIN
  -- OPS is the administrator set less nine keys, and every exclusion is a decision some earlier
  -- migration already made in its own words rather than a judgement invented here:
  --
  --   admin.users.write, admin.roles.write        the exclusion the pre-W-12 blanket carried
  --   health.view, health.manage                  D-H6 — health is not acquired as a side effect
  --   enrollment.requirement_exception.manage     20260901120000 — excepting a requirement is not
  --                                               working the queue
  --   enrollment.pricing.override                 granted to admin alone
  --   fin.adjust, fin.responsibility, fin.subsidy forgiving, reallocating and settling agency money
  --                                               are not billing
  --
  -- Stated positively, so an exclusion is visible as an absence from a list rather than as a NOT IN
  -- nobody reads.
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'ops', enumerated.permission_key, true
  from (values
      ('admin.roles.read'::text),
      ('admin.users.read'),
      ('ai.enrichment.use'),
      ('ai.provider.config.manage'),
      ('ai.telemetry.review'),
      ('attendance.read'),
      ('attendance.record'),
      ('billing.read'),
      ('billing.write'),
      ('communications.read'),
      ('communications.send'),
      ('config_assist.apply'),
      ('config_assist.generate'),
      ('config_assist.review'),
      ('crm.customers.read'),
      ('crm.customers.write'),
      ('crm.opportunities.read'),
      ('crm.opportunities.write'),
      ('data_quality.view'),
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
      ('settings.users_roles.read')
  ) as enumerated(permission_key)
  -- Narrowing guard, not a source. It can only remove a key from the list above; it can never add
  -- one, which is the whole of what G5 asks. `is_active` shapes nothing else at runtime — the
  -- resolver reads grant rows without joining the catalog — so dropping the predicate would be a
  -- real widening: a deactivated key would start reaching new organizations.
  where exists (
      select 1
      from public.permission_definitions pd
      where pd.key = enumerated.permission_key
        and pd.is_active = true
  )
  on conflict (org_id, role_key, permission_key) do nothing;

  -- W12:OPS-GRANTS:END

  -- ACCESSV2:DIRECTOR-GRANTS:BEGIN
  -- The two director roles the function never mentioned at all.
  --
  -- `20260909240000` granted `fin.read` to `school_director` and `regional_lead` for every org that
  -- existed on 2026-09-09, with its reasoning stated: reading the financial position of the school
  -- you run is squarely inside those roles, and read is the minimum that makes the workspace
  -- truthful for them. It did not touch this function, so a NEW org's directors would have been
  -- born without it and the same defect would have reappeared on the next tenant.
  --
  -- This is `fin.read` and nothing else, for the same reason that migration gave: widening to
  -- `fin.write`, `fin.adjust`, `fin.responsibility` or `fin.subsidy` is a decision about who may
  -- move money, and a read repair must not smuggle write authority in behind it. That these two
  -- roles hold ONE capability across a 66-key catalog is a real gap; it is recorded for the Access
  -- owner rather than filled in by guessing at what a regional lead should be able to do.
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, director.role_key, 'fin.read', true
  from (values ('school_director'::text), ('regional_lead')) as director(role_key)
  where exists (
      select 1
      from public.permission_definitions pd
      where pd.key = 'fin.read'
        and pd.is_active = true
  )
  on conflict (org_id, role_key, permission_key) do nothing;
  -- ACCESSV2:DIRECTOR-GRANTS:END
end;
$$;

ALTER FUNCTION public.seed_default_rbac("p_org_id" "uuid") OWNER TO "postgres";

-- ---------------------------------------------------------------------------
-- 2. The missing trigger.
--
--    Roles already follow the organization automatically: `orgs_seed_default_role_definitions` is
--    an AFTER INSERT trigger installed by Phase 0. Grants did not, and that asymmetry is the whole
--    of the initiating defect — an organization that has roles but no grants admits its
--    administrator to the portal and then refuses them everywhere that checks a capability.
--
--    `seed_default_rbac` already calls `seed_default_role_definitions` itself and every write in it
--    is `on conflict do nothing`, so this trigger is idempotent, order-independent with respect to
--    the existing one, and harmless when the local seed also calls the function by hand.
--
--    It does not replace that call. `supabase/seed/local_representative_seed.sql` invokes the
--    function explicitly and should keep doing so: a seed that depends on a trigger to be correct
--    is a seed that silently changes meaning when the trigger is dropped.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.orgs_seed_default_rbac() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
begin
  perform public.seed_default_rbac(new.id);
  return new;
end;
$fn$;

ALTER FUNCTION public.orgs_seed_default_rbac() OWNER TO "postgres";

DROP TRIGGER IF EXISTS orgs_seed_default_rbac ON public.orgs;
CREATE TRIGGER orgs_seed_default_rbac
    AFTER INSERT ON public.orgs
    FOR EACH ROW EXECUTE FUNCTION public.orgs_seed_default_rbac();

COMMENT ON FUNCTION public.orgs_seed_default_rbac() IS
    'Seeds default role_permission_grants for a new org. The grant half of what orgs_seed_default_role_definitions does for roles; without it an org has roles and no capabilities, and its administrator is admitted to the portal and refused by every surface that checks one.';

-- ---------------------------------------------------------------------------
-- 3. Repairing the organizations that already exist.
--
--    THE CONSTRAINT THAT SHAPES BOTH RULES. `replace_role_permission_grants` revokes by DELETE, not
--    by `allowed = false`. So the absence of a row means either "this org was never seeded" or "an
--    administrator removed this on purpose", and nothing in the table tells them apart. A blanket
--    backfill would restore every deliberate revocation in the estate — which is the widening this
--    initiative has spent four workstreams removing, arriving as a repair.
--
--    Each rule below is a case where the two ARE distinguishable, and it is stated as the reason
--    rather than as a filter.
-- ---------------------------------------------------------------------------

-- 3a. An organization whose `admin` AND `ops` hold no grant row at all was never seeded.
--
--     There is nothing to preserve. An organization in that state has nobody who can administer it:
--     its administrator is admitted to the portal by the role literal and refused by every surface
--     that checks a capability, including the Access editor's own backing routes. Restoring the
--     default package is the only outcome that leaves the tenant usable, and it is the exact
--     population of the initiating defect — the certification database holds three of them.
--
--     The director roles are deliberately NOT part of the test. `20260909240000` granted them
--     `fin.read` in a one-shot that reached every org, so a never-seeded org still carries those two
--     rows; requiring them to be empty too would make this rule match nothing.
--
--     IT CALLS THE SEED RATHER THAN RE-DERIVING WHAT THE SEED GRANTS. A statement here selecting
--     `pd.key` from the catalog would be the fifth blanket grant in the tree and would defeat G5 —
--     "a grant seed must not be a SELECT over the catalog" — in a repair, which is the most
--     plausible way that rule dies. Re-typing the enumeration instead would put a third copy of 66
--     keys in the tree, and a third copy is a third thing that can drift. The function is idempotent
--     and every write in it is `on conflict do nothing`, so calling it cannot overwrite anything a
--     configured organization decided.

DO $repair$
DECLARE
    v_org uuid;
    v_repaired int := 0;
BEGIN
    FOR v_org IN
        SELECT DISTINCT rd.org_id
          FROM public.role_definitions rd
         WHERE rd.is_active
           AND rd.role_key IN ('admin', 'ops')
           AND NOT EXISTS (
               SELECT 1 FROM public.role_permission_grants g
                WHERE g.org_id = rd.org_id
                  AND g.role_key IN ('admin', 'ops')
           )
    LOOP
        PERFORM public.seed_default_rbac(v_org);
        v_repaired := v_repaired + 1;
    END LOOP;

    RAISE NOTICE 'ACCESS-V2: seeded the default role package into % organization(s) that had role definitions and no grants.', v_repaired;
END
$repair$;

-- 3b. `admin` only: the keys this organization was created too late to ever receive.
--
--     Each of the nine keys added since W-12 froze the enumeration arrived with a one-shot backfill
--     over the orgs that existed AT THAT MOMENT. An organization seeded AFTER a key was catalogued
--     therefore never met that backfill, and the seed does not name the key either — so it has never
--     held it, and "no row" cannot be a revocation of something it never had. That is the discriminator,
--     and it is exact:
--
--         catalogued_at  <  this org's admin was first seeded   =>  never held it   => grant
--         catalogued_at  >  this org's admin was first seeded   =>  the backfill reached it, and an
--                                                                  absence is somebody's decision => leave alone
--
--     Restricted to `admin` because `admin` is the role whose contract is "administers the tenant",
--     and restricted to the nine because for every other key the org WAS seeded with it and an
--     absence is therefore a revocation. On the certification tenant this grants exactly three rows:
--     `health.view`, `health.manage` and `enrollment.requirement_exception.manage` to the org created
--     on 2026-09-06, and nothing to anyone else.

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT seeded.org_id, 'admin', pd.key, true
  FROM (
      SELECT rd.org_id, min(g.created_at) AS admin_seeded_at
        FROM public.role_definitions rd
        JOIN public.role_permission_grants g
          ON g.org_id = rd.org_id AND g.role_key = 'admin'
       WHERE rd.role_key = 'admin' AND rd.is_active
       GROUP BY rd.org_id
  ) AS seeded
  JOIN public.permission_definitions pd
    ON pd.is_active
   AND pd.created_at < seeded.admin_seeded_at
   AND pd.key IN (
       'attendance.read', 'attendance.record',
       'enrollment.pricing.override', 'enrollment.requirement_exception.manage',
       'fin.adjust', 'fin.responsibility', 'fin.subsidy',
       'health.manage', 'health.view'
   )
 WHERE NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = seeded.org_id AND g.role_key = 'admin' AND g.permission_key = pd.key
   );

-- ---------------------------------------------------------------------------
-- 4. The assertions, run against THIS database, now.
--
--    W-12 carried the same check and it was correct — but a check that runs once at its own apply
--    cannot notice a catalog that grows afterwards, which is exactly what happened. Re-running it
--    here proves the property holds today; the repository lock
--    (`web/tests/access/grantSeedEnumeration.test.ts`) is what will notice the tenth key, before a
--    tenant is created without it rather than after an operator reports being unable to see the money.
--
--    The assertions read the function's own INSTALLED SOURCE between its sentinels, rather than
--    repeating any list a third time. A third copy is a third thing that can drift; this cannot
--    disagree with the function, because it reads the function.
-- ---------------------------------------------------------------------------

DO $accessv2$
DECLARE
    v_src            text;
    v_admin_region   text;
    v_ops_region     text;
    v_missing        text[];
    v_ops_extra      text[];
    v_active         int;
    v_unseeded_roles int;
    v_no_trigger     boolean;
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);

    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0
       OR strpos(v_src, 'ACCESSV2:DIRECTOR-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION
            'ACCESS-V2 ABORT: the installed seed_default_rbac does not carry the grant-enumeration sentinels. Nothing can be asserted about what it grants, so the migration refuses to leave it installed.';
    END IF;

    v_admin_region := substr(v_src, strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:ADMIN-GRANTS:END') - strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'));
    v_ops_region   := substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:OPS-GRANTS:END') - strpos(v_src, 'W12:OPS-GRANTS:BEGIN'));

    SELECT count(*) INTO v_active FROM public.permission_definitions WHERE is_active = true;

    -- (a) The administrator contract, asserted rather than described: every active catalog key is
    --     named in the admin enumeration. This is the check that would have caught the nine.
    SELECT array_agg(pd.key ORDER BY pd.key) INTO v_missing
      FROM public.permission_definitions pd
     WHERE pd.is_active = true
       AND strpos(v_admin_region, '''' || pd.key || '''') = 0;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            'ACCESS-V2 ABORT: % of % active catalog key(s) are absent from the enumerated admin grant list, so a new organization would receive an administrator who cannot administer it: %. Add them to the enumeration deliberately, or establish why this database carries keys the repository does not seed, before re-applying.',
            array_length(v_missing, 1), v_active, v_missing;
    END IF;

    -- (b) The ops exclusions survive the rewrite. An exclusion is now an ABSENCE from a list, and an
    --     absence is exactly the kind of thing an editor restores by accident.
    SELECT array_agg(k ORDER BY k) INTO v_ops_extra
      FROM unnest(ARRAY[
          'admin.users.write', 'admin.roles.write',
          'enrollment.pricing.override', 'enrollment.requirement_exception.manage',
          'fin.adjust', 'fin.responsibility', 'fin.subsidy',
          'health.view', 'health.manage'
      ]) AS k
     WHERE strpos(v_ops_region, '''' || k || '''') > 0;

    IF v_ops_extra IS NOT NULL THEN
        RAISE EXCEPTION
            'ACCESS-V2 ABORT: the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops. This would widen ops, not preserve it.',
            v_ops_extra;
    END IF;

    -- (c) The repair actually repaired. No active system role may be left holding nothing — that is
    --     the state the operator reported, and leaving one behind would mean this migration ran and
    --     the defect survived it.
    SELECT count(*) INTO v_unseeded_roles
      FROM public.role_definitions rd
     WHERE rd.is_active
       AND rd.role_key IN ('admin', 'ops', 'school_director', 'regional_lead')
       AND NOT EXISTS (
           SELECT 1 FROM public.role_permission_grants g
            WHERE g.org_id = rd.org_id AND g.role_key = rd.role_key AND g.allowed
       );

    IF v_unseeded_roles > 0 THEN
        RAISE EXCEPTION
            'ACCESS-V2 ABORT: % active system role(s) still hold no capability after the repair. An administrator in that state is admitted to the portal and refused by every surface that checks one, which is the defect this migration exists to end.',
            v_unseeded_roles;
    END IF;

    -- (d) The trigger is installed. Without it §1 is a function nobody calls, which is how the
    --     grants half came to be unwired in the first place.
    SELECT NOT EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.orgs'::regclass
           AND NOT t.tgisinternal
           AND t.tgname = 'orgs_seed_default_rbac'
    ) INTO v_no_trigger;

    IF v_no_trigger THEN
        RAISE EXCEPTION 'ACCESS-V2 ABORT: orgs_seed_default_rbac trigger is not installed on public.orgs.';
    END IF;

    RAISE NOTICE 'ACCESS-V2: seed_default_rbac enumerates all % active catalog key(s) for admin, withholds nine from ops, and seeds fin.read for both director roles. The grants half is now triggered on public.orgs. No active system role holds an empty capability set.', v_active;
END
$accessv2$;

-- W-13 — PORTAL ADMISSION BECOMES A CAPABILITY.
--
-- `PORTAL_ROLES = new Set(["admin", "ops"])` decided who reached the operator portal. It was a role
-- literal in two TypeScript modules: stored in no table, scoped to no organization, held by no
-- grant row, and therefore not editable by an administrator through the product at all. A custom
-- role could be given every capability Alloy defines and still be refused at the front door, and a
-- role named `admin` was admitted whatever its grants said. `04-authentication-model.md §3.6`
-- records that literal as the FIFTH authority layer and the operator's standing directive is to
-- reduce to four.
--
-- `20260818170000` removed the two places where the literal CONFERRED authority, converting them to
-- `settings.users_roles` / `settings.users_roles.read`. It did NOT introduce `portal.access`, and
-- `docs/platform/governance/roles-and-permissions.md` still records that as a settled negative.
-- This migration reopens exactly that one question and answers it the other way, because admission
-- itself — the last thing the literal decided — cannot be moved into the four-layer model without a
-- capability to move it onto. `docs/platform/planning/access-identity-v2/d2-i10-role-composition-decision.md`
-- is the plan of record for the split: *"W-13 — portal admission as a capability … ships
-- behaviour-preserving without D2"*, where D2 is the separate, operator-owned question of whether
-- `school_director` and `regional_lead` should also receive it.
--
-- **THIS MIGRATION CHANGES NOBODY'S ACCESS.** It makes explicit, as grant rows, an admission the
-- application code was already conferring implicitly through role names. Exactly the principals
-- admitted before it are admitted after it. That is the same contract `20260818170000` opened with,
-- and the same ordering constraint follows from it: *it MUST be applied before the code change that
-- stops honouring the literals.* A narrowing whose guaranteeing grants are not yet present is a
-- lockout with a migration attached — and this one's blast radius is every operator, not one gate.
--
-- WHO RECEIVES IT, AND WHY THAT LIST IS EXACTLY TODAY'S:
--
--   admin  -> portal.access     `PORTAL_ROLES` admitted `admin`. Preserved.
--   ops    -> portal.access     `PORTAL_ROLES` admitted `ops`.   Preserved.
--
--   school_director, regional_lead — NOT HERE, deliberately. The literal did not admit them, so
--   granting them admission would be this migration widening while claiming to preserve. Whether
--   those roles belong in the operator portal is the D2 default-role package decision; it is
--   reported to the Access owner, not answered here. W-13 changes HOW admission is decided, not
--   WHICH roles deserve it.
--
-- The catalog row makes `portal.access` grantable through the ordinary role editor from the moment
-- this applies, which is the product half of the repair: admission becomes something an
-- administrator can give a custom role and take back, in the same place they give every other
-- capability.

-- ---------------------------------------------------------------------------
-- 0. Preflight. Refuse rather than half-apply.
-- ---------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.permission_definitions') is null then
        raise exception 'W-13 ABORT: public.permission_definitions is absent; the catalog consolidation (W-9) has not been applied to this database';
    end if;
    if to_regclass('public.role_permission_grants') is null then
        raise exception 'W-13 ABORT: public.role_permission_grants is absent';
    end if;
    if to_regprocedure('public.seed_default_rbac(uuid)') is null then
        raise exception 'W-13 ABORT: public.seed_default_rbac(uuid) is absent; 20260807170000/20260910183000 have not been applied';
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The catalog row.
--
--    `permission_definitions` is the ONLY catalog table — W-9 consolidated the three-way catalog and
--    `permissions` / `permission_keys` survive as VIEWS over it. RL-7 fails any migration after that
--    consolidation which writes through a deprecated name, so this writes the canonical table.
--
--    `group_key = 'portal'` is a NEW technical group, and it gets an operator-facing home in the same
--    commit (`web/lib/access/capabilityTaxonomy.ts`, area `portal`). `IA-R6` forbids a matrix row with
--    nothing behind it; the converse obligation is that a key with real authority behind it must not
--    land in the editor as an unmapped orphan an administrator cannot find.
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES (
    'portal.access',
    'portal',
    'Access operator portal',
    'Enter the Alloy operator portal for this organization. Admission only: it grants no capability inside the portal, and every surface remains gated on its own.',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key   = EXCLUDED.group_key,
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active   = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- 2. The preservation grants, for the organizations that already exist.
--
--    `role_permission_grants (org_id, role_key)` is FK'd to `role_definitions (org_id, role_key)`,
--    so selecting FROM `role_definitions` skips an org that does not define the role rather than
--    failing the migration.
--
--    `allowed = true` ON CONFLICT is the one place this migration can be said to change stored
--    state, and it is deliberate for the same reason `20260818170000` gave: the role literal
--    overrides such a row today, so `allowed = false` was never being honoured for these pairs.
--    Leaving it false is what would turn the code change into a silent lockout for exactly the
--    administrators whose row disagreed with the literal. There is no deliberate revocation to
--    preserve here, because there was nothing to revoke.
-- ---------------------------------------------------------------------------

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'portal.access', true
FROM public.role_definitions AS rd
WHERE rd.role_key IN ('admin', 'ops')
  -- RL-7 / W-9: the grant validates against the ONE catalog table the surviving foreign key names,
  -- never against `permissions` or `permission_keys`, which are views over it. §1 above wrote this
  -- row, so the predicate is satisfied by construction — which is the point: it states the
  -- dependency instead of relying on the reader noticing the statement order.
  AND EXISTS (
      SELECT 1 FROM public.permission_definitions pd
       WHERE pd.key = 'portal.access' AND pd.is_active = true
  )
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE
SET allowed = true;

-- ---------------------------------------------------------------------------
-- 3. The seed, re-enumerated so a NEW organization is born with it.
--
--    Reproduced from `20260910183000` with `portal.access` added to the catalog literal and to BOTH
--    grant enumerations, and nothing else changed. G5: the enumeration is a literal list, never a
--    SELECT over the catalog, so adding a catalog key grants nothing implicitly — which is exactly
--    why this key had to be written into the list by hand for it to reach anybody.
--
--    Without this, `orgs_seed_default_rbac` would create tenants whose administrator cannot open the
--    portal at all. That is the defect class `20260910183000` was written to close, one migration
--    ago, and it would have reappeared immediately and at maximum severity.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_rbac("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- Permission catalog (canonical table; legacy names are views over this).
  -- UNCHANGED — reproduced from 20260807170000 (W-12) §1, which reproduced it from 20260729120000 §6.
  -- W-13 does NOT add `portal.access` to this list, and the omission is deliberate. The list is a
  -- frozen REPRODUCTION of what the catalog held on 2026-07-29, carried unchanged through W-12; it
  -- is asserted byte-for-byte by `grantSeedEnumeration.test.ts` precisely so that nobody edits
  -- history to make a new key look old. `permission_definitions` is global, not per-org, so §1 of
  -- this migration has already put the row there for every organization that will ever be created.
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
      ('portal.access'),
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
      ('portal.access'),
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
-- ===========================================================================
-- 4. WHAT 20260910183000 ASSERTED, RE-ASSERTED — because this file is now the
--    definition of `seed_default_rbac`, and an invariant that lived beside the
--    previous definition does not follow a redefinition on its own.
--
--    `grantSeedEnumeration.test.ts` states the rule this obeys: the guard runs
--    against whichever database the LIVE seed lands on, at apply time, and the
--    repository lock runs on every commit. Neither alone was enough — W-12's
--    guard was correct and still could not notice a catalog that grew after it
--    had run. Reproducing the trigger install and the assertion block keeps
--    both halves attached to the definition they are about. Every statement
--    below is idempotent and was already true before this migration; what is
--    new is that `portal.access` is now inside the enumerated set they check.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 4a. The missing trigger (reproduced from 20260910183000 §2).
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
-- 4b. The guards that read THE FUNCTION, reproduced. The two that read the
--     DATABASE, deliberately not.
--
--    20260910183000 §4 carried four checks. Two of them assert things about the
--    installed function's own source — the sentinels are present, and the nine
--    ops exclusions are still absent from the ops region. Those are properties
--    of the definition this file installs, so they belong to this file and are
--    reproduced verbatim below.
--
--    The other two assert things about the DATABASE the migration lands on:
--    that every active catalog key is named in the admin enumeration, and that
--    no active system role holds an empty grant set. They were that migration's
--    proof that ITS repair had worked, and re-running them here would make this
--    migration refuse to apply over drift it did not cause and cannot fix.
--
--    That is not hypothetical: the shared certification database carries
--    `attendance.record.assigned_only`, active, granted to nobody, inserted at
--    runtime on 2026-09-10 and seeded by NO migration in this tree — the
--    attendance lane's own merged migration (20260911110000) records that it
--    deliberately did *not* put that capability in the catalog, *"because
--    permissions are additive and union across roles, so a narrowing permission
--    would make adding a role reduce authority."* A reproduced completeness
--    check aborts on it, and no edit to THIS migration can make it true.
--
--    The risk that check was guarding against — an author who adds a catalog key
--    and forgets to enumerate it — is covered for this migration by §5, which
--    names `portal.access` in both regions explicitly. The general property
--    stays locked in the repository, on every commit, by
--    `web/tests/access/grantSeedEnumeration.test.ts`, which reads the tree
--    rather than a database and is therefore immune to another lane's residue.
-- ---------------------------------------------------------------------------

DO $w13guards$
DECLARE
    v_src          text;
    v_ops_region   text;
    v_ops_extra    text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);

    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0
       OR strpos(v_src, 'ACCESSV2:DIRECTOR-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION
            'ACCESS-V2 ABORT: the installed seed_default_rbac does not carry the grant-enumeration sentinels. Nothing can be asserted about what it grants, so the migration refuses to leave it installed.';
    END IF;

    v_ops_region := substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN'),
                           strpos(v_src, 'W12:OPS-GRANTS:END') - strpos(v_src, 'W12:OPS-GRANTS:BEGIN'));

    -- The ops exclusions survive the rewrite. An exclusion is an ABSENCE from a list, and an absence
    -- is exactly the kind of thing an editor restores by accident — which is the whole risk of
    -- reproducing a 60-key enumeration in order to add one key to it.
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
END
$w13guards$;

-- ---------------------------------------------------------------------------
-- 5. The assertions this migration adds: the preservation actually preserved.
--
--    A preservation migration that preserves nothing is the failure worth catching, and it is
--    catchable here: the population that MUST hold `portal.access` afterwards is exactly the
--    population the role literal admitted before, and both are computable.
-- ---------------------------------------------------------------------------
do $$
declare
    v_missing        bigint;
    v_src            text;
    v_admin_region   text;
    v_ops_region     text;
begin
    -- 4a. Every (org, role) pair the literal admitted now holds the key.
    select count(*)
      into v_missing
      from public.role_definitions rd
     where rd.role_key in ('admin', 'ops')
       and not exists (
           select 1
             from public.role_permission_grants g
            where g.org_id = rd.org_id
              and g.role_key = rd.role_key
              and g.permission_key = 'portal.access'
              and g.allowed = true
       );
    if v_missing > 0 then
        raise exception 'W-13 ABORT: % admin/ops role_definitions did not receive portal.access; applying the code change would lock them out', v_missing;
    end if;

    -- 4b. And nobody else did. A preservation migration that widens is not a preservation migration.
    select count(*)
      into v_missing
      from public.role_permission_grants g
     where g.permission_key = 'portal.access'
       and g.allowed = true
       and g.role_key not in ('admin', 'ops')
       and exists (
           select 1 from public.role_definitions rd
            where rd.org_id = g.org_id and rd.role_key = g.role_key and rd.is_system = true
       );
    if v_missing > 0 then
        raise exception 'W-13 ABORT: % SYSTEM role(s) other than admin/ops hold portal.access; this migration must not widen admission', v_missing;
    end if;

    -- 4c. The seed carries the key in both enumerated regions, sliced by the sentinels the function
    --     actually carries rather than by a line number that drifts.
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    if strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 then
        raise exception 'W-13 ABORT: seed_default_rbac does not carry the W-12 grant sentinels; the slice below would assert over the wrong text';
    end if;
    v_admin_region := substr(v_src, strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:ADMIN-GRANTS:END') - strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'));
    v_ops_region   := substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:OPS-GRANTS:END') - strpos(v_src, 'W12:OPS-GRANTS:BEGIN'));
    if strpos(v_admin_region, '''portal.access''') = 0 then
        raise exception 'W-13 ABORT: the admin enumeration does not name portal.access; new organizations would be created with no administrator who can open the portal';
    end if;
    if strpos(v_ops_region, '''portal.access''') = 0 then
        raise exception 'W-13 ABORT: the ops enumeration does not name portal.access';
    end if;

    -- 4d. The catalog row is active. An inactive row is filtered out by the seed's narrowing guard,
    --     which would make 4c true and the grant still not arrive.
    if not exists (
        select 1 from public.permission_definitions
         where key = 'portal.access' and is_active = true
    ) then
        raise exception 'W-13 ABORT: portal.access is absent or inactive in the catalog';
    end if;
end $$;

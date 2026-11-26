-- OPERATIONAL INTELLIGENCE AUTHORITY: ops keeps the read, and stops carrying a write it never used.
--
-- `20260915110000` made `reports.write` real. Until then it was catalogued, seeded to ops, and
-- enforced NOWHERE as a write: its only executable effect was satisfying the analytics READ gate in
-- canReadAnalytics as a superset of `reports.read`. Ten Operational Intelligence mutations asked
-- `ctx.role !== "admin"` instead, so ops could not perform any of them.
--
-- Enforcement without this correction would have handed ops those ten mutations on the strength of a
-- grant that had never authorized anything. The measurement was not ambiguous:
--
--   * zero custom roles held reports.write (census gar_e1a6e3b0e7535b)
--   * zero mutation events have ever named it - nobody granted or revoked it deliberately
--   * per-org provenance found exactly ONE ops grant on the deployed primary, class
--     A_UNTOUCHED_SEED, and that org already holds reports.read (census gar_81e5b99b334d3a)
--
-- This is the doctrine `20260914114000` already applied to `scheduling.write` and `ops.jobs.write`,
-- in its own words: seeded and enforced nowhere, so the grant conferred nothing, and keeping it
-- while the keys became real would have been the widening.
--
-- WHAT OPS KEEPS. `reports.read`, untouched. canReadAnalytics accepts either key, so Operational
-- Intelligence stays readable for ops exactly as before - the Calculation Library, KPI targets,
-- measurements and every analytics read route. Only authoring narrows, and it narrows to what ops
-- could already do, which was nothing.
--
-- ADMIN is unchanged and still carries both keys.

CREATE OR REPLACE FUNCTION public.seed_default_rbac(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      ('business_process.activate'),
      ('business_process.configure'),
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
      ('fields.delete'),
      ('fields.editability.manage'),
      ('fields.manage'),
      ('fields.requirements.manage'),
      ('fin.adjust'),
      ('fin.post'),
      ('fin.read'),
      ('fin.responsibility'),
      ('fin.subsidy'),
      ('fin.write'),
      ('forms.author'),
      ('forms.submissions'),
      ('forms.submissions.confirm'),
      ('health.manage'),
      ('health.view'),
      ('layouts.lifecycle'),
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
      ('option_sets.delete'),
      ('option_sets.manage'),
      ('portal.access'),
      ('processing.archive'),
      ('processing.dev_cleanup'),
      ('processing.documents.manage'),
      ('processing.operate'),
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
      ('forms.submissions.confirm'),
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
      ('processing.operate'),
      ('reports.read'),
      ('scheduling.read'),
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
$function$;

-- The grant half stays wired to the org, exactly as the role half is. Re-asserted here because a
-- migration that redefines the seed and leaves the trigger to an earlier file is a migration whose
-- correctness depends on the order someone replays them in.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- THE GUARDS THIS REDEFINITION CANNOT HONESTLY SKIP.
--
-- Reproducing a 69-key enumeration in order to add three is exactly the operation that drops a line
-- by accident, and an ops EXCLUSION is an absence — the kind of thing that comes back silently. Both
-- checks read `pg_get_functiondef`, so they describe the text this migration itself installs, and
-- they hold on any database.
-- ─────────────────────────────────────────────────────────────────────────────
-- -----------------------------------------------------------------------------
-- THE GUARDS THIS REDEFINITION CANNOT HONESTLY SKIP.
--
-- Reproducing a 71-key enumeration in order to add two is exactly the operation that drops a line by
-- accident, and an ops EXCLUSION is an absence -- the kind of thing that comes back silently. Both
-- checks read `pg_get_functiondef`, so they describe the text this migration itself installs, and
-- they hold on any database.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- THE GUARDS. A redefinition that reproduces a 71-key enumeration in order to REMOVE one is exactly
-- the operation that drops a line by accident, and a removal is an absence - the kind of thing that
-- comes back silently. Both checks read pg_get_functiondef, so they describe the text this migration
-- itself installs.
-- -----------------------------------------------------------------------------
DO $oiguard$
DECLARE
    v_src          text;
    v_admin_region text;
    v_ops_region   text;
    v_ops_extra    text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);

    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION
            'OIAUTH ABORT: the installed seed_default_rbac does not carry the grant-enumeration sentinels. Nothing can be asserted about what it grants, so the migration refuses to leave it installed.';
    END IF;

    v_admin_region := substr(v_src, strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:ADMIN-GRANTS:END') - strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'));
    v_ops_region   := substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:OPS-GRANTS:END') - strpos(v_src, 'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin_region, '''reports.write''') = 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: admin lost reports.write; a new administrator could not author Operational Intelligence.';
    END IF;
    IF strpos(v_admin_region, '''reports.read''') = 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: admin lost reports.read.';
    END IF;

    IF strpos(v_ops_region, '''reports.write''') > 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: the ops enumeration still grants reports.write, which is now a real write authority ops has never exercised. This would widen ops, not preserve it.';
    END IF;

    -- THE HALF THAT MATTERS MOST. Removing the write key must not cost ops its analytics READ.
    IF strpos(v_ops_region, '''reports.read''') = 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: ops lost reports.read, so Operational Intelligence would stop being readable. The correction narrows authoring, never reading.';
    END IF;

    -- No folder capability may appear. Operational Intelligence owns this authority under reports.*.
    IF strpos(v_src, 'organization_calculations.') > 0 OR strpos(v_src, 'metrics.manage') > 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: the seed enumerates a folder-named capability; Operational Intelligence owns this authority as reports.*.';
    END IF;

    -- THE FULL WITHHELD SET, in the wording the RL-8 grant-seed lock reads. Every key here is one
    -- the migration that introduced it deliberately kept from ops; reproducing the whole list rather
    -- than only this slice's addition is what stops a later redefinition quietly restoring one.
    SELECT array_agg(k ORDER BY k) INTO v_ops_extra
      FROM unnest(ARRAY[
          'admin.users.write', 'admin.roles.write',
          'enrollment.pricing.override', 'enrollment.requirement_exception.manage',
          'fin.adjust', 'fin.responsibility', 'fin.subsidy',
          'health.view', 'health.manage',
          'forms.author', 'forms.submissions',
          'processing.archive', 'processing.documents.manage', 'processing.dev_cleanup',
          'scheduling.write', 'ops.jobs.write', 'fin.post',
          'option_sets.delete', 'layouts.lifecycle', 'fields.delete',
          'business_process.configure', 'business_process.activate',
          'reports.write'
      ]) AS k
     WHERE strpos(v_ops_region, '''' || k || '''') > 0;
    IF v_ops_extra IS NOT NULL THEN
        RAISE EXCEPTION
            'OIAUTH ABORT: the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops. This would widen ops, not preserve it.',
            v_ops_extra;
    END IF;

    IF strpos(v_ops_region, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'OIAUTH ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
END
$oiguard$;

-- -----------------------------------------------------------------------------
-- EXISTING ORGS. Only class A - a seeded grant nothing has ever touched - may be corrected, and the
-- predicate is role-precise: it joins mutation_events to the ops role of the SAME org, because an
-- org-wide test would let an unrelated admin-role change protect an ops grant. A deliberate grant is
-- an organization's decision and is preserved.
-- -----------------------------------------------------------------------------
DELETE FROM public.role_permission_grants g
WHERE g.role_key = 'ops'
  AND g.permission_key = 'reports.write'
  AND NOT EXISTS (
      SELECT 1 FROM public.mutation_events m
        JOIN public.role_definitions rd ON rd.id = m.subject_id AND rd.org_id = m.org_id
       WHERE m.org_id = g.org_id AND m.subject_type = 'role' AND rd.role_key = 'ops'
         AND (coalesce(m.new_state,'') LIKE '%reports.write%'
           OR coalesce(m.previous_state,'') LIKE '%reports.write%'))
  -- Never strand an org without analytics read. If reports.read is somehow absent, leave the write
  -- grant alone and let the completeness migration answer for it.
  AND EXISTS (
      SELECT 1 FROM public.role_permission_grants r
       WHERE r.org_id = g.org_id AND r.role_key = 'ops'
         AND r.permission_key = 'reports.read' AND r.allowed);

-- -----------------------------------------------------------------------------
-- AND THE FUNCTION IS EXERCISED, NOT ONLY READ.
-- -----------------------------------------------------------------------------
DO $oiseed$
DECLARE
    v_org       uuid := gen_random_uuid();
    v_ops_write integer;
    v_ops_read  integer;
    v_admin     integer;
    v_left      integer;
BEGIN
    INSERT INTO public.orgs (id, name, slug)
    VALUES (v_org, 'OI authority seed self-test', '_oi_seed_' || substr(v_org::text, 1, 8));
    PERFORM public.seed_default_rbac(v_org);

    SELECT count(*) INTO v_ops_write FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND allowed AND permission_key = 'reports.write';
    IF v_ops_write <> 0 THEN
        RAISE EXCEPTION 'OIAUTH SEED ABORT: a new ops role received reports.write, which is now a real write authority it has never exercised.';
    END IF;

    SELECT count(*) INTO v_ops_read FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND allowed AND permission_key = 'reports.read';
    IF v_ops_read <> 1 THEN
        RAISE EXCEPTION 'OIAUTH SEED ABORT: a new ops role holds % reports.read grant(s), expected 1. Operational Intelligence must stay readable.', v_ops_read;
    END IF;

    SELECT count(*) INTO v_admin FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND allowed
       AND permission_key IN ('reports.read', 'reports.write');
    IF v_admin <> 2 THEN
        RAISE EXCEPTION 'OIAUTH SEED ABORT: a new administrator holds % of the 2 reports keys, expected 2.', v_admin;
    END IF;

    DELETE FROM public.role_permission_grants WHERE org_id = v_org;
    DELETE FROM public.role_definitions WHERE org_id = v_org;
    DELETE FROM public.orgs WHERE id = v_org;

    -- And nothing deliberate was swept: any surviving ops write grant must be one an event named.
    SELECT count(*) INTO v_left FROM public.role_permission_grants
     WHERE role_key = 'ops' AND permission_key = 'reports.write';
    RAISE NOTICE 'OIAUTH: ops keeps reports.read and no longer receives reports.write; % deliberate ops write grant(s) preserved.', v_left;
END
$oiseed$;

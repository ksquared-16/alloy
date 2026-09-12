-- A NEW ORGANIZATION COULD NOT WORK ITS OWN PROCESSING QUEUE.
--
-- `20260912113000` defined the four Processing capabilities and granted them to the roles of every
-- organization that existed at that moment. It did not touch `seed_default_rbac`, which is the
-- function the `orgs` insert trigger calls — so an organization created afterwards would receive
-- four roles, the pre-Processing grant set, and no Processing authority at all. Its administrator
-- could not archive a case; its ops user could not work one.
--
-- That is the cliff `20260910183000` was written to end: "an organization inherits a key if and only
-- if it existed on the day that key was catalogued." A backfill that does not also teach the seed
-- only moves the cliff to a later date.
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ──
--
-- All four keys join the ADMIN enumeration, on the contract that region already states: the
-- Organization Administrator receives every ordinary organizational capability the platform defines.
--
-- `ops` receives `processing.operate` and NOT the other three, so the withheld set grows from eleven
-- to fourteen. That is not a new judgement. `ops` was admitted by the Processing operator context
-- and by nothing else in that cluster: archive was admin-only, the destructive document operations
-- were admin-only, and so was the test-data reset. Each exclusion is the product's own boundary,
-- preserved.
--
-- They do NOT join the catalog literal inside the function. That literal reproduces what
-- `permission_definitions` held on 2026-07-29, carried forward unchanged; widening it would quietly
-- rewrite history, and `20260912113000` is where these keys enter the catalog.
--
-- Nothing is granted to `school_director` or `regional_lead`.
--
-- A grant of `processing.dev_cleanup` is not a licence to run it: the route and the planner both
-- refuse in production independently of any grant, and a newly seeded administrator in production is
-- refused exactly like every other one.

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
      ('forms.author'),
      ('forms.submissions'),
      ('forms.submissions.confirm'),
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
DO $formsguard$
DECLARE
    v_src          text;
    v_admin_region text;
    v_ops_region   text;
    v_missing      text[];
    v_ops_extra    text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);

    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0
       OR strpos(v_src, 'ACCESSV2:DIRECTOR-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION
            'PROCESSING ABORT: the installed seed_default_rbac does not carry the grant-enumeration sentinels. Nothing can be asserted about what it grants, so the migration refuses to leave it installed.';
    END IF;

    v_admin_region := substr(v_src, strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:ADMIN-GRANTS:END') - strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN'));
    v_ops_region   := substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN'),
                             strpos(v_src, 'W12:OPS-GRANTS:END') - strpos(v_src, 'W12:OPS-GRANTS:BEGIN'));

    SELECT array_agg(k ORDER BY k) INTO v_missing
      FROM unnest(ARRAY['processing.operate', 'processing.archive',
                        'processing.documents.manage', 'processing.dev_cleanup']) AS k
     WHERE strpos(v_admin_region, '''' || k || '''') = 0;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'PROCESSING ABORT: % absent from the admin enumeration; a new administrator could not work Processing.', v_missing;
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_ops_extra
      FROM unnest(ARRAY[
          'admin.users.write', 'admin.roles.write',
          'enrollment.pricing.override', 'enrollment.requirement_exception.manage',
          'fin.adjust', 'fin.responsibility', 'fin.subsidy',
          'health.view', 'health.manage',
          'forms.author', 'forms.submissions',
          'processing.archive', 'processing.documents.manage', 'processing.dev_cleanup'
      ]) AS k
     WHERE strpos(v_ops_region, '''' || k || '''') > 0;
    IF v_ops_extra IS NOT NULL THEN
        RAISE EXCEPTION
            'PROCESSING ABORT: the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops. This would widen ops, not preserve it.',
            v_ops_extra;
    END IF;

    IF strpos(v_ops_region, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'PROCESSING ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
END
$formsguard$;
-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — a freshly seeded organization must come out whole.
-- ─────────────────────────────────────────────────────────────────────────────
DO $procseed$
DECLARE
    v_org       uuid := gen_random_uuid();
    v_admin     integer;
    v_ops_op    integer;
    v_ops_wide  integer;
    v_forms     integer;
    v_missing   text;
BEGIN
    INSERT INTO public.orgs (id, name, slug)
    VALUES (v_org, 'Processing seed self-test', '_proc_seed_' || substr(v_org::text, 1, 8));
    PERFORM public.seed_default_rbac(v_org);

    SELECT count(*) INTO v_admin FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND permission_key LIKE 'processing.%' AND allowed;
    IF v_admin <> 4 THEN
        RAISE EXCEPTION 'PROCESSING SEED ABORT: a new administrator holds % Processing capabilities, expected 4.', v_admin;
    END IF;

    SELECT count(*) INTO v_ops_op FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND permission_key = 'processing.operate' AND allowed;
    SELECT count(*) INTO v_ops_wide FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops'
       AND permission_key IN ('processing.archive', 'processing.documents.manage', 'processing.dev_cleanup')
       AND allowed;
    IF v_ops_op <> 1 OR v_ops_wide <> 0 THEN
        RAISE EXCEPTION 'PROCESSING SEED ABORT: ops got operate=% wide=%, expected 1 and 0.', v_ops_op, v_ops_wide;
    END IF;

    /*
     * The Forms package is re-proved here, not assumed.
     *
     * This function is redefined by whichever slice last needed to teach it a key, and each
     * redefinition reproduces the whole enumeration. That is precisely the operation that drops a
     * line by accident, so the slice that rewrites the seed owes the previous slice its proof back.
     */
    SELECT count(*) INTO v_forms FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND permission_key LIKE 'forms.%' AND allowed;
    IF v_forms <> 3 THEN
        RAISE EXCEPTION 'PROCESSING SEED ABORT: the Forms package regressed to % keys, expected 3.', v_forms;
    END IF;

    /*
     * Scoped to the keys THIS program owns, for the reason the Forms slice recorded: asserting the
     * whole catalogue fails on `attendance.record.assigned_only`, `integrations.manage` and
     * `integrations.read` — keys catalogued by other programs whose migrations seeded the
     * organizations existing at the time and never taught this function. Repairing that here would
     * mean silently granting three unrelated authorities to every administrator. Reported as debt.
     */
    SELECT string_agg(k.key, ', ') INTO v_missing
      FROM (VALUES ('processing.operate'), ('processing.archive'),
                   ('processing.documents.manage'), ('processing.dev_cleanup'),
                   ('forms.author'), ('forms.submissions'), ('forms.submissions.confirm')) AS k(key)
     WHERE NOT EXISTS (SELECT 1 FROM public.role_permission_grants g
                        WHERE g.org_id = v_org AND g.role_key = 'admin'
                          AND g.permission_key = k.key AND g.allowed);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'PROCESSING SEED ABORT: a new administrator is missing %.', v_missing;
    END IF;

    DELETE FROM public.role_permission_grants WHERE org_id = v_org;
    DELETE FROM public.user_access_profiles WHERE org_id = v_org;
    DELETE FROM public.role_definitions WHERE org_id = v_org;
    DELETE FROM public.orgs WHERE id = v_org;

    RAISE NOTICE 'PROCESSING: a newly bootstrapped organization receives all four Processing keys, ops receives exactly operate, and the Forms package is intact.';
END
$procseed$;

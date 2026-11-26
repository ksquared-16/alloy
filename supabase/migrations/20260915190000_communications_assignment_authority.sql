-- ===========================================================================
-- CONVERSATION ASSIGNMENT IS A SCOPE-GRANTING OPERATION, SO IT GETS ITS OWN KEY.
--
-- The Director ruling this implements: assignment is an OPERATION PATTERN, not
-- an authority. The same verb across products does not imply the same power, so
-- there is no platform-wide `assignments.manage`. Authority belongs to the
-- product whose business truth changes. This migration adds the COMMUNICATIONS
-- half of that ruling and nothing else.
--
-- WHY NOT `communications.send`, WHICH ALREADY EXISTS.
--
-- Because bundling them would open a scope-escalation path, and the source says
-- so rather than the reasoning being speculative:
--
--   `decideCommunicationsSendScope` checks assignment BEFORE site scope --
--   `assigned_user_id === actorUserId` returns `allowed: true` with reason
--   `assigned_to_actor`, deliberately, so a site-restricted operator can be
--   handed one organization conversation by name without being handed the whole
--   inbox. And `CONVERSATION_ASSIGNMENT_ACTIONS` includes `claim`, which assigns
--   a thread to the ACTOR.
--
-- Put those together under one key and any site-restricted holder of
-- `communications.send` could claim any conversation in the organization and
-- answer it -- escaping the very site scope that was configured for them, one
-- conversation at a time, with no one granting them anything.
--
-- So assignment is separated from sending. The two are now independently
-- grantable, which is what lets an organization say "you may route the inbox"
-- and "you may answer families" as different sentences.
--
-- WHAT IT DOES NOT DO: assignment cannot confer the ability to send. That same
-- function returns `no_send_permission` before it ever looks at assignment, so
-- an assignee who lacks `communications.send` still cannot reply. Assignment
-- widens SCOPE for someone who already holds the capability; it never grants the
-- capability. That is why this is a Communications authority and NOT an Access
-- delegation: it changes no principal's capability set, so the W-18 assignment
-- ceiling is not engaged and must not be invoked merely because the word
-- "assignment" appears.
--
-- DEFAULT PACKAGE, DERIVED RATHER THAN ASSUMED. Communications doctrine as
-- promoted: ADMIN holds every Communications capability; OPS holds the ordinary
-- operator work (`read`, `send`) and none of the management keys
-- (`templates.manage`, `provider.configure`, `bulk.send`). Routing a shared
-- inbox is ordinary operator work of exactly the kind `ops` already does -- it
-- already owns conversation triage under `communications.send` -- so `ops`
-- receives this key and directors and custom roles receive nothing
-- automatically. This is also a NARROWING for everyone: the assign route today
-- asks `requireAdminOrOps()`, which resolves portal admission and no capability,
-- so every portal principal reaches it whenever the feature flag is on.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CAPABILITY.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, label, group_key, description) VALUES
    ('communications.assign', 'Assign conversations', 'communications',
     'Claim, assign, reassign, unassign and route conversations to an operator or team. Assignment grants the assignee SCOPE to answer that one conversation; it never grants the ability to send, which remains communications.send.')
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label,
       group_key = EXCLUDED.group_key,
       description = EXCLUDED.description,
       is_active = true;

-- ---------------------------------------------------------------------------
-- 2. THE SEED, so a NEW organization is born with the key rather than
--    acquiring it only if someone remembers a backfill.
--
--    Reproduced from 20260915180000 with one line added to each of the two
--    W12 regions. The regions are sentinels the guard below reads back out of
--    `pg_get_functiondef`, so a reproduction that dropped one would abort
--    rather than silently seed a narrower package.
-- ---------------------------------------------------------------------------
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
  /*
   * THE TWO NEW KEYS ARE DELIBERATELY ABSENT FROM THE LIST ABOVE.
   *
   * That list is a reproduction of what `permission_definitions` held on 2026-07-29, carried forward
   * unchanged through every redefinition of this function; `RL-8` holds it byte-for-byte because
   * narrowing it is an operator decision about the deletion list, not something a seed rewrite may
   * do in passing. Growing it is equally wrong, and pointlessly so: `permission_definitions` is
   * keyed on `key` alone with no `org_id`, so the catalog is GLOBAL. Section 1 of this migration
   * inserts `admin.access_scope.write` and `attendance.devices.manage` once, for the database — a
   * new organization needs no catalog rows of its own, only the grants enumerated below.
   */

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
      ('admin.access_scope.write'),
      ('attendance.devices.manage'),
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
      ('communications.assign'),
      ('communications.send'),
      ('communications.templates.manage'),
      ('communications.provider.configure'),
      ('communications.bulk.send'),
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
      ('settings.read')
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
      ('communications.assign'),
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
      ('settings.read')
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

-- THE TRIGGER THAT MAKES THE SEED RUN AT ALL, re-asserted.
--
-- `seed_default_rbac` had no trigger and no caller for months: an organization created by
-- any path but the local seed got its four roles and no grants. Every redefinition of the
-- function re-states the wiring, because a migration that replaced the function and left the
-- trigger pointing at nothing would look successful and seed nothing. RL-8 reads this back.

-- The grant half stays wired to the org, exactly as the role half is.
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


-- ---------------------------------------------------------------------------
-- 3. EVERY EXISTING ORGANIZATION. `seed_default_rbac` runs for new ones only.
--
--    Scoped to the two system roles the policy names, and only where the role
--    is active. A custom role receives nothing: holding `communications.send`
--    never meant holding the authority to route the organization's inbox, it
--    meant reaching a route that asked for no capability at all.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'communications.assign', true
  FROM public.role_definitions rd
 WHERE rd.is_active
   AND rd.role_key IN ('admin', 'ops')
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. THE GUARDS THIS REDEFINITION CANNOT HONESTLY SKIP.
-- ---------------------------------------------------------------------------
DO $axguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin, '''communications.assign''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: a new organization admin would not receive communications.assign.';
    END IF;
    IF strpos(v_ops, '''communications.assign''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: a new organization ops role would not receive communications.assign.';
    END IF;

    -- The five promoted Communications keys must survive the reproduction. An
    -- enumeration retyped to add one line is exactly where one goes missing.
    IF strpos(v_admin, '''communications.read''') = 0
       OR strpos(v_admin, '''communications.send''') = 0
       OR strpos(v_admin, '''communications.templates.manage''') = 0
       OR strpos(v_admin, '''communications.provider.configure''') = 0
       OR strpos(v_admin, '''communications.bulk.send''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: the admin enumeration lost a promoted Communications capability.';
    END IF;
    IF strpos(v_ops, '''communications.read''') = 0 OR strpos(v_ops, '''communications.send''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: ops lost ordinary Communications authority.';
    END IF;

    -- THE WHOLE WITHHELD LIST, NOT THIS SLICE'S ONE. An ops exclusion is an
    -- ABSENCE, and an absence is what comes back without anyone noticing; this
    -- migration could otherwise be the one that quietly restored fin.adjust
    -- while passing its own guard. The wording is the one RL-8 reads.
    SELECT array_agg(k ORDER BY k) INTO v_leaked
      FROM unnest(ARRAY[
          'admin.users.write', 'admin.roles.write',
          'admin.access_scope.write', 'attendance.devices.manage',
          'communications.templates.manage', 'communications.provider.configure', 'communications.bulk.send',
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
     WHERE strpos(v_ops, '''' || k || '''') > 0;
    IF v_leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'ACCESSV2 ABORT: the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops. This would widen ops, not preserve it.',
            v_leaked;
    END IF;

    IF strpos(v_ops, '''admin.users.read''') = 0 OR strpos(v_ops, '''admin.roles.read''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: ops lost a directory or role-catalog read it has always held.';
    END IF;
    IF strpos(v_ops, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
    IF strpos(v_admin, '''settings.users_roles''') > 0 OR strpos(v_ops, '''settings.users_roles''') > 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: the seed still grants the retired settings.users_roles umbrella.';
    END IF;
END
$axguard$;

-- ---------------------------------------------------------------------------
-- 5. SELF-TEST. The approved policy, asserted against the database being
--    migrated, in a transaction that rolls itself back.
--
--    The interesting assertion is the SEPARATION: a role holding
--    `communications.send` must NOT thereby hold `communications.assign`. If it
--    did, the scope-escalation path described in the header would still be open
--    and this migration would have achieved nothing while appearing to succeed.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org uuid := 'c0ffee00-0000-4000-8000-0000000c0ff2'::uuid;
    v_admin integer; v_ops integer; v_sender integer; v_dir integer; v_dupes integer;
BEGIN
    IF (SELECT count(*) FROM public.permission_definitions
         WHERE key = 'communications.assign' AND is_active AND group_key = 'communications') <> 1 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: communications.assign is not active in the communications group.';
    END IF;

    -- A fresh organization, through the REAL trigger rather than a direct seed call.
    INSERT INTO public.orgs (id, name, slug, status)
    VALUES (v_org, 'Communications Assignment Self Test', 'communications-assignment-self-test', 'active');

    SELECT count(*) INTO v_admin FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND allowed AND permission_key = 'communications.assign';
    IF v_admin <> 1 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: a new organization admin did not receive communications.assign.';
    END IF;

    SELECT count(*) INTO v_ops FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND allowed AND permission_key = 'communications.assign';
    IF v_ops <> 1 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: a new organization ops role did not receive communications.assign.';
    END IF;

    -- DIRECTORS UNCHANGED, the same statement the Communications model made.
    SELECT count(*) INTO v_dir FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key IN ('school_director','regional_lead') AND allowed
       AND permission_key LIKE 'communications.%';
    IF v_dir <> 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: a director role received % Communications capabilities.', v_dir;
    END IF;

    -- THE SEPARATION ITSELF. A custom role granted the ability to SEND does not
    -- thereby acquire the ability to route the organization's inbox to itself.
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
    VALUES (v_org, 'st_sender_only', 'Sender only', false, true);
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (v_org, 'st_sender_only', 'communications.send', true);

    SELECT count(*) INTO v_sender FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'st_sender_only' AND allowed
       AND permission_key = 'communications.assign';
    IF v_sender <> 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: holding communications.send conferred communications.assign; the scope-escalation path is still open.';
    END IF;

    SELECT count(*) INTO v_dupes FROM (
        SELECT org_id, role_key FROM public.role_permission_grants
         WHERE permission_key = 'communications.assign'
         GROUP BY 1,2 HAVING count(*) > 1
    ) d;
    IF v_dupes <> 0 THEN
        RAISE EXCEPTION 'COMMSASSIGN ABORT: % duplicate communications.assign grants exist.', v_dupes;
    END IF;

    RAISE NOTICE 'communications assignment self-test passed: admin yes, ops yes, directors unchanged, send does not confer assign, no duplicates';
    RAISE EXCEPTION 'selftest_rollback';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'selftest_rollback' THEN
        RAISE NOTICE 'communications assignment self-test rolled back cleanly';
    ELSE
        RAISE;
    END IF;
END;
$selftest$;

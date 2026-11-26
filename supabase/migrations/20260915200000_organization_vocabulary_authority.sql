-- ===========================================================================
-- ORGANIZATION VOCABULARY IS ONE POWER -- FOR FOUR OF THE FIVE FAMILIES.
--
-- The Director approved ONE dedicated authority conditionally: only if a fresh
-- semantic census proved the five candidate families represent the same
-- business power. Four do. One does not, and this migration excludes it rather
-- than stretching the capability to cover it.
--
-- THE CONTRACT: create and manage organization-defined vocabulary used to
-- classify, relate, label or assign records and operational objects.
--
-- INCLUDED, because each defines WORDS the organization chooses and nothing
-- else:
--
--   entity_labels                     what this organization calls a thing
--                                     (singular, plural). Naming only.
--   customer_person_role_types        how a person relates to a household.
--   person_relationship_type_settings how people relate to each other.
--   operational_assignment_types      the kinds of assignment that exist.
--
-- EXCLUDED: status_definitions, and the reason is load-bearing rather than
-- fastidious. `normalizeStatusDefinitionMetadata` PERSISTS the process-stage
-- key -- `out[PROCESS_STAGE_METADATA_KEY] = t` -- and
-- `parseProcessStageKeyFromStatusMetadata` reads it to decide which lifecycle
-- stage a status belongs to. So PATCHing a status definition can rebind a
-- status to a different process stage: the same effect that
-- `enrollment-process/status-stages` already gates on
-- `business_process.configure`, with queue synchronisation hanging off it.
--
-- Folding that into a generic vocabulary key would hand lifecycle stage
-- rebinding to whoever may rename a label, and would open a second door to an
-- operation Business Process already owns. Status definitions therefore take
-- `business_process.configure` -- which is admin-only in all ten organizations,
-- exactly matching the `ctx.role !== 'admin'` title they carry today, so the
-- move changes nobody's reach.
--
-- ASSIGNMENT TYPES ARE CONFIGURATION, NOT ASSIGNMENT. Assignments Authority
-- Model V1 established that assignment authority belongs to each business
-- surface. Defining the TYPES that exist is a different act from assigning
-- anything, and the routes prove it: they write `operational_assignment_types`
-- and read `schedule_assignments` only to REFUSE archiving a type still in use.
-- This key confers no ability to assign a conversation, a vendor, a staff
-- member, work, or a role.
--
-- DEFAULTS. ADMIN only. Three of the four families are gated on the role TITLE
-- "admin" today, so admin-only preserves the intended reach; the fourth
-- (assignment types) is reachable by any portal-admitted principal, which is
-- accidental reach rather than policy and is deliberately NOT preserved. OPS
-- does not receive it: nothing in the product ever said ops defines the
-- organization's vocabulary. Directors and custom roles receive nothing
-- automatically.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CAPABILITY.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, label, group_key, description) VALUES
    ('configuration.vocabulary.manage', 'Manage organization vocabulary', 'config',
     'Create and manage reusable labels, types, statuses and relationship vocabulary used across the organization. Defines the words available for classifying and relating records; confers no authority to change the records themselves, to assign anything, or to configure fields, layouts or business processes.')
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label,
       group_key = EXCLUDED.group_key,
       description = EXCLUDED.description,
       is_active = true;

-- ---------------------------------------------------------------------------
-- 2. THE SEED, so a new organization is born with it. ADMIN region only --
--    the guard below reads both regions back and aborts if ops gained it.
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
      ('configuration.vocabulary.manage'),
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
-- 3. EXISTING ORGANIZATIONS. The admin system role, and nothing else.
--
--    NOT ops -- nothing in the product says ops defines the organization's
--    vocabulary, and three of the four families deny ops today. NOT custom
--    roles: holding `fields.manage` or `option_sets.manage` says nothing about
--    vocabulary, and inheriting from an unrelated Configuration capability
--    would be exactly the accidental widening this programme keeps closing.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'configuration.vocabulary.manage', true
  FROM public.role_definitions rd
 WHERE rd.is_active AND rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. GUARDS.
-- ---------------------------------------------------------------------------
DO $axguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin, '''configuration.vocabulary.manage''') = 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: a new organization admin would not receive configuration.vocabulary.manage.';
    END IF;
    -- THE HALF THAT MATTERS: ops must not have acquired it.
    IF strpos(v_ops, '''configuration.vocabulary.manage''') > 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: the ops enumeration gained configuration.vocabulary.manage, which the approved policy withholds.';
    END IF;

    -- The Communications and Assignment keys must survive this reproduction.
    IF strpos(v_admin, '''communications.assign''') = 0
       OR strpos(v_admin, '''communications.bulk.send''') = 0
       OR strpos(v_ops, '''communications.assign''') = 0
       OR strpos(v_ops, '''communications.read''') = 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: the reproduction lost a promoted Communications capability.';
    END IF;

    -- THE WHOLE WITHHELD LIST, NOT THIS SLICE'S ONE. An ops exclusion is an
    -- absence, and an absence is what comes back unnoticed; this migration could
    -- otherwise be the one that quietly restored fin.adjust while passing its
    -- own guard. The wording is the one RL-8 reads.
    SELECT array_agg(k ORDER BY k) INTO v_leaked
      FROM unnest(ARRAY[
          'admin.users.write', 'admin.roles.write',
          'admin.access_scope.write', 'attendance.devices.manage',
          'communications.templates.manage', 'communications.provider.configure', 'communications.bulk.send',
          'configuration.vocabulary.manage',
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
        RAISE EXCEPTION 'VOCAB ABORT: ops lost a directory or role-catalog read it has always held.';
    END IF;
    IF strpos(v_ops, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
END
$axguard$;

-- ---------------------------------------------------------------------------
-- 5. SELF-TEST, rolled back.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org uuid := 'c0ffee33-0000-4000-8000-0000000c0ff3'::uuid;
    v_admin integer; v_ops integer; v_dir integer; v_custom integer; v_dupes integer;
BEGIN
    IF (SELECT count(*) FROM public.permission_definitions
         WHERE key = 'configuration.vocabulary.manage' AND is_active AND group_key = 'config') <> 1 THEN
        RAISE EXCEPTION 'VOCAB ABORT: the capability is not active in the config group.';
    END IF;

    INSERT INTO public.orgs (id, name, slug, status)
    VALUES (v_org, 'Vocabulary Authority Self Test', 'vocabulary-authority-self-test', 'active');

    SELECT count(*) INTO v_admin FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND allowed
       AND permission_key = 'configuration.vocabulary.manage';
    IF v_admin <> 1 THEN
        RAISE EXCEPTION 'VOCAB ABORT: a new organization admin did not receive the vocabulary authority.';
    END IF;

    SELECT count(*) INTO v_ops FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND allowed
       AND permission_key = 'configuration.vocabulary.manage';
    IF v_ops <> 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: a new organization ops role received the vocabulary authority.';
    END IF;

    SELECT count(*) INTO v_dir FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key IN ('school_director','regional_lead') AND allowed
       AND permission_key = 'configuration.vocabulary.manage';
    IF v_dir <> 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: a director role received the vocabulary authority.';
    END IF;

    -- NO INHERITANCE FROM ADJACENT CONFIGURATION. Holding fields.manage says
    -- nothing about the organization's vocabulary.
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
    VALUES (v_org, 'st_field_mgr', 'Field manager', false, true);
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (v_org, 'st_field_mgr', 'fields.manage', true),
           (v_org, 'st_field_mgr', 'option_sets.manage', true);

    SELECT count(*) INTO v_custom FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'st_field_mgr' AND allowed
       AND permission_key = 'configuration.vocabulary.manage';
    IF v_custom <> 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: a role holding fields.manage inherited vocabulary authority.';
    END IF;

    SELECT count(*) INTO v_dupes FROM (
        SELECT org_id, role_key FROM public.role_permission_grants
         WHERE permission_key = 'configuration.vocabulary.manage'
         GROUP BY 1,2 HAVING count(*) > 1
    ) d;
    IF v_dupes <> 0 THEN
        RAISE EXCEPTION 'VOCAB ABORT: % duplicate vocabulary grants exist.', v_dupes;
    END IF;

    RAISE NOTICE 'organization vocabulary self-test passed: admin yes, ops no, directors no, fields.manage does not inherit, no duplicates';
    RAISE EXCEPTION 'selftest_rollback';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'selftest_rollback' THEN
        RAISE NOTICE 'organization vocabulary self-test rolled back cleanly';
    ELSE
        RAISE;
    END IF;
END;
$selftest$;

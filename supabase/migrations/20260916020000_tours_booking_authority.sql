-- ===========================================================================
-- TOURS / BOOKINGS AUTHORITY V1 — two powers, because they are two jobs.
--
-- All nine Tour mutations were reachable through PORTAL ADMISSION ALONE:
-- `requireAdminOrOps()` resolves admission and no role, so any principal who
-- could enter the portal could rewrite when tours may be booked, and could
-- confirm, cancel or no-show any family's tour. That is accidental reach, not a
-- package, and it is the largest portal-only cluster the programme has left.
--
-- ── WHY TWO KEYS, AND NOT A BORROWED ONE ──
--
-- `tours.configure`  when and where tours may be booked: the availability rules
--                    an administrator edits at Settings -> Tours -> Availability.
--
-- `tours.book`       one family's tour lifecycle: create, confirm, cancel,
--                    complete, no-show, reschedule, operated from the Lead
--                    drawer where the front desk actually works.
--
-- NOT `scheduling.write`. Tour availability is not ordinary schedule editing:
-- it governs a customer-facing booking window, and the rules live in their own
-- table with their own location binding.
--
-- NOT `crm.opportunities.write`. The booking lifecycle does update the Lead --
-- `tourBookingOpportunityIntegration` mirrors booking state onto
-- `opportunities.metadata`, org-scoped and with an undo -- but that is the Tour
-- transaction mirroring its OWN state, not an independent Lead edit. The
-- Opportunity census established that `crm.opportunities.*` is legacy
-- vocabulary over live runtime and must not be published as authority.
--
-- The two are independently delegable: a front desk that books tours should not
-- thereby decide the organization's availability, and whoever sets availability
-- need not be trusted to cancel a family's tour.
--
-- ── THE DEFAULT PACKAGE, RE-PROVEN RATHER THAN ASSUMED ──
--
-- Admin and ops both receive both keys. The ops half was tested rather than
-- copied: the seeded ops region already carries `settings.manage`,
-- `fields.manage`, `layouts.manage`, `sections.manage`, `option_sets.manage`
-- and the three `config_assist.*` keys, so a Settings-level configuration
-- authority is squarely inside what this platform seeds to ops. The booking
-- half matches the operational shape ops already owns -- `processing.operate`,
-- `attendance.record`, `communications.assign`, `forms.submissions.confirm`.
--
-- Directors and custom roles receive nothing automatically.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CAPABILITIES.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, label, group_key, description) VALUES
    ('tours.configure', 'Configure tours', 'scheduling',
     'Set when and where tours may be booked, by editing the organization tour availability rules for each location. Confers no authority to book, reschedule or cancel any family tour, and none over ordinary schedules or calendars.'),
    ('tours.book', 'Manage tour bookings', 'scheduling',
     'Operate one family tour through its lifecycle: book, confirm, reschedule, cancel, complete and record a no-show. Confers no authority to change the organization tour availability, and none over the family record beyond the tour state the booking itself mirrors.')
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label,
       group_key = EXCLUDED.group_key,
       description = EXCLUDED.description,
       is_active = true;

-- ---------------------------------------------------------------------------
-- 2. THE SEED, so a new organization is born with both. Admin AND ops regions;
--    the guard in section 4 reads both back and aborts if either is missing.
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
      ('tours.configure'),
      ('tours.book'),
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
      ('tours.configure'),
      ('tours.book'),
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

-- ---------------------------------------------------------------------------
-- 2b. THE GUARDS THE DEFINING MIGRATION RE-ASSERTS.
--
-- Carried forward verbatim, because whichever migration DEFINES `seed_default_rbac` owns them.
-- Reproducing an 87-key enumeration in order to add two keys is precisely the operation that
-- drops a line by accident, and an ops EXCLUSION is an absence, which comes back silently. Both
-- checks read `pg_get_functiondef`, so they describe the text THIS migration installs and hold on
-- any database rather than on a repository grep. RL-8 asserts their presence here.
-- ---------------------------------------------------------------------------
DO $axguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'TOURS SEED ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin, '''configuration.vocabulary.manage''') = 0 THEN
        RAISE EXCEPTION 'TOURS SEED ABORT: a new organization admin would not receive configuration.vocabulary.manage.';
    END IF;
    -- THE HALF THAT MATTERS: ops must not have acquired it.
    IF strpos(v_ops, '''configuration.vocabulary.manage''') > 0 THEN
        RAISE EXCEPTION 'TOURS SEED ABORT: the ops enumeration gained configuration.vocabulary.manage, which the approved policy withholds.';
    END IF;

    -- The Communications and Assignment keys must survive this reproduction.
    IF strpos(v_admin, '''communications.assign''') = 0
       OR strpos(v_admin, '''communications.bulk.send''') = 0
       OR strpos(v_ops, '''communications.assign''') = 0
       OR strpos(v_ops, '''communications.read''') = 0 THEN
        RAISE EXCEPTION 'TOURS SEED ABORT: the reproduction lost a promoted Communications capability.';
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
        RAISE EXCEPTION 'TOURS SEED ABORT: ops lost a directory or role-catalog read it has always held.';
    END IF;
    IF strpos(v_ops, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'TOURS SEED ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
END
$axguard$;

-- ---------------------------------------------------------------------------
-- 2c. THE TRIGGER, RE-ASSERTED.
--
-- `seed_default_rbac` had no caller for months: an organization created by the real path got its
-- four role rows and none of their grants. The role half has been an AFTER INSERT trigger since
-- Phase 0; this wires the grant half the same way, and every migration that redefines the seed
-- re-asserts it so a redefinition cannot quietly leave a new tenant unseeded.
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

-- ---------------------------------------------------------------------------
-- 3. EXISTING ORGANIZATIONS.
--
-- Structural role identity only: `role_key`, never a display label. An
-- organization that renamed its administrator role is still its administrator,
-- and one that labelled a custom role "Operations" is not ops.
--
-- Custom roles receive NOTHING. A new key is not retrofitted onto a package
-- nobody chose, and inferring intent from a neighbouring grant -- scheduling,
-- CRM, portal access -- is exactly the guess this programme refuses to make.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, k.key, true
FROM public.role_definitions rd
CROSS JOIN (VALUES ('tours.configure'), ('tours.book')) AS k(key)
WHERE rd.role_key IN ('admin', 'ops')
  AND rd.is_active
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

-- ---------------------------------------------------------------------------
-- 4. SELF-TEST. A migration that cannot prove its own effect is a hope.
--
-- Checked here rather than only in a test, because the seed function is
-- rewritten wholesale by every capability slice: the failure this catches is a
-- later CREATE OR REPLACE silently dropping these two keys from one region
-- while the route keeps declaring them.
-- ---------------------------------------------------------------------------
DO $tours$
DECLARE
    v_admin_src integer;
    v_ops_src integer;
    v_orgs integer;
    v_granted integer;
BEGIN
    IF (SELECT count(*) FROM public.permission_definitions
        WHERE key IN ('tours.configure','tours.book') AND is_active) <> 2 THEN
        RAISE EXCEPTION 'TOURS ABORT: both capabilities must be catalogued and active';
    END IF;

    -- Both regions of the installed function must name both keys. Reading the
    -- INSTALLED source is the point: a stale deployment would pass a repo grep.
    SELECT count(*) INTO v_admin_src FROM unnest(ARRAY['tours.configure','tours.book']) AS k
    WHERE strpos(
            substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                   strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN'),
                   strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:END')
                     - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:ADMIN-GRANTS:BEGIN')),
            '''' || k || '''') > 0;
    IF v_admin_src <> 2 THEN
        RAISE EXCEPTION 'TOURS ABORT: the admin seed region does not name both Tours keys (found %)', v_admin_src;
    END IF;

    SELECT count(*) INTO v_ops_src FROM unnest(ARRAY['tours.configure','tours.book']) AS k
    WHERE strpos(
            substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                   strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN'),
                   strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:END')
                     - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure), 'W12:OPS-GRANTS:BEGIN')),
            '''' || k || '''') > 0;
    IF v_ops_src <> 2 THEN
        RAISE EXCEPTION 'TOURS ABORT: the ops seed region does not name both Tours keys (found %)', v_ops_src;
    END IF;

    -- Every existing admin and ops role now holds both, and NON-VACUOUSLY: an
    -- empty tenant would otherwise satisfy the count trivially.
    SELECT count(*) INTO v_orgs FROM public.role_definitions
     WHERE role_key IN ('admin','ops') AND is_active;
    IF v_orgs = 0 THEN
        RAISE EXCEPTION 'TOURS ABORT: no seeded admin or ops roles found; the backfill proved nothing';
    END IF;

    SELECT count(*) INTO v_granted
      FROM public.role_definitions rd
      JOIN public.role_permission_grants g
        ON g.org_id = rd.org_id AND g.role_key = rd.role_key AND g.allowed
     WHERE rd.role_key IN ('admin','ops') AND rd.is_active
       AND g.permission_key IN ('tours.configure','tours.book');
    IF v_granted <> v_orgs * 2 THEN
        RAISE EXCEPTION 'TOURS ABORT: expected % grants across % seeded roles, found %',
            v_orgs * 2, v_orgs, v_granted;
    END IF;

    -- CUSTOM ROLES MUST HAVE RECEIVED NOTHING. The backfill is the one place a
    -- new key could silently land in a package nobody chose.
    IF EXISTS (
        SELECT 1 FROM public.role_permission_grants g
         WHERE g.permission_key IN ('tours.configure','tours.book')
           AND g.allowed
           AND g.role_key NOT IN ('admin','ops')
    ) THEN
        RAISE EXCEPTION 'TOURS ABORT: a role outside admin/ops received a Tours capability';
    END IF;
END $tours$;

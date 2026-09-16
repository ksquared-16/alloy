-- ===========================================================================
-- ENROLLMENT RECORD AUTHORITY V1 — SLICE 1: keeping the record, deciding the
-- outcome.
--
-- Eighteen mutations ran an organization's enrollment with no functional
-- authority. SIXTEEN were reachable through PORTAL ADMISSION ALONE —
-- `requireAdminOrOps()` resolves admission and no role, as its own docstring
-- records — one asked only for a session, and `lead-location` had no gate of
-- any kind. So who could edit a family's inquiry, move a child up the waitlist,
-- cancel an enrollment agreement or mark a child Enrolled was decided by who
-- could reach the portal.
--
-- ── THE SPLIT ──
--
-- `enrollment.record.manage`  keeps the enrollment RECORD: the inquiry, the
--                             children on it, their requested program, room,
--                             site, start date and tuition quote.
--
-- `enrollment.decide`         changes the enrollment OUTCOME: status, the
--                             agreement that binds it, placement, and waitlist
--                             position — which decides who is offered the next
--                             spot.
--
-- Neither implies the other. Correcting a requested start date is not being
-- trusted to mark the family Enrolled.
--
-- ── THE PACKAGE, MEASURED RATHER THAN LABELLED ──
--
-- ADMIN and OPS each receive BOTH. Ops is already seeded the entire Inquiry
-- product in this same function — `crm.customers.write` and all four legacy
-- Opportunity keys — so operating enrollment is ops's day job, not an
-- administrative act. That is the evidence, and it is why this differs from
-- Work Authority V1, where ops received only the operating half.
--
-- `school_director` and `regional_lead` receive NOTHING: `20260911140000`
-- deliberately withheld `portal.access` from both, so neither can reach an
-- operator route at all. Granting enrollment authority to a role that cannot
-- enter the portal would be a control that changes nothing. Custom roles
-- receive nothing automatically — D3.
--
-- ── WHAT THIS DELIBERATELY DOES NOT CREATE ──
--
-- NO `enrollment.configure`. D1 ruled it out and the estate agrees: process and
-- stage design is `business_process.configure` / `.activate`, forms are
-- `forms.*`, program and room vocabulary is programs configuration, and the
-- legacy pipeline tables are CRM configuration awaiting retirement. There is no
-- Enrollment-specific configuration left to own.
--
-- NO `enrollment.record.delete`, though D1 approved the key and D2 approved its
-- admin-only package. Cataloguing a key whose enforcement lands in Slice 2 puts
-- an inert row in the role editor — a control an administrator can set that
-- changes nothing — which is the revocation theatre `W-50`/`IA-R8` forbid.
-- `§10` of the instruction left this to repository doctrine; doctrine is
-- unambiguous, so the key is catalogued in Slice 2 beside the gate that
-- enforces it. Section 4 ABORTS if it appears early. Hard Delete Lead keeps its
-- current authority until then.
--
-- NO activation of `crm.opportunities.*` or `ops.opportunities.*`. All four
-- remain inert and are asserted so in section 4.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CAPABILITIES.
--
-- `group_key = 'enrollment'` routes both into the Enrollment area the
-- presentation taxonomy already carries, with no taxonomy change. Labels are
-- product language: no Opportunity, no CRM Pipeline, no stage_key.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, label, group_key, description) VALUES
  ('enrollment.record.manage', 'Manage enrollment records', 'enrollment',
   'Create and update enrollment inquiries, the children on them, and their requested program, room, site and start date.'),
  ('enrollment.decide', 'Make enrollment decisions', 'enrollment',
   'Decide whether a child is enrolled, waitlisted, placed or ended — including waitlist position and enrollment agreements.')
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      group_key = EXCLUDED.group_key,
      description = EXCLUDED.description,
      is_active = true;

-- ---------------------------------------------------------------------------
-- 2. THE SEED. Both keys reach admin AND ops; section 4 reads both regions back
--    and aborts if either loses one.
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
      ('work.configure'),
      ('work.operate'),
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
      ('enrollment.decide'),
      ('enrollment.pricing.override'),
      ('enrollment.record.manage'),
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
      ('work.operate'),
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
      ('enrollment.decide'),
      ('enrollment.record.manage'),
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
$function$;-- ---------------------------------------------------------------------------
-- 2b. THE GUARDS THE DEFINING MIGRATION RE-ASSERTS.
--
-- Carried forward because whichever migration DEFINES `seed_default_rbac` owns them. RL-8
-- asserts their presence here.
-- ---------------------------------------------------------------------------
DO $axguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'WORK SEED ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin, '''configuration.vocabulary.manage''') = 0 THEN
        RAISE EXCEPTION 'WORK SEED ABORT: a new organization admin would not receive configuration.vocabulary.manage.';
    END IF;
    -- THE HALF THAT MATTERS: ops must not have acquired it.
    IF strpos(v_ops, '''configuration.vocabulary.manage''') > 0 THEN
        RAISE EXCEPTION 'WORK SEED ABORT: the ops enumeration gained configuration.vocabulary.manage, which the approved policy withholds.';
    END IF;

    -- The Communications and Assignment keys must survive this reproduction.
    IF strpos(v_admin, '''communications.assign''') = 0
       OR strpos(v_admin, '''communications.bulk.send''') = 0
       OR strpos(v_ops, '''communications.assign''') = 0
       OR strpos(v_ops, '''communications.read''') = 0 THEN
        RAISE EXCEPTION 'WORK SEED ABORT: the reproduction lost a promoted Communications capability.';
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
        RAISE EXCEPTION 'WORK SEED ABORT: ops lost a directory or role-catalog read it has always held.';
    END IF;
    IF strpos(v_ops, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'WORK SEED ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
END
$axguard$;
-- ---------------------------------------------------------------------------
-- 2c. THE TRIGGER, RE-ASSERTED, so a redefinition cannot leave a new tenant unseeded.
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
-- Structural role identity only — `role_key`, never a display label, so a role
-- NAMED "Enrollment Admin" receives nothing from its name. Custom roles receive
-- NOTHING: a new key is not retrofitted onto a package nobody chose, and
-- inferring intent from a neighbouring grant is the guess this programme
-- refuses to make (D3).
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, k.key, true
FROM public.role_definitions rd
CROSS JOIN (VALUES ('enrollment.record.manage'), ('enrollment.decide')) AS k(key)
WHERE rd.role_key IN ('admin', 'ops') AND rd.is_active
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

-- ---------------------------------------------------------------------------
-- 4. SELF-TEST. A migration that cannot prove its own effect is a hope.
--
-- Asserted in BOTH directions: the keys must be present where they belong and
-- absent where they do not. The failure most likely to rot is a later slice
-- regenerating the seed and dropping one region's copy, so each region is read
-- back from the INSTALLED function rather than from this file.
-- ---------------------------------------------------------------------------
DO $enr$
DECLARE
    v_src         text;
    v_admin_reg   text;
    v_ops_reg     text;
    v_admin_src   integer;
    v_ops_src     integer;
    v_admins      integer;
    v_ops         integer;
    v_admin_gr    integer;
    v_ops_gr      integer;
    v_legacy      integer;
BEGIN
    -- Both keys catalogued and active.
    IF (SELECT count(*) FROM public.permission_definitions
        WHERE key IN ('enrollment.record.manage','enrollment.decide') AND is_active) <> 2 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: both Slice-1 capabilities must be catalogued and active';
    END IF;

    -- SLICE-1 EXCLUSIONS. The Director ruled these out BY NAME for this slice.
    IF EXISTS (SELECT 1 FROM public.permission_definitions WHERE key = 'enrollment.record.delete') THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: enrollment.record.delete must not be catalogued in Slice 1; it ships in Slice 2 beside its gate';
    END IF;
    IF EXISTS (SELECT 1 FROM public.permission_definitions WHERE key = 'enrollment.configure') THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: enrollment.configure must not exist; enrollment process design is business_process.configure/.activate';
    END IF;

    -- THE FOUR LEGACY OPPORTUNITY KEYS STAY INERT. Not deleted — not activated.
    SELECT count(*) INTO v_legacy
      FROM public.role_permission_grants
     WHERE permission_key IN ('crm.opportunities.read','crm.opportunities.write',
                              'ops.opportunities.read','ops.opportunities.write')
       AND allowed;
    IF v_legacy = 0 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: the legacy Opportunity grants vanished; this slice must leave them exactly as they were';
    END IF;

    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: the seed sentinels are missing; the region reads below would prove nothing';
    END IF;
    v_admin_reg := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                          strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops_reg   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                          strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    SELECT count(*) INTO v_admin_src FROM unnest(ARRAY['enrollment.record.manage','enrollment.decide']) AS k
     WHERE strpos(v_admin_reg, '''' || k || '''') > 0;
    IF v_admin_src <> 2 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: the admin seed region must name both Enrollment keys (found %)', v_admin_src;
    END IF;

    SELECT count(*) INTO v_ops_src FROM unnest(ARRAY['enrollment.record.manage','enrollment.decide']) AS k
     WHERE strpos(v_ops_reg, '''' || k || '''') > 0;
    IF v_ops_src <> 2 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: the ops seed region must name both Enrollment keys (found %) — ops operates enrollment', v_ops_src;
    END IF;

    -- The delete key must not have been smuggled into either region either.
    IF strpos(v_admin_reg, 'enrollment.record.delete') > 0 OR strpos(v_ops_reg, 'enrollment.record.delete') > 0 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: enrollment.record.delete reached a seed region; it is Slice 2';
    END IF;

    -- THE BACKFILL ACTUALLY LANDED.
    SELECT count(*) INTO v_admins FROM public.role_definitions WHERE role_key='admin' AND is_active;
    SELECT count(*) INTO v_ops    FROM public.role_definitions WHERE role_key='ops'   AND is_active;
    IF v_admins = 0 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: no seeded admin roles found; the backfill proved nothing';
    END IF;

    SELECT count(*) INTO v_admin_gr
      FROM public.role_definitions rd
      JOIN public.role_permission_grants g
        ON g.org_id=rd.org_id AND g.role_key=rd.role_key AND g.allowed
     WHERE rd.role_key='admin' AND rd.is_active
       AND g.permission_key IN ('enrollment.record.manage','enrollment.decide');
    IF v_admin_gr <> v_admins * 2 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: expected % admin grants, found %', v_admins * 2, v_admin_gr;
    END IF;

    SELECT count(*) INTO v_ops_gr
      FROM public.role_definitions rd
      JOIN public.role_permission_grants g
        ON g.org_id=rd.org_id AND g.role_key=rd.role_key AND g.allowed
     WHERE rd.role_key='ops' AND rd.is_active
       AND g.permission_key IN ('enrollment.record.manage','enrollment.decide');
    IF v_ops_gr <> v_ops * 2 THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: expected % ops grants, found %', v_ops * 2, v_ops_gr;
    END IF;

    -- NO ROLE OUTSIDE admin/ops RECEIVED EITHER KEY. Catches a label-matching
    -- backfill and a custom-role inference in one assertion.
    IF EXISTS (SELECT 1 FROM public.role_permission_grants
                WHERE permission_key IN ('enrollment.record.manage','enrollment.decide')
                  AND allowed AND role_key NOT IN ('admin','ops')) THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: a role outside admin/ops received an Enrollment capability';
    END IF;

    -- ZERO DUPLICATES. The grant table is keyed, so a duplicate would be a
    -- constraint failure rather than a row — assert the key still holds.
    IF EXISTS (
        SELECT 1 FROM public.role_permission_grants
         WHERE permission_key IN ('enrollment.record.manage','enrollment.decide')
         GROUP BY org_id, role_key, permission_key HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'ENROLLMENT ABORT: duplicate Enrollment grant rows exist';
    END IF;
END $enr$;

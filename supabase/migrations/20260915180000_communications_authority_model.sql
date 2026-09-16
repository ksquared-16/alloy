-- ===========================================================================
-- COMMUNICATIONS HAS FIVE POWERS, AND HAD TWO KEYS.
--
-- The census that preceded this migration found 32 Communications mutations of
-- which 29 carried no functional authority at all, and proved the consequence
-- empirically: a principal holding ONLY `portal.access` -- in a role LABELLED
-- "Admin" that grants nothing -- was admitted past the authority gate on
-- provider-connection POST and DELETE, template creation, announcement
-- creation, conversation assignment, preference changes and channel bindings.
-- Each answered 400 or 404, never 403, meaning the route accepted their
-- authority and rejected only the request body.
--
-- THE CAUSE WAS A GATE THAT PROMISES WHAT IT DOES NOT ENFORCE.
--
-- Those routes call `requireAdminOrOps()`. Despite the name it checks nothing
-- about admin or ops: it resolves the light org context, whose documented
-- contract is "authenticated userId + primary orgId + portal admission only --
-- no full permission grant union". Anyone who can enter the portal passes it.
-- That helper is called by 155 API route files across the estate, so this is a
-- program-wide condition; Communications is where it is being repaired first.
--
-- WHY NOT ONE KEY. Flattening this surface onto `communications.send` would
-- mean anyone who may send a family a message may also rewrite every
-- organization template and reconfigure the delivery infrastructure those
-- messages travel over. Five powers with materially different blast radius get
-- five keys:
--
--   communications.read              organization communication truth
--   communications.send              ordinary individual send
--   communications.templates.manage  authoring, without delivery
--   communications.provider.configure delivery infrastructure, not secrets
--   communications.bulk.send         organization-wide blast radius
--
-- NOT IN THIS MODEL: conversation assignment. It is ownership, not messaging,
-- and putting it under a Communications key would decide the cross-product
-- Assignments model by accident. It stays ASSIGNMENTS_AUTHORITY_MODEL_DEBT and
-- is classified BLOCKED_DECISION by the authority lock -- an acknowledged
-- unfinished mutation rather than an unknown one.
--
-- DEFAULTS ARE THE APPROVED POLICY, NOT THE CURRENT REACH. Every portal
-- principal can reach these routes today; that is the defect, not a
-- compatibility contract. Admin receives all five. Ops receives read and send
-- only -- nothing in the product ever said ops administers templates, provider
-- configuration or campaigns. Custom roles receive NOTHING automatically: a
-- role holding `communications.send` was never granted template or provider
-- authority, it merely reached routes that asked for none.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE THREE NEW CAPABILITIES.
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, label, group_key, description) VALUES
    ('communications.templates.manage',   'Manage communication templates',  'communications',
     'Create, edit and archive the organization''s communication templates. Authoring only: it confers no ability to deliver a message.'),
    ('communications.provider.configure', 'Configure communication delivery', 'communications',
     'Configure the organization''s communication delivery services and channel bindings. Selects and connects credential REFERENCES; it is not authority to read secret material.'),
    ('communications.bulk.send',          'Send bulk communications',        'communications',
     'Send organization-wide, announcement and campaign-style communications, whose blast radius is materially larger than an individual message.')
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label,
       group_key = EXCLUDED.group_key,
       description = EXCLUDED.description,
       is_active = true;

-- ---------------------------------------------------------------------------
-- 2. THE CANONICAL PACKAGE OWNER. `seed_default_rbac` re-created from its
--    installed definition with three keys added to the ADMIN region and NOTHING
--    added to the ops region, so a new organization is born with the approved
--    policy rather than with the reach the old routes happened to allow.
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
-- 3. EXISTING ORGANIZATIONS. Role-precise and org-precise: the three keys go to
--    the `admin` system role and nowhere else.
--
--    NOT to ops, which the approved policy excludes. NOT to custom roles holding
--    `communications.send` -- that grant never conferred template or provider
--    authority; those roles merely reached routes that asked for nothing, and
--    inheriting that reach would preserve the defect as if it were policy.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, k, true
  FROM public.role_definitions rd
 CROSS JOIN unnest(ARRAY['communications.templates.manage',
                         'communications.provider.configure',
                         'communications.bulk.send']) AS k
 WHERE rd.role_key = 'admin'
   AND rd.is_active
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. THE GUARDS THIS REDEFINITION CANNOT HONESTLY SKIP.
-- ---------------------------------------------------------------------------
DO $axguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_missing text[]; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_missing
      FROM unnest(ARRAY['communications.templates.manage','communications.provider.configure','communications.bulk.send']) AS k
     WHERE strpos(v_admin, '''' || k || '''') = 0;
    IF array_length(v_missing,1) IS NOT NULL THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: a new organization''s admin would not receive %.', array_to_string(v_missing, ', ');
    END IF;

    -- THE HALF THAT MATTERS MOST: ops must not have gained anything it was withheld.
    --
    -- THE WHOLE LIST, NOT ONLY THIS SLICE'S THREE. Every key here is one the migration that
    -- introduced it deliberately kept from ops, and reproducing all of them is what stops a later
    -- redefinition quietly restoring one -- an ops EXCLUSION is an ABSENCE, and an absence is
    -- exactly the kind of thing that comes back without anyone noticing. Re-stating only this
    -- slice's additions would let THIS migration be the one that loses `fin.adjust` or
    -- `health.manage` from the withheld set while still passing its own guard. The wording is the
    -- one the RL-8 grant-seed lock reads.
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

    -- The two reads and the one Forms write ops already had. Narrowing those was never approved,
    -- and a reproduced enumeration is exactly how they would go missing.
    IF strpos(v_ops, '''admin.users.read''') = 0 OR strpos(v_ops, '''admin.roles.read''') = 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: ops lost a directory or role-catalog read it has always held.';
    END IF;
    IF strpos(v_ops, '''forms.submissions.confirm''') = 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: ops lost forms.submissions.confirm, the one Forms write it already had.';
    END IF;
    IF strpos(v_admin, '''settings.users_roles''') > 0 OR strpos(v_ops, '''settings.users_roles''') > 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: the seed still grants the retired settings.users_roles umbrella.';
    END IF;

    -- Ops keeps what it had. Narrowing ordinary communications was not approved.
    IF strpos(v_ops, '''communications.read''') = 0 OR strpos(v_ops, '''communications.send''') = 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: ops lost ordinary communications authority; this slice narrows management, never messaging.';
    END IF;
END
$axguard$;

-- ---------------------------------------------------------------------------
-- 5. SELF-TEST. The approved policy, asserted against the database being
--    migrated, in a transaction that is rolled back.
--
--    The interesting half is not "did admin get the keys" -- it is that ops did
--    NOT, and that custom roles holding `communications.send` did not inherit
--    template or provider authority. A migration that quietly widened those
--    would look successful and would preserve the very defect this repairs.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org uuid := 'c0ff1000-0000-4000-8000-0000000c0ff1'::uuid;
    v_new integer; v_ops integer; v_custom integer; v_dupes integer; v_dir integer;
BEGIN
    -- (a) THE CATALOG. Three keys, active, in the Communications group.
    IF (SELECT count(*) FROM public.permission_definitions
         WHERE key IN ('communications.templates.manage','communications.provider.configure','communications.bulk.send')
           AND is_active AND group_key = 'communications') <> 3 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: the three capabilities are not all active in the communications group.';
    END IF;

    -- (b) A FRESH ORGANIZATION, through the REAL trigger. Not a direct seed call:
    --     the trigger is what a new tenant actually goes through.
    INSERT INTO public.orgs (id, name, slug, status)
    VALUES (v_org, 'Communications Authority Self Test', 'communications-authority-self-test', 'active');

    SELECT count(*) INTO v_new FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'admin' AND allowed
       AND permission_key IN ('communications.read','communications.send',
                              'communications.templates.manage','communications.provider.configure','communications.bulk.send');
    IF v_new <> 5 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: a new organization''s admin holds % of the 5 approved Communications capabilities.', v_new;
    END IF;

    SELECT count(*) INTO v_ops FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'ops' AND allowed
       AND permission_key IN ('communications.templates.manage','communications.provider.configure','communications.bulk.send');
    IF v_ops <> 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: a new organization''s ops role received % management capabilities the policy withholds.', v_ops;
    END IF;

    -- Ops keeps ordinary communications. This slice narrows management, not messaging.
    IF (SELECT count(*) FROM public.role_permission_grants
         WHERE org_id = v_org AND role_key = 'ops' AND allowed
           AND permission_key IN ('communications.read','communications.send')) <> 2 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: ops lost ordinary communications authority in a fresh organization.';
    END IF;

    -- (c) DIRECTORS UNCHANGED. This slice does not resolve their package.
    SELECT count(*) INTO v_dir FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key IN ('school_director','regional_lead') AND allowed
       AND permission_key IN ('communications.templates.manage','communications.provider.configure','communications.bulk.send');
    IF v_dir <> 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: a director role received Communications management authority this slice did not approve.';
    END IF;

    -- (d) CUSTOM ROLES INHERIT NOTHING. Holding `communications.send` never meant
    --     template or provider authority; it meant reaching routes that asked for none.
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
    VALUES (v_org, 'st_sender', 'Sender', false, true);
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (v_org, 'st_sender', 'communications.send', true);

    SELECT count(*) INTO v_custom FROM public.role_permission_grants
     WHERE org_id = v_org AND role_key = 'st_sender' AND allowed
       AND permission_key IN ('communications.templates.manage','communications.provider.configure','communications.bulk.send');
    IF v_custom <> 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: a custom role holding communications.send inherited % management capabilities.', v_custom;
    END IF;

    -- (e) NO DUPLICATE GRANTS anywhere the backfill touched.
    SELECT count(*) INTO v_dupes FROM (
        SELECT org_id, role_key, permission_key FROM public.role_permission_grants
         WHERE permission_key IN ('communications.templates.manage','communications.provider.configure','communications.bulk.send')
         GROUP BY 1,2,3 HAVING count(*) > 1
    ) d;
    IF v_dupes <> 0 THEN
        RAISE EXCEPTION 'COMMSAUTH ABORT: % duplicate Communications grants exist.', v_dupes;
    END IF;

    RAISE NOTICE 'communications authority self-test passed: admin 5/5, ops 0 management, directors unchanged, custom inherits nothing, no duplicates';
    RAISE EXCEPTION 'selftest_rollback';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'selftest_rollback' THEN
        RAISE NOTICE 'communications authority self-test rolled back cleanly';
    ELSE
        RAISE;
    END IF;
END;
$selftest$;

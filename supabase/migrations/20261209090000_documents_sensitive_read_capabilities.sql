-- =============================================================================
-- Documents V1 / D3 (Director authorization, 2026-10-23) — two sensitive-document READ capabilities.
--
--   documents.identity.read    read documents declared `personal_identity`
--   documents.restricted.read  read documents declared `restricted`
--
-- Until now both classes were cleared by role (owner or admin), recorded in D2 as interim because minting a catalog
-- key is a Director decision (W-11). The D3 authorization makes that decision. The clearance becomes the KEY, or the
-- `owner` role, which holds no seeded grants and keeps the clearance it always had.
--
-- GRANTED TO ADMIN ONLY, ON PURPOSE (the D-H6 precedent for health.view): every organization's `admin` receives both,
-- so no administrator loses what the role clearance gave them; `ops` and every custom role receive nothing, so no one
-- gains access. An organization that wants another role to hold one grants it explicitly.
--
-- Sections: 1 catalog; 2 the new-org seed, re-declared verbatim from 20261122170000 with exactly these two keys added to
-- the explicit ADMIN list; 2b guards read back from the installed function; 2c the trigger re-asserted; 3 existing
-- administrators; 4 self-test. Re-runnable.
-- =============================================================================

-- 1. CATALOG ------------------------------------------------------------------
INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('documents.identity.read', 'documents', 'Read personal identity documents',
     'Open documents declared personal_identity (identity papers). Holding documents.read is not enough on its own.'),
    ('documents.restricted.read', 'documents', 'Read restricted documents',
     'Open documents declared restricted. Holding documents.read is not enough on its own.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

-- 2. THE NEW-ORG SEED -----------------------------------------------------------
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
      ('fin.provider'),
      ('fin.read'),
      ('fin.responsibility'),
      ('fin.subsidy'),
      ('fin.write'),
      ('forms.author'),
      ('forms.submissions'),
      ('forms.submissions.confirm'),
      ('health.manage'),
      ('health.view'),
      ('integrations.manage'),
      ('integrations.read'),
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
      -- Documents D3 (2026-10-23): sensitive-document read clearances. Admin only; ops never receives them.
      ('documents.identity.read'),
      ('documents.restricted.read'),
      ('processing.operate'),
      ('reports.read'),
      ('reports.write'),
      ('scheduling.read'),
      ('scheduling.write'),
      ('sections.manage'),
      ('settings.manage'),
      ('staff.compensation.read'),
      ('staff.compensation.write'),
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
$function$;

-- 2b. GUARDS, read back from the INSTALLED function -------------------------------
DO $docguard$
DECLARE
    v_src text; v_admin text; v_ops text; v_leaked text[];
BEGIN
    v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
    IF strpos(v_src, 'W12:ADMIN-GRANTS:BEGIN') = 0 OR strpos(v_src, 'W12:OPS-GRANTS:BEGIN') = 0 THEN
        RAISE EXCEPTION 'DOCUMENTS SEED ABORT: the installed seed does not carry the grant-enumeration sentinels.';
    END IF;
    v_admin := substr(v_src, strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'),
                      strpos(v_src,'W12:ADMIN-GRANTS:END') - strpos(v_src,'W12:ADMIN-GRANTS:BEGIN'));
    v_ops   := substr(v_src, strpos(v_src,'W12:OPS-GRANTS:BEGIN'),
                      strpos(v_src,'W12:OPS-GRANTS:END') - strpos(v_src,'W12:OPS-GRANTS:BEGIN'));

    IF strpos(v_admin, '''documents.identity.read''') = 0 OR strpos(v_admin, '''documents.restricted.read''') = 0 THEN
        RAISE EXCEPTION 'DOCUMENTS SEED ABORT: a new organization admin would not receive the sensitive-document read keys.';
    END IF;

    -- THE WHOLE WITHHELD LIST, not this slice's two: an ops exclusion is an absence, and an absence comes back unnoticed.
    SELECT array_agg(k ORDER BY k) INTO v_leaked
      FROM unnest(ARRAY[
          'admin.users.write',
          'admin.roles.write',
          'admin.access_scope.write',
          'attendance.devices.manage',
          'work.configure',
          'configuration.vocabulary.manage',
          'communications.templates.manage',
          'communications.provider.configure',
          'communications.bulk.send',
          'enrollment.pricing.override',
          'enrollment.requirement_exception.manage',
          'fin.adjust',
          'fin.responsibility',
          'fin.subsidy',
          'health.view',
          'health.manage',
          'forms.author',
          'forms.submissions',
          'processing.archive',
          'processing.documents.manage',
          'processing.dev_cleanup',
          'business_process.configure',
          'business_process.activate',
          'reports.write',
          'scheduling.write',
          'ops.jobs.write',
          'fin.post',
          'option_sets.delete',
          'layouts.lifecycle',
          'fields.delete',
          'documents.identity.read',
          'documents.restricted.read'
      ]) AS k
     WHERE strpos(v_ops, '''' || k || '''') > 0;
    IF v_leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'ACCESSV2 ABORT: the ops enumeration grants %, which the migration that introduced each of those keys explicitly withheld from ops. This would widen ops, not preserve it.',
            v_leaked;
    END IF;

    IF strpos(v_ops, '''documents.read''') = 0 OR strpos(v_ops, '''documents.write''') = 0 THEN
        RAISE EXCEPTION 'DOCUMENTS SEED ABORT: ops lost documents.read or documents.write, which it has always held.';
    END IF;
END
$docguard$;

-- 2c. THE TRIGGER, RE-ASSERTED, so a redefinition cannot leave a new tenant unseeded ----------
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

-- 3. EXISTING ORGANIZATIONS: the `admin` role only (structural role_key, never a label). Custom roles receive nothing.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, k.key, true
FROM public.role_definitions rd
CROSS JOIN (VALUES ('documents.identity.read'), ('documents.restricted.read')) AS k(key)
WHERE rd.role_key = 'admin' AND rd.is_active
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

-- 4. SELF-TEST ------------------------------------------------------------------
DO $docself$
DECLARE
    v_admins integer; v_granted integer; v_other integer;
BEGIN
    IF (SELECT count(*) FROM public.permission_definitions
        WHERE key IN ('documents.identity.read', 'documents.restricted.read') AND is_active) <> 2 THEN
        RAISE EXCEPTION 'DOCUMENTS ABORT: both sensitive-document read keys must be catalogued and active';
    END IF;
    SELECT count(*) INTO v_admins FROM public.role_definitions WHERE role_key = 'admin' AND is_active;
    SELECT count(*) INTO v_granted
      FROM public.role_definitions rd
      JOIN public.role_permission_grants g ON g.org_id = rd.org_id AND g.role_key = rd.role_key AND g.allowed
     WHERE rd.role_key = 'admin' AND rd.is_active
       AND g.permission_key IN ('documents.identity.read', 'documents.restricted.read');
    IF v_granted <> v_admins * 2 THEN
        RAISE EXCEPTION 'DOCUMENTS ABORT: % admin roles but % admin grants of the two keys (expected %)', v_admins, v_granted, v_admins * 2;
    END IF;
    SELECT count(*) INTO v_other FROM public.role_permission_grants
     WHERE permission_key IN ('documents.identity.read', 'documents.restricted.read') AND allowed AND role_key <> 'admin';
    IF v_other > 0 THEN
        RAISE EXCEPTION 'DOCUMENTS ABORT: % non-admin grants of a sensitive-document read key; this migration grants admin only', v_other;
    END IF;
END
$docself$;

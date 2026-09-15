-- ===========================================================================
-- ACCESS ADMINISTRATION SPLIT V1 — four authorities where there was one.
--
-- `settings.users_roles` authorized creating users, assigning roles, defining roles, granting ANY
-- capability, changing where a person may operate, and registering attendance kiosks. Six
-- materially different powers behind one grant, so a site director who needed to register a kiosk
-- had to be handed the power to rewrite the access model.
--
-- `admin.users.*` and `admin.roles.*` are NOT invented here. They have been catalogued since the
-- permission grid with a package the umbrella then contradicted — read to admin AND ops, write to
-- admin ALONE — and the umbrella handed ops the write half anyway. Activating them RESTORES a
-- decision the catalog already recorded. Two keys are genuinely new because nothing truthful owned
-- their operations: access scope, and attendance device administration.
--
-- Role definition and capability grants stay together under `admin.roles.write`: a role definition
-- without its package authorizes nothing. What makes that safe is W-18, which bounds every grant to
-- the actor's own effective authority and is preserved below.
-- ===========================================================================

-- 1. THE TWO GENUINELY NEW KEYS.
INSERT INTO public.permission_definitions (key, label, group_key, description)
VALUES
    ('admin.access_scope.write', 'Manage user access scope', 'system',
     'Choose where a user may operate within the organization. Does not allow creating users, assigning roles, or changing what a role may do.'),
    ('attendance.devices.manage', 'Manage attendance devices', 'operations',
     'Register, update and revoke attendance kiosk devices. Grants no authority over users, roles, permissions or access scope.')
ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label, group_key = EXCLUDED.group_key, description = EXCLUDED.description;

-- 2. THE GRANTS AUTHORITY IS NOW `admin.roles.write`, SO THE LOCKOUT GUARD MUST FOLLOW IT.
--
--    W-18's self-lockout refusal stops an actor removing access administration from the only role
--    that grants it to them. It keyed on the umbrella. Left alone it would guard a key that no
--    longer authorizes anything, and an administrator could strip their own last route back in.
--    The delegation ceiling itself is unchanged.
CREATE OR REPLACE FUNCTION public.replace_role_permission_grants(
    p_org_id uuid,
    p_role_key text,
    p_permission_keys text[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_keys text[] := COALESCE(p_permission_keys, ARRAY[]::text[]);
    v_invalid text[];
    v_role_id uuid;
    v_before text[];
    v_after text[];
    v_added text[];
    v_removed text[];
    v_beyond text[];
BEGIN
    SELECT id INTO v_role_id
    FROM public.role_definitions
    WHERE org_id = p_org_id AND role_key = p_role_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_invalid
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (
        SELECT 1 FROM public.permission_definitions pd
        WHERE pd.key = k AND pd.is_active
    );

    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_permission_keys:%', array_to_string(v_invalid, ',') USING ERRCODE = '22023';
    END IF;

    -- ── THE LOCKOUT REFUSAL, BEFORE ANYTHING IS WRITTEN ──────────────────────
    --
    -- Checked here rather than after the replace so the refusal costs nothing and so the message
    -- describes an intention rather than a state that briefly existed.
    IF p_actor_user_id IS NOT NULL
       AND NOT ('admin.roles.write' = ANY (v_keys))
       AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.org_id = p_org_id
              AND ur.user_id::text = p_actor_user_id
              AND ur.role = p_role_key
       )
       AND EXISTS (
           -- They have it TODAY through this role: otherwise there is nothing to lose here.
           SELECT 1 FROM public.role_permission_grants g
            WHERE g.org_id = p_org_id AND g.role_key = p_role_key
              AND g.permission_key = 'admin.roles.write' AND g.allowed
       )
       AND NOT EXISTS (
           -- And no OTHER role they hold would still carry it afterwards.
           SELECT 1
             FROM public.user_roles ur
             JOIN public.role_permission_grants g
               ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
            WHERE ur.org_id = p_org_id
              AND ur.user_id::text = p_actor_user_id
              AND ur.role <> p_role_key
              AND g.permission_key = 'admin.roles.write'
       )
    THEN
        RAISE EXCEPTION
            'self_authority_lockout: removing role administration from %, the only role granting it to you, would leave nobody able to undo it',
            p_role_key
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_before
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    -- ── W-18: THE DELEGATION CEILING ────────────────────────────────────────
    --
    -- An actor may not use access administration to hand out authority they do not themselves hold.
    --
    -- THE HOLE THIS CLOSES. `isSelfAuthorityMutation` compares the actor to the TARGET USER, so it
    -- protects the user-targeted routes and cannot see this one: the subject here is a ROLE KEY. An
    -- actor holding nothing but `portal.access` and `settings.users_roles` could therefore add
    -- `fin.post` to a role they themselves hold and walk away able to post money. That was
    -- reproduced against this function before the check existed.
    --
    -- IT OPERATES ON THE DELTA, NOT THE FINAL SET. Requiring `after ⊆ actor` would mean an
    -- administrator could not touch a role richer than themselves without first stripping it, which
    -- turns a safety rule into an accidental destruction rule. What must be bounded is what the
    -- actor INTRODUCES:
    --
    --     ADDED = proposed - existing        must satisfy    ADDED ⊆ actor effective authority
    --
    -- so a pre-existing capability the actor lacks may be kept (it is not being delegated) and may
    -- be removed (reduction is not escalation).
    --
    -- AUTHORITY IS THE UNION ACROSS EVERY ROLE THE ACTOR HOLDS, because W-17 made multi-role real.
    -- Reading one membership row, or the role that happens to carry access administration, would
    -- refuse delegations the actor is genuinely entitled to make.
    --
    -- A NULL ACTOR IS NOT A SYSTEM BYPASS. It cannot reach a write that changes anything: the
    -- audit_actor_required check below already refuses an unattributed change. Canonical bootstrap
    -- (`seed_default_rbac`) does not come through this function at all — it inserts grants directly
    -- — so trusted provisioning needs no exception here, and none is offered.
    IF p_actor_user_id IS NOT NULL AND btrim(p_actor_user_id) <> '' THEN
        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
          INTO v_beyond
          FROM unnest(v_keys) AS k
         WHERE NOT (k = ANY (v_before))
           AND NOT EXISTS (
               SELECT 1
                 FROM public.user_roles ur
                 JOIN public.role_permission_grants g
                   ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
                WHERE ur.org_id = p_org_id
                  AND ur.user_id::text = p_actor_user_id
                  AND g.permission_key = k
           );

        IF array_length(v_beyond, 1) IS NOT NULL THEN
            RAISE EXCEPTION
                'delegation_ceiling:%', array_to_string(v_beyond, ',')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.role_permission_grants g
    WHERE g.org_id = p_org_id
      AND g.role_key = p_role_key
      AND NOT (g.permission_key = ANY (v_keys));

    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    SELECT p_org_id, p_role_key, k, true
    FROM unnest(v_keys) AS k
    ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_after
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    IF v_before IS DISTINCT FROM v_after THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_added
          FROM unnest(v_after) AS k WHERE NOT (k = ANY (v_before));
        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_removed
          FROM unnest(v_before) AS k WHERE NOT (k = ANY (v_after));

        INSERT INTO public.mutation_events (
            org_id, command_key, domain,
            subject_id, subject_type,
            previous_state, new_state,
            operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.role.grants_changed', 'access',
            v_role_id, 'role',
            array_to_string(v_before, ','), array_to_string(v_after, ','),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'role_key', p_role_key,
                'before', to_jsonb(v_before),
                'after', to_jsonb(v_after),
                'added', to_jsonb(v_added),
                'removed', to_jsonb(v_removed),
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    RETURN QUERY
    SELECT g.permission_key
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed
     ORDER BY g.permission_key;
END;
$fn$;

ALTER FUNCTION public.replace_role_permission_grants(uuid, text, text[], text, text, text) OWNER TO postgres;

-- 3. THE CANONICAL SEED — a NEW organization gets the corrected packages.
CREATE OR REPLACE FUNCTION public.seed_access_administration_split("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    -- Admin administers access, and now says which part it is administering.
    insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
    select p_org_id, 'admin', k, true
    from (values
        ('admin.users.read'::text), ('admin.users.write'),
        ('admin.roles.read'), ('admin.roles.write'),
        ('admin.access_scope.write'),
        ('attendance.devices.manage')
    ) as enumerated(k)
    on conflict (org_id, role_key, permission_key) do update set allowed = true;

    -- Ops INSPECTS users and roles. It does not administer them. This is the narrowing the catalog
    -- always described and the umbrella overrode.
    insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
    select p_org_id, 'ops', k, true
    from (values ('admin.users.read'::text), ('admin.roles.read')) as enumerated(k)
    on conflict (org_id, role_key, permission_key) do update set allowed = true;

    -- The umbrella confers nothing to anyone any more.
    delete from public.role_permission_grants
     where org_id = p_org_id
       and permission_key in ('settings.users_roles', 'settings.users_roles.read');
end;
$$;

ALTER FUNCTION public.seed_access_administration_split(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.seed_access_administration_split(uuid) IS
    'Access Administration Split V1: grants admin the four administration authorities, leaves ops with read only, and removes the superseded umbrella. Enumerated deliberately - a catalog addition must never widen a package on its own.';

-- 3b. THE CANONICAL SEED, so a NEW organization is BORN with the corrected packages.
--
--     Defining a provisioning function and never calling it is exactly how
--     INTEGRATIONS_NEW_ORG_GRANT_ORPHANED_SEED happened: `seed_integrations_role_grants` is
--     commented as the path for new organizations and is invoked from nowhere, so every org created
--     since 2026-09-11 has an administrator missing those keys. The correction is therefore edited
--     INTO the enumerated regions the org-creation trigger actually runs, not bolted alongside them.
--
--     The umbrella leaves both grant regions. Its catalog rows stay in the definition insert, which
--     is `on conflict (key) do nothing` and so cannot resurrect the is_active = false set below —
--     the rows must survive for `mutation_events` history to stay readable.
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
    ('admin.users.write', 'Manage users', 'system', null),
    ('admin.access_scope.write', 'Manage user access scope', 'system', null),
    ('attendance.devices.manage', 'Manage attendance devices', 'operations', null)
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

-- 4. EVERY EXISTING ORGANIZATION. `seed_default_rbac` only runs for new ones.
DO $backfill$
DECLARE
    v_org uuid;
BEGIN
    FOR v_org IN SELECT DISTINCT org_id FROM public.role_permission_grants LOOP
        PERFORM public.seed_access_administration_split(v_org);
    END LOOP;
END;
$backfill$;

-- 5. THE UMBRELLA LEAVES THE OPERATOR-CONFIGURABLE CATALOG.
--
--    Deactivated rather than deleted: `mutation_events` and `role_permission_grants` history refer
--    to it, and a deleted key would make the audit unreadable. Inactive means it cannot be granted
--    (the grants RPC rejects inactive keys) and it appears nowhere an operator can choose it, so it
--    is vocabulary without authority rather than a second way in.
UPDATE public.permission_definitions
   SET is_active = false
 WHERE key IN ('settings.users_roles', 'settings.users_roles.read');

-- ---------------------------------------------------------------------------
-- Self-test: the split took, ops lost the umbrella, and W-18 still refuses.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_org uuid;
    v_missing text;
BEGIN
    SELECT org_id INTO v_org FROM public.role_permission_grants
     WHERE role_key = 'admin' GROUP BY org_id LIMIT 1;
    IF v_org IS NULL THEN
        RAISE NOTICE 'Access split self-test skipped: no organization has grants in this database';
        RETURN;
    END IF;

    SELECT string_agg(k, ', ') INTO v_missing
      FROM unnest(ARRAY['admin.users.read','admin.users.write','admin.roles.read','admin.roles.write',
                        'admin.access_scope.write','attendance.devices.manage']) AS k
     WHERE NOT EXISTS (
        SELECT 1 FROM public.role_permission_grants g
         WHERE g.org_id = v_org AND g.role_key = 'admin' AND g.permission_key = k AND g.allowed);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Access split self-test: admin is missing %', v_missing;
    END IF;

    IF EXISTS (SELECT 1 FROM public.role_permission_grants
                WHERE org_id = v_org AND permission_key LIKE 'settings.users_roles%' AND allowed) THEN
        RAISE EXCEPTION 'Access split self-test: the umbrella still grants something';
    END IF;

    IF EXISTS (SELECT 1 FROM public.role_permission_grants
                WHERE org_id = v_org AND role_key = 'ops'
                  AND permission_key IN ('admin.users.write','admin.roles.write','admin.access_scope.write','attendance.devices.manage')
                  AND allowed) THEN
        RAISE EXCEPTION 'Access split self-test: ops kept an administration write authority';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.role_permission_grants
                    WHERE org_id = v_org AND role_key = 'ops'
                      AND permission_key = 'admin.users.read' AND allowed) THEN
        RAISE EXCEPTION 'Access split self-test: ops lost the read access it is meant to keep';
    END IF;
END;
$assert$;

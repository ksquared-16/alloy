-- Access & Roles V2 — Phase 0: Catalog & role-definition integrity
--
-- Implements docs/platform/planning/vacilando-os/qa/vertical-slice-v1/access-roles-v2-proposal.md §3.1.
--
-- Three defects are closed here:
--
--   1. Triple-written catalog. `permissions`, `permission_keys` and `permission_definitions` were
--      three independent tables holding the same catalog. `role_permission_grants.permission_key`
--      carried dual FKs onto the first two, while `PUT /api/admin/rbac/grants` validated against
--      the third — so a key present in two of three was a silent trap in either direction.
--      `permission_definitions` becomes the single canonical table; the other two become views.
--
--   2. Grid keys absent from the catalog. The operator permission grid wrote `workflows.read` /
--      `workflows.write`, which existed in no catalog table, so saving that row returned
--      `400 Invalid or inactive permission keys` and discarded the operator's entire payload.
--      The grid now writes `ops.workflows.*`; this migration guarantees those keys are present
--      and active in the canonical catalog.
--
--   3. Orgs with no role definitions. `role_definitions` was only ever seeded by a one-time
--      migration across then-existing orgs; no org-creation path wrote it. The API then read an
--      empty table while the UI fabricated four roles for display — roles that `POST /users` and
--      `PATCH /users/:id/role` reject with `400 Invalid or inactive role for this org`. Seeding
--      now happens on `orgs` insert, and the read-time fabrication is deleted in application code.
--
-- Additive to data: no catalog row is lost (legacy rows are unioned into the canonical table before
-- the legacy tables are replaced by views over that same data).
--
-- Safety (shared apply): §0 preflight aborts on orphan grants / unexpected FKs; §6 seed_default_rbac
-- writes the full live platform catalog (57 keys as of 2026-07-29 shared preflight), not the thin
-- legacy 22-key list — so new orgs do not silently lose permissions present on shared today.

-- ---------------------------------------------------------------------------
-- 0. Apply-time preflight (fail closed before any DROP).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  orphan_grants text;
  unexpected_fks text;
BEGIN
  SELECT string_agg(DISTINCT g.permission_key, ', ' ORDER BY g.permission_key)
  INTO orphan_grants
  FROM public.role_permission_grants g
  WHERE NOT EXISTS (
    SELECT 1 FROM (
      SELECT key FROM public.permission_definitions
      UNION
      SELECT key FROM public.permission_keys
      UNION
      SELECT key FROM public.permissions
      UNION
      SELECT unnest(ARRAY['ops.workflows.read', 'ops.workflows.write'])
    ) u
    WHERE u.key = g.permission_key
  );

  IF orphan_grants IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 0 preflight failed: role_permission_grants keys missing from catalog union: %',
      orphan_grants;
  END IF;

  SELECT string_agg(con.conname || '→' || conf.relname, ', ' ORDER BY con.conname)
  INTO unexpected_fks
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  JOIN pg_class conf ON conf.oid = con.confrelid
  WHERE con.contype = 'f'
    AND n.nspname = 'public'
    AND conf.relname IN ('permissions', 'permission_keys')
    AND con.conname NOT IN (
      'role_permission_grants_permission_key_fkey',
      'role_permission_grants_permissions_fkey'
    );

  IF unexpected_fks IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 0 preflight failed: unexpected FKs onto permissions/permission_keys (refuse DROP): %',
      unexpected_fks;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Union the legacy catalog tables into the canonical one.
--    `permission_definitions` wins on conflict — it is the table the API already validates against.
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
SELECT pk.key, pk.group_key, pk.label, pk.description, pk.is_active
FROM public.permission_keys pk
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
SELECT p.key, p.group_key, p.label, p.is_active
FROM public.permissions p
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Every key the operator grid can write must exist and be active.
--    `ops.workflows.*` was previously seeded only into `permission_keys` (by seed_default_rbac),
--    so it was invisible to the validator that reads `permission_definitions`.
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES
    ('ops.workflows.read', 'operations', 'View workflows', true),
    ('ops.workflows.write', 'operations', 'Manage workflows', true)
ON CONFLICT (key) DO UPDATE
SET group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = true;

-- Keep the org admin role coherent with the catalog, as the prior grid-keys migration did.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', p.key, true
FROM public.orgs o
JOIN public.permission_definitions p ON p.key IN ('ops.workflows.read', 'ops.workflows.write')
JOIN public.role_definitions rd ON rd.org_id = o.id AND rd.role_key = 'admin'
WHERE p.is_active = true
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. One referential truth for grants.
--    A view cannot be an FK target, so the two legacy FKs are replaced by one FK onto the
--    canonical table. ON DELETE RESTRICT is kept (the legacy pair disagreed: one RESTRICT,
--    one CASCADE — meaning deleting a catalog key could silently delete grants).
-- ---------------------------------------------------------------------------

ALTER TABLE public.role_permission_grants
    DROP CONSTRAINT IF EXISTS role_permission_grants_permission_key_fkey;
ALTER TABLE public.role_permission_grants
    DROP CONSTRAINT IF EXISTS role_permission_grants_permissions_fkey;

ALTER TABLE public.role_permission_grants
    ADD CONSTRAINT role_permission_grants_permission_definitions_fkey
    FOREIGN KEY (permission_key)
    REFERENCES public.permission_definitions (key)
    ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4. Collapse the triple-write: legacy names survive as read-only views.
--    Readers keep working; there is exactly one writer and one validator.
-- ---------------------------------------------------------------------------

DROP TABLE public.permissions;
DROP TABLE public.permission_keys;

CREATE VIEW public.permissions WITH (security_invoker = true) AS
SELECT key, group_key, label, is_active, created_at
FROM public.permission_definitions;

CREATE VIEW public.permission_keys WITH (security_invoker = true) AS
SELECT key, label, group_key, description, is_active, created_at
FROM public.permission_definitions;

COMMENT ON VIEW public.permissions IS
    'Deprecated compatibility view over permission_definitions (Access V2 Phase 0). Read-only: write to permission_definitions.';
COMMENT ON VIEW public.permission_keys IS
    'Deprecated compatibility view over permission_definitions (Access V2 Phase 0). Read-only: write to permission_definitions.';

GRANT SELECT ON public.permissions TO "anon", "authenticated", "service_role";
GRANT SELECT ON public.permission_keys TO "anon", "authenticated", "service_role";

-- ---------------------------------------------------------------------------
-- 5. Role definitions are seeded by the database, never fabricated at read time.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_role_definitions("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.role_definitions (org_id, role_key, role_label, description, is_system, is_active)
  values
    (p_org_id, 'admin', 'Admin', 'Full access', true, true),
    (p_org_id, 'ops', 'Ops', 'Operational access', true, true),
    (p_org_id, 'regional_lead', 'Regional lead', 'Regional manager persona', true, true),
    (p_org_id, 'school_director', 'School director', 'Site director persona', true, true)
  on conflict (org_id, role_key) do nothing;
end;
$$;

ALTER FUNCTION public.seed_default_role_definitions("p_org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.orgs_seed_default_role_definitions() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.seed_default_role_definitions(new.id);
  return new;
end;
$$;

ALTER FUNCTION public.orgs_seed_default_role_definitions() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "orgs_seed_default_role_definitions" ON public.orgs;
CREATE TRIGGER "orgs_seed_default_role_definitions"
    AFTER INSERT ON public.orgs
    FOR EACH ROW EXECUTE FUNCTION public.orgs_seed_default_role_definitions();

-- Backfill every existing org (idempotent).
DO $$
DECLARE
    org_row record;
BEGIN
    FOR org_row IN SELECT id FROM public.orgs LOOP
        PERFORM public.seed_default_role_definitions(org_row.id);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Rewrite seed_default_rbac onto the canonical catalog.
--    Full platform catalog (shared 2026-07-29: 57 active keys). Previously wrote only ~22 keys
--    into permission_keys; new orgs would otherwise drift behind live.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_default_rbac("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- Permission catalog (canonical table; legacy names are views over this).
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

  -- Grants for admin: everything.
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'admin', pd.key, true
  from public.permission_definitions pd
  where pd.is_active = true
  on conflict (org_id, role_key, permission_key) do nothing;

  -- Grants for ops: no system user/role write.
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'ops', pd.key, true
  from public.permission_definitions pd
  where pd.is_active = true
    and pd.key not in ('admin.users.write', 'admin.roles.write')
  on conflict (org_id, role_key, permission_key) do nothing;
end;
$$;

ALTER FUNCTION public.seed_default_rbac("p_org_id" "uuid") OWNER TO "postgres";

-- =============================================================================
-- Operational Expectations — P1 · Wave C: Governed Authority model
-- =============================================================================
-- Realizes the FROZEN `Authority` tuple facet as a governed catalog + effective-
-- dated holder assignments, closing the C3 blocker. No new ontology, no new
-- primitive: `Authority` was already a tuple facet; this gives it a governed
-- representation so "does actor X hold authority Y for org O in scope S at time T"
-- is answerable.
--
-- Separation (both may be required):
--   RBAC permission  → may the actor invoke a command?   (operational_expectations.*)
--   Held authority   → may the actor author/ratify under a specific authority?
--
-- ADDITIVE. Preserves Wave A/B/C data: legacy free-text `authority_key` stays; an
-- unresolved legacy claim can never become binding (a governed+active authority +
-- an active in-scope assignment are required to bind). Feature flag remains the
-- rollout boundary.
-- =============================================================================

-- 0. Governed management permissions (distinct from author/ratify) -----------
DO $seed$
DECLARE k text; lbl text; dsc text;
BEGIN
    FOR k, lbl, dsc IN VALUES
        ('operational_expectations.authority.manage', 'Manage operational authorities',
         'Create/activate operational authority catalog entries. Managing authorities does NOT confer holding them.'),
        ('operational_expectations.authority.assign', 'Assign operational authorities',
         'Grant/revoke held-authority assignments. Assigning authority does NOT confer holding it.')
    LOOP
        INSERT INTO public.permissions (key, group_key, label, is_active)
        VALUES (k, 'operations', lbl, true)
        ON CONFLICT (key) DO UPDATE SET group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;
        INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
        VALUES (k, lbl, 'operations', dsc, true)
        ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, group_key = EXCLUDED.group_key, description = EXCLUDED.description, is_active = EXCLUDED.is_active;
        INSERT INTO public.permission_definitions (key, group_key, label, is_active)
        VALUES (k, 'operations', lbl, true)
        ON CONFLICT (key) DO UPDATE SET group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;
        INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
        SELECT o.id, 'admin', k, true FROM public.orgs o
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permission_grants g WHERE g.org_id = o.id AND g.role_key = 'admin' AND g.permission_key = k);
    END LOOP;
END
$seed$;

-- 1. Authority catalog (governed; descriptive only — NO executable behaviour) --
CREATE TABLE IF NOT EXISTS public.operational_authorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    authority_key text NOT NULL,
    label text NOT NULL,
    description text,
    authority_kind text NOT NULL DEFAULT 'operational',
    is_active boolean NOT NULL DEFAULT true,
    effective_start timestamptz NOT NULL DEFAULT now(),
    effective_end timestamptz,
    config_version_ref jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT operational_authorities_kind_check
        CHECK (authority_kind = ANY (ARRAY['operational'::text, 'licensing'::text, 'policy'::text, 'process'::text, 'external'::text])),
    CONSTRAINT operational_authorities_effective_window
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT operational_authorities_key_nonempty CHECK (char_length(btrim(authority_key)) > 0)
);
-- Unique authority key per org (may repeat across orgs).
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_authorities_org_key
    ON public.operational_authorities (org_id, authority_key);
COMMENT ON TABLE public.operational_authorities IS
    'Governed org-scoped Operational Expectation authority catalog (P1 Wave C). Descriptive only — no executable behaviour. A new expectation''s authority_key must resolve to an active entry here to be eligible for binding standing.';

-- 2. Held-authority assignments (append-only, effective-dated) ----------------
CREATE TABLE IF NOT EXISTS public.operational_authority_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    authority_key text NOT NULL,
    -- Holder — the frozen author classes that may HOLD ratifying authority. AI is
    -- excluded: AI is non-ratifying provenance, never a ratifying holder.
    holder_type text NOT NULL,
    holder_id text NOT NULL,
    -- Scope the assignment covers.
    scope_type text NOT NULL DEFAULT 'organization',
    scope_id text,
    status text NOT NULL DEFAULT 'granted',
    -- Effective window + lineage (revocation supersedes a prior grant).
    effective_start timestamptz NOT NULL DEFAULT now(),
    effective_end timestamptz,
    supersedes_assignment_id uuid REFERENCES public.operational_authority_assignments (id) ON DELETE RESTRICT,
    source text NOT NULL DEFAULT 'operator',
    granted_by uuid,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT oe_authority_assignments_holder_type_check
        CHECK (holder_type = ANY (ARRAY['human'::text, 'policy'::text, 'process'::text, 'external'::text])),
    CONSTRAINT oe_authority_assignments_scope_type_check
        CHECK (scope_type = ANY (ARRAY['organization'::text, 'location'::text, 'business_process'::text, 'subject'::text, 'subject_type'::text])),
    CONSTRAINT oe_authority_assignments_status_check
        CHECK (status = ANY (ARRAY['granted'::text, 'revoked'::text])),
    CONSTRAINT oe_authority_assignments_effective_window
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    -- organization scope has no scope_id; narrower scopes require one.
    CONSTRAINT oe_authority_assignments_scope_shape CHECK (
        (scope_type = 'organization' AND scope_id IS NULL)
        OR (scope_type <> 'organization' AND scope_id IS NOT NULL)
    ),
    -- a revocation must supersede a prior grant; a grant supersedes nothing.
    CONSTRAINT oe_authority_assignments_revocation_shape CHECK (
        (status = 'granted' AND supersedes_assignment_id IS NULL)
        OR (status = 'revoked' AND supersedes_assignment_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_oe_authority_assignments_lookup
    ON public.operational_authority_assignments (org_id, authority_key, holder_type, holder_id);
CREATE INDEX IF NOT EXISTS idx_oe_authority_assignments_supersedes
    ON public.operational_authority_assignments (supersedes_assignment_id) WHERE supersedes_assignment_id IS NOT NULL;
COMMENT ON TABLE public.operational_authority_assignments IS
    'Append-only, effective-dated held-authority assignments (P1 Wave C). A holder holds an authority in a scope while an active grant exists and no later revocation supersedes it. Never a mutable boolean; revocation is a new superseding row. AI cannot be a holder.';

-- Append-only enforcement for assignments.
CREATE OR REPLACE FUNCTION public.prevent_oe_authority_assignments_mutation()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
    RAISE EXCEPTION 'operational_authority_assignments is append-only: % not allowed (grant/revoke via a new row).', TG_OP USING ERRCODE = '0A000';
END;
$f$;
DROP TRIGGER IF EXISTS trg_prevent_oe_authority_assignments_mutation ON public.operational_authority_assignments;
CREATE TRIGGER trg_prevent_oe_authority_assignments_mutation
    BEFORE UPDATE OR DELETE ON public.operational_authority_assignments
    FOR EACH ROW EXECUTE FUNCTION public.prevent_oe_authority_assignments_mutation();

-- Assignment consistency: same-org authority + server-assigned recorded_at + AI-guard.
CREATE OR REPLACE FUNCTION public.validate_oe_authority_assignment()
RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE prior_org uuid;
BEGIN
    NEW.recorded_at := now();
    IF NOT EXISTS (SELECT 1 FROM public.operational_authorities a WHERE a.org_id = NEW.org_id AND a.authority_key = NEW.authority_key) THEN
        RAISE EXCEPTION 'oe_authority_assignment: authority % is not governed in this org', NEW.authority_key USING ERRCODE = '23503';
    END IF;
    IF NEW.supersedes_assignment_id IS NOT NULL THEN
        SELECT org_id INTO prior_org FROM public.operational_authority_assignments WHERE id = NEW.supersedes_assignment_id;
        IF prior_org IS NULL OR prior_org <> NEW.org_id THEN
            RAISE EXCEPTION 'oe_authority_assignment: revocation must supersede a same-org grant' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS trg_validate_oe_authority_assignment ON public.operational_authority_assignments;
CREATE TRIGGER trg_validate_oe_authority_assignment
    BEFORE INSERT ON public.operational_authority_assignments
    FOR EACH ROW EXECUTE FUNCTION public.validate_oe_authority_assignment();

-- 3. Evidence columns on the expectation ledger (additive, nullable) ---------
ALTER TABLE public.operational_expectations
    ADD COLUMN IF NOT EXISTS authority_assignment_id uuid,
    ADD COLUMN IF NOT EXISTS authority_matched_scope text;
COMMENT ON COLUMN public.operational_expectations.authority_assignment_id IS
    'When a row was admitted as binding by self-ratification, the held-authority assignment that proved it (audit). NULL for proposed/model/legacy.';

-- 4. RLS: SELECT org-scoped; NO client writes (writes via service-role RPCs) --
ALTER TABLE public.operational_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_authority_assignments ENABLE ROW LEVEL SECURITY;
DO $rls$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['operational_authorities','operational_authority_assignments'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select_org ON public.%I', t, t);
        EXECUTE format($p$CREATE POLICY %I_select_org ON public.%I FOR SELECT TO authenticated
            USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = %I.org_id))$p$, t, t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
        EXECUTE format($p$CREATE POLICY %I_service_all ON public.%I FOR ALL TO authenticated
            USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')$p$, t, t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END LOOP;
END
$rls$;

-- 5. THE single held-authority resolver (authoritative; used by both RPCs) ----
-- Exact authority-key match (no invented hierarchy — Part II.4). Fail-closed.
CREATE OR REPLACE FUNCTION public.resolve_held_operational_authority(
    p_org_id uuid, p_holder_type text, p_holder_id text, p_authority_key text,
    p_scope_type text, p_scope_id text, p_effective_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_assignment uuid;
BEGIN
    -- AI never holds ratifying authority.
    IF p_holder_type = 'ai' THEN RETURN NULL; END IF;
    -- Authority must be governed + active at the effective time.
    IF NOT EXISTS (
        SELECT 1 FROM public.operational_authorities a
        WHERE a.org_id = p_org_id AND a.authority_key = p_authority_key AND a.is_active
          AND a.effective_start <= p_effective_at AND (a.effective_end IS NULL OR a.effective_end >= p_effective_at)
    ) THEN RETURN NULL; END IF;
    -- An active, in-scope, non-revoked grant for this holder.
    SELECT g.id INTO v_assignment
    FROM public.operational_authority_assignments g
    WHERE g.org_id = p_org_id AND g.authority_key = p_authority_key
      AND g.holder_type = p_holder_type AND g.holder_id = p_holder_id
      AND g.status = 'granted'
      AND g.effective_start <= p_effective_at AND (g.effective_end IS NULL OR g.effective_end >= p_effective_at)
      AND (g.scope_type = 'organization' OR (g.scope_type = p_scope_type AND g.scope_id = p_scope_id))
      AND NOT EXISTS (
          SELECT 1 FROM public.operational_authority_assignments r
          WHERE r.supersedes_assignment_id = g.id AND r.status = 'revoked'
            AND r.effective_start <= p_effective_at
      )
    ORDER BY (g.scope_type = 'organization'), g.effective_start DESC
    LIMIT 1;
    RETURN v_assignment;
END;
$f$;
REVOKE ALL ON FUNCTION public.resolve_held_operational_authority(uuid,text,text,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_held_operational_authority(uuid,text,text,text,text,text,timestamptz) TO service_role;

-- 6. Bounded management RPCs (service-role only) -----------------------------
CREATE OR REPLACE FUNCTION public.upsert_operational_authority(
    p_org_id uuid, p_authority_key text, p_label text, p_description text, p_kind text, p_is_active boolean, p_actor uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.operational_authorities (org_id, authority_key, label, description, authority_kind, is_active, created_by)
    VALUES (p_org_id, p_authority_key, p_label, p_description, COALESCE(p_kind,'operational'), COALESCE(p_is_active,true), p_actor)
    ON CONFLICT (org_id, authority_key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description,
        authority_kind = EXCLUDED.authority_kind, is_active = EXCLUDED.is_active
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.upsert_operational_authority(uuid,text,text,text,text,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_operational_authority(uuid,text,text,text,text,boolean,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_operational_authority_assignment(
    p_org_id uuid, p_authority_key text, p_holder_type text, p_holder_id text,
    p_scope_type text, p_scope_id text, p_effective_start timestamptz, p_effective_end timestamptz, p_actor uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.operational_authority_assignments
        (org_id, authority_key, holder_type, holder_id, scope_type, scope_id, status, effective_start, effective_end, granted_by)
    VALUES (p_org_id, p_authority_key, p_holder_type, p_holder_id, COALESCE(p_scope_type,'organization'), p_scope_id,
        'granted', COALESCE(p_effective_start, now()), p_effective_end, p_actor)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.grant_operational_authority_assignment(uuid,text,text,text,text,text,timestamptz,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_operational_authority_assignment(uuid,text,text,text,text,text,timestamptz,timestamptz,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_operational_authority_assignment(p_org_id uuid, p_assignment_id uuid, p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_id uuid; v_auth text; v_ht text; v_hid text; v_st text; v_sid text;
BEGIN
    SELECT authority_key, holder_type, holder_id, scope_type, scope_id INTO v_auth, v_ht, v_hid, v_st, v_sid
    FROM public.operational_authority_assignments WHERE id = p_assignment_id AND org_id = p_org_id AND status = 'granted';
    IF v_auth IS NULL THEN RAISE EXCEPTION 'oe_authority_assignment: grant % not found in org', p_assignment_id USING ERRCODE = '23503'; END IF;
    INSERT INTO public.operational_authority_assignments
        (org_id, authority_key, holder_type, holder_id, scope_type, scope_id, status, supersedes_assignment_id, granted_by)
    VALUES (p_org_id, v_auth, v_ht, v_hid, v_st, v_sid, 'revoked', p_assignment_id, p_actor)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.revoke_operational_authority_assignment(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_operational_authority_assignment(uuid,uuid,uuid) TO service_role;

-- =============================================================================
-- Processing Identity Resolution — D2 Deterministic Commit Executor
-- =============================================================================
-- Introduces:
--   processing_commit_attempts  — append-only execution runs + per-op results
--   processing_exceptions       — operator-actionable blockers/partials
--   execute_processing_identity_group() — ONE-TRANSACTION atomic identity group
--     (person + household + links + child), mirroring the mutation RPC pattern
--     (20260630121000_mutation_events_outbox.sql). This is the real transaction
--     boundary for atomic groups (RFC §7.14 / §24); the executor never fakes
--     atomicity in memory. No feature flag.
-- =============================================================================

SET search_path TO public;

-- ---------------------------------------------------------------------------
-- processing_commit_attempts (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_commit_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.processing_commit_plans (id) ON DELETE CASCADE,
    plan_version integer NOT NULL,
    plan_content_hash text NOT NULL,
    attempt_no integer NOT NULL,
    execution_idempotency_key text NOT NULL,
    actor_id uuid NOT NULL,
    outcome text NOT NULL,
    operations jsonb NOT NULL DEFAULT '[]'::jsonb,
    compensation jsonb NOT NULL DEFAULT '[]'::jsonb,
    events jsonb NOT NULL DEFAULT '[]'::jsonb,
    preflight_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
    retention_class text NOT NULL DEFAULT 'audit_authoritative',
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_processing_commit_attempts_plan_attempt UNIQUE (plan_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_processing_commit_attempts_case
    ON public.processing_commit_attempts (org_id, case_id);
CREATE INDEX IF NOT EXISTS idx_processing_commit_attempts_idem
    ON public.processing_commit_attempts (plan_id, execution_idempotency_key);

CREATE OR REPLACE FUNCTION public.processing_commit_attempts_append_only_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'processing_commit_attempts is append-only; record a new attempt instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_commit_attempts_append_only ON public.processing_commit_attempts;
CREATE TRIGGER trg_processing_commit_attempts_append_only
    BEFORE UPDATE OR DELETE ON public.processing_commit_attempts
    FOR EACH ROW EXECUTE FUNCTION public.processing_commit_attempts_append_only_guard();

-- ---------------------------------------------------------------------------
-- processing_exceptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    exception_type text NOT NULL,
    severity text NOT NULL DEFAULT 'warning',
    code text NOT NULL,
    message text NOT NULL,
    subject_ref jsonb,
    evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processing_exceptions_open
    ON public.processing_exceptions (org_id, exception_type, resolved_at);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped read; service-role writes (Processing service owns execution).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['processing_commit_attempts', 'processing_exceptions'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_org', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY[''owner'',''admin'',''ops'',''manager'']));',
            t || '_select_org', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_all_service_role', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            t || '_all_service_role', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ref resolver helper: "@op_id" placeholder → concrete id from the ref map.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processing_resolve_ref(p_val text, p_refs jsonb)
    RETURNS text
    LANGUAGE plpgsql
    IMMUTABLE
    SET search_path = public
AS $$
BEGIN
    IF p_val IS NULL THEN
        RETURN NULL;
    END IF;
    IF left(p_val, 1) = '@' THEN
        RETURN p_refs ->> substring(p_val FROM 2);
    END IF;
    RETURN p_val;
END;
$$;

-- ---------------------------------------------------------------------------
-- execute_processing_identity_group: the atomic identity group in ONE tx.
-- p_operations is an ordered array of { op_id, command_key, payload }. Any
-- failure raises → the whole group rolls back (true atomicity, no partial).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_processing_identity_group(
    p_org_id uuid,
    p_actor text,
    p_idempotency_key text,
    p_operations jsonb
)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_refs   jsonb := '{}'::jsonb;
    v_op     jsonb;
    v_op_id  text;
    v_key    text;
    v_pl     jsonb;
    v_new_id uuid;
    v_person uuid;
    v_house  uuid;
BEGIN
    FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations)
    LOOP
        v_op_id := v_op ->> 'op_id';
        v_key   := v_op ->> 'command_key';
        v_pl    := v_op -> 'payload';

        IF v_key = 'create_person' THEN
            INSERT INTO persons (org_id, first_name, last_name, email, phone)
            VALUES (
                p_org_id,
                v_pl ->> 'first_name',
                v_pl ->> 'last_name',
                v_pl ->> 'email',
                v_pl ->> 'phone'
            )
            RETURNING id INTO v_new_id;

        ELSIF v_key = 'create_household' THEN
            INSERT INTO customers (org_id, name)
            VALUES (p_org_id, coalesce(v_pl ->> 'household_name', 'Household'))
            RETURNING id INTO v_new_id;

        ELSIF v_key = 'link_person_to_household' THEN
            v_person := public.processing_resolve_ref(v_pl ->> 'person_id', v_refs)::uuid;
            v_house  := public.processing_resolve_ref(v_pl ->> 'household_id', v_refs)::uuid;
            INSERT INTO customer_persons (org_id, customer_id, person_id, role_type)
            VALUES (p_org_id, v_house, v_person, coalesce(v_pl ->> 'role_type', 'primary_contact'))
            ON CONFLICT (org_id, customer_id, person_id) DO UPDATE SET role_type = EXCLUDED.role_type
            RETURNING id INTO v_new_id;

        ELSIF v_key IN ('create_child', 'link_child_to_household') THEN
            v_house := public.processing_resolve_ref(v_pl ->> 'household_id', v_refs)::uuid;
            INSERT INTO customer_members (
                org_id, customer_id, person_id, display_name, first_name, last_name, dob, relationship
            )
            VALUES (
                p_org_id,
                v_house,
                NULLIF(public.processing_resolve_ref(v_pl ->> 'person_id', v_refs), '')::uuid,
                coalesce(v_pl ->> 'display_name', 'Child'),
                v_pl ->> 'first_name',
                v_pl ->> 'last_name',
                NULLIF(v_pl ->> 'dob', '')::date,
                coalesce(v_pl ->> 'relationship', 'child')
            )
            RETURNING id INTO v_new_id;

        ELSE
            RAISE EXCEPTION 'unsupported_atomic_group_command:%', v_key;
        END IF;

        v_refs := jsonb_set(v_refs, ARRAY[v_op_id], to_jsonb(v_new_id::text));
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'refs', v_refs);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_processing_identity_group(uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.execute_processing_identity_group(uuid, text, text, jsonb) TO service_role;

COMMENT ON TABLE public.processing_commit_attempts IS
    'D2: append-only execution runs + per-op results/compensation for a commit plan.';
COMMENT ON TABLE public.processing_exceptions IS
    'D2: operator-actionable blockers/duplicates/partial-commit exceptions.';
COMMENT ON FUNCTION public.execute_processing_identity_group(uuid, text, text, jsonb) IS
    'D2: executes the atomic identity group (person/household/links/child) in one transaction.';

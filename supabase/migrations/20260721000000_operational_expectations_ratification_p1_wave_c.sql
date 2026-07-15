-- =============================================================================
-- Operational Expectations — P1 · Wave C · C2: Ratification (Authority → binding)
-- =============================================================================
-- The immutable ratification path that promotes a `proposed` deontic expectation
-- to effective `binding` standing. ADDITIVE over Waves A/B; changes NO existing
-- authoring behaviour (the Wave B intake still writes proposed/model). Because the
-- ledger is append-only, binding is NEVER a mutated column — it is recorded by a
-- new, immutable, lineage-linked Ratification Act, and effective standing is
-- DERIVED from its presence.
--
-- Frozen rules (System Design §5/§12; Engineering Realization X0):
--   - Ratification is an authoring act by an authority, lineage-linked, promoting
--     proposed → binding. A Ratification Act is a DISTINCT act kind (not a sixth
--     tuple verb) — the five-verb set stays closed.
--   - Deontic/commissive (required/prohibited/intended/committed) proposals REQUIRE
--     ratification to bind. `predicted` stands at `model` and is NOT ratifiable.
--   - AI never self-ratifies. Ratification authority ≠ authoring authority.
--   - Possession of service-role credentials is NOT authority.
--
-- Delivers: (1) a DEDICATED `operational_expectations.ratify` RBAC capability
-- (admin-default; distinct from `.author`); (2) an append-only
-- `operational_expectation_ratifications` history table; (3) an atomic
-- `ratify_operational_expectation` RPC (ratification record + mutation_events
-- Ratification Act in one transaction; one ratification per expectation).
-- =============================================================================

-- 1. Dedicated ratification capability (RBAC catalog) -------------------------
INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES ('operational_expectations.ratify', 'operations', 'Ratify operational expectations', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'operational_expectations.ratify',
    'Ratify operational expectations',
    'operations',
    'Promote a proposed deontic Operational Expectation to binding standing via a ratification act. DISTINCT from operational_expectations.author — authoring permission does not grant ratification authority.',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label, group_key = EXCLUDED.group_key,
    description = EXCLUDED.description, is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES ('operational_expectations.ratify', 'operations', 'Ratify operational expectations', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;

-- Default grant: org `admin` role only (narrowest safe grant; idempotent per org).
-- Ordinary authors (operational_expectations.author holders) are UNCHANGED — a
-- caller who can author cannot ratify.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', 'operational_expectations.ratify', true
FROM public.orgs AS o
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = 'admin'
      AND g.permission_key = 'operational_expectations.ratify'
);

-- 2. Append-only ratification history ----------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_expectation_ratifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    -- Lineage link to the ratified expectation + its lineage root.
    expectation_id uuid NOT NULL
        REFERENCES public.operational_expectations (id) ON DELETE RESTRICT,
    lineage_root_id uuid REFERENCES public.operational_expectations (id) ON DELETE RESTRICT,

    -- The standing before/after. A ratification always promotes to binding.
    prior_standing text NOT NULL,
    new_standing text NOT NULL DEFAULT 'binding',

    -- The authority under which ratification is made + who ratified.
    ratifier_authority_key text NOT NULL,
    ratified_by_user_id uuid,
    ratified_by_label text,
    rationale text,

    -- Retry-safety.
    idempotency_key text,
    payload_fingerprint text,

    -- Server-assigned recorded time (non-forgeable; immutable via append-only).
    ratified_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT oe_ratifications_new_standing_binding CHECK (new_standing = 'binding'),
    CONSTRAINT oe_ratifications_prior_standing_check
        CHECK (prior_standing = ANY (ARRAY['proposed'::text, 'model'::text, 'binding'::text]))
);

COMMENT ON TABLE public.operational_expectation_ratifications IS
    'Append-only ratification history (P1 Wave C). Each row is an immutable Ratification Act promoting a proposed deontic expectation to effective binding standing. One ratification per (org_id, expectation_id). Rows are never updated/deleted.';
COMMENT ON COLUMN public.operational_expectation_ratifications.ratified_at IS
    'Server-assigned recorded time (BEFORE INSERT trigger); immutable (append-only).';

-- One ratification per expectation (a second is redundant; enforces no double-bind).
CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_ratifications_org_expectation
    ON public.operational_expectation_ratifications (org_id, expectation_id);
-- Client-retry idempotency (when a key is supplied).
CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_ratifications_org_idempotency
    ON public.operational_expectation_ratifications (org_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oe_ratifications_lineage_root
    ON public.operational_expectation_ratifications (org_id, lineage_root_id);

-- Append-only: block UPDATE/DELETE for all roles (immutable ratification history).
CREATE OR REPLACE FUNCTION public.prevent_oe_ratifications_mutation()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'operational_expectation_ratifications is append-only: % is not allowed.', TG_OP
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_oe_ratifications_mutation ON public.operational_expectation_ratifications;
CREATE TRIGGER trg_prevent_oe_ratifications_mutation
    BEFORE UPDATE OR DELETE ON public.operational_expectation_ratifications
    FOR EACH ROW EXECUTE FUNCTION public.prevent_oe_ratifications_mutation();

-- Structural validation: server-assign ratified_at; the target must be a same-org,
-- currently-proposed, DEONTIC expectation (predicted stands at model — not ratifiable).
CREATE OR REPLACE FUNCTION public.validate_oe_ratification()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    exp_org uuid;
    exp_modality text;
    exp_standing text;
    exp_root uuid;
BEGIN
    NEW.ratified_at := now(); -- server-assigned, non-forgeable

    SELECT e.org_id, e.modality, e.standing, e.lineage_root_id
    INTO exp_org, exp_modality, exp_standing, exp_root
    FROM public.operational_expectations e
    WHERE e.id = NEW.expectation_id;

    IF exp_org IS NULL THEN
        RAISE EXCEPTION 'oe_ratification: expectation % not found', NEW.expectation_id USING ERRCODE = '23503';
    END IF;
    IF exp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'oe_ratification: cross-org ratification is forbidden' USING ERRCODE = '23514';
    END IF;
    IF exp_modality NOT IN ('required', 'prohibited', 'intended', 'committed') THEN
        RAISE EXCEPTION 'oe_ratification: only deontic/commissive expectations are ratifiable (got %)', exp_modality USING ERRCODE = '23514';
    END IF;
    IF exp_standing <> 'proposed' THEN
        RAISE EXCEPTION 'oe_ratification: only a proposed expectation may be ratified (got %)', exp_standing USING ERRCODE = '23514';
    END IF;

    NEW.prior_standing := exp_standing;
    IF NEW.lineage_root_id IS NULL THEN
        NEW.lineage_root_id := COALESCE(exp_root, NEW.expectation_id);
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_oe_ratification ON public.operational_expectation_ratifications;
CREATE TRIGGER trg_validate_oe_ratification
    BEFORE INSERT ON public.operational_expectation_ratifications
    FOR EACH ROW EXECUTE FUNCTION public.validate_oe_ratification();

-- RLS: org-scoped SELECT; NO client INSERT (writes only via the service-role RPC).
ALTER TABLE public.operational_expectation_ratifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oe_ratifications_select_org ON public.operational_expectation_ratifications;
CREATE POLICY oe_ratifications_select_org
    ON public.operational_expectation_ratifications
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = operational_expectation_ratifications.org_id
    ));

DROP POLICY IF EXISTS oe_ratifications_service_all ON public.operational_expectation_ratifications;
CREATE POLICY oe_ratifications_service_all
    ON public.operational_expectation_ratifications
    FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

GRANT SELECT ON TABLE public.operational_expectation_ratifications TO authenticated;
GRANT ALL ON TABLE public.operational_expectation_ratifications TO service_role;

-- 3. Atomic ratification RPC -------------------------------------------------
-- Inserts the ratification record + the mutation_events Ratification Act in one
-- transaction. One ratification per expectation (insert-with-conflict-catch).
-- Grammar/permission are enforced in TS; this is service-role-only infrastructure.
CREATE OR REPLACE FUNCTION public.ratify_operational_expectation(
    p_org_id          uuid,
    p_actor_user_id   uuid,
    p_ratification    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_expectation_id uuid := (p_ratification->>'expectation_id')::uuid;
    v_key            text := nullif(p_ratification->>'idempotency_key', '');
    v_fingerprint    text := p_ratification->>'payload_fingerprint';
    v_authority      text := p_ratification->>'ratifier_authority_key';
    v_new            public.operational_expectation_ratifications%ROWTYPE;
    v_existing       public.operational_expectation_ratifications%ROWTYPE;
    v_mutation_id    uuid := gen_random_uuid();
    v_event_id       uuid;
BEGIN
    IF v_expectation_id IS NULL THEN
        RAISE EXCEPTION 'oe_ratification_missing_expectation' USING ERRCODE = '22023';
    END IF;

    BEGIN
        INSERT INTO public.operational_expectation_ratifications (
            org_id, expectation_id, prior_standing, new_standing,
            ratifier_authority_key, ratified_by_user_id, ratified_by_label, rationale,
            idempotency_key, payload_fingerprint
        ) VALUES (
            p_org_id, v_expectation_id, 'proposed', 'binding',
            v_authority, p_actor_user_id, nullif(p_ratification->>'ratified_by_label', ''),
            nullif(p_ratification->>'rationale', ''),
            v_key, v_fingerprint
        )
        RETURNING * INTO v_new;

        INSERT INTO public.mutation_events (
            org_id, mutation_id, command_key, domain,
            subject_id, subject_type, previous_state, new_state,
            operator_id, origin, context_payload, committed_at, effective_at
        ) VALUES (
            p_org_id, v_mutation_id, 'ratify_expectation', 'operational_expectations',
            v_expectation_id, 'operational_expectation', v_new.prior_standing, 'binding',
            p_actor_user_id::text, 'api',
            jsonb_build_object(
                'ratification_id', v_new.id, 'expectation_id', v_expectation_id,
                'ratifier_authority_key', v_authority, 'lineage_root_id', v_new.lineage_root_id,
                'prior_standing', v_new.prior_standing, 'new_standing', 'binding',
                'idempotency_key', v_key
            ),
            now(), v_new.ratified_at
        );

        RETURN jsonb_build_object(
            'ok', true, 'disposition', 'created', 'idempotent', false,
            'ratification_id', v_new.id, 'expectation_id', v_expectation_id,
            'new_standing', 'binding', 'authoring_act_event_id', v_mutation_id,
            'ratified_at', v_new.ratified_at
        );

    EXCEPTION WHEN unique_violation THEN
        -- The expectation is already ratified (or same idempotency key). Reload the
        -- winner; a ratification is idempotent (one binding, immutable history).
        SELECT * INTO v_existing
        FROM public.operational_expectation_ratifications
        WHERE org_id = p_org_id AND expectation_id = v_expectation_id
        ORDER BY ratified_at ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE; -- a different constraint — do not mask
        END IF;
        IF v_fingerprint IS NOT NULL AND v_existing.payload_fingerprint IS NOT NULL
           AND v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'oe_ratification_conflict' USING ERRCODE = '23505';
        END IF;

        SELECT mutation_id INTO v_event_id
        FROM public.mutation_events
        WHERE org_id = p_org_id AND domain = 'operational_expectations'
          AND subject_id = v_expectation_id AND command_key = 'ratify_expectation'
        ORDER BY committed_at ASC
        LIMIT 1;

        RETURN jsonb_build_object(
            'ok', true, 'disposition', 'existing', 'idempotent', true,
            'ratification_id', v_existing.id, 'expectation_id', v_expectation_id,
            'new_standing', 'binding', 'authoring_act_event_id', COALESCE(v_event_id, v_existing.id),
            'ratified_at', v_existing.ratified_at
        );
    END;
END;
$function$;

COMMENT ON FUNCTION public.ratify_operational_expectation(uuid, uuid, jsonb) IS
    'P1 Wave C ratification RPC. Inserts the immutable ratification record + the mutation_events Ratification Act in one transaction; one ratification per (org_id, expectation_id) via insert-with-conflict-catch. Permission (operational_expectations.ratify) + tenancy are enforced in TS; the trigger enforces same-org, proposed, deontic. service_role only.';

REVOKE ALL ON FUNCTION public.ratify_operational_expectation(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ratify_operational_expectation(uuid, uuid, jsonb) TO service_role;

-- Rollback (documented): ratification history is append-only and preserved. To
-- retire, revoke the capability grant + drop the RPC; the table/rows remain.

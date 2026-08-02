-- =============================================================================
-- Trust Runtime V1 — Slice 1 foundation
-- =============================================================================
-- Four additive, org-scoped tables. No existing table is altered.
--
-- The invariants below are enforced HERE, by the database, not by the service
-- layer. A future writer — a service, an agent, a migration that forgets —
-- cannot bypass them:
--
--   * a Decision Package is immutable at creation (no UPDATE, no DELETE);
--   * exactly one Decision Package per Decision Contract;
--   * a Decision Contract is insert-only apart from advancing its lifecycle,
--     and the lifecycle may only move forward;
--   * observations and reasoning usage are append-only;
--   * a Decision Package carries NO mutable lifecycle column — post-creation
--     lifecycle is the observation stream, per Trust Platform Decision 020.
--
-- What these tables do NOT own: operational truth, identity, permissions,
-- business rules, execution. A Decision Package is evidence. Nothing here can
-- execute anything.
--
-- @see docs/platform/trust/decision-package.md
-- @see docs/platform/trust/trust-platform-decisions.md — Decisions 020, 021, 022
-- =============================================================================

-- -----------------------------------------------------------------------------
-- trust_decision_contracts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trust_decision_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,

    decision_class_key text NOT NULL,

    intent text NOT NULL,
    context jsonb NOT NULL DEFAULT '{}'::jsonb,

    information_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
    knowledge_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,

    privacy_policy_key text NOT NULL,
    validation_policy_key text NOT NULL,

    economic_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
    success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,

    correlation_id text NOT NULL,
    initiating_actor_type text NOT NULL,
    initiating_actor_id uuid,
    channel text NOT NULL,

    lifecycle_state text NOT NULL DEFAULT 'created'::text,

    runtime_version text NOT NULL,
    registry_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tdc_lifecycle_state CHECK (lifecycle_state = ANY (ARRAY[
        'created'::text,
        'accepted'::text,
        'prepared'::text,
        'executing'::text,
        'validated'::text,
        'packaged'::text,
        'completed'::text,
        'archived'::text
    ])),
    CONSTRAINT chk_tdc_actor_type CHECK (initiating_actor_type = ANY (ARRAY['operator'::text, 'system'::text, 'automation'::text])),
    CONSTRAINT chk_tdc_channel CHECK (channel = ANY (ARRAY['operator'::text, 'participant'::text, 'bos'::text, 'api'::text, 'system'::text]))
);

COMMENT ON TABLE public.trust_decision_contracts IS
    'Trust Runtime: a submitted request for a decision. Insert-only apart from advancing lifecycle_state. Never contains a prompt, provider, model or API parameter.';

CREATE INDEX IF NOT EXISTS idx_tdc_org_class_created
    ON public.trust_decision_contracts (org_id, decision_class_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdc_correlation
    ON public.trust_decision_contracts (org_id, correlation_id);

-- -----------------------------------------------------------------------------
-- trust_decision_packages
-- -----------------------------------------------------------------------------
-- NOTE: there is deliberately NO lifecycle / accepted / rejected / overridden /
-- executed column on this table. Adding one would violate Decision 020, and the
-- certification suite asserts their absence.
CREATE TABLE IF NOT EXISTS public.trust_decision_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,

    -- One completed contract produces exactly one package. Enforced, not asserted.
    contract_id uuid NOT NULL UNIQUE REFERENCES public.trust_decision_contracts (id) ON DELETE RESTRICT,
    decision_class_key text NOT NULL,

    outcome text NOT NULL,

    -- Present only when outcome = 'recommended'; a refusal is still a package.
    recommendation jsonb,
    explanation text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    remaining_uncertainty jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Statistical certainty. Deliberately separate from trust_score.
    confidence numeric,

    trust_vector jsonb,
    trust_score numeric,
    trust_semantics_version text,
    review_requirement text NOT NULL,

    validation_results jsonb,
    privacy_report jsonb NOT NULL DEFAULT '{}'::jsonb,
    economics jsonb NOT NULL DEFAULT '{}'::jsonb,
    knowledge_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
    learning_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Lineage: set when a materially modified recommendation produced this
    -- package. The predecessor is never edited.
    supersedes_package_id uuid REFERENCES public.trust_decision_packages (id) ON DELETE RESTRICT,

    strategy_key text,
    strategy_version text,
    validation_version text,
    runtime_version text NOT NULL,
    registry_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tdp_outcome CHECK (outcome = ANY (ARRAY[
        'recommended'::text,
        'refused_policy'::text,
        'refused_permission'::text,
        'refused_unsupported_class'::text,
        'refused_insufficient_information'::text,
        'refused_privacy'::text,
        'refused_budget'::text,
        'failed_validation'::text,
        'failed_reasoning'::text
    ])),
    -- A recommendation exists only on the recommended outcome, and a refusal
    -- never smuggles one through.
    CONSTRAINT chk_tdp_recommendation_only_when_recommended CHECK (
        (outcome = 'recommended' AND recommendation IS NOT NULL)
        OR (outcome <> 'recommended' AND recommendation IS NULL)
    ),
    CONSTRAINT chk_tdp_no_self_lineage CHECK (supersedes_package_id IS NULL OR supersedes_package_id <> id)
);

COMMENT ON TABLE public.trust_decision_packages IS
    'Trust Runtime: the immutable output of one Decision Contract. Evidence supporting a human decision, an Objective, or a registered command invocation — never directly executable. No lifecycle column by design (Decision 020).';

CREATE INDEX IF NOT EXISTS idx_tdp_org_class_created
    ON public.trust_decision_packages (org_id, decision_class_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdp_org_outcome
    ON public.trust_decision_packages (org_id, outcome);
CREATE INDEX IF NOT EXISTS idx_tdp_lineage
    ON public.trust_decision_packages (supersedes_package_id)
    WHERE supersedes_package_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- trust_decision_observations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trust_decision_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    package_id uuid NOT NULL REFERENCES public.trust_decision_packages (id) ON DELETE RESTRICT,

    observation_kind text NOT NULL,
    observed_by_actor_type text NOT NULL,
    observed_by_actor_id uuid,
    channel text NOT NULL,

    -- Evidence that an execution authority acted. NEVER an instruction to act.
    execution_reference text,

    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    observed_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tdo_kind CHECK (observation_kind = ANY (ARRAY[
        'presented'::text,
        'accepted'::text,
        'rejected'::text,
        'overridden'::text,
        'modified'::text,
        'deferred'::text,
        'executed'::text,
        'outcome'::text
    ])),
    CONSTRAINT chk_tdo_actor_type CHECK (observed_by_actor_type = ANY (ARRAY['operator'::text, 'system'::text, 'automation'::text]))
);

COMMENT ON TABLE public.trust_decision_observations IS
    'Trust Runtime: append-only outcomes referencing an immutable Decision Package. This IS the post-creation lifecycle (Decision 020).';

CREATE INDEX IF NOT EXISTS idx_tdo_package
    ON public.trust_decision_observations (package_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_tdo_org_kind
    ON public.trust_decision_observations (org_id, observation_kind, observed_at DESC);

-- -----------------------------------------------------------------------------
-- trust_reasoning_usage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trust_reasoning_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    contract_id uuid NOT NULL REFERENCES public.trust_decision_contracts (id) ON DELETE CASCADE,

    decision_class_key text NOT NULL,
    strategy_key text,
    strategy_kind text,
    escalation_level integer NOT NULL DEFAULT 0,
    latency_ms integer NOT NULL DEFAULT 0,
    cache_utilized boolean NOT NULL DEFAULT false,
    -- V1 runs no provider, so this is structurally zero rather than unmeasured.
    provider_cost_units numeric NOT NULL DEFAULT 0,
    outcome text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tru_escalation_level CHECK (escalation_level >= 0),
    CONSTRAINT chk_tru_latency CHECK (latency_ms >= 0)
);

COMMENT ON TABLE public.trust_reasoning_usage IS
    'Trust Runtime: append-only economics per contract. Aggregated by Operational Intelligence; never read by reasoning.';

CREATE INDEX IF NOT EXISTS idx_tru_org_class_recorded
    ON public.trust_reasoning_usage (org_id, decision_class_key, recorded_at DESC);

-- =============================================================================
-- Invariant enforcement
-- =============================================================================

-- A Decision Contract is insert-only apart from advancing lifecycle_state, and
-- the lifecycle may only move forward.
CREATE OR REPLACE FUNCTION public.enforce_trust_decision_contract_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_states text[] := ARRAY['created','accepted','prepared','executing','validated','packaged','completed','archived'];
    v_old_pos integer;
    v_new_pos integer;
BEGIN
    IF (to_jsonb(NEW) - 'lifecycle_state') IS DISTINCT FROM (to_jsonb(OLD) - 'lifecycle_state') THEN
        RAISE EXCEPTION
            'trust_decision_contracts is insert-only: only lifecycle_state may change after insert (contract %)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    v_old_pos := array_position(v_states, OLD.lifecycle_state);
    v_new_pos := array_position(v_states, NEW.lifecycle_state);

    IF v_new_pos IS NULL THEN
        RAISE EXCEPTION 'trust_decision_contracts: unknown lifecycle_state %', NEW.lifecycle_state
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_new_pos < v_old_pos THEN
        RAISE EXCEPTION
            'trust_decision_contracts: lifecycle_state may only advance (% -> % on contract %)',
            OLD.lifecycle_state, NEW.lifecycle_state, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_decision_contract_immutability ON public.trust_decision_contracts;
CREATE TRIGGER trg_trust_decision_contract_immutability
    BEFORE UPDATE ON public.trust_decision_contracts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_trust_decision_contract_immutability();

CREATE OR REPLACE FUNCTION public.refuse_trust_decision_contract_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'trust_decision_contracts is insert-only: DELETE is refused (contract %)', OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_decision_contract_no_delete ON public.trust_decision_contracts;
CREATE TRIGGER trg_trust_decision_contract_no_delete
    BEFORE DELETE ON public.trust_decision_contracts
    FOR EACH ROW EXECUTE FUNCTION public.refuse_trust_decision_contract_delete();

-- A Decision Package is immutable at creation. UPDATE and DELETE are refused
-- outright — there is no "correct a package", only a new package with lineage.
CREATE OR REPLACE FUNCTION public.refuse_trust_decision_package_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'trust_decision_packages is immutable at creation: % is refused (package %). A materially modified recommendation creates a NEW contract and package with supersedes_package_id lineage.',
        TG_OP, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_decision_package_immutable ON public.trust_decision_packages;
CREATE TRIGGER trg_trust_decision_package_immutable
    BEFORE UPDATE OR DELETE ON public.trust_decision_packages
    FOR EACH ROW EXECUTE FUNCTION public.refuse_trust_decision_package_mutation();

-- Observations are append-only.
CREATE OR REPLACE FUNCTION public.refuse_trust_decision_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'trust_decision_observations is append-only: % is refused (observation %)', TG_OP, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_decision_observation_append_only ON public.trust_decision_observations;
CREATE TRIGGER trg_trust_decision_observation_append_only
    BEFORE UPDATE OR DELETE ON public.trust_decision_observations
    FOR EACH ROW EXECUTE FUNCTION public.refuse_trust_decision_observation_mutation();

-- Reasoning usage is append-only.
CREATE OR REPLACE FUNCTION public.refuse_trust_reasoning_usage_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'trust_reasoning_usage is append-only: % is refused (row %)', TG_OP, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_reasoning_usage_append_only ON public.trust_reasoning_usage;
CREATE TRIGGER trg_trust_reasoning_usage_append_only
    BEFORE UPDATE OR DELETE ON public.trust_reasoning_usage
    FOR EACH ROW EXECUTE FUNCTION public.refuse_trust_reasoning_usage_mutation();

-- An observation must belong to the same org as its package. A cross-tenant
-- observation would let one org narrate another org's decision.
CREATE OR REPLACE FUNCTION public.enforce_trust_observation_tenancy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_pkg_org uuid;
BEGIN
    SELECT org_id INTO v_pkg_org FROM public.trust_decision_packages WHERE id = NEW.package_id;
    IF v_pkg_org IS NULL THEN
        RAISE EXCEPTION 'trust_decision_observations: package % does not exist', NEW.package_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_pkg_org <> NEW.org_id THEN
        RAISE EXCEPTION 'trust_decision_observations: org mismatch with package % ', NEW.package_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_observation_tenancy ON public.trust_decision_observations;
CREATE TRIGGER trg_trust_observation_tenancy
    BEFORE INSERT ON public.trust_decision_observations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_trust_observation_tenancy();

-- A package must belong to the same org as its contract.
CREATE OR REPLACE FUNCTION public.enforce_trust_package_tenancy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_contract_org uuid;
BEGIN
    SELECT org_id INTO v_contract_org FROM public.trust_decision_contracts WHERE id = NEW.contract_id;
    IF v_contract_org IS NULL THEN
        RAISE EXCEPTION 'trust_decision_packages: contract % does not exist', NEW.contract_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_contract_org <> NEW.org_id THEN
        RAISE EXCEPTION 'trust_decision_packages: org mismatch with contract %', NEW.contract_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trust_package_tenancy ON public.trust_decision_packages;
CREATE TRIGGER trg_trust_package_tenancy
    BEFORE INSERT ON public.trust_decision_packages
    FOR EACH ROW EXECUTE FUNCTION public.enforce_trust_package_tenancy();

-- =============================================================================
-- RLS — org-scoped read, server-authoritative write
-- =============================================================================
-- Operators may READ their own org's decisions (a Decision Package must be
-- explainable to the person it is shown to). All writes are service-role only:
-- no client may author a contract, a package, an observation or a usage row.

ALTER TABLE public.trust_decision_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_decision_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_decision_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_reasoning_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trust_decision_contracts_select_org ON public.trust_decision_contracts;
CREATE POLICY trust_decision_contracts_select_org
    ON public.trust_decision_contracts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = trust_decision_contracts.org_id));

DROP POLICY IF EXISTS trust_decision_packages_select_org ON public.trust_decision_packages;
CREATE POLICY trust_decision_packages_select_org
    ON public.trust_decision_packages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = trust_decision_packages.org_id));

DROP POLICY IF EXISTS trust_decision_observations_select_org ON public.trust_decision_observations;
CREATE POLICY trust_decision_observations_select_org
    ON public.trust_decision_observations FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = trust_decision_observations.org_id));

DROP POLICY IF EXISTS trust_reasoning_usage_select_org ON public.trust_reasoning_usage;
CREATE POLICY trust_reasoning_usage_select_org
    ON public.trust_reasoning_usage FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.org_id = trust_reasoning_usage.org_id));

-- Read only for authenticated. No INSERT/UPDATE/DELETE grant: writes are
-- service-role, which bypasses RLS by design.
GRANT SELECT ON public.trust_decision_contracts TO authenticated;
GRANT SELECT ON public.trust_decision_packages TO authenticated;
GRANT SELECT ON public.trust_decision_observations TO authenticated;
GRANT SELECT ON public.trust_reasoning_usage TO authenticated;

GRANT ALL ON public.trust_decision_contracts TO service_role;
GRANT ALL ON public.trust_decision_packages TO service_role;
GRANT ALL ON public.trust_decision_observations TO service_role;
GRANT ALL ON public.trust_reasoning_usage TO service_role;

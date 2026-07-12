-- =============================================================================
-- Processing Identity Resolution — D1 Versioned Commit Plans and Approval
-- =============================================================================
-- Gates G5 (recommendation → plan) and G6 (approval binds to version+hash).
-- Introduces the three typed tables from the frozen data model (§4):
--   processing_commit_plans     — versioned, immutable diff
--   processing_plan_operations  — typed ops → semantic command; DAG + atomic group
--   processing_approvals        — approver bound to one plan version + content hash
-- No feature flag (D0–D3 execution instruction). No execution here (D2 owns it).
-- Plans/operations/approvals are immutable; a material edit creates a NEW version.
-- =============================================================================

SET search_path TO public;

-- ---------------------------------------------------------------------------
-- processing_commit_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_commit_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    version integer NOT NULL,
    content_hash text NOT NULL,
    source_resolution_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
    preconditions jsonb NOT NULL DEFAULT '[]'::jsonb,
    atomic_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
    downstream_effect_preview jsonb NOT NULL DEFAULT '[]'::jsonb,
    requires_approval boolean NOT NULL DEFAULT true,
    requires_privileged_approval boolean NOT NULL DEFAULT false,
    reversible boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'draft',
    built_at timestamptz DEFAULT now() NOT NULL,
    superseded_by uuid REFERENCES public.processing_commit_plans (id) ON DELETE SET NULL,
    superseded_at timestamptz,
    retention_class text NOT NULL DEFAULT 'audit_authoritative',
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT uq_processing_commit_plans_case_version UNIQUE (case_id, version)
);

CREATE INDEX IF NOT EXISTS idx_processing_commit_plans_case
    ON public.processing_commit_plans (org_id, case_id);

-- ---------------------------------------------------------------------------
-- processing_plan_operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_plan_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.processing_commit_plans (id) ON DELETE CASCADE,
    op_id text NOT NULL,
    op_order integer NOT NULL,
    op_kind text NOT NULL,
    command_key text NOT NULL,
    command_version text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    before_snapshot jsonb,
    after_values jsonb,
    reason text,
    evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    resolution_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    risk text NOT NULL DEFAULT 'low',
    depends_on jsonb NOT NULL DEFAULT '[]'::jsonb,
    atomic_group text,
    precondition_record_version text,
    included boolean NOT NULL DEFAULT true,
    optional boolean NOT NULL DEFAULT false,
    reversibility text NOT NULL DEFAULT 'reversible',
    expected_side_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
    mapping jsonb,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT uq_processing_plan_operations_plan_op UNIQUE (plan_id, op_id)
);

CREATE INDEX IF NOT EXISTS idx_processing_plan_operations_plan
    ON public.processing_plan_operations (plan_id, op_order);

-- ---------------------------------------------------------------------------
-- processing_approvals — bound to exactly one plan version + content hash
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.processing_commit_plans (id) ON DELETE CASCADE,
    plan_version integer NOT NULL,
    plan_content_hash text NOT NULL,
    approving_actor uuid NOT NULL,
    approval_authority text NOT NULL DEFAULT 'standard',
    decision text NOT NULL DEFAULT 'approved',
    included_operation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    approved_at timestamptz DEFAULT now() NOT NULL,
    invalidated_at timestamptz,
    invalidation_reason text,
    retention_class text NOT NULL DEFAULT 'audit_authoritative',
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_approvals_plan
    ON public.processing_approvals (plan_id);
CREATE INDEX IF NOT EXISTS idx_processing_approvals_case
    ON public.processing_approvals (org_id, case_id);

-- Only one active (non-invalidated) approval per plan version.
CREATE UNIQUE INDEX IF NOT EXISTS uq_processing_approvals_active_plan
    ON public.processing_approvals (plan_id)
    WHERE invalidated_at IS NULL AND decision = 'approved';

-- ---------------------------------------------------------------------------
-- Immutability: plans + operations never change in place; a material edit
-- creates a NEW version. Approvals are append-only (invalidated_at may be set
-- by the service via service_role, but core binding columns are frozen).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processing_commit_plans_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $$
BEGIN
    -- Only the supersession pointer + status may change after build.
    IF NEW.version IS DISTINCT FROM OLD.version
        OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
        OR NEW.case_id IS DISTINCT FROM OLD.case_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.built_at IS DISTINCT FROM OLD.built_at THEN
        RAISE EXCEPTION 'processing_commit_plans core columns are immutable; create a new version instead';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_commit_plans_immutable ON public.processing_commit_plans;
CREATE TRIGGER trg_processing_commit_plans_immutable
    BEFORE UPDATE ON public.processing_commit_plans
    FOR EACH ROW EXECUTE FUNCTION public.processing_commit_plans_immutable_guard();

CREATE OR REPLACE FUNCTION public.processing_plan_operations_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'processing_plan_operations rows are immutable; build a new plan version instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_plan_operations_immutable ON public.processing_plan_operations;
CREATE TRIGGER trg_processing_plan_operations_immutable
    BEFORE UPDATE OR DELETE ON public.processing_plan_operations
    FOR EACH ROW EXECUTE FUNCTION public.processing_plan_operations_immutable_guard();

-- ---------------------------------------------------------------------------
-- RLS: org-scoped read; writes are service-role only (Processing service owns
-- plan authorship + approval binding — never a client or raw admin route).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'processing_commit_plans',
        'processing_plan_operations',
        'processing_approvals'
    ] LOOP
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

COMMENT ON TABLE public.processing_commit_plans IS
    'D1: versioned, immutable Commit Plan; approval binds to (version, content_hash).';
COMMENT ON TABLE public.processing_plan_operations IS
    'D1: immutable typed operations targeting registered semantic commands (never physical tables).';
COMMENT ON TABLE public.processing_approvals IS
    'D1: approver bound to one plan version + content hash; voided when the plan is superseded.';

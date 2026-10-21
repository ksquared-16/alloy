-- =============================================================================
-- MEDICAL V0.5 — child health insurance, and the medical consent lifecycle.
--
-- 1. INSURANCE is a fifth `person_health_facts` kind. It is the child's coverage AS REPORTED
--    (provider, plan, policy / member identifiers, the coverage holder), carried with the same
--    append-only lineage, provenance and access boundary as an allergy: a correction supersedes,
--    coverage that ends is ended. Alloy does not verify eligibility or coverage — nothing here
--    claims it.
--
-- 2. MEDICAL CONSENTS are a new Medical-owned record. A consent is a STATE with a lifecycle —
--    granted, effective, withdrawn, superseded — which a signature on a form cannot carry
--    (stageRequirementsV1: "No canonical consent record exists… cannot carry withdrawal").
--    The signed artifact itself stays with its owner: `evidence_document_id` POINTS at the
--    Forms-owned signed document and `source_ref` at the submission; no signature or file is
--    stored here.
--
-- Re-runnable: every statement is idempotent (a failed apply does not roll back DDL).
-- =============================================================================

-- ── 1. insurance as a health fact kind ──────────────────────────────────────────────────────
ALTER TABLE public.person_health_facts DROP CONSTRAINT IF EXISTS person_health_facts_kind_chk;
ALTER TABLE public.person_health_facts ADD CONSTRAINT person_health_facts_kind_chk
    CHECK (fact_kind = ANY (ARRAY[
        'allergy'::text, 'condition'::text, 'medication'::text, 'immunization'::text, 'insurance'::text
    ]));

-- ── 2. medical consents ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.person_medical_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- The child the consent covers (the same grain as health facts).
    subject_entity_type text NOT NULL DEFAULT 'customer_member',
    subject_entity_id uuid NOT NULL,

    -- What is authorized. A configured vocabulary in code; the CHECK keeps the set honest.
    consent_kind text NOT NULL,

    -- The exact text authorized: which form version, which blocks, and a hash of their content,
    -- so "what did they agree to" is answerable after the form is edited.
    text_form_definition_version_id uuid,
    text_field_ids text[] NOT NULL DEFAULT '{}'::text[],
    text_sha256 text,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Who granted it, and when.
    granted_by_name text,
    granted_by_person_id uuid,
    granted_at timestamptz NOT NULL,
    effective_from date NOT NULL,
    effective_to date,

    status text NOT NULL DEFAULT 'active',
    withdrawn_at timestamptz,
    withdrawn_by uuid,
    withdrawal_reason text,
    supersedes_id uuid REFERENCES public.person_medical_consents (id) ON DELETE RESTRICT,

    -- Provenance: the submission it came from, and the signed artifact Documents/Forms own.
    source_kind text NOT NULL,
    source_ref text,
    evidence_document_id uuid,

    recorded_by uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT person_medical_consents_subject_type_chk
        CHECK (subject_entity_type = 'customer_member'),
    CONSTRAINT person_medical_consents_kind_chk
        CHECK (consent_kind = ANY (ARRAY['medical_records_release'::text, 'emergency_medical_treatment'::text])),
    CONSTRAINT person_medical_consents_status_chk
        CHECK (status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'superseded'::text])),
    CONSTRAINT person_medical_consents_source_kind_chk
        CHECK (source_kind = ANY (ARRAY['form_submission'::text, 'operator'::text])),
    CONSTRAINT person_medical_consents_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- A withdrawn consent says when and why; an active one has neither.
    CONSTRAINT person_medical_consents_withdrawal_chk
        CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)),
    CONSTRAINT person_medical_consents_no_self_supersede_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_person_medical_consents_subject
    ON public.person_medical_consents (org_id, subject_entity_id, consent_kind);

-- At most ONE active consent of a kind per child: a new grant supersedes the old one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_medical_consents_one_active
    ON public.person_medical_consents (org_id, subject_entity_id, consent_kind)
    WHERE status = 'active';

-- The same submission is recorded once, whatever retries do.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_medical_consents_source
    ON public.person_medical_consents (org_id, consent_kind, source_ref)
    WHERE source_ref IS NOT NULL;

-- History is never rewritten: what was granted, by whom, from which text, is immutable; only
-- the lifecycle columns move, and only forward (active → withdrawn | superseded). No DELETE.
CREATE OR REPLACE FUNCTION public.person_medical_consents_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'person_medical_consents: consents are never deleted; withdraw or supersede instead';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.subject_entity_id IS DISTINCT FROM OLD.subject_entity_id
        OR NEW.consent_kind IS DISTINCT FROM OLD.consent_kind
        OR NEW.text_sha256 IS DISTINCT FROM OLD.text_sha256
        OR NEW.text_form_definition_version_id IS DISTINCT FROM OLD.text_form_definition_version_id
        OR NEW.granted_by_name IS DISTINCT FROM OLD.granted_by_name
        OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
        OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
        OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id THEN
        RAISE EXCEPTION 'person_medical_consents: what was granted is immutable';
    END IF;
    IF OLD.status <> 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'person_medical_consents: a % consent cannot change state', OLD.status;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_medical_consents_guard ON public.person_medical_consents;
CREATE TRIGGER trg_person_medical_consents_guard
    BEFORE UPDATE OR DELETE ON public.person_medical_consents
    FOR EACH ROW EXECUTE FUNCTION public.person_medical_consents_guard();

-- Access: server-side only. No grant to `authenticated` or `anon` — every read and write passes
-- the application's health permissions (health.view / health.manage).
ALTER TABLE public.person_medical_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_medical_consents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.person_medical_consents FROM PUBLIC;
REVOKE ALL ON public.person_medical_consents FROM anon;
REVOKE ALL ON public.person_medical_consents FROM authenticated;
GRANT ALL ON public.person_medical_consents TO service_role;

DROP POLICY IF EXISTS person_medical_consents_service_role_all ON public.person_medical_consents;
CREATE POLICY person_medical_consents_service_role_all ON public.person_medical_consents
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE public.person_medical_consents IS
    'Medical V0.5. A child''s medical consent as a STATE: granted (text version + hash, by whom, when), active / withdrawn / superseded. The signed artifact stays with Forms/Documents (evidence_document_id points at it). One active consent per child and kind.';

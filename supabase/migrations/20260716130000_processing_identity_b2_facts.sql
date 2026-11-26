-- =============================================================================
-- Processing Identity Resolution — B2 Durable Facts and Evidence Foundation
-- =============================================================================
-- Gate G3: immutable processing_facts lineage + case/source extensions.
-- No uniqueness constraints. No commit/plan tables.
-- Flag: PROCESSING_PERSIST_FACTS (off by default at runtime).
-- =============================================================================

SET search_path TO public;

-- processing_cases extensions (foundation)
ALTER TABLE public.processing_cases
    ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'uncommitted_submission';

ALTER TABLE public.processing_cases
    ADD COLUMN IF NOT EXISTS case_subject_kind text;

ALTER TABLE public.processing_cases
    ADD COLUMN IF NOT EXISTS primary_customer_id uuid;

ALTER TABLE public.processing_cases
    ADD COLUMN IF NOT EXISTS primary_opportunity_id uuid;

COMMENT ON COLUMN public.processing_cases.retention_class IS
    'B2 retention taxonomy: uncommitted_submission | committed_case_lineage | audit_authoritative | ...';

-- processing_case_sources extensions
ALTER TABLE public.processing_case_sources
    ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.processing_case_sources
    ADD COLUMN IF NOT EXISTS trust_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.processing_case_sources
    ADD COLUMN IF NOT EXISTS envelope_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pcs_org_idempotency_key
    ON public.processing_case_sources (org_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- processing_facts (immutable lineage)
CREATE TABLE IF NOT EXISTS public.processing_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    source_id uuid REFERENCES public.processing_case_sources (id) ON DELETE SET NULL,
    subject_ref text,
    fact_type text NOT NULL,
    semantic_key text,
    raw_value text,
    normalized_value text,
    data_type text,
    extraction_method text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    extraction_confidence numeric,
    validation_state text,
    mapping_state text,
    role_hint text,
    produced_by text,
    extractor_version text,
    generation_id uuid NOT NULL,
    corrected_from uuid REFERENCES public.processing_facts (id) ON DELETE SET NULL,
    retention_class text NOT NULL DEFAULT 'uncommitted_submission',
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_facts_case_generation
    ON public.processing_facts (case_id, generation_id);

CREATE INDEX IF NOT EXISTS idx_processing_facts_org_case
    ON public.processing_facts (org_id, case_id);

CREATE INDEX IF NOT EXISTS idx_processing_facts_subject_ref
    ON public.processing_facts (case_id, subject_ref)
    WHERE subject_ref IS NOT NULL;

-- Immutability: forbid UPDATE/DELETE on original fact rows (corrections append only)
CREATE OR REPLACE FUNCTION public.processing_facts_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'processing_facts rows are immutable; append a corrected fact instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_facts_immutable ON public.processing_facts;
CREATE TRIGGER trg_processing_facts_immutable
    BEFORE UPDATE OR DELETE ON public.processing_facts
    FOR EACH ROW
    EXECUTE FUNCTION public.processing_facts_immutable_guard();

-- RLS
ALTER TABLE public.processing_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_facts_select_org ON public.processing_facts;
CREATE POLICY processing_facts_select_org ON public.processing_facts
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS processing_facts_insert_org ON public.processing_facts;
CREATE POLICY processing_facts_insert_org ON public.processing_facts
    FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS processing_facts_all_service_role ON public.processing_facts;
CREATE POLICY processing_facts_all_service_role ON public.processing_facts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON public.processing_facts TO authenticated;
GRANT ALL ON public.processing_facts TO service_role;

COMMENT ON TABLE public.processing_facts IS
    'B2: immutable extracted/normalized intake facts with evidence lineage (Processing Identity Resolution).';

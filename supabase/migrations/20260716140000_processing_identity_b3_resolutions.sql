-- =============================================================================
-- Processing Identity Resolution — B3 Resolver Persistence
-- =============================================================================
-- Gate G4: processing_resolutions (proposals only, no commit).
-- Flag: PROCESSING_REAL_RESOLVER (off by default at runtime).
-- =============================================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.processing_resolutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    generation_id uuid NOT NULL,
    input_facts_hash text NOT NULL,
    subject_ref text NOT NULL,
    subject_role text NOT NULL,
    provisional jsonb NOT NULL DEFAULT '{}'::jsonb,
    candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
    decision_action text,
    selected_candidate_id text,
    decided_by text NOT NULL DEFAULT 'engine',
    operator_id uuid,
    policy_version text,
    resolver_version text NOT NULL,
    stale_at timestamptz,
    superseded_by uuid REFERENCES public.processing_resolutions (id) ON DELETE SET NULL,
    retention_class text NOT NULL DEFAULT 'uncommitted_submission',
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT uq_processing_resolutions_case_subject_generation
        UNIQUE (case_id, subject_ref, generation_id)
);

CREATE INDEX IF NOT EXISTS idx_processing_resolutions_case
    ON public.processing_resolutions (org_id, case_id);

CREATE INDEX IF NOT EXISTS idx_processing_resolutions_input_hash
    ON public.processing_resolutions (case_id, input_facts_hash);

ALTER TABLE public.processing_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_resolutions_select_org ON public.processing_resolutions;
CREATE POLICY processing_resolutions_select_org ON public.processing_resolutions
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS processing_resolutions_insert_org ON public.processing_resolutions;
CREATE POLICY processing_resolutions_insert_org ON public.processing_resolutions
    FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS processing_resolutions_update_org ON public.processing_resolutions;
CREATE POLICY processing_resolutions_update_org ON public.processing_resolutions
    FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS processing_resolutions_all_service_role ON public.processing_resolutions;
CREATE POLICY processing_resolutions_all_service_role ON public.processing_resolutions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.processing_resolutions TO authenticated;
GRANT ALL ON public.processing_resolutions TO service_role;

COMMENT ON TABLE public.processing_resolutions IS
    'B3: durable identity resolution snapshots per Processing Case subject (proposals only).';

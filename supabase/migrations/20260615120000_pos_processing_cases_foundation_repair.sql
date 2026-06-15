-- =============================================================================
-- Repair: POS Processing Case foundation (remote schema gap)
-- =============================================================================
-- Context: remote supabase_migrations already records version 20260612120000
-- for enrollment_process_status_vocabulary_repair.sql. A parallel branch used
-- the same version for pos_processing_cases_v1, so staging never received the
-- processing_cases / processing_case_sources DDL. This migration recovers that
-- foundation under a new version without altering migration history.
--
-- Idempotent: safe on fresh local reset (tables may already exist) and on
-- staging where tables are absent. Does not modify existing migration files.
-- Source: Alloy-Claude pos_processing_cases_v1 + pos_processing_queue_index.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) processing_cases — thin envelope
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'received',
    case_type text,
    status_changed_at timestamptz DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    archived_at timestamptz,
    CONSTRAINT chk_processing_cases_status CHECK (
        status = ANY (ARRAY[
            'received'::text, 'processing'::text, 'needs_review'::text,
            'needs_resolution'::text, 'ready'::text, 'completed'::text, 'archived'::text
        ])
    )
);

CREATE INDEX IF NOT EXISTS idx_processing_cases_org ON public.processing_cases (org_id);
CREATE INDEX IF NOT EXISTS idx_processing_cases_org_status ON public.processing_cases (org_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_cases_org_status_created
    ON public.processing_cases (org_id, status, created_at DESC);

COMMENT ON TABLE public.processing_cases IS 'POS Processing Case envelope. Thin: lifecycle status only; references sources, never absorbs them; no canonical record truth.';
COMMENT ON COLUMN public.processing_cases.status IS 'POS-internal lifecycle (received..archived). Distinct from CRM status and Lifecycle stages.';
COMMENT ON COLUMN public.processing_cases.case_type IS 'Optional classification derived from the primary source (supports later recipe selection). Nullable in FP1.';

DROP TRIGGER IF EXISTS trg_processing_cases_updated_at ON public.processing_cases;
CREATE TRIGGER trg_processing_cases_updated_at
    BEFORE UPDATE ON public.processing_cases
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) processing_case_sources — polymorphic source references
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.processing_case_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    processing_case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    source_kind text NOT NULL,
    source_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'related',
    linked_at timestamptz DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT chk_pcs_source_kind CHECK (
        source_kind = ANY (ARRAY[
            'form_submission'::text, 'form_packet_session'::text, 'document'::text,
            'upload'::text, 'email_attachment'::text, 'import'::text, 'recreated_document'::text
        ])
    ),
    CONSTRAINT chk_pcs_role CHECK (role = ANY (ARRAY['primary'::text, 'related'::text]))
);

CREATE INDEX IF NOT EXISTS idx_pcs_case ON public.processing_case_sources (processing_case_id);
CREATE INDEX IF NOT EXISTS idx_pcs_org_source ON public.processing_case_sources (org_id, source_kind, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pcs_one_primary_per_case
    ON public.processing_case_sources (processing_case_id)
    WHERE role = 'primary';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pcs_primary_source_once
    ON public.processing_case_sources (org_id, source_kind, source_id)
    WHERE role = 'primary';

COMMENT ON TABLE public.processing_case_sources IS 'Polymorphic references from a Processing Case to its sources (primary + related). No source data copied; no cross-table FK.';
COMMENT ON COLUMN public.processing_case_sources.source_id IS 'Polymorphic id into the owning system table for source_kind. No FK by design.';
COMMENT ON COLUMN public.processing_case_sources.role IS 'primary (exactly one per case) or related.';

-- -----------------------------------------------------------------------------
-- 3) Row Level Security (org-scoped; mirrors forms engine)
-- -----------------------------------------------------------------------------
ALTER TABLE public.processing_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_case_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_cases_select_by_org_role ON public.processing_cases;
CREATE POLICY processing_cases_select_by_org_role ON public.processing_cases FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS processing_cases_insert_by_org_role ON public.processing_cases;
CREATE POLICY processing_cases_insert_by_org_role ON public.processing_cases FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS processing_cases_update_by_org_role ON public.processing_cases;
CREATE POLICY processing_cases_update_by_org_role ON public.processing_cases FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS processing_cases_delete_by_org_role ON public.processing_cases;
CREATE POLICY processing_cases_delete_by_org_role ON public.processing_cases FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS processing_case_sources_select_by_org_role ON public.processing_case_sources;
CREATE POLICY processing_case_sources_select_by_org_role ON public.processing_case_sources FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS processing_case_sources_insert_by_org_role ON public.processing_case_sources;
CREATE POLICY processing_case_sources_insert_by_org_role ON public.processing_case_sources FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS processing_case_sources_update_by_org_role ON public.processing_case_sources;
CREATE POLICY processing_case_sources_update_by_org_role ON public.processing_case_sources FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS processing_case_sources_delete_by_org_role ON public.processing_case_sources;
CREATE POLICY processing_case_sources_delete_by_org_role ON public.processing_case_sources FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

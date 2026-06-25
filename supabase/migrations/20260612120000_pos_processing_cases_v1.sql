-- =============================================================================
-- POS-FP1 — Processing Case envelope (minimal additive foundation)
-- =============================================================================
-- Doctrine (docs/product/pos/POS-FP1-processing-case-envelope-package.md):
-- - Processing Case is a THIN envelope. No copied source payloads. No canonical
--   record FKs. Sources are REFERENCED (polymorphic), never absorbed.
-- - POS owns review/resolution/outcome STATE only (none added here beyond the
--   lifecycle status field). No UI, no BOS, no Outcome Engine, no auto-execution.
-- - Additive only: two new tables. No changes to existing tables.
-- - Org-scoped RLS mirrors the forms engine (anon none; authenticated has_org_role;
--   service_role bypasses RLS for server-side best-effort case creation).
--
-- Tables:
--   processing_cases          — the envelope (lifecycle status + thin metadata)
--   processing_case_sources   — polymorphic source references (primary + related)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) processing_cases — the thin envelope
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

COMMENT ON TABLE public.processing_cases IS 'POS Processing Case envelope. Thin: lifecycle status only; references sources, never absorbs them; no canonical record truth.';
COMMENT ON COLUMN public.processing_cases.status IS 'POS-internal lifecycle (received..archived). Distinct from CRM status and Lifecycle stages.';
COMMENT ON COLUMN public.processing_cases.case_type IS 'Optional classification derived from the primary source (supports later recipe selection). Nullable in FP1.';

DROP TRIGGER IF EXISTS trg_processing_cases_updated_at ON public.processing_cases;
CREATE TRIGGER trg_processing_cases_updated_at
    BEFORE UPDATE ON public.processing_cases
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) processing_case_sources — polymorphic source references (primary + related)
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

-- NOTE: source_id is a POLYMORPHIC reference into the owning system's table
-- (form_submissions / form_packet_sessions / documents). Intentionally NO cross-table
-- FK — sources remain owned by their systems (mirrors documents.entity_type/entity_id).

CREATE INDEX IF NOT EXISTS idx_pcs_case ON public.processing_case_sources (processing_case_id);
CREATE INDEX IF NOT EXISTS idx_pcs_org_source ON public.processing_case_sources (org_id, source_kind, source_id);

-- Exactly one PRIMARY source per case.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcs_one_primary_per_case
    ON public.processing_case_sources (processing_case_id)
    WHERE role = 'primary';

-- A given source can be the PRIMARY of at most one case (makes the on-ramp idempotent).
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

-- processing_cases
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

-- processing_case_sources
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

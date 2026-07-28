-- Re-assert chk_pcs_source_kind so the deployed schema matches the canonical
-- source-kind vocabulary — specifically that `create_lead` is permitted.
--
-- Why this exists
-- ---------------
-- Migration 20260718120000 (D4) already extended chk_pcs_source_kind to include
-- `create_lead`, and the application path (lib/pos/processingIdentity/sources/
-- createLeadIntakeAdapter.ts + the ProcessingCaseSourceKind type) submits exactly
-- that value. Repository history is internally consistent.
--
-- The deployed staging schema, however, still carries the pre-D4 constraint (7
-- values, no `create_lead`), so operator Create Lead fails at the
-- processing_case_sources insert with:
--   new row for relation "processing_case_sources" violates check constraint
--   "chk_pcs_source_kind"
-- 20260718120000 is timestamped earlier than migrations already applied to
-- staging (20260719xxxxxx..20260724000000); a version-ordered runner that only
-- applies versions newer than the latest-applied one skips a back-dated migration
-- permanently. This forward-dated migration re-asserts the intended constraint so
-- it is guaranteed to apply, regardless of that ordering.
--
-- Safety
-- ------
-- The permitted set below is the full canonical vocabulary and a strict SUPERSET
-- of the pre-D4 set, so ADD CONSTRAINT cannot fail against any existing row.
-- The constraint is not weakened (no value removed, no alias added). If a database
-- already carries the D4 constraint, this is a no-op re-assertion.
--
-- Idempotent: DROP IF EXISTS + ADD re-creates identical JSON on any re-run.

ALTER TABLE public.processing_case_sources
    DROP CONSTRAINT IF EXISTS chk_pcs_source_kind;

ALTER TABLE public.processing_case_sources
    ADD CONSTRAINT chk_pcs_source_kind CHECK (
        source_kind = ANY (ARRAY[
            'form_submission'::text,
            'form_packet_session'::text,
            'document'::text,
            'upload'::text,
            'email_attachment'::text,
            'import'::text,
            'recreated_document'::text,
            'create_lead'::text
        ])
    );

COMMENT ON COLUMN public.processing_case_sources.source_kind IS
    'Polymorphic source taxonomy. create_lead = Manual Create Lead operator intake (D4).';

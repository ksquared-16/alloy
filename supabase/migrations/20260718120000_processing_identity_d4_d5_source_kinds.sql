-- D4/D5 — extend processing_case_sources.source_kind for Manual Create Lead intake.
-- Public forms continue to use form_submission; create_lead covers operator-initiated intake.

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

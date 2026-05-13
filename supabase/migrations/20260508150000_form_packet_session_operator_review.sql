-- E3.2-C: operator review gate for completed packet sessions (generic CRM; not childcare-specific).

ALTER TABLE public.form_packet_sessions
    ADD COLUMN IF NOT EXISTS operator_review_status text,
    ADD COLUMN IF NOT EXISTS operator_review_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS operator_reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS operator_reviewed_by_user_id uuid,
    ADD COLUMN IF NOT EXISTS operator_review_notes text;

COMMENT ON COLUMN public.form_packet_sessions.operator_review_status IS
    'Operator gate after public completion: needs_review | approved | rejected | needs_correction; NULL before completion or legacy rows.';

COMMENT ON COLUMN public.form_packet_sessions.operator_review_warnings IS
    'JSON array of {kind,message,field_key?} hints (e.g. name vs CRM mismatch); informational only.';

DO $$
BEGIN
    ALTER TABLE public.form_packet_sessions
        ADD CONSTRAINT chk_form_packet_sessions_operator_review_status CHECK (
            operator_review_status IS NULL
            OR operator_review_status = ANY (
                ARRAY['needs_review'::text, 'approved'::text, 'rejected'::text, 'needs_correction'::text]
            )
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

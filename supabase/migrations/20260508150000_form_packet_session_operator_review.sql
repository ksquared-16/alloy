-- E3.2-C: operator review gate for completed packet sessions (generic CRM; not childcare-specific).
--
-- NOTE: this migration is timestamped BEFORE the foundation migration that creates
-- public.form_packet_sessions (20260510120000), so on a fresh `supabase db reset`
-- the table does not exist yet here. The columns/constraint/comments are now also
-- defined in the foundation migration; this migration is a table-existence-guarded
-- no-op so it is safe both on a fresh reset (table absent -> skip) and on
-- already-applied environments (table present -> idempotent ADD COLUMN IF NOT EXISTS
-- / guarded CHECK).
DO $$
BEGIN
    IF to_regclass('public.form_packet_sessions') IS NULL THEN
        RAISE NOTICE 'form_packet_sessions absent; operator_review columns are added by the foundation migration 20260510120000.';
        RETURN;
    END IF;

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
    END;
END $$;

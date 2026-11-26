-- Personal seen/unseen for queue subjects, scoped to a stage-membership occurrence.
-- One operator opening a row must not mark it seen for others.
-- Reopening the same membership is idempotent (unique occurrence key).

CREATE TABLE IF NOT EXISTS public.operator_stage_membership_acks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    stage_key text NOT NULL,
    stage_entered_at timestamptz NOT NULL,
    occurrence_key text NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operator_stage_membership_acks IS
    'Per-operator acknowledgement that a queue subject was intentionally opened for a specific stage membership occurrence.';

COMMENT ON COLUMN public.operator_stage_membership_acks.occurrence_key IS
    'Stable key: org:user:subjectType:subjectId:stageKey:stageEnteredAt — unique per acknowledgement.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_operator_stage_membership_acks_occurrence
    ON public.operator_stage_membership_acks (org_id, occurrence_key);

CREATE INDEX IF NOT EXISTS idx_operator_stage_membership_acks_viewer
    ON public.operator_stage_membership_acks (org_id, user_id, subject_type, subject_id);

ALTER TABLE public.operator_stage_membership_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operator_stage_membership_acks_select_own ON public.operator_stage_membership_acks;
CREATE POLICY operator_stage_membership_acks_select_own
    ON public.operator_stage_membership_acks
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.org_id = operator_stage_membership_acks.org_id
        )
    );

DROP POLICY IF EXISTS operator_stage_membership_acks_write_own ON public.operator_stage_membership_acks;
CREATE POLICY operator_stage_membership_acks_write_own
    ON public.operator_stage_membership_acks
    FOR ALL
    TO authenticated
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.org_id = operator_stage_membership_acks.org_id
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.org_id = operator_stage_membership_acks.org_id
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_stage_membership_acks TO authenticated;
GRANT ALL ON public.operator_stage_membership_acks TO service_role;

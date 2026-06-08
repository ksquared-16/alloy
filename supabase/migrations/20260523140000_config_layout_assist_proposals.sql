-- Configuration / Layout Assist V1 — Card 6: durable proposal persistence + lifecycle state.
-- No apply execution in DB; application code transitions state only.

CREATE TABLE IF NOT EXISTS public.config_layout_assist_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    proposal_version integer NOT NULL DEFAULT 1,
    proposal_json jsonb NOT NULL,
    proposal_hash text NOT NULL,
    state text NOT NULL DEFAULT 'draft'::text,
    category text NOT NULL,
    summary text NOT NULL,
    risk_level text NOT NULL,
    apply_mode text NOT NULL,
    permission_requirements text[] NOT NULL DEFAULT '{}'::text[],
    created_by uuid,
    reviewed_by uuid,
    approved_by uuid,
    applied_by uuid,
    rejected_by uuid,
    failed_reason text,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    approved_at timestamptz,
    applied_at timestamptz,
    rejected_at timestamptz,
    failed_at timestamptz,
    rolled_back_at timestamptz,
    CONSTRAINT chk_config_layout_assist_proposals_state CHECK (
        state = ANY (
            ARRAY[
                'draft'::text,
                'reviewed'::text,
                'approved'::text,
                'rejected'::text,
                'applied'::text,
                'failed'::text,
                'rolled_back'::text
            ]
        )
    ),
    CONSTRAINT chk_config_layout_assist_proposals_risk CHECK (
        risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])
    ),
    CONSTRAINT chk_config_layout_assist_proposals_apply_mode CHECK (
        apply_mode = ANY (
            ARRAY['single_operation'::text, 'batched_atomic'::text, 'recommendation_only'::text]
        )
    )
);

COMMENT ON TABLE public.config_layout_assist_proposals IS
    'Configuration/Layout Assist durable proposals (canonical proposal_json + lifecycle state). Apply execution is application-layer only (Card 10+).';

COMMENT ON COLUMN public.config_layout_assist_proposals.proposal_hash IS
    'SHA-256 hex of canonical normalized proposal JSON for dedupe/audit.';

CREATE INDEX IF NOT EXISTS idx_config_layout_assist_proposals_org_state_created
    ON public.config_layout_assist_proposals (org_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_layout_assist_proposals_org_category_created
    ON public.config_layout_assist_proposals (org_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_layout_assist_proposals_org_created
    ON public.config_layout_assist_proposals (org_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_config_layout_assist_proposals_updated_at ON public.config_layout_assist_proposals;
CREATE TRIGGER trg_config_layout_assist_proposals_updated_at
    BEFORE UPDATE ON public.config_layout_assist_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.config_layout_assist_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS config_layout_assist_proposals_select_org ON public.config_layout_assist_proposals;
CREATE POLICY config_layout_assist_proposals_select_org
    ON public.config_layout_assist_proposals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = config_layout_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS config_layout_assist_proposals_insert_admin ON public.config_layout_assist_proposals;
CREATE POLICY config_layout_assist_proposals_insert_admin
    ON public.config_layout_assist_proposals
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = config_layout_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    );

DROP POLICY IF EXISTS config_layout_assist_proposals_update_admin ON public.config_layout_assist_proposals;
CREATE POLICY config_layout_assist_proposals_update_admin
    ON public.config_layout_assist_proposals
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = config_layout_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = config_layout_assist_proposals.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    );

DROP POLICY IF EXISTS config_layout_assist_proposals_service_all ON public.config_layout_assist_proposals;
CREATE POLICY config_layout_assist_proposals_service_all
    ON public.config_layout_assist_proposals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- AI agent slice v0: minimal proposal + apply audit (org-scoped). Server writes use service role; RLS for direct client access.

CREATE TABLE IF NOT EXISTS public.agent_v0_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    proposal_id uuid NOT NULL,
    request_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    work_unit_id uuid NOT NULL REFERENCES public.work_units (id) ON DELETE CASCADE,
    intent_json jsonb NOT NULL,
    before_hash text NOT NULL,
    after_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v0_proposals_proposal_id UNIQUE (proposal_id)
);

COMMENT ON TABLE public.agent_v0_proposals IS 'AI agent v0: one row per successful queue_definition proposal (minimal audit).';

CREATE INDEX IF NOT EXISTS idx_agent_v0_proposals_org_id ON public.agent_v0_proposals (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v0_proposals_correlation ON public.agent_v0_proposals (correlation_id);

CREATE TABLE IF NOT EXISTS public.agent_v0_apply_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    result_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    work_unit_id uuid NOT NULL REFERENCES public.work_units (id) ON DELETE CASCADE,
    terminal_status text NOT NULL,
    applied_queue_definition_version integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v0_apply_audit_result_id UNIQUE (result_id),
    CONSTRAINT fk_agent_v0_apply_proposal FOREIGN KEY (proposal_id) REFERENCES public.agent_v0_proposals (proposal_id) ON DELETE CASCADE,
    CONSTRAINT chk_agent_v0_apply_terminal CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text]))
);

COMMENT ON TABLE public.agent_v0_apply_audit IS 'AI agent v0: apply outcome per proposal (minimal).';

CREATE INDEX IF NOT EXISTS idx_agent_v0_apply_audit_org_id ON public.agent_v0_apply_audit (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v0_apply_audit_proposal ON public.agent_v0_apply_audit (proposal_id);

ALTER TABLE public.agent_v0_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_v0_apply_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_v0_proposals_select_by_org_admin" ON public.agent_v0_proposals;
CREATE POLICY "agent_v0_proposals_select_by_org_admin"
  ON public.agent_v0_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v0_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v0_proposals_insert_by_org_admin" ON public.agent_v0_proposals;
CREATE POLICY "agent_v0_proposals_insert_by_org_admin"
  ON public.agent_v0_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v0_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v0_apply_audit_select_by_org_admin" ON public.agent_v0_apply_audit;
CREATE POLICY "agent_v0_apply_audit_select_by_org_admin"
  ON public.agent_v0_apply_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v0_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v0_apply_audit_insert_by_org_admin" ON public.agent_v0_apply_audit;
CREATE POLICY "agent_v0_apply_audit_insert_by_org_admin"
  ON public.agent_v0_apply_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v0_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

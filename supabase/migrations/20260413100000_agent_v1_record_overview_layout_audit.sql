-- AI agent record layout slice v1: proposal + apply audit + atomic RPC for record_overview_layouts.config.
-- Mirrors agent_v0_commit_queue_definition_apply pattern; execute RPC from service_role only.

CREATE TABLE IF NOT EXISTS public.agent_v1_record_layout_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    proposal_id uuid NOT NULL,
    request_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    record_overview_layout_id uuid NOT NULL REFERENCES public.record_overview_layouts (id) ON DELETE CASCADE,
    intent_json jsonb NOT NULL,
    before_hash text NOT NULL,
    after_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v1_rl_proposals_proposal_id UNIQUE (proposal_id)
);

COMMENT ON TABLE public.agent_v1_record_layout_proposals IS
  'AI agent v1 (record overview layout): one row per successful proposal (minimal audit).';

CREATE INDEX IF NOT EXISTS idx_agent_v1_rl_proposals_org_id ON public.agent_v1_record_layout_proposals (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v1_rl_proposals_correlation ON public.agent_v1_record_layout_proposals (correlation_id);

CREATE TABLE IF NOT EXISTS public.agent_v1_record_layout_apply_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    result_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    record_overview_layout_id uuid NOT NULL REFERENCES public.record_overview_layouts (id) ON DELETE CASCADE,
    terminal_status text NOT NULL,
    applied_config_version integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v1_rl_apply_result_id UNIQUE (result_id),
    CONSTRAINT fk_agent_v1_rl_apply_proposal FOREIGN KEY (proposal_id) REFERENCES public.agent_v1_record_layout_proposals (proposal_id) ON DELETE CASCADE,
    CONSTRAINT chk_agent_v1_rl_apply_terminal CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text]))
);

COMMENT ON TABLE public.agent_v1_record_layout_apply_audit IS
  'AI agent v1 (record overview layout): apply outcome per proposal (minimal).';

CREATE INDEX IF NOT EXISTS idx_agent_v1_rl_apply_org_id ON public.agent_v1_record_layout_apply_audit (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v1_rl_apply_proposal ON public.agent_v1_record_layout_apply_audit (proposal_id);

ALTER TABLE public.agent_v1_record_layout_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_v1_record_layout_apply_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_v1_rl_proposals_select_by_org_role" ON public.agent_v1_record_layout_proposals;
CREATE POLICY "agent_v1_rl_proposals_select_by_org_role"
  ON public.agent_v1_record_layout_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v1_record_layout_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v1_rl_proposals_insert_by_org_admin" ON public.agent_v1_record_layout_proposals;
CREATE POLICY "agent_v1_rl_proposals_insert_by_org_admin"
  ON public.agent_v1_record_layout_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v1_record_layout_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v1_rl_apply_select_by_org_role" ON public.agent_v1_record_layout_apply_audit;
CREATE POLICY "agent_v1_rl_apply_select_by_org_role"
  ON public.agent_v1_record_layout_apply_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v1_record_layout_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v1_rl_apply_insert_by_org_admin" ON public.agent_v1_record_layout_apply_audit;
CREATE POLICY "agent_v1_rl_apply_insert_by_org_admin"
  ON public.agent_v1_record_layout_apply_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v1_record_layout_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

CREATE OR REPLACE FUNCTION public.agent_v1_commit_record_overview_layout_apply(
    p_org_id uuid,
    p_user_id uuid,
    p_entity_type text,
    p_surface text,
    p_expected_version integer,
    p_config jsonb,
    p_proposal_id uuid,
    p_request_id uuid,
    p_correlation_id uuid,
    p_intent_json jsonb,
    p_result_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    layout_id uuid;
    cur jsonb;
    v_old integer;
    before_h text;
    after_h text;
    out_row jsonb;
BEGIN
    SELECT rol.id, coalesce(rol.config, '{}'::jsonb)
    INTO layout_id, cur
    FROM public.record_overview_layouts rol
    WHERE rol.org_id = p_org_id
      AND rol.entity_type = p_entity_type
      AND rol.surface = p_surface
    FOR UPDATE;

    IF NOT FOUND THEN
        IF p_expected_version IS DISTINCT FROM 0 THEN
            RAISE EXCEPTION 'agent_v1:no_record_overview_layout_row';
        END IF;

        before_h := encode(extensions.digest(convert_to('{}'::jsonb::text, 'UTF8'), 'sha256'), 'hex');
        after_h := encode(extensions.digest(convert_to(p_config::text, 'UTF8'), 'sha256'), 'hex');

        INSERT INTO public.record_overview_layouts (org_id, entity_type, surface, template_key, config, is_active)
        VALUES (p_org_id, p_entity_type, p_surface, 'default_record_overview', p_config, true)
        RETURNING id INTO layout_id;

        cur := '{}'::jsonb;
    ELSE
        v_old := coalesce((cur->>'version')::integer, 0);
        IF v_old IS DISTINCT FROM p_expected_version THEN
            RAISE EXCEPTION 'agent_v1:stale_record_overview_layout_version';
        END IF;

        before_h := encode(extensions.digest(convert_to(cur::text, 'UTF8'), 'sha256'), 'hex');
        after_h := encode(extensions.digest(convert_to(p_config::text, 'UTF8'), 'sha256'), 'hex');

        UPDATE public.record_overview_layouts
        SET
            config = p_config,
            updated_at = now()
        WHERE id = layout_id
          AND org_id = p_org_id;
    END IF;

    INSERT INTO public.agent_v1_record_layout_proposals (
        proposal_id,
        request_id,
        correlation_id,
        org_id,
        user_id,
        record_overview_layout_id,
        intent_json,
        before_hash,
        after_hash
    )
    VALUES (
        p_proposal_id,
        p_request_id,
        p_correlation_id,
        p_org_id,
        p_user_id,
        layout_id,
        p_intent_json,
        before_h,
        after_h
    );

    INSERT INTO public.agent_v1_record_layout_apply_audit (
        result_id,
        proposal_id,
        org_id,
        user_id,
        record_overview_layout_id,
        terminal_status,
        applied_config_version
    )
    VALUES (
        p_result_id,
        p_proposal_id,
        p_org_id,
        p_user_id,
        layout_id,
        'success',
        coalesce((p_config->>'version')::integer, 0)
    );

    SELECT to_jsonb(rol.*)
    INTO out_row
    FROM public.record_overview_layouts rol
    WHERE rol.id = layout_id;

    RETURN out_row;
END;
$$;

COMMENT ON FUNCTION public.agent_v1_commit_record_overview_layout_apply IS
  'AI agent v1: single transaction for record_overview_layouts.config + audit rows. Execute only from service_role (Next admin route).';

REVOKE ALL ON FUNCTION public.agent_v1_commit_record_overview_layout_apply(
    uuid, uuid, text, text, integer, jsonb, uuid, uuid, uuid, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.agent_v1_commit_record_overview_layout_apply(
    uuid, uuid, text, text, integer, jsonb, uuid, uuid, uuid, jsonb, uuid
) TO service_role;

REVOKE ALL ON public.agent_v1_record_layout_proposals FROM anon;
REVOKE ALL ON public.agent_v1_record_layout_apply_audit FROM anon;

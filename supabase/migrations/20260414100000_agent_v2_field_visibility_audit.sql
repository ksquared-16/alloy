-- AI agent field visibility slice v2: proposal + apply audit + atomic RPC for field_definitions visibility columns.

CREATE TABLE IF NOT EXISTS public.agent_v2_field_visibility_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    proposal_id uuid NOT NULL,
    request_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    field_definition_id uuid NOT NULL REFERENCES public.field_definitions (id) ON DELETE CASCADE,
    intent_json jsonb NOT NULL,
    before_hash text NOT NULL,
    after_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v2_fv_proposals_proposal_id UNIQUE (proposal_id)
);

COMMENT ON TABLE public.agent_v2_field_visibility_proposals IS
  'AI agent v2 (field visibility): one row per successful proposal (minimal audit).';

CREATE INDEX IF NOT EXISTS idx_agent_v2_fv_proposals_org_id ON public.agent_v2_field_visibility_proposals (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v2_fv_proposals_correlation ON public.agent_v2_field_visibility_proposals (correlation_id);

CREATE TABLE IF NOT EXISTS public.agent_v2_field_visibility_apply_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    result_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    field_definition_id uuid NOT NULL REFERENCES public.field_definitions (id) ON DELETE CASCADE,
    terminal_status text NOT NULL,
    applied_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ux_agent_v2_fv_apply_result_id UNIQUE (result_id),
    CONSTRAINT fk_agent_v2_fv_apply_proposal FOREIGN KEY (proposal_id) REFERENCES public.agent_v2_field_visibility_proposals (proposal_id) ON DELETE CASCADE,
    CONSTRAINT chk_agent_v2_fv_apply_terminal CHECK (terminal_status = ANY (ARRAY['success'::text, 'failed'::text]))
);

COMMENT ON TABLE public.agent_v2_field_visibility_apply_audit IS
  'AI agent v2 (field visibility): apply outcome per proposal (minimal).';

CREATE INDEX IF NOT EXISTS idx_agent_v2_fv_apply_org_id ON public.agent_v2_field_visibility_apply_audit (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_v2_fv_apply_proposal ON public.agent_v2_field_visibility_apply_audit (proposal_id);

ALTER TABLE public.agent_v2_field_visibility_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_v2_field_visibility_apply_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_v2_fv_proposals_select_by_org_role" ON public.agent_v2_field_visibility_proposals;
CREATE POLICY "agent_v2_fv_proposals_select_by_org_role"
  ON public.agent_v2_field_visibility_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v2_field_visibility_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v2_fv_proposals_insert_by_org_admin" ON public.agent_v2_field_visibility_proposals;
CREATE POLICY "agent_v2_fv_proposals_insert_by_org_admin"
  ON public.agent_v2_field_visibility_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v2_field_visibility_proposals.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v2_fv_apply_select_by_org_role" ON public.agent_v2_field_visibility_apply_audit;
CREATE POLICY "agent_v2_fv_apply_select_by_org_role"
  ON public.agent_v2_field_visibility_apply_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v2_field_visibility_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
  );

DROP POLICY IF EXISTS "agent_v2_fv_apply_insert_by_org_admin" ON public.agent_v2_field_visibility_apply_audit;
CREATE POLICY "agent_v2_fv_apply_insert_by_org_admin"
  ON public.agent_v2_field_visibility_apply_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id = agent_v2_field_visibility_apply_audit.org_id
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

CREATE OR REPLACE FUNCTION public.agent_v2_commit_field_visibility_apply(
    p_org_id uuid,
    p_user_id uuid,
    p_field_definition_id uuid,
    p_expected_updated_at text,
    p_is_visible_in_form boolean,
    p_is_visible_in_drawer boolean,
    p_is_visible_in_table boolean,
    p_is_visible_in_public_booking boolean,
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
    fd public.field_definitions%ROWTYPE;
    v_lock timestamptz;
    exp_ts timestamptz;
    before_h text;
    after_h text;
    out_row jsonb;
    before_vis jsonb;
    after_vis jsonb;
BEGIN
    SELECT *
    INTO fd
    FROM public.field_definitions
    WHERE id = p_field_definition_id
      AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'agent_v2:field_definition_not_found';
    END IF;

    v_lock := coalesce(fd.updated_at, fd.created_at);

    IF v_lock IS NULL THEN
        RAISE EXCEPTION 'agent_v2:field_definition_not_found';
    END IF;

    exp_ts := p_expected_updated_at::timestamptz;

    IF v_lock IS DISTINCT FROM exp_ts THEN
        RAISE EXCEPTION 'agent_v2:stale_field_definition';
    END IF;

    before_vis := jsonb_build_object(
        'is_visible_in_form', fd.is_visible_in_form,
        'is_visible_in_drawer', fd.is_visible_in_drawer,
        'is_visible_in_table', fd.is_visible_in_table,
        'is_visible_in_public_booking', fd.is_visible_in_public_booking
    );
    before_h := encode(extensions.digest(convert_to(before_vis::text, 'UTF8'), 'sha256'), 'hex');

    after_vis := jsonb_build_object(
        'is_visible_in_form', p_is_visible_in_form,
        'is_visible_in_drawer', p_is_visible_in_drawer,
        'is_visible_in_table', p_is_visible_in_table,
        'is_visible_in_public_booking', p_is_visible_in_public_booking
    );
    after_h := encode(extensions.digest(convert_to(after_vis::text, 'UTF8'), 'sha256'), 'hex');

    UPDATE public.field_definitions
    SET
        is_visible_in_form = p_is_visible_in_form,
        is_visible_in_drawer = p_is_visible_in_drawer,
        is_visible_in_table = p_is_visible_in_table,
        is_visible_in_public_booking = p_is_visible_in_public_booking,
        updated_at = now()
    WHERE id = p_field_definition_id
      AND org_id = p_org_id;

    INSERT INTO public.agent_v2_field_visibility_proposals (
        proposal_id,
        request_id,
        correlation_id,
        org_id,
        user_id,
        field_definition_id,
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
        p_field_definition_id,
        p_intent_json,
        before_h,
        after_h
    );

    INSERT INTO public.agent_v2_field_visibility_apply_audit (
        result_id,
        proposal_id,
        org_id,
        user_id,
        field_definition_id,
        terminal_status,
        applied_updated_at
    )
    VALUES (
        p_result_id,
        p_proposal_id,
        p_org_id,
        p_user_id,
        p_field_definition_id,
        'success',
        (SELECT updated_at FROM public.field_definitions WHERE id = p_field_definition_id)
    );

    SELECT to_jsonb(f.*)
    INTO out_row
    FROM public.field_definitions f
    WHERE f.id = p_field_definition_id;

    RETURN out_row;
END;
$$;

COMMENT ON FUNCTION public.agent_v2_commit_field_visibility_apply IS
  'AI agent v2: field_definitions visibility update + audit. Execute only from service_role (Next admin route).';

REVOKE ALL ON FUNCTION public.agent_v2_commit_field_visibility_apply(
    uuid, uuid, uuid, text, boolean, boolean, boolean, boolean, uuid, uuid, uuid, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.agent_v2_commit_field_visibility_apply(
    uuid, uuid, uuid, text, boolean, boolean, boolean, boolean, uuid, uuid, uuid, jsonb, uuid
) TO service_role;

REVOKE ALL ON public.agent_v2_field_visibility_proposals FROM anon;
REVOKE ALL ON public.agent_v2_field_visibility_apply_audit FROM anon;

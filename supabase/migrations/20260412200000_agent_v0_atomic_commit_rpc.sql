-- Atomic agent v0 apply: work_units.queue_definition update + proposal + apply_audit in one transaction.
-- Hashes match DB jsonb text (extensions.digest); service_role only.

CREATE OR REPLACE FUNCTION public.agent_v0_commit_queue_definition_apply(
    p_org_id uuid,
    p_user_id uuid,
    p_work_unit_id uuid,
    p_expected_version integer,
    p_queue_definition jsonb,
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
    cur jsonb;
    v_old integer;
    before_h text;
    after_h text;
    out_row jsonb;
BEGIN
    SELECT coalesce(wu.queue_definition, '{}'::jsonb)
    INTO cur
    FROM public.work_units wu
    WHERE wu.id = p_work_unit_id
      AND wu.org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'agent_v0:work_unit_not_found';
    END IF;

    v_old := coalesce((cur->>'version')::integer, 0);
    IF v_old IS DISTINCT FROM p_expected_version THEN
        RAISE EXCEPTION 'agent_v0:stale_queue_definition_version';
    END IF;

    before_h := encode(extensions.digest(convert_to(cur::text, 'UTF8'), 'sha256'), 'hex');
    after_h := encode(extensions.digest(convert_to(p_queue_definition::text, 'UTF8'), 'sha256'), 'hex');

    UPDATE public.work_units
    SET
        queue_definition = p_queue_definition,
        updated_at = now()
    WHERE id = p_work_unit_id
      AND org_id = p_org_id;

    INSERT INTO public.agent_v0_proposals (
        proposal_id,
        request_id,
        correlation_id,
        org_id,
        user_id,
        work_unit_id,
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
        p_work_unit_id,
        p_intent_json,
        before_h,
        after_h
    );

    INSERT INTO public.agent_v0_apply_audit (
        result_id,
        proposal_id,
        org_id,
        user_id,
        work_unit_id,
        terminal_status,
        applied_queue_definition_version
    )
    VALUES (
        p_result_id,
        p_proposal_id,
        p_org_id,
        p_user_id,
        p_work_unit_id,
        'success',
        coalesce((p_queue_definition->>'version')::integer, 0)
    );

    SELECT to_jsonb(wu.*)
    INTO out_row
    FROM public.work_units wu
    WHERE wu.id = p_work_unit_id;

    RETURN out_row;
END;
$$;

COMMENT ON FUNCTION public.agent_v0_commit_queue_definition_apply IS
  'AI agent v0: single transaction for queue_definition + audit rows. Execute only from service_role (Next admin route).';

REVOKE ALL ON FUNCTION public.agent_v0_commit_queue_definition_apply(
    uuid, uuid, uuid, integer, jsonb, uuid, uuid, uuid, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.agent_v0_commit_queue_definition_apply(
    uuid, uuid, uuid, integer, jsonb, uuid, uuid, uuid, jsonb, uuid
) TO service_role;

-- Harden direct table access: browser clients use authenticated + RLS; anon has no business here.
REVOKE ALL ON public.agent_v0_proposals FROM anon;
REVOKE ALL ON public.agent_v0_apply_audit FROM anon;

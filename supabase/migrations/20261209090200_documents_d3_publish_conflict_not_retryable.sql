-- =============================================================================
-- Documents V1 / D3 — the publish conflict must not be a retryable error.
--
-- 20261209090100 raised `document_type_publish_conflict` (a stale compare-and-swap) with SQLSTATE 40001
-- serialization_failure. That code means "retry the transaction" to the layers between the application and the
-- database, so on hosted staging a stale publish was retried until the request timed out (measured 2026-10-23: the
-- connection closed after 60 s, twice, in authz_q1 run qar_ad7ca37df52f) instead of answering 409. The conflict is not
-- transient — the editor must reopen the type — so it is now raised as 55000 object_not_in_prerequisite_state. The
-- message, which the application maps to PUBLISH_CONFLICT, is unchanged; nothing else in the function changes.
-- Re-runnable.
-- =============================================================================

-- Publish a validated version: compare-and-swap on the type's current published version, supersede it, make this one
-- current. Validation is re-run here; publication never trusts an earlier answer.
CREATE OR REPLACE FUNCTION public.document_type_publish(
    p_org_id uuid, p_type_id uuid, p_version_id uuid, p_expected_published_version_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t record;
    v record;
    probs jsonb;
BEGIN
    SELECT * INTO t FROM public.document_types WHERE id = p_type_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF t.status <> 'active' THEN RAISE EXCEPTION 'document_type_archived: re-activate the type before publishing' USING ERRCODE = 'check_violation'; END IF;
    IF t.published_version_id IS DISTINCT FROM p_expected_published_version_id THEN
        RAISE EXCEPTION 'document_type_publish_conflict: the published version changed since this draft was opened' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    SELECT * INTO v FROM public.document_type_versions WHERE id = p_version_id AND document_type_id = p_type_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v.status <> 'validated' THEN
        RAISE EXCEPTION 'document_type_version_not_validated: validate the draft before publishing' USING ERRCODE = 'check_violation';
    END IF;
    probs := public.document_type_version_problems(p_version_id);
    IF jsonb_array_length(probs) > 0 THEN
        RAISE EXCEPTION 'document_type_version_invalid: %', probs USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_type_publish', 'on', true);
    UPDATE public.document_type_versions SET status = 'superseded', superseded_at = now()
     WHERE document_type_id = p_type_id AND status = 'published';
    UPDATE public.document_type_versions SET status = 'published', published_at = now(), published_by = p_actor WHERE id = p_version_id;
    UPDATE public.document_types SET published_version_id = p_version_id, updated_by = p_actor WHERE id = p_type_id;
    PERFORM set_config('alloy.document_type_publish', 'off', true);
    RETURN jsonb_build_object('type_id', p_type_id, 'version_id', p_version_id, 'version_number', v.version_number,
                              'superseded_version_id', p_expected_published_version_id);
END;
$$;

REVOKE ALL ON FUNCTION public.document_type_publish(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_type_publish(uuid, uuid, uuid, uuid, uuid) TO service_role;

DO $verify$
BEGIN
    IF strpos(pg_get_functiondef('public.document_type_publish(uuid, uuid, uuid, uuid, uuid)'::regprocedure), 'serialization_failure') > 0 THEN
        RAISE EXCEPTION 'd3 verify: document_type_publish still raises a retryable serialization_failure';
    END IF;
END
$verify$;

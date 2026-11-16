-- Documents W-C1: stored, verified audit linkage for review, validity, link and unlink.
--
-- Upload, filing, archive and restore already store the id of the audit row written before them. Review, validity,
-- link and unlink did not: the API writes the audit first and refuses (503 AUDIT_UNAVAILABLE) if it cannot, but the id
-- never reached the effect, so W-C1 could only pair them by time (census 009063d0). This migration lets the caller
-- pass that id and has the database check it before anything changes:
--   * the event exists in the same org, about the same document, with the expected event type and facts (version;
--     link change, subject type and subject id), and was written by the same actor the caller authenticated
--     (application + installation, staff user, or system process): p_audit_payload, which must name an actor;
--   * one audit row binds at most one effect (partial unique indexes), so an audit written for a refused or no-op
--     request is never bound, and can never stand in for a later effect;
--   * a mismatch raises audit_event_mismatch (22023) before any write.
-- p_audit_event_id / p_audit_payload default to NULL: staff routes and the SQL filing path (document_file calls
-- document_link_subject positionally) keep working unchanged. The previous signatures are dropped so no overload
-- survives. No backfill: rows written before this migration keep NULL. Idempotent (IF NOT EXISTS, DROP IF EXISTS,
-- CREATE OR REPLACE). Design: certification/documents-v1/finish/W-C1-STORED-AUDIT-LINKAGE-DESIGN.md.

ALTER TABLE public.document_version_review_events ADD COLUMN IF NOT EXISTS audit_event_id uuid;
ALTER TABLE public.document_subjects
    ADD COLUMN IF NOT EXISTS link_audit_event_id uuid,
    ADD COLUMN IF NOT EXISTS unlink_audit_event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_version_review_events_audit_event
    ON public.document_version_review_events (audit_event_id) WHERE audit_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_subjects_link_audit_event
    ON public.document_subjects (link_audit_event_id) WHERE link_audit_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_subjects_unlink_audit_event
    ON public.document_subjects (unlink_audit_event_id) WHERE unlink_audit_event_id IS NOT NULL;

-- The match: same shape as document_malware_audit_event_matches (20261219090000), without the version column
-- requirement (link / unlink are not version-scoped; review and validity pass version_id in p_payload_must).
CREATE OR REPLACE FUNCTION public.document_audit_event_matches(
    p_audit_event_id uuid, p_org_id uuid, p_event_type text, p_document_id uuid, p_payload_must jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.workflow_events e
         WHERE e.id = p_audit_event_id
           AND e.org_id = p_org_id
           AND e.event_type = p_event_type
           AND e.entity_type = 'documents'
           AND e.entity_id = p_document_id
           AND e.payload @> coalesce(p_payload_must, '{}'::jsonb)
    )
$fn$;

-- Refuses unless the audit row matches and names an actor. Called first, before any lock or write.
CREATE OR REPLACE FUNCTION public.document_audit_event_require(
    p_audit_event_id uuid, p_org_id uuid, p_event_type text, p_document_id uuid, p_facts jsonb, p_audit_payload jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF p_audit_payload IS NULL OR jsonb_typeof(p_audit_payload) <> 'object'
       OR NOT (p_audit_payload ? 'actor_kind' OR p_audit_payload ? 'actor_user_id') THEN
        RAISE EXCEPTION 'audit_event_mismatch: the acting principal is required with an audit event id' USING ERRCODE = '22023';
    END IF;
    IF NOT public.document_audit_event_matches(p_audit_event_id, p_org_id, p_event_type, p_document_id,
                                               p_audit_payload || coalesce(p_facts, '{}'::jsonb)) THEN
        RAISE EXCEPTION 'audit_event_mismatch' USING ERRCODE = '22023';
    END IF;
END;
$fn$;

-- The previous signatures go first, in one statement, so no overload survives (callers with fewer arguments resolve to
-- the new functions through the defaults, including document_file's positional six-argument link).
DROP FUNCTION IF EXISTS
    public.document_review_version(uuid, uuid, uuid, text, text, uuid, boolean),
    public.document_set_version_validity(uuid, uuid, uuid, date, date, text, uuid),
    public.document_link_subject(uuid, uuid, text, uuid, text, uuid),
    public.document_unlink_subject(uuid, uuid, text, uuid, uuid);

-- ── review ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Re-declared from 20261217090000_documents_d9_3_archive.sql; changes: p_audit_event_id / p_audit_payload, the match
-- before any write, audit_event_id on the event row.
CREATE OR REPLACE FUNCTION public.document_review_version(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_decision text, p_reason text, p_actor uuid, p_rereview boolean,
    p_audit_event_id uuid DEFAULT NULL, p_audit_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_status text;
    v_event text;
    v_id uuid;
BEGIN
    IF p_audit_event_id IS NOT NULL THEN
        PERFORM public.document_audit_event_require(p_audit_event_id, p_org_id, 'document_version_reviewed', p_document_id,
                                                    jsonb_build_object('version_id', p_version_id::text), p_audit_payload);
    END IF;
    IF p_decision NOT IN ('accepted', 'rejected', 'pending') THEN
        RAISE EXCEPTION 'document_review_decision_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
        RAISE EXCEPTION 'document_review_document_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.current_version_id IS NULL OR v_doc.current_version_id <> p_version_id THEN
        RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, review_status, effective_on, expires_on INTO v_ver FROM public.document_versions
     WHERE id = p_version_id AND org_id = p_org_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation'; END IF;

    v_status := CASE WHEN p_decision = 'pending' THEN 'pending' ELSE p_decision END;
    IF v_ver.review_status IN ('accepted', 'rejected') THEN
        IF NOT coalesce(p_rereview, false) THEN
            RAISE EXCEPTION 'document_review_already_decided' USING ERRCODE = 'check_violation';
        END IF;
        IF v_reason IS NULL OR length(v_reason) < 3 THEN
            RAISE EXCEPTION 'document_review_reason_required' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF p_decision IN ('rejected', 'pending') AND (v_reason IS NULL OR length(v_reason) < 3) THEN
        RAISE EXCEPTION 'document_review_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_decision = 'pending' AND coalesce(v_ver.review_status, 'pending') = 'pending' THEN
        RAISE EXCEPTION 'document_review_already_pending' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.document_versions
       SET review_status = v_status,
           reviewed_by = CASE WHEN v_status = 'pending' THEN NULL ELSE p_actor END,
           reviewed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END
     WHERE id = p_version_id AND org_id = p_org_id;

    v_event := CASE WHEN p_decision = 'pending' THEN 'reopened' ELSE p_decision END;
    INSERT INTO public.document_version_review_events
        (org_id, document_id, version_id, kind, decision, previous_review_status, reason, effective_on, expires_on, actor, audit_event_id)
    VALUES (p_org_id, p_document_id, p_version_id, 'review', v_event, v_ver.review_status, v_reason, v_ver.effective_on, v_ver.expires_on, p_actor, p_audit_event_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'review_status', v_status,
                              'previous_review_status', v_ver.review_status, 'rereview', v_ver.review_status IN ('accepted', 'rejected'),
                              'audit_event_id', p_audit_event_id);
END;
$$;

-- ── validity ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Re-declared from 20261217090000_documents_d9_3_archive.sql; same changes. A no-op (changed:false) binds nothing.
CREATE OR REPLACE FUNCTION public.document_set_version_validity(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_effective_on date, p_expires_on date, p_reason text, p_actor uuid,
    p_audit_event_id uuid DEFAULT NULL, p_audit_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_id uuid;
BEGIN
    IF p_audit_event_id IS NOT NULL THEN
        PERFORM public.document_audit_event_require(p_audit_event_id, p_org_id, 'document_version_validity_set', p_document_id,
                                                    jsonb_build_object('version_id', p_version_id::text), p_audit_payload);
    END IF;
    IF p_effective_on IS NOT NULL AND p_expires_on IS NOT NULL AND p_expires_on < p_effective_on THEN
        RAISE EXCEPTION 'document_validity_range_inverted' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
        RAISE EXCEPTION 'document_review_document_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.current_version_id IS NULL OR v_doc.current_version_id <> p_version_id THEN
        RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, effective_on, expires_on INTO v_ver FROM public.document_versions
     WHERE id = p_version_id AND org_id = p_org_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation'; END IF;
    IF v_ver.effective_on IS NOT DISTINCT FROM p_effective_on AND v_ver.expires_on IS NOT DISTINCT FROM p_expires_on THEN
        RETURN jsonb_build_object('version_id', p_version_id, 'changed', false, 'effective_on', p_effective_on, 'expires_on', p_expires_on);
    END IF;

    UPDATE public.document_versions SET effective_on = p_effective_on, expires_on = p_expires_on
     WHERE id = p_version_id AND org_id = p_org_id;
    INSERT INTO public.document_version_review_events
        (org_id, document_id, version_id, kind, decision, reason, effective_on, expires_on, previous_effective_on, previous_expires_on, actor, audit_event_id)
    VALUES (p_org_id, p_document_id, p_version_id, 'validity', NULL, nullif(btrim(coalesce(p_reason, '')), ''),
            p_effective_on, p_expires_on, v_ver.effective_on, v_ver.expires_on, p_actor, p_audit_event_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'changed', true, 'effective_on', p_effective_on,
                              'expires_on', p_expires_on, 'audit_event_id', p_audit_event_id);
END;
$$;

-- ── link ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Re-declared from 20261208090000_documents_d2_canonical_foundation.sql; changes: the match first, link_audit_event_id
-- on the new row. An existing association (created:false) binds nothing.
CREATE OR REPLACE FUNCTION public.document_link_subject(
    p_org_id uuid, p_document_id uuid, p_subject_type text, p_subject_id uuid, p_association text, p_actor uuid,
    p_audit_event_id uuid DEFAULT NULL, p_audit_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_audit_event_id IS NOT NULL THEN
        PERFORM public.document_audit_event_require(p_audit_event_id, p_org_id, 'document_subject_changed', p_document_id,
            jsonb_build_object('change', 'link', 'subject_type', p_subject_type, 'subject_id', p_subject_id::text), p_audit_payload);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND org_id = p_org_id) THEN
        RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT id INTO v_id FROM public.document_subjects
     WHERE document_id = p_document_id AND subject_type = p_subject_type AND subject_id = p_subject_id AND ended_at IS NULL;
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('association_id', v_id, 'created', false);
    END IF;
    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source, created_by, link_audit_event_id)
    VALUES (p_org_id, p_document_id, p_subject_type, p_subject_id, p_association, false, 'governed', p_actor, p_audit_event_id)
    RETURNING id INTO v_id;
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    RETURN jsonb_build_object('association_id', v_id, 'created', true, 'audit_event_id', p_audit_event_id);
END;
$$;

-- ── unlink ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Re-declared from 20261208090000_documents_d2_canonical_foundation.sql; changes: the match first, unlink_audit_event_id
-- with ended_at. Nothing to end (ended:false) binds nothing.
CREATE OR REPLACE FUNCTION public.document_unlink_subject(
    p_org_id uuid, p_document_id uuid, p_subject_type text, p_subject_id uuid, p_actor uuid,
    p_audit_event_id uuid DEFAULT NULL, p_audit_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
BEGIN
    IF p_audit_event_id IS NOT NULL THEN
        PERFORM public.document_audit_event_require(p_audit_event_id, p_org_id, 'document_subject_changed', p_document_id,
            jsonb_build_object('change', 'unlink', 'subject_type', p_subject_type, 'subject_id', p_subject_id::text), p_audit_payload);
    END IF;
    SELECT * INTO v FROM public.document_subjects
     WHERE org_id = p_org_id AND document_id = p_document_id AND subject_type = p_subject_type
       AND subject_id = p_subject_id AND ended_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('ended', false); END IF;
    IF v.is_primary THEN
        RAISE EXCEPTION 'document_primary_subject_required: change the primary owner instead of removing it'
            USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    UPDATE public.document_subjects SET ended_at = now(), ended_by = p_actor, unlink_audit_event_id = p_audit_event_id WHERE id = v.id;
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    RETURN jsonb_build_object('ended', true, 'association_id', v.id, 'audit_event_id', p_audit_event_id);
END;
$$;

-- ── grants: service_role only, as before; the helpers are callable by no API role ─────────────────────────────────
REVOKE ALL ON FUNCTION
    public.document_review_version(uuid, uuid, uuid, text, text, uuid, boolean, uuid, jsonb),
    public.document_set_version_validity(uuid, uuid, uuid, date, date, text, uuid, uuid, jsonb),
    public.document_link_subject(uuid, uuid, text, uuid, text, uuid, uuid, jsonb),
    public.document_unlink_subject(uuid, uuid, text, uuid, uuid, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION
    public.document_review_version(uuid, uuid, uuid, text, text, uuid, boolean, uuid, jsonb),
    public.document_set_version_validity(uuid, uuid, uuid, date, date, text, uuid, uuid, jsonb),
    public.document_link_subject(uuid, uuid, text, uuid, text, uuid, uuid, jsonb),
    public.document_unlink_subject(uuid, uuid, text, uuid, uuid, uuid, jsonb)
    TO service_role;
REVOKE ALL ON FUNCTION
    public.document_audit_event_matches(uuid, uuid, text, uuid, jsonb),
    public.document_audit_event_require(uuid, uuid, text, uuid, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

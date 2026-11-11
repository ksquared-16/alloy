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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY INVARIANT (W-C1 audit linkage). Everything ABOVE this banner is the pending migration
-- supabase/migrations/20261222090000_documents_w_c1_audit_linkage.sql, byte for byte, TWICE (T10: the second apply must
-- succeed unchanged; locked by web/tests/documents/preapplyInvariantParity.test.ts). It runs inside the executor's
-- transaction, so nothing is applied. Everything BELOW is certification/invariants/documents-w-c1-audit-linkage.sql, byte
-- for byte. Needs an EXISTING ready certification environment carrying the Documents migrations through 20261219090000.
--
-- Documents W-C1 — rollback-only invariant for migration 20261222090000 (stored, verified audit linkage for review,
-- validity, link and unlink). For database.run_rollback_invariant_test against an EXISTING ready certification
-- environment; its pre-apply twin (documents-w-c1-audit-linkage-preapply.sql) runs the pending migration twice first
-- (T10: idempotent), inside the same discarded transaction. Any failed case RAISEs. Every refusal has a positive
-- control: the same call with only the defect removed succeeds, so a refusal cannot pass by broken setup.
-- Cases follow certification/documents-v1/finish/W-C1-STORED-AUDIT-LINKAGE-DESIGN.md (T1-T5, T7, T10; T6/T8/T9 are TS).
DO $wc1$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    hh uuid := gen_random_uuid();
    hh2 uuid := gen_random_uuid();
    sha text := repeat('e', 64);
    app jsonb := '{"actor_kind":"application","actor_application_id":"app-wc1","actor_installation_id":"inst-wc1"}'::jsonb;
    app_other jsonb := '{"actor_kind":"application","actor_application_id":"app-wc1","actor_installation_id":"inst-OTHER"}'::jsonb;
    d1 uuid; v1 uuid; d2 uuid; v2 uuid; d3 uuid; v3 uuid;
    ev uuid; ev2 uuid; ev3 uuid;
    r jsonb;
    msg text;
    n integer;
    passed integer := 0;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (o1, 'ZZ wc1 A', 'zz-wc1-a-' || left(o1::text, 8)),
                                                    (o2, 'ZZ wc1 B', 'zz-wc1-b-' || left(o2::text, 8));
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (hh, o1, 'wc1 household', 997101), (hh2, o1, 'wc1 other', 997102);
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 one', '1.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/1.pdf', 'uploaded') RETURNING id INTO d1;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 two', '2.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/2.pdf', 'uploaded') RETURNING id INTO d2;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 three', '3.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/3.pdf', 'uploaded') RETURNING id INTO d3;
    SELECT current_version_id INTO v1 FROM public.documents WHERE id = d1;
    SELECT current_version_id INTO v2 FROM public.documents WHERE id = d2;
    SELECT current_version_id INTO v3 FROM public.documents WHERE id = d3;
    IF v1 IS NULL OR v2 IS NULL OR v3 IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: D2 trigger wrote no version'; END IF;

    -- CASE 1 (T1): review and validity store the exact audit id they were given.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev;
    r := public.document_review_version(o1, d1, v1, 'accepted', NULL, NULL, false, ev, app);
    IF (SELECT audit_event_id FROM public.document_version_review_events WHERE id = (r->>'event_id')::uuid) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 1 FAILED: review did not store its audit id';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev;
    r := public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2027-10-31', NULL, NULL, ev, app);
    IF (SELECT audit_event_id FROM public.document_version_review_events WHERE id = (r->>'event_id')::uuid) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 1 FAILED: validity did not store its audit id';
    END IF;
    passed := passed + 1;

    -- CASE 2 (T2): a refused review (already decided, no re-review) binds nothing; the next accepted review binds only its own.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev2;
    msg := NULL;
    BEGIN PERFORM public.document_review_version(o1, d1, v1, 'rejected', 'not this one', NULL, false, ev2, app);
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_review_already_decided%' THEN RAISE EXCEPTION 'CASE 2 FAILED: refusal (%)', coalesce(msg, 'accepted'); END IF;
    IF EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN RAISE EXCEPTION 'CASE 2 FAILED: a refused review bound its audit'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d2, app || jsonb_build_object('version_id', v2::text)) RETURNING id INTO ev3;
    PERFORM public.document_review_version(o1, d2, v2, 'accepted', NULL, NULL, false, ev3, app);
    SELECT count(*) INTO n FROM public.document_version_review_events WHERE document_id = d2 AND audit_event_id = ev3;
    IF n <> 1 OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 2 FAILED: the accepted review did not bind only its own audit';
    END IF;
    passed := passed + 1;

    -- CASE 3 (T3): no-ops bind nothing: same validity dates, an existing link, nothing to unlink.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev2;
    r := public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2027-10-31', NULL, NULL, ev2, app);
    IF (r->>'changed')::boolean OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: a no-op validity bound its audit';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    PERFORM public.document_link_subject(o1, d1, 'household', hh, 'context', NULL, ev, app);
    IF (SELECT link_audit_event_id FROM public.document_subjects WHERE document_id = d1 AND subject_id = hh AND ended_at IS NULL) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 3 FAILED: link did not store its audit id (T1)';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev2;
    r := public.document_link_subject(o1, d1, 'household', hh, 'context', NULL, ev2, app);
    IF (r->>'created')::boolean OR EXISTS (SELECT 1 FROM public.document_subjects WHERE link_audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: an existing link bound a second audit';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    PERFORM public.document_unlink_subject(o1, d1, 'household', hh, NULL, ev, app);
    IF (SELECT unlink_audit_event_id FROM public.document_subjects WHERE document_id = d1 AND subject_id = hh) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 3 FAILED: unlink did not store its audit id (T1)';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev2;
    r := public.document_unlink_subject(o1, d1, 'household', hh, NULL, ev2, app);
    IF (r->>'ended')::boolean OR EXISTS (SELECT 1 FROM public.document_subjects WHERE unlink_audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: nothing to unlink still bound an audit';
    END IF;
    passed := passed + 1;

    -- CASE 4 (T4): id / target / actor integrity. Each mismatch raises audit_event_mismatch and writes nothing; the
    -- positive control (a correct audit) then succeeds on the same document.
    -- wrong org: the audit row is in o2
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o2, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong org (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong document
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d2, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong document (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong version
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v2::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong version (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong event type (a validity audit offered to a review)
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong event type (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong actor: written for another installation of the same application
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app_other || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong installation (%)', coalesce(msg, 'accepted'); END IF;
    -- an id without any actor payload
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev2;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev2, NULL); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: missing actor (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong subject (link audit for hh offered for hh2)
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong subject (%)', coalesce(msg, 'accepted'); END IF;
    -- an unlink audit offered to a link
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh2::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: unlink audit used for a link (%)', coalesce(msg, 'accepted'); END IF;
    -- nothing was written by any refused call
    IF (SELECT review_status FROM public.document_versions WHERE id = v3) IN ('accepted', 'rejected')
       OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE document_id = d3)
       OR EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d3 AND subject_id = hh2) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: a refused call wrote something';
    END IF;
    -- positive controls on the same document and subject
    PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev2, app);
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh2::text)) RETURNING id INTO ev;
    PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app);
    IF (SELECT review_status FROM public.document_versions WHERE id = v3) <> 'accepted'
       OR NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d3 AND subject_id = hh2 AND link_audit_event_id = ev) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: positive control refused';
    END IF;
    passed := passed + 1;

    -- CASE 5 (T5): one audit, one effect. Re-using a bound validity audit for a real change on the same version is
    -- refused by the unique index and changes nothing.
    SELECT audit_event_id INTO ev FROM public.document_version_review_events WHERE document_id = d1 AND kind = 'validity' AND audit_event_id IS NOT NULL LIMIT 1;
    msg := NULL;
    BEGIN PERFORM public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2028-10-31', NULL, NULL, ev, app);
    EXCEPTION WHEN unique_violation THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%uq_document_version_review_events_audit_event%' THEN RAISE EXCEPTION 'CASE 5 FAILED: re-used audit (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT expires_on FROM public.document_versions WHERE id = v1) <> DATE '2027-10-31' THEN RAISE EXCEPTION 'CASE 5 FAILED: the change was written'; END IF;
    passed := passed + 1;

    -- CASE 6 (T7): compatibility. Calls without an audit work (staff routes); the SQL filing path's positional
    -- six-argument link still resolves; the old signatures are gone; grants are service_role only; helpers are private.
    PERFORM public.document_review_version(o1, d2, v2, 'pending', 'reopen for check', NULL, true);
    PERFORM public.document_link_subject(o1, d2, 'household', hh, 'context', NULL);
    PERFORM public.document_unlink_subject(o1, d2, 'household', hh, NULL);
    IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d2 AND subject_id = hh AND link_audit_event_id IS NULL AND unlink_audit_event_id IS NULL) THEN
        RAISE EXCEPTION 'CASE 6 FAILED: unbound staff link/unlink';
    END IF;
    IF to_regprocedure('public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)') IS NOT NULL
       OR to_regprocedure('public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid)') IS NOT NULL
       OR to_regprocedure('public.document_link_subject(uuid,uuid,text,uuid,text,uuid)') IS NOT NULL
       OR to_regprocedure('public.document_unlink_subject(uuid,uuid,text,uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'CASE 6 FAILED: an old signature survived (overload)';
    END IF;
    IF has_function_privilege('authenticated', 'public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_link_subject(uuid,uuid,text,uuid,text,uuid,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.document_unlink_subject(uuid,uuid,text,uuid,uuid,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.document_audit_event_require(uuid,uuid,text,uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.document_audit_event_matches(uuid,uuid,text,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 6 FAILED: grants';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS documents w-c1 audit linkage: ids stored, refused and no-op calls bind nothing, org/document/version/event/subject/installation integrity, one audit per effect, unbound staff calls, old signatures gone, grants';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$wc1$;

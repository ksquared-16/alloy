-- =============================================================================
-- Documents V1 / D7 — review lifecycle, validity dates and their history.
--
-- D2 made review and expiration the ONLY mutable fields of a document version (`document_versions.review_status`,
-- `reviewed_by`, `reviewed_at`, `effective_on`, `expires_on`); D3 declared each Studio type's validity policy; D6 added
-- requirement satisfaction and the version review route. What was missing:
--
--   * a HISTORY: a version's review fields hold only the latest decision, so a rejection followed by an acceptance left
--     no trace in the record (D6 hosted certification, qar_af1c638fd52a, "history records the reviews" 73/74);
--   * an AUTHORITY for a second decision on the same version (re-review) and for recording validity dates;
--   * a writer for validity dates that does not also overwrite the reviewer.
--
--   document_version_review_events   append-only: one row per review decision (accepted / rejected / reopened) or
--                                    validity record (effective_on / expires_on), with reason, actor and the state it
--                                    replaced. Never updated; removed only by cascade with its version or document
--                                    (the audited document delete, lead deletion), so a governed QA teardown still
--                                    ends with zero residue.
--   document_review_version(...)     the ONE writer of a review decision after filing: current version only, never an
--                                    unavailable (quarantined, deleted, restricted, superseded) document, a reason for
--                                    a rejection, a reopen or any change to an already decided version, and that
--                                    change only when the caller asserts re-review authority (the route checks it).
--   document_set_version_validity(…) the ONE writer of validity dates: current version only, available documents only,
--                                    effective_on <= expires_on; review fields untouched.
--
-- VALIDITY IS NEVER STORED AS A STATUS. "valid / expiring soon / expired / date missing" is derived on every read by the
-- application's one validity evaluator (web/lib/documents/validity/documentValidity.ts) from these dates, the type's
-- published validity policy and the organization's local date — the same way D6 derives requirement satisfaction.
--
-- `document_set_version_review` (D2) is unchanged: D5 filing still records the filing review through it, inside the
-- governed filing transaction.
--
-- Additive, re-runnable, self-verifying. Rollback: drop the table and the two functions created here.
-- =============================================================================

-- ── 1. review and validity history ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_version_review_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
    version_id uuid NOT NULL REFERENCES public.document_versions (id) ON DELETE CASCADE,
    kind text NOT NULL,
    decision text,
    previous_review_status text,
    reason text,
    effective_on date,
    expires_on date,
    previous_effective_on date,
    previous_expires_on date,
    actor uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_document_version_review_events_kind CHECK (kind IN ('review', 'validity')),
    CONSTRAINT chk_document_version_review_events_decision CHECK (
        (kind = 'review' AND decision IN ('accepted', 'rejected', 'reopened'))
        OR (kind = 'validity' AND decision IS NULL)),
    CONSTRAINT chk_document_version_review_events_reason CHECK (reason IS NULL OR length(reason) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_document_version_review_events_document
    ON public.document_version_review_events (org_id, document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_version_review_events_version
    ON public.document_version_review_events (version_id);

ALTER TABLE public.document_version_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_version_review_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_version_review_events TO service_role;

-- Append-only. A direct DELETE is refused; the cascade from a deleted version or document (an RI trigger, so the trigger
-- depth is greater than one) is the only way a row goes.
CREATE OR REPLACE FUNCTION public.document_version_review_events_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'document_review_event_immutable: a review event is never edited' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'document_review_event_immutable: a review event goes only with its version or document' USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_version_review_events_guard ON public.document_version_review_events;
CREATE TRIGGER trg_document_version_review_events_guard BEFORE UPDATE OR DELETE ON public.document_version_review_events
    FOR EACH ROW EXECUTE FUNCTION public.document_version_review_events_guard();

-- ── 2. the review decision ───────────────────────────────────────────────────────────────────────────────────
-- p_decision: 'accepted' | 'rejected' | 'pending' (reopen). A version still pending (or never reviewed) takes its first
-- decision with p_rereview = false. Any decision on a version already accepted or rejected — including reopening it —
-- is a RE-REVIEW: it needs p_rereview = true (the caller holds re-review authority) and a reason.
CREATE OR REPLACE FUNCTION public.document_review_version(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_decision text, p_reason text, p_actor uuid, p_rereview boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_status text;
    v_event text;
    v_id uuid;
BEGIN
    IF p_decision NOT IN ('accepted', 'rejected', 'pending') THEN
        RAISE EXCEPTION 'document_review_decision_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
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
        (org_id, document_id, version_id, kind, decision, previous_review_status, reason, effective_on, expires_on, actor)
    VALUES (p_org_id, p_document_id, p_version_id, 'review', v_event, v_ver.review_status, v_reason, v_ver.effective_on, v_ver.expires_on, p_actor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'review_status', v_status,
                              'previous_review_status', v_ver.review_status, 'rereview', v_ver.review_status IN ('accepted', 'rejected'));
END;
$$;

-- ── 3. validity dates ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_set_version_validity(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_effective_on date, p_expires_on date, p_reason text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_id uuid;
BEGIN
    IF p_effective_on IS NOT NULL AND p_expires_on IS NOT NULL AND p_expires_on < p_effective_on THEN
        RAISE EXCEPTION 'document_validity_range_inverted' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
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
        (org_id, document_id, version_id, kind, decision, reason, effective_on, expires_on, previous_effective_on, previous_expires_on, actor)
    VALUES (p_org_id, p_document_id, p_version_id, 'validity', NULL, nullif(btrim(coalesce(p_reason, '')), ''),
            p_effective_on, p_expires_on, v_ver.effective_on, v_ver.expires_on, p_actor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'changed', true, 'effective_on', p_effective_on, 'expires_on', p_expires_on);
END;
$$;

REVOKE ALL ON FUNCTION public.document_review_version(uuid, uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_review_version(uuid, uuid, uuid, text, text, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.document_set_version_validity(uuid, uuid, uuid, date, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_set_version_validity(uuid, uuid, uuid, date, date, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_version_review_events_guard() FROM PUBLIC, anon, authenticated;

-- ── 4. self-verification ──────────────────────────────────────────────────────────────────────────────────────
DO $verify$
BEGIN
    IF to_regprocedure('public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)') IS NULL
       OR to_regprocedure('public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid)') IS NULL THEN
        RAISE EXCEPTION 'd7 self-verify: functions missing';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_version_review_events'::regclass) THEN
        RAISE EXCEPTION 'd7 self-verify: row level security is not enabled';
    END IF;
    IF has_table_privilege('authenticated', 'public.document_version_review_events', 'SELECT')
       OR has_table_privilege('anon', 'public.document_version_review_events', 'SELECT')
       OR has_function_privilege('authenticated', 'public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'd7 self-verify: a D7 object is reachable outside the service role';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_document_version_review_events_guard') THEN
        RAISE EXCEPTION 'd7 self-verify: the review history guard is missing';
    END IF;
END
$verify$;

COMMENT ON TABLE public.document_version_review_events IS 'D7: append-only history of document version review decisions and validity dates. Validity status is never stored; it is derived.';

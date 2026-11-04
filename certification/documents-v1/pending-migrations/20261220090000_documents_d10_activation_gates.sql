-- Documents D10 activation gates: Q2 (release honours verdicts, archive restore included), W2 (scan-held documents
-- release only on a clean verdict), N8 (bounded rescan attempts), the Access & Identity Q1 follow-up (status compared in
-- lower case), and Communications' W3 (WS11 trigger function search_path and EXECUTE).
--
-- Applies on top of 20261219090000 (verdict store) and 20261218090000 (WS11). Nothing here enables a scanner, a
-- schedule, retrieval or provider traffic, and nothing creates a role or credential. With no verdict rows (no scanner
-- runs) the new guard only refuses releases that a verdict would make unsafe, and every inbound attachment stays held.
--
-- RULES
--   G1 (Q2)  a document may leave `quarantined` or `archived` for an available status only if NO version of it has an
--            unsafe (infected / suspicious) effective verdict. One trigger covers the screening release route, D9.3
--            `document_unarchive` and any future writer. The versions are read FOR SHARE, which conflicts with the
--            verdict writer's FOR UPDATE, so a verdict being recorded cannot race the release.
--   G2 (W2)  a document stored while awaiting a verdict (metadata.screening.malware_hold = 'awaiting_verdict') may become
--            available only when its CURRENT version's effective verdict is `clean`.
--   G3 (N8)  scan attempts are counted per version; the counter is service-role only and never decides a verdict itself.
--   G4 (Q1)  the verdict writer's quarantine predicate compares status in lower case, like the other document functions.
--   G5 (W3)  validate_communication_message_attachment_org(): search_path gains pg_temp; EXECUTE is revoked from PUBLIC,
--            anon and authenticated (Supabase grants the latter two directly). Its body is unchanged.

-- G4 (Q1). Identical to 20261219090000 except the one predicate line.
CREATE OR REPLACE FUNCTION public.record_document_malware_verdict(
    p_org_id uuid,
    p_version_id uuid,
    p_checksum_sha256 text,
    p_verdict text,
    p_engine text,
    p_engine_version text,
    p_signature_version text,
    p_signature_released_at timestamptz,
    p_scanned_at timestamptz,
    p_provider_reference text,
    p_audit_event_id uuid,
    p_idempotency_key text
)
RETURNS TABLE (verdict_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
    -- B2: written by the function, never taken from the caller. An audit label, not a database-enforced identity.
    c_recorded_by constant jsonb := '{"actor_kind":"system","actor_process":"malware_scan_worker"}'::jsonb;
    v_version record;
    v_row public.document_malware_verdicts%ROWTYPE;
    v_id uuid;
BEGIN
    IF p_org_id IS NULL OR p_version_id IS NULL OR p_audit_event_id IS NULL OR p_idempotency_key IS NULL OR p_scanned_at IS NULL THEN
        RAISE EXCEPTION 'record_document_malware_verdict: org, version, scan time, audit event and idempotency key are required'
            USING ERRCODE = '22023';
    END IF;
    IF p_verdict IS NULL OR p_verdict NOT IN ('clean', 'infected', 'suspicious', 'failed') THEN
        RAISE EXCEPTION 'record_document_malware_verdict: unknown verdict' USING ERRCODE = '22023';
    END IF;
    IF p_scanned_at > now() + interval '5 minutes' THEN
        RAISE EXCEPTION 'record_document_malware_verdict: scan time is in the future' USING ERRCODE = '22023';
    END IF;

    -- I1 / I2: the version must exist in THIS organization and carry exactly these bytes.
    -- The row lock serializes every writer of this version, so `seq` is assigned without a race (D-N1).
    SELECT id, org_id, document_id, checksum_sha256, created_at INTO v_version
      FROM public.document_versions WHERE id = p_version_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'record_document_malware_verdict: version not found' USING ERRCODE = 'P0002';
    END IF;
    -- R4: bytes cannot be scanned before their version existed (5 minutes of clock skew allowed).
    IF p_scanned_at < v_version.created_at - interval '5 minutes' THEN
        RAISE EXCEPTION 'record_document_malware_verdict: scan time precedes the version' USING ERRCODE = '22023';
    END IF;
    IF v_version.checksum_sha256 IS NULL OR v_version.checksum_sha256 IS DISTINCT FROM p_checksum_sha256 THEN
        RAISE EXCEPTION 'record_document_malware_verdict: checksum does not match the version' USING ERRCODE = '22023';
    END IF;

    -- B4: a replay converges only on identical content (the audit event is per delivery and is not compared).
    SELECT * INTO v_row FROM public.document_malware_verdicts WHERE org_id = p_org_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_row.kind IS DISTINCT FROM 'verdict' OR v_row.version_id IS DISTINCT FROM p_version_id
           OR v_row.checksum_sha256 IS DISTINCT FROM p_checksum_sha256 OR v_row.verdict IS DISTINCT FROM p_verdict
           OR v_row.engine IS DISTINCT FROM p_engine OR v_row.engine_version IS DISTINCT FROM p_engine_version
           OR v_row.signature_version IS DISTINCT FROM p_signature_version OR v_row.scanned_at IS DISTINCT FROM p_scanned_at
           OR v_row.signature_released_at IS DISTINCT FROM p_signature_released_at
           OR v_row.provider_reference IS DISTINCT FROM p_provider_reference THEN
            RAISE EXCEPTION 'record_document_malware_verdict: idempotency_key_conflict' USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT v_row.id, false;
        RETURN;
    END IF;

    -- B3: the cited audit event is this verdict's, in this organization.
    IF NOT public.document_malware_audit_event_matches(p_audit_event_id, p_org_id, 'document_malware_verdict_recorded',
            v_version.document_id, p_version_id, jsonb_build_object('actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', p_verdict)) THEN
        RAISE EXCEPTION 'record_document_malware_verdict: audit_event_mismatch' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.document_malware_verdicts (
        seq, org_id, document_id, version_id, checksum_sha256, kind, verdict, revokes_verdict_id,
        engine, engine_version, signature_version, signature_released_at, scanned_at, provider_reference, reason,
        recorded_by, audit_event_id, idempotency_key
    ) VALUES (
        (SELECT coalesce(max(x.seq), 0) + 1 FROM public.document_malware_verdicts x WHERE x.version_id = p_version_id),
        p_org_id, v_version.document_id, p_version_id, p_checksum_sha256, 'verdict', p_verdict, NULL,
        p_engine, p_engine_version, p_signature_version, p_signature_released_at, p_scanned_at, p_provider_reference, NULL,
        c_recorded_by, p_audit_event_id, p_idempotency_key
    )
    ON CONFLICT ON CONSTRAINT uq_dmv_idempotency DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        -- A concurrent delivery won the key: identical content converges, anything else is refused (B4).
        SELECT * INTO v_row FROM public.document_malware_verdicts WHERE org_id = p_org_id AND idempotency_key = p_idempotency_key;
        IF v_row.kind IS DISTINCT FROM 'verdict' OR v_row.version_id IS DISTINCT FROM p_version_id
           OR v_row.checksum_sha256 IS DISTINCT FROM p_checksum_sha256 OR v_row.verdict IS DISTINCT FROM p_verdict
           OR v_row.engine IS DISTINCT FROM p_engine OR v_row.engine_version IS DISTINCT FROM p_engine_version
           OR v_row.signature_version IS DISTINCT FROM p_signature_version OR v_row.scanned_at IS DISTINCT FROM p_scanned_at
           OR v_row.signature_released_at IS DISTINCT FROM p_signature_released_at
           OR v_row.provider_reference IS DISTINCT FROM p_provider_reference THEN
            RAISE EXCEPTION 'record_document_malware_verdict: idempotency_key_conflict' USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT v_row.id, false;
        RETURN;
    END IF;

    -- I3: an unsafe verdict quarantines the document through the existing status (review queue, isDocumentUnavailable).
    IF p_verdict IN ('infected', 'suspicious') THEN
        -- Q1: only an AVAILABLE document is quarantined. deleted / archived / superseded / restricted are already
        -- unavailable, and overwriting them would let a later quarantine release (→ uploaded) bring one back.
        UPDATE public.documents SET status = 'quarantined'
         WHERE id = v_version.document_id AND org_id = p_org_id
           AND lower(coalesce(status, 'uploaded')) NOT IN ('deleted', 'archived', 'superseded', 'restricted', 'quarantined');
    END IF;

    RETURN QUERY SELECT v_id, true;
END
$fn$;

-- G1 / G2. The guard on every status change of a document.
CREATE OR REPLACE FUNCTION public.documents_refuse_unsafe_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF lower(coalesce(OLD.status, 'uploaded')) IN ('quarantined', 'archived')
       AND lower(coalesce(NEW.status, 'uploaded')) NOT IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
        PERFORM 1 FROM public.document_versions v WHERE v.document_id = NEW.id AND v.org_id = NEW.org_id FOR SHARE;
        IF EXISTS (
            SELECT 1
              FROM public.document_versions v
              CROSS JOIN LATERAL public.document_malware_effective_verdict(NEW.org_id, v.id) e
             WHERE v.document_id = NEW.id AND v.org_id = NEW.org_id AND e.verdict IN ('infected', 'suspicious')
        ) THEN
            RAISE EXCEPTION 'document_malware_unsafe' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.metadata #>> '{screening,malware_hold}' = 'awaiting_verdict' AND NOT EXISTS (
            SELECT 1 FROM public.document_malware_effective_verdict(NEW.org_id, NEW.current_version_id) e WHERE e.verdict = 'clean'
        ) THEN
            RAISE EXCEPTION 'document_malware_scan_pending' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_documents_refuse_unsafe_release ON public.documents;
CREATE TRIGGER trg_documents_refuse_unsafe_release BEFORE UPDATE OF status ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_refuse_unsafe_release();

-- G3 (N8). One row per version; attempts only grow.
CREATE TABLE IF NOT EXISTS public.document_malware_scan_attempts (
    version_id uuid PRIMARY KEY REFERENCES public.document_versions (id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    attempts integer NOT NULL,
    last_detail text NOT NULL,
    next_attempt_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_dmsa_attempts CHECK (attempts > 0),
    CONSTRAINT chk_dmsa_detail CHECK (length(btrim(last_detail)) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_dmsa_due ON public.document_malware_scan_attempts (org_id, next_attempt_at);
ALTER TABLE public.document_malware_scan_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_malware_scan_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_malware_scan_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.document_malware_scan_attempts FROM service_role;
GRANT SELECT ON public.document_malware_scan_attempts TO service_role;

-- Records one deferred attempt for a version of this organization and returns the new count. Backoff doubles from
-- p_base_seconds, capped at p_max_seconds. The caller decides what the count means (a terminal `failed` at its cap).
CREATE OR REPLACE FUNCTION public.note_document_malware_scan_attempt(
    p_org_id uuid,
    p_version_id uuid,
    p_detail text,
    p_base_seconds integer,
    p_max_seconds integer
)
RETURNS TABLE (attempts integer, next_attempt_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
    v_attempts integer;
BEGIN
    IF p_org_id IS NULL OR p_version_id IS NULL OR p_base_seconds IS NULL OR p_max_seconds IS NULL
       OR p_base_seconds < 1 OR p_max_seconds < p_base_seconds THEN
        RAISE EXCEPTION 'note_document_malware_scan_attempt: invalid arguments' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_versions WHERE id = p_version_id AND org_id = p_org_id) THEN
        RAISE EXCEPTION 'note_document_malware_scan_attempt: version not found' USING ERRCODE = 'P0002';
    END IF;
    -- First attempt inserts; a later one updates under the row lock (two statements, so each write names its table).
    INSERT INTO public.document_malware_scan_attempts (version_id, org_id, attempts, last_detail, next_attempt_at)
    VALUES (p_version_id, p_org_id, 1, left(coalesce(nullif(btrim(p_detail), ''), 'unspecified'), 120), now() + make_interval(secs => p_base_seconds))
    ON CONFLICT (version_id) DO NOTHING
    RETURNING attempts INTO v_attempts;
    IF v_attempts IS NULL THEN
        UPDATE public.document_malware_scan_attempts AS a
           SET attempts = a.attempts + 1,
               last_detail = left(coalesce(nullif(btrim(p_detail), ''), 'unspecified'), 120),
               next_attempt_at = now() + make_interval(secs => least(p_max_seconds::bigint, p_base_seconds::bigint * (2::bigint ^ least(a.attempts, 30))::bigint)),
               updated_at = now()
         WHERE a.version_id = p_version_id AND a.org_id = p_org_id
        RETURNING a.attempts INTO v_attempts;
    END IF;
    IF v_attempts IS NULL THEN
        RAISE EXCEPTION 'note_document_malware_scan_attempt: version belongs to another organization' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT a.attempts, a.next_attempt_at FROM public.document_malware_scan_attempts a WHERE a.version_id = p_version_id;
END
$fn$;

-- G5 (W3). Identical to 20261218090000 except the search_path line; then its grants.
CREATE OR REPLACE FUNCTION public.validate_communication_message_attachment_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.communication_messages m WHERE m.id = NEW.message_id AND m.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: message % is not in org %', NEW.message_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id AND d.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: document % is not in org %', NEW.document_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.validate_communication_message_attachment_org() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.documents_refuse_unsafe_release() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer) TO service_role;

-- Self-check: the configuration this file promises is the configuration in force.
DO $check$
DECLARE
    v_conf text[];
BEGIN
    IF has_function_privilege('anon', 'public.validate_communication_message_attachment_org()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_communication_message_attachment_org()', 'EXECUTE') THEN
        RAISE EXCEPTION 'W3: a client role can still execute validate_communication_message_attachment_org()';
    END IF;
    SELECT proconfig INTO v_conf FROM pg_proc WHERE oid = 'public.validate_communication_message_attachment_org()'::regprocedure;
    IF NOT ('search_path=public, pg_temp' = ANY (coalesce(v_conf, '{}'))) THEN
        RAISE EXCEPTION 'W3: search_path is %', v_conf;
    END IF;
    IF has_function_privilege('anon', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.documents_refuse_unsafe_release()', 'EXECUTE') THEN
        RAISE EXCEPTION 'G1/G3: a client role can execute a new function';
    END IF;
    IF has_table_privilege('authenticated', 'public.document_malware_scan_attempts', 'SELECT')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'UPDATE')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'DELETE') THEN
        RAISE EXCEPTION 'G3: scan attempts are writable or readable outside the function';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_refuse_unsafe_release' AND tgrelid = 'public.documents'::regclass) THEN
        RAISE EXCEPTION 'G1: release guard trigger missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.record_document_malware_verdict(uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text, uuid, text)'::regprocedure
                     AND prosrc LIKE '%lower(coalesce(status, ''uploaded'')) NOT IN%') THEN
        RAISE EXCEPTION 'G4: quarantine predicate is not lower-cased';
    END IF;
END
$check$;

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
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.document_malware_scan_attempts FROM service_role;
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
    INSERT INTO public.document_malware_scan_attempts AS a (version_id, org_id, attempts, last_detail, next_attempt_at)
    VALUES (p_version_id, p_org_id, 1, left(coalesce(nullif(btrim(p_detail), ''), 'unspecified'), 120), now() + make_interval(secs => p_base_seconds))
    ON CONFLICT (version_id) DO UPDATE
       SET attempts = a.attempts + 1,
           last_detail = EXCLUDED.last_detail,
           next_attempt_at = now() + make_interval(secs => least(p_max_seconds::bigint, p_base_seconds::bigint * (2::bigint ^ least(a.attempts, 30))::bigint)),
           updated_at = now()
     WHERE a.org_id = p_org_id
    RETURNING a.attempts INTO v_attempts;
    IF v_attempts IS NULL THEN
        RAISE EXCEPTION 'note_document_malware_scan_attempt: version belongs to another organization' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT a.attempts, a.next_attempt_at FROM public.document_malware_scan_attempts a WHERE a.version_id = p_version_id;
END
$fn$;

-- G5 (W3). Body unchanged; only its configuration and grants.
ALTER FUNCTION public.validate_communication_message_attachment_org() SET search_path = public, pg_temp;
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
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'UPDATE') THEN
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

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY INVARIANT (D10 activation gates). Everything ABOVE this banner is the pending migration
-- certification/documents-v1/pending-migrations/20261220090000_documents_d10_activation_gates.sql, byte for byte (it contains no GRANT
-- EXECUTE, so no substitution). Everything BELOW is certification/invariants/documents-d10-activation-gates.sql, byte for
-- byte. Both are locked by web/tests/documents/preapplyInvariantParity.test.ts. It runs inside the executor's transaction,
-- so the trigger, table and functions exist only for these assertions and are discarded with them: nothing is applied.
-- Documents D10 activation gates — rollback-only invariant for migration 20261220090000 (G1 Q2 release guard incl. archive
-- restore, G2 W2 scan hold, G3 N8 scan attempts, G4 Q1 lower-case predicate, G5 W3 WS11 trigger function). For
-- database.run_rollback_invariant_test against an isolated certification environment (certenv-*). Its pre-apply twin
-- (documents-d10-activation-gates-preapply.sql) runs the pending migration first, inside the same discarded transaction.
-- The executor owns the transaction and always discards it. Any failed invariant RAISEs. Every refusal has a positive
-- control: the same change with only the defect removed succeeds, so a refusal cannot pass by broken setup.
DO $$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    actor uuid := gen_random_uuid();
    sha text := repeat('d', 64);
    t0 timestamptz := now() - interval '1 minute';
    sig timestamptz := now() - interval '2 hours';
    d_bad uuid; v_bad uuid;
    d_ok uuid;
    d_arch uuid; v_arch uuid;
    d_arch_ok uuid;
    d_hold uuid; v_hold uuid;
    d_up uuid; v_up uuid;
    d_cap uuid; v_cap uuid;
    d_res uuid; v_res uuid;
    ev uuid;
    r record;
    n1 integer; n2 integer; n3 integer;
    at1 timestamptz; at2 timestamptz; at3 timestamptz;
    refused boolean;
    msg text;
    passed integer := 0;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (o1, 'ZZ d10 gates A', 'zz-d10g-a-' || left(o1::text, 8)),
                                                    (o2, 'ZZ d10 gates B', 'zz-d10g-b-' || left(o2::text, 8));
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g bad', 'b.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-bad.pdf', 'uploaded') RETURNING id INTO d_bad;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g ok', 'o.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-ok.pdf', 'quarantined') RETURNING id INTO d_ok;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g arch', 'a.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-arch.pdf', 'Archived',
            jsonb_build_object('archive', jsonb_build_object('previous_status', 'uploaded'))) RETURNING id INTO d_arch;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g arch ok', 'a2.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-arch-ok.pdf', 'archived',
            jsonb_build_object('archive', jsonb_build_object('previous_status', 'uploaded'))) RETURNING id INTO d_arch_ok;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g hold', 'h.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-hold.pdf', 'quarantined',
            jsonb_build_object('screening', jsonb_build_object('malware_hold', 'awaiting_verdict', 'structural_status', 'uploaded'))) RETURNING id INTO d_hold;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g up', 'u.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-up.pdf', 'uploaded') RETURNING id INTO d_up;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g cap', 'c.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-cap.pdf', 'uploaded') RETURNING id INTO d_cap;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g res', 'r.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-res.pdf', 'restricted') RETURNING id INTO d_res;
    SELECT current_version_id INTO v_bad FROM public.documents WHERE id = d_bad;
    SELECT current_version_id INTO v_arch FROM public.documents WHERE id = d_arch;
    SELECT current_version_id INTO v_hold FROM public.documents WHERE id = d_hold;
    SELECT current_version_id INTO v_up FROM public.documents WHERE id = d_up;
    SELECT current_version_id INTO v_cap FROM public.documents WHERE id = d_cap;
    SELECT current_version_id INTO v_res FROM public.documents WHERE id = d_res;
    IF v_bad IS NULL OR v_arch IS NULL OR v_hold IS NULL OR v_up IS NULL OR v_cap IS NULL OR v_res IS NULL THEN
        RAISE EXCEPTION 'SETUP FAILED: D2 trigger wrote no version';
    END IF;

    -- CASE 1 (G4, Q1): an unsafe verdict leaves a capitalised `Archived` and a `restricted` document as they are; it still
    -- quarantines an uploaded one (positive control).
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_arch,
            jsonb_build_object('version_id', v_arch::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_arch, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-arch-infected');
    IF (SELECT status FROM public.documents WHERE id = d_arch) <> 'Archived' THEN RAISE EXCEPTION 'CASE 1 FAILED: a capitalised Archived document was quarantined'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_res,
            jsonb_build_object('version_id', v_res::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_res, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-res-infected');
    IF (SELECT status FROM public.documents WHERE id = d_res) <> 'restricted' THEN RAISE EXCEPTION 'CASE 1 FAILED: a restricted document was quarantined'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_bad,
            jsonb_build_object('version_id', v_bad::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_bad, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-bad-infected');
    IF (SELECT status FROM public.documents WHERE id = d_bad) <> 'quarantined' THEN RAISE EXCEPTION 'CASE 1 FAILED: an uploaded document was not quarantined'; END IF;
    passed := passed + 1;

    -- CASE 2 (G1, Q2): a quarantined document with an infected verdict cannot be released to an available status.
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_bad;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 2 FAILED: unsafe release (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT status FROM public.documents WHERE id = d_bad) <> 'quarantined' THEN RAISE EXCEPTION 'CASE 2 FAILED: status changed'; END IF;
    -- Moves that are not releases stay allowed: quarantined → deleted.
    UPDATE public.documents SET status = 'deleted' WHERE id = d_bad;
    UPDATE public.documents SET status = 'quarantined' WHERE id = d_bad;
    passed := passed + 1;

    -- CASE 3 (G1 positive control): a quarantined document with no verdict is released.
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_ok;
    IF (SELECT status FROM public.documents WHERE id = d_ok) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 3 FAILED: a verdict-free release was refused'; END IF;
    passed := passed + 1;

    -- CASE 4 (G1, Q2 + D9.3): document_unarchive cannot restore an archived document whose version is infected.
    msg := NULL;
    BEGIN PERFORM public.document_unarchive(o1, d_arch, 'restore after review', actor, NULL);
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 4 FAILED: unsafe unarchive (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT status FROM public.documents WHERE id = d_arch) <> 'Archived' THEN RAISE EXCEPTION 'CASE 4 FAILED: status changed'; END IF;
    passed := passed + 1;

    -- CASE 5 (G1 positive control): an archived document with no verdict is restored to its previous status.
    PERFORM public.document_unarchive(o1, d_arch_ok, 'restore after review', actor, NULL);
    IF (SELECT status FROM public.documents WHERE id = d_arch_ok) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 5 FAILED: a verdict-free unarchive was refused'; END IF;
    passed := passed + 1;

    -- CASE 6 (G2, W2): a scan-held document is not released without a verdict, nor on a `failed` verdict.
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_scan_pending%' THEN RAISE EXCEPTION 'CASE 6 FAILED: pending release (%)', coalesce(msg, 'accepted'); END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_hold,
            jsonb_build_object('version_id', v_hold::text, 'verdict', 'failed', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_hold, sha, 'failed', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-hold-failed');
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_scan_pending%' THEN RAISE EXCEPTION 'CASE 6 FAILED: release on failed (%)', coalesce(msg, 'accepted'); END IF;
    passed := passed + 1;

    -- CASE 7 (G2 positive control): a clean verdict on the current version releases the scan-held document.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_hold,
            jsonb_build_object('version_id', v_hold::text, 'verdict', 'clean', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_hold, sha, 'clean', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-hold-clean');
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    IF (SELECT status FROM public.documents WHERE id = d_hold) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 7 FAILED: clean release refused'; END IF;
    passed := passed + 1;

    -- CASE 8 (G3, N8): attempts count up with growing backoff; arguments and organization are checked.
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'object_missing', 60, 3600); n1 := r.attempts; at1 := r.next_attempt_at;
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'object_missing', 60, 3600); n2 := r.attempts; at2 := r.next_attempt_at;
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'clamd_timeout', 60, 3600); n3 := r.attempts; at3 := r.next_attempt_at;
    IF n1 <> 1 OR n2 <> 2 OR n3 <> 3 THEN RAISE EXCEPTION 'CASE 8 FAILED: attempts % % %', n1, n2, n3; END IF;
    IF NOT (at1 < at2 AND at2 < at3) THEN RAISE EXCEPTION 'CASE 8 FAILED: backoff does not grow (% % %)', at1, at2, at3; END IF;
    IF (SELECT last_detail FROM public.document_malware_scan_attempts WHERE version_id = v_cap) <> 'clamd_timeout' THEN RAISE EXCEPTION 'CASE 8 FAILED: detail'; END IF;
    refused := false;
    BEGIN PERFORM public.note_document_malware_scan_attempt(o2, v_cap, 'x', 60, 3600); EXCEPTION WHEN OTHERS THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'CASE 8 FAILED: another organization counted an attempt'; END IF;
    refused := false;
    BEGIN PERFORM public.note_document_malware_scan_attempt(o1, v_cap, 'x', 0, 3600); EXCEPTION WHEN OTHERS THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'CASE 8 FAILED: a zero backoff accepted'; END IF;
    -- The counter decides nothing: the version is still pending.
    IF EXISTS (SELECT 1 FROM public.document_malware_effective_verdict(o1, v_cap)) THEN RAISE EXCEPTION 'CASE 8 FAILED: an attempt produced a verdict'; END IF;
    passed := passed + 1;

    -- CASE 9 (G3, G5, grants): clients cannot reach the new functions or the counter; service_role writes the counter
    -- only through its function; the WS11 trigger function has pg_temp and no client EXECUTE.
    IF has_function_privilege('anon', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: note_document_malware_scan_attempt grants';
    END IF;
    IF has_table_privilege('authenticated', 'public.document_malware_scan_attempts', 'SELECT')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'INSERT')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'SELECT') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: document_malware_scan_attempts grants';
    END IF;
    IF has_function_privilege('anon', 'public.validate_communication_message_attachment_org()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_communication_message_attachment_org()', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: W3 client EXECUTE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.validate_communication_message_attachment_org()'::regprocedure
                     AND 'search_path=public, pg_temp' = ANY (coalesce(proconfig, '{}'))) THEN
        RAISE EXCEPTION 'CASE 9 FAILED: W3 search_path';
    END IF;
    IF has_function_privilege('authenticated', 'public.documents_refuse_unsafe_release()', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: release guard executable by a client';
    END IF;
    passed := passed + 1;

    -- CASE 10 (G1 scope): an ordinary edit of an available document is untouched by the guard (no verdict reads).
    UPDATE public.documents SET title = 'g up renamed' WHERE id = d_up;
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_up;
    IF (SELECT title FROM public.documents WHERE id = d_up) <> 'g up renamed' THEN RAISE EXCEPTION 'CASE 10 FAILED'; END IF;
    passed := passed + 1;

    -- Seed for CASE 11 (run below as service_role): a thread and inbound message in o1, a document in o1 and one in o2.
    INSERT INTO public.communication_threads (id, org_id, primary_entity_type, primary_entity_id, channel, recipient_key) VALUES
        ('d10a0000-0000-4000-8000-0000000000a1', o1, 'person', 'd10a0000-0000-4000-8000-0000000000b1', 'email', 'd10g-parent@example.invalid');
    INSERT INTO public.communication_messages (id, org_id, thread_id, channel, direction, status, provider, provider_message_id, metadata) VALUES
        ('d10a0000-0000-4000-8000-0000000000c1', o1, 'd10a0000-0000-4000-8000-0000000000a1', 'email', 'inbound', 'received', 'resend', 'd10g-resend-1', '{}');
    INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status) VALUES
        ('d10a0000-0000-4000-8000-0000000000d1', o1, 'g link', 'l.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-link.pdf', 'quarantined'),
        ('d10a0000-0000-4000-8000-0000000000d2', o2, 'g foreign', 'f.pdf', 'application/pdf', 10, sha, 'org_documents', o2::text || '/pos_intake/g-foreign.pdf', 'uploaded');
    PERFORM set_config('d10g.org', o1::text, true);
    PERFORM set_config('d10g.passed', passed::text, true);
END $$;
SET LOCAL ROLE service_role;
DO $system_writer$
DECLARE
    o1 uuid := current_setting('d10g.org')::uuid;
    passed integer := current_setting('d10g.passed')::integer;
    msg text;
BEGIN
    IF current_user <> 'service_role' THEN RAISE EXCEPTION 'CASE 11 SETUP: running as %, not service_role', current_user; END IF;
    -- CASE 11 (G5 positive control): after the W3 revoke the WS11 tenant trigger still fires for the system writer — a
    -- same-organization link is written, a document of another organization is refused.
    INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition)
    VALUES (o1, 'd10a0000-0000-4000-8000-0000000000c1', 'd10a0000-0000-4000-8000-0000000000d1', 'att-1', 'attachment');
    msg := NULL;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition)
        VALUES (o1, 'd10a0000-0000-4000-8000-0000000000c1', 'd10a0000-0000-4000-8000-0000000000d2', 'att-2', 'attachment');
    EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'communication_message_attachments: document %' THEN
        RAISE EXCEPTION 'CASE 11 FAILED: cross-organization link (%)', coalesce(msg, 'accepted');
    END IF;
    passed := passed + 1;
    RAISE NOTICE 'PASS documents d10 activation gates: lower-case quarantine predicate incl. restricted, unsafe release and unarchive refused, scan hold needs clean, bounded attempts, grants, W3 with its trigger still enforcing';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$system_writer$;

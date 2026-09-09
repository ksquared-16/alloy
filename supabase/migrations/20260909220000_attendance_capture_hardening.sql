-- =============================================================================
-- Attendance Capture Hardening — durable idempotency + authoritative provenance
-- =============================================================================
-- Thread 2. The fact layer is not rebuilt: the table, its append-only trigger,
-- its correction lineage and its RLS all stand. What changes is what a PRODUCER
-- may assert and what a REPLAY may create.
--
-- 1) IDEMPOTENCY. Reuses the established Alloy contract — a nullable
--    `idempotency_key` with a PARTIAL unique index on (org_id, idempotency_key)
--    plus a `payload_fingerprint` so a retry carrying the same key but different
--    content is a conflict rather than a silent divergence. Same shape as
--    consumption_events, operational_expectations (Wave B) and payments.
--
--    One deliberate improvement on that precedent: `author_operational_expectation`
--    does SELECT … FOR UPDATE and then INSERT, which does not lock a row that does
--    not exist yet — two concurrent first-writes race and one surfaces a raw
--    23505. The RPC below inserts FIRST with ON CONFLICT DO NOTHING and re-reads
--    on conflict, so concurrent duplicates converge on one fact instead of one
--    fact and one error.
--
-- 2) PROVENANCE. `source_type` gains the channels future producers need, and
--    `correlation_id` ties a fact back to the command invocation that authored
--    it. Trust is established by the SERVER: the route and the registered action
--    derive actor/source from the authenticated principal and the invocation
--    origin. Nothing here lets a request body assert them — the vocabulary being
--    representable is not the same as a channel being implemented.
--
-- Doctrine: docs/platform/modules/attendance-system.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Idempotency + correlation substrate (additive; every existing row is NULL).
-- -----------------------------------------------------------------------------
ALTER TABLE public.child_attendance_events
    ADD COLUMN IF NOT EXISTS idempotency_key text,
    ADD COLUMN IF NOT EXISTS payload_fingerprint text,
    ADD COLUMN IF NOT EXISTS correlation_id text;

COMMENT ON COLUMN public.child_attendance_events.idempotency_key IS
    'Producer-supplied ingestion identity for retry safety. Unique per (org_id, idempotency_key) when present; NULL on any fact authored without one. For an integration this is the external event id — the same replayed event must carry the same key.';
COMMENT ON COLUMN public.child_attendance_events.payload_fingerprint IS
    'Fingerprint of the accepted fact payload. A retry with the same key but a different fingerprint is an idempotency conflict, never a silent second fact.';
COMMENT ON COLUMN public.child_attendance_events.correlation_id IS
    'Correlation of the command invocation that authored this fact, for audit trace across surfaces. Never an identity or an authorization input.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_attendance_events_idempotency_key_nonempty') THEN
        ALTER TABLE public.child_attendance_events
            ADD CONSTRAINT child_attendance_events_idempotency_key_nonempty
            CHECK (idempotency_key IS NULL OR char_length(btrim(idempotency_key)) > 0);
    END IF;
END$$;

-- Partial: dedupe only where a key is present. Pre-existing facts are NULL and
-- unaffected, and a fact authored without a key is never deduped against another.
CREATE UNIQUE INDEX IF NOT EXISTS uq_child_attendance_events_org_idempotency
    ON public.child_attendance_events (org_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Channel vocabulary for future producers.
-- -----------------------------------------------------------------------------
-- Representable ≠ implemented. Kiosk, mobile, integrations and door access are
-- Threads 5/6; this only means those producers will not need a schema change to
-- record the truth about where a fact came from.
ALTER TABLE public.child_attendance_events
    DROP CONSTRAINT IF EXISTS child_attendance_events_source_type_check;
ALTER TABLE public.child_attendance_events
    ADD CONSTRAINT child_attendance_events_source_type_check
    CHECK (source_type = ANY (ARRAY[
        'operator_action'::text,
        'staff_workspace'::text,
        'parent_portal'::text,
        'processing_import'::text,
        'system'::text,
        -- Thread 2 additions (channels, not products):
        'kiosk'::text,
        'integration_api'::text,
        'door_access'::text,
        'mobile_app'::text
    ]));

CREATE INDEX IF NOT EXISTS idx_child_attendance_events_org_source
    ON public.child_attendance_events (org_id, source_type, service_date);

-- -----------------------------------------------------------------------------
-- 3) The one authoritative, race-free ingestion RPC.
-- -----------------------------------------------------------------------------
-- Every producer converges here. The caller has already resolved the subject and
-- the provenance server-side; this owns atomic idempotent insertion and nothing
-- else. It deliberately does NOT re-implement the fact invariants — the existing
-- BEFORE INSERT consistency trigger and the CHECK constraints still run, and the
-- append-only trigger still refuses UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.record_child_attendance_event(
    p_org_id uuid,
    p_fact jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_key         text := nullif(btrim(coalesce(p_fact->>'idempotency_key', '')), '');
    v_fingerprint text := nullif(p_fact->>'payload_fingerprint', '');
    v_existing    public.child_attendance_events%ROWTYPE;
    v_new         public.child_attendance_events%ROWTYPE;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'attendance_missing_org' USING ERRCODE = '22023';
    END IF;

    -- Insert FIRST. A concurrent duplicate loses the ON CONFLICT race and falls
    -- through to the re-read below, so both callers return the same fact instead
    -- of one fact and one unique-violation.
    INSERT INTO public.child_attendance_events (
        org_id, enrollment_agreement_id, customer_member_id, site_location_id,
        event_kind, entry_type, corrects_event_id,
        event_at, service_date,
        room_location_id, from_room_location_id, to_room_location_id,
        actor_type, actor_user_id, actor_person_id, actor_label,
        source_type, source_key,
        reason_key, note, metadata, created_by,
        idempotency_key, payload_fingerprint, correlation_id
    ) VALUES (
        p_org_id,
        (p_fact->>'enrollment_agreement_id')::uuid,
        (p_fact->>'customer_member_id')::uuid,
        (p_fact->>'site_location_id')::uuid,
        p_fact->>'event_kind',
        coalesce(p_fact->>'entry_type', 'original'),
        nullif(p_fact->>'corrects_event_id', '')::uuid,
        (p_fact->>'event_at')::timestamptz,
        (p_fact->>'service_date')::date,
        nullif(p_fact->>'room_location_id', '')::uuid,
        nullif(p_fact->>'from_room_location_id', '')::uuid,
        nullif(p_fact->>'to_room_location_id', '')::uuid,
        p_fact->>'actor_type',
        nullif(p_fact->>'actor_user_id', '')::uuid,
        nullif(p_fact->>'actor_person_id', '')::uuid,
        nullif(p_fact->>'actor_label', ''),
        coalesce(p_fact->>'source_type', 'operator_action'),
        coalesce(nullif(p_fact->>'source_key', ''), 'operator_action'),
        nullif(p_fact->>'reason_key', ''),
        nullif(p_fact->>'note', ''),
        coalesce(p_fact->'metadata', '{}'::jsonb),
        nullif(p_fact->>'created_by', '')::uuid,
        v_key, v_fingerprint, nullif(p_fact->>'correlation_id', '')
    )
    ON CONFLICT (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_new;

    IF v_new.id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', false, 'event', to_jsonb(v_new));
    END IF;

    -- Lost the race, or a straightforward replay. Re-read the winning fact.
    SELECT * INTO v_existing
    FROM public.child_attendance_events
    WHERE org_id = p_org_id AND idempotency_key = v_key;

    IF NOT FOUND THEN
        -- No key was supplied, so there was nothing to conflict on and the insert
        -- should have produced a row. Surfacing rather than inventing a result.
        RAISE EXCEPTION 'attendance_insert_produced_no_row' USING ERRCODE = '23514';
    END IF;

    -- Same key, different content: the producer changed its mind under a reused
    -- key. Refuse rather than silently returning a fact that is not what was
    -- asked for.
    IF v_fingerprint IS NOT NULL
       AND v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'attendance_idempotency_conflict' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'event', to_jsonb(v_existing));
END;
$function$;

COMMENT ON FUNCTION public.record_child_attendance_event(uuid, jsonb) IS
    'The single authoritative attendance ingestion entry point. Atomic and race-free: inserts with ON CONFLICT DO NOTHING on the (org_id, idempotency_key) partial unique index and re-reads on conflict, so sequential AND concurrent replays converge on one fact. Same key with a different payload_fingerprint raises attendance_idempotency_conflict. Callers resolve subject + provenance server-side before calling; fact invariants remain owned by the table triggers.';

REVOKE ALL ON FUNCTION public.record_child_attendance_event(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_child_attendance_event(uuid, jsonb) TO service_role;

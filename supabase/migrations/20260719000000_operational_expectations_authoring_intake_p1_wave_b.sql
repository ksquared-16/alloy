-- =============================================================================
-- Operational Expectations — P1 · Wave B: Authoring Intake (idempotency + atomic
-- Authoring Act)
-- =============================================================================
-- ADDITIVE, backward-compatible over Wave A. With `oe.ledger.author` OFF nothing
-- calls this and product behavior is unchanged. It adds:
--   1. idempotency substrate on operational_expectations (idempotency_key +
--      payload_fingerprint + a PARTIAL unique index) — retry-safe intake;
--   2. author_operational_expectation(...) — the canonical SECURITY DEFINER RPC
--      that inserts the authored ledger row AND the one Authoring Act outbox event
--      (mutation_events) in ONE transaction (no event without the committed row),
--      following the house atomic-RPC/outbox convention (execute_lead_status_
--      mutation, reconcile_consumption_correction).
--
-- SCOPE (Wave B — authoring intake only): admits the five verbs, is idempotent,
-- emits one Authoring Act. It does NOT resolve Authority→Standing (Wave C) — rows
-- land at provisional standing (proposed | model), never binding. It does NOT
-- implement revision/correction PROPAGATION (Wave D), evaluation, judgment, gaps,
-- or effectors. It never mutates a Wave A row (append-only) and never drops data.
--
-- Grammar is validated in TypeScript BEFORE this RPC; the Wave A CHECK constraints
-- + lineage trigger are the final defense-in-depth (modality closure, verb→
-- transition map, no-self-reference, cross-org predecessor, server-assigned
-- authored_at).
-- =============================================================================

-- 1. Idempotency substrate (additive) ----------------------------------------
ALTER TABLE public.operational_expectations
    ADD COLUMN IF NOT EXISTS idempotency_key text,
    ADD COLUMN IF NOT EXISTS payload_fingerprint text;

COMMENT ON COLUMN public.operational_expectations.idempotency_key IS
    'Intake identity for retry-safety (Wave B). Unique per (org_id, idempotency_key) when present; NULL for any pre-intake row.';
COMMENT ON COLUMN public.operational_expectations.payload_fingerprint IS
    'Fingerprint of the accepted authoring payload; a retry with the same key but a different fingerprint is an idempotency conflict.';

-- Partial unique: dedupe only when a key is present (existing Wave A rows are NULL
-- and unaffected). Mirrors processing_case_sources / consumption_events.
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_expectations_org_idempotency
    ON public.operational_expectations (org_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 2. Canonical atomic authoring RPC ------------------------------------------
-- Inserts the authored row + the Authoring Act outbox event in one transaction.
-- Grammar is pre-validated in TS; this enforces idempotency + atomicity and relies
-- on the Wave A constraints/trigger as the final guard.
CREATE OR REPLACE FUNCTION public.author_operational_expectation(
    p_org_id          uuid,
    p_actor_user_id   uuid,
    p_act             jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_key           text := nullif(p_act->>'idempotency_key', '');
    v_fingerprint   text := p_act->>'payload_fingerprint';
    v_existing      public.operational_expectations%ROWTYPE;
    v_new           public.operational_expectations%ROWTYPE;
    v_mutation_id   uuid := gen_random_uuid();
    v_event_id      uuid;
    v_verb          text := p_act->>'verb';
    v_modality      text := p_act->>'modality';
    v_standing      text := p_act->>'standing';
    v_transition    text := nullif(p_act->>'transition_type', '');
    v_supersedes    uuid := nullif(p_act->>'supersedes_expectation_id', '')::uuid;
    v_valid_from    timestamptz := (p_act->>'valid_from')::timestamptz;
BEGIN
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'oe_missing_idempotency_key' USING ERRCODE = '22023';
    END IF;

    -- Idempotency: same key → return the existing act; different payload → conflict.
    SELECT * INTO v_existing
    FROM public.operational_expectations
    WHERE org_id = p_org_id AND idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'oe_idempotency_conflict' USING ERRCODE = '23505';
        END IF;
        -- Return the existing Authoring Act (idempotent replay; no new row).
        SELECT mutation_id INTO v_event_id
        FROM public.mutation_events
        WHERE org_id = p_org_id
          AND domain = 'operational_expectations'
          AND subject_id = v_existing.id
          AND command_key = 'author_expectation'
        ORDER BY committed_at ASC
        LIMIT 1;

        RETURN jsonb_build_object(
            'ok', true,
            'idempotent', true,
            'expectation_id', v_existing.id,
            'authoring_act_event_id', COALESCE(v_event_id, v_existing.id),
            'verb', v_existing.verb,
            'modality', v_existing.modality,
            'transition_type', v_existing.transition_type,
            'standing', v_existing.standing,
            'supersedes_expectation_id', v_existing.supersedes_expectation_id,
            'lineage_root_id', v_existing.lineage_root_id,
            'authored_at', v_existing.authored_at
        );
    END IF;

    -- Insert the authored row. authored_at + lineage_root_id are set by the Wave A
    -- BEFORE INSERT trigger (server-assigned recorded time; derived lineage root).
    INSERT INTO public.operational_expectations (
        org_id,
        authority_key, author_class,
        modality, subject_kind, subject_ref, condition, temporal_frame, beneficiary,
        verb, transition_type, supersedes_expectation_id,
        standing, footprint,
        valid_from, valid_to, config_version_ref,
        authored_by_user_id, authored_by_label,
        idempotency_key, payload_fingerprint
    ) VALUES (
        p_org_id,
        p_act->>'authority_key', p_act->>'author_class',
        v_modality, p_act->>'subject_kind', p_act->'subject_ref', p_act->'condition',
        p_act->'temporal_frame',
        CASE WHEN p_act->'beneficiary' = 'null'::jsonb THEN NULL ELSE p_act->'beneficiary' END,
        v_verb, v_transition, v_supersedes,
        v_standing, COALESCE(p_act->'footprint', '{}'::jsonb),
        v_valid_from,
        nullif(p_act->>'valid_to', '')::timestamptz,
        CASE WHEN p_act->'config_version_ref' = 'null'::jsonb THEN NULL ELSE p_act->'config_version_ref' END,
        p_actor_user_id, nullif(p_act->>'authored_by_label', ''),
        v_key, v_fingerprint
    )
    RETURNING * INTO v_new;

    -- The one Authoring Act — written in the SAME transaction (atomicity: no event
    -- without the committed row). This is the canonical outbox, not a second bus.
    INSERT INTO public.mutation_events (
        org_id, mutation_id, command_key, domain,
        subject_id, subject_type,
        previous_state, new_state,
        operator_id, origin, context_payload,
        committed_at, effective_at
    ) VALUES (
        p_org_id, v_mutation_id, 'author_expectation', 'operational_expectations',
        v_new.id, 'operational_expectation',
        v_supersedes::text,
        v_verb || ':' || v_modality || ':' || v_standing,
        p_actor_user_id::text, 'api',
        jsonb_build_object(
            'expectation_id', v_new.id,
            'verb', v_verb,
            'modality', v_modality,
            'transition_type', v_transition,
            'standing', v_standing,
            'supersedes_expectation_id', v_supersedes,
            'lineage_root_id', v_new.lineage_root_id,
            'subject_kind', v_new.subject_kind,
            'valid_from', v_valid_from,
            'idempotency_key', v_key,
            'footprint', v_new.footprint
        ),
        now(), v_valid_from
    );

    RETURN jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'expectation_id', v_new.id,
        'authoring_act_event_id', v_mutation_id,
        'verb', v_new.verb,
        'modality', v_new.modality,
        'transition_type', v_new.transition_type,
        'standing', v_new.standing,
        'supersedes_expectation_id', v_new.supersedes_expectation_id,
        'lineage_root_id', v_new.lineage_root_id,
        'authored_at', v_new.authored_at
    );
END;
$function$;

COMMENT ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) IS
    'P1 Wave B canonical authoring intake RPC. Idempotent per (org_id, idempotency_key); inserts the authored operational_expectations row and the one Authoring Act (mutation_events, domain=operational_expectations, command_key=author_expectation) in one transaction. Grammar is pre-validated in TS; Wave A constraints/trigger are the final guard. service_role only.';

-- Infrastructure only: the intake service calls this via the service-role admin
-- client. Not a product-facing authoring surface.
REVOKE ALL ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- Rollback (documented): disable `oe.ledger.author` (env OFF) to stop all intake;
-- the authored ledger history is PRESERVED (append-only, never deleted). To fully
-- retire: DROP FUNCTION author_operational_expectation; DROP INDEX
-- uq_operational_expectations_org_idempotency; the idempotency_key/
-- payload_fingerprint columns may remain (nullable, additive). No Wave A row is
-- altered or dropped by this migration or its rollback.
-- -----------------------------------------------------------------------------

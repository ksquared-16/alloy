-- =============================================================================
-- Operational Expectations — P1 · Wave C: enforce held authority in authoring +
-- ratification (server-side, authoritative).
-- =============================================================================
-- Standing is now decided by the DATABASE from the canonical resolver, not by a
-- caller-supplied value. A caller can never force binding: the author RPC computes
-- standing from resolve_held_operational_authority; the ratify RPC requires
-- sufficient held authority. This is defense-in-depth beneath the TS intake.
-- =============================================================================

-- Authoring with self-ratification (replaces the Wave B author RPC). ----------
CREATE OR REPLACE FUNCTION public.author_operational_expectation(
    p_org_id uuid, p_actor_user_id uuid, p_act jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
    v_key text := nullif(p_act->>'idempotency_key','');
    v_fingerprint text := p_act->>'payload_fingerprint';
    v_existing public.operational_expectations%ROWTYPE;
    v_new public.operational_expectations%ROWTYPE;
    v_mutation_id uuid := gen_random_uuid();
    v_verb text := p_act->>'verb';
    v_modality text := p_act->>'modality';
    v_author_class text := p_act->>'author_class';
    v_authority_key text := p_act->>'authority_key';
    v_transition text := nullif(p_act->>'transition_type','');
    v_supersedes uuid := nullif(p_act->>'supersedes_expectation_id','')::uuid;
    v_valid_from timestamptz := (p_act->>'valid_from')::timestamptz;
    -- authority resolution inputs (server-trusted; NOT a caller standing choice)
    v_holder_id text := nullif(p_act->>'authority_holder_id','');
    v_scope_type text := COALESCE(nullif(p_act->>'authority_scope_type',''), 'organization');
    v_scope_id text := nullif(p_act->>'authority_scope_id','');
    v_standing text;
    v_assignment uuid;
    v_matched_scope text;
BEGIN
    IF v_key IS NULL THEN RAISE EXCEPTION 'oe_missing_idempotency_key' USING ERRCODE = '22023'; END IF;

    -- Compute standing AUTHORITATIVELY. predicted → model; AI → proposed; else a
    -- held-authority holder self-ratifies to binding, otherwise proposed.
    IF v_modality = 'predicted' THEN
        v_standing := 'model';
    ELSIF v_author_class = 'ai' THEN
        v_standing := 'proposed';
    ELSE
        v_assignment := public.resolve_held_operational_authority(
            p_org_id, v_author_class, COALESCE(v_holder_id, p_actor_user_id::text), v_authority_key, v_scope_type, v_scope_id, now());
        IF v_assignment IS NOT NULL THEN
            v_standing := 'binding';
            v_matched_scope := v_scope_type;
        ELSE
            v_standing := 'proposed';
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.operational_expectations (
            org_id, authority_key, author_class, modality, subject_kind, subject_ref, condition,
            temporal_frame, beneficiary, verb, transition_type, supersedes_expectation_id, standing,
            footprint, valid_from, valid_to, config_version_ref, authored_by_user_id, authored_by_label,
            idempotency_key, payload_fingerprint, authority_assignment_id, authority_matched_scope
        ) VALUES (
            p_org_id, v_authority_key, v_author_class, v_modality, p_act->>'subject_kind', p_act->'subject_ref',
            p_act->'condition', p_act->'temporal_frame',
            CASE WHEN p_act->'beneficiary' = 'null'::jsonb THEN NULL ELSE p_act->'beneficiary' END,
            v_verb, v_transition, v_supersedes, v_standing, COALESCE(p_act->'footprint','{}'::jsonb),
            v_valid_from, nullif(p_act->>'valid_to','')::timestamptz,
            CASE WHEN p_act->'config_version_ref' = 'null'::jsonb THEN NULL ELSE p_act->'config_version_ref' END,
            p_actor_user_id, nullif(p_act->>'authored_by_label',''), v_key, v_fingerprint, v_assignment, v_matched_scope
        ) RETURNING * INTO v_new;

        INSERT INTO public.mutation_events (
            org_id, mutation_id, command_key, domain, subject_id, subject_type,
            previous_state, new_state, operator_id, origin, context_payload, committed_at, effective_at
        ) VALUES (
            p_org_id, v_mutation_id, 'author_expectation', 'operational_expectations', v_new.id, 'operational_expectation',
            v_supersedes::text, v_verb || ':' || v_modality || ':' || v_standing, p_actor_user_id::text, 'api',
            jsonb_build_object('expectation_id', v_new.id, 'verb', v_verb, 'modality', v_modality,
                'transition_type', v_transition, 'standing', v_standing, 'authority_key', v_authority_key,
                'authority_assignment_id', v_assignment, 'authority_matched_scope', v_matched_scope,
                'self_ratified', (v_standing = 'binding'), 'lineage_root_id', v_new.lineage_root_id,
                'idempotency_key', v_key),
            now(), v_valid_from
        );

        RETURN jsonb_build_object('ok', true, 'disposition', 'created', 'idempotent', false,
            'expectation_id', v_new.id, 'authoring_act_event_id', v_mutation_id, 'verb', v_new.verb,
            'modality', v_new.modality, 'transition_type', v_new.transition_type, 'standing', v_new.standing,
            'self_ratified', (v_new.standing = 'binding'), 'authority_assignment_id', v_assignment,
            'supersedes_expectation_id', v_new.supersedes_expectation_id, 'lineage_root_id', v_new.lineage_root_id,
            'authored_at', v_new.authored_at);

    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing FROM public.operational_expectations WHERE org_id = p_org_id AND idempotency_key = v_key;
        IF NOT FOUND THEN RAISE; END IF;
        IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'oe_idempotency_conflict' USING ERRCODE = '23505'; END IF;
        RETURN jsonb_build_object('ok', true, 'disposition', 'existing', 'idempotent', true,
            'expectation_id', v_existing.id, 'authoring_act_event_id', v_existing.id, 'verb', v_existing.verb,
            'modality', v_existing.modality, 'transition_type', v_existing.transition_type, 'standing', v_existing.standing,
            'self_ratified', (v_existing.standing = 'binding'), 'authority_assignment_id', v_existing.authority_assignment_id,
            'supersedes_expectation_id', v_existing.supersedes_expectation_id, 'lineage_root_id', v_existing.lineage_root_id,
            'authored_at', v_existing.authored_at);
    END;
END;
$function$;

-- Ratification with authority sufficiency (replaces the C2 ratify RPC). -------
CREATE OR REPLACE FUNCTION public.ratify_operational_expectation(
    p_org_id uuid, p_actor_user_id uuid, p_ratification jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
    v_expectation_id uuid := (p_ratification->>'expectation_id')::uuid;
    v_key text := nullif(p_ratification->>'idempotency_key','');
    v_fingerprint text := p_ratification->>'payload_fingerprint';
    v_new public.operational_expectation_ratifications%ROWTYPE;
    v_existing public.operational_expectation_ratifications%ROWTYPE;
    v_mutation_id uuid := gen_random_uuid();
    v_event_id uuid;
    v_exp_authority text; v_exp_subject text; v_exp_modality text; v_exp_standing text;
    v_assignment uuid; v_scope_type text; v_scope_id text;
BEGIN
    IF v_expectation_id IS NULL THEN RAISE EXCEPTION 'oe_ratification_missing_expectation' USING ERRCODE = '22023'; END IF;

    -- Read the expectation's own authority + subject to resolve sufficiency.
    SELECT authority_key, subject_kind, modality, standing INTO v_exp_authority, v_exp_subject, v_exp_modality, v_exp_standing
    FROM public.operational_expectations WHERE id = v_expectation_id AND org_id = p_org_id;
    IF v_exp_authority IS NULL THEN RAISE EXCEPTION 'oe_ratification_expectation_not_found' USING ERRCODE = '23503'; END IF;

    -- AUTHORITY SUFFICIENCY (the ratifier is a human; AI never holds authority).
    v_scope_type := COALESCE(nullif(p_ratification->>'authority_scope_type',''), 'subject_type');
    v_scope_id := COALESCE(nullif(p_ratification->>'authority_scope_id',''), v_exp_subject);
    v_assignment := public.resolve_held_operational_authority(
        p_org_id, 'human', p_actor_user_id::text, v_exp_authority, v_scope_type, v_scope_id, now());
    IF v_assignment IS NULL THEN
        RAISE EXCEPTION 'oe_insufficient_authority' USING ERRCODE = '42501';
    END IF;

    BEGIN
        INSERT INTO public.operational_expectation_ratifications (
            org_id, expectation_id, prior_standing, new_standing, ratifier_authority_key,
            ratified_by_user_id, ratified_by_label, rationale, idempotency_key, payload_fingerprint, metadata
        ) VALUES (
            p_org_id, v_expectation_id, 'proposed', 'binding', v_exp_authority,
            p_actor_user_id, nullif(p_ratification->>'ratified_by_label',''), nullif(p_ratification->>'rationale',''),
            v_key, v_fingerprint, jsonb_build_object('authority_assignment_id', v_assignment, 'matched_scope', v_scope_type)
        ) RETURNING * INTO v_new;

        INSERT INTO public.mutation_events (
            org_id, mutation_id, command_key, domain, subject_id, subject_type,
            previous_state, new_state, operator_id, origin, context_payload, committed_at, effective_at
        ) VALUES (
            p_org_id, v_mutation_id, 'ratify_expectation', 'operational_expectations', v_expectation_id, 'operational_expectation',
            v_new.prior_standing, 'binding', p_actor_user_id::text, 'api',
            jsonb_build_object('ratification_id', v_new.id, 'expectation_id', v_expectation_id, 'authority_key', v_exp_authority,
                'authority_assignment_id', v_assignment, 'matched_scope', v_scope_type, 'prior_standing', v_new.prior_standing,
                'new_standing', 'binding', 'idempotency_key', v_key),
            now(), v_new.ratified_at
        );

        RETURN jsonb_build_object('ok', true, 'disposition', 'created', 'idempotent', false,
            'ratification_id', v_new.id, 'expectation_id', v_expectation_id, 'new_standing', 'binding',
            'authority_assignment_id', v_assignment, 'authoring_act_event_id', v_mutation_id, 'ratified_at', v_new.ratified_at);

    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing FROM public.operational_expectation_ratifications
        WHERE org_id = p_org_id AND expectation_id = v_expectation_id ORDER BY ratified_at ASC LIMIT 1;
        IF NOT FOUND THEN RAISE; END IF;
        IF v_fingerprint IS NOT NULL AND v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'oe_ratification_conflict' USING ERRCODE = '23505'; END IF;
        SELECT mutation_id INTO v_event_id FROM public.mutation_events
        WHERE org_id = p_org_id AND domain = 'operational_expectations' AND subject_id = v_expectation_id AND command_key = 'ratify_expectation'
        ORDER BY committed_at ASC LIMIT 1;
        RETURN jsonb_build_object('ok', true, 'disposition', 'existing', 'idempotent', true,
            'ratification_id', v_existing.id, 'expectation_id', v_expectation_id, 'new_standing', 'binding',
            'authority_assignment_id', (v_existing.metadata->>'authority_assignment_id'),
            'authoring_act_event_id', COALESCE(v_event_id, v_existing.id), 'ratified_at', v_existing.ratified_at);
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.author_operational_expectation(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.author_operational_expectation(uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.ratify_operational_expectation(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ratify_operational_expectation(uuid,uuid,jsonb) TO service_role;

-- Rollback (documented): disable oe.ledger.author to stop intake; authored/ratified
-- history + authority catalog/assignments are append-only and preserved. Restoring
-- the prior RPCs reverts to capability-only ratification. No data is mutated/dropped.

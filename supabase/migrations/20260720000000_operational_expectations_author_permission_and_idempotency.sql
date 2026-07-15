-- =============================================================================
-- Operational Expectations — P1 · Wave B closure: dedicated authoring capability
-- + concurrent-idempotency hardening.
-- =============================================================================
-- Two narrow corrections over the Wave B intake (20260719000000):
--   1. A DEDICATED governed capability `operational_expectations.author` (via the
--      canonical RBAC catalog + a conservative default grant to the org `admin`
--      role). Authoring operational assertions is a distinct capability from
--      editing workflows — `workflows.write` no longer authorizes it.
--   2. CREATE OR REPLACE author_operational_expectation with an insert-with-
--      conflict-catch flow so two concurrent transactions for a NEW idempotency
--      key deterministically yield ONE ledger row + ONE Authoring Act (the loser
--      reloads the winner), and a divergent-fingerprint reuse is a typed conflict.
--
-- Additive + idempotent. No Wave A/B row is altered or dropped.
-- =============================================================================

-- 1. Dedicated authoring capability (RBAC catalog) ---------------------------
INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES ('operational_expectations.author', 'operations', 'Author operational expectations', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'operational_expectations.author',
    'Author operational expectations',
    'operations',
    'Author assertions into the Operational Expectations ledger through the one authoring intake (org flag oe.ledger.author still applies). Distinct from workflow authoring.',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label, group_key = EXCLUDED.group_key,
    description = EXCLUDED.description, is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES ('operational_expectations.author', 'operations', 'Author operational expectations', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active;

-- Default grant: org `admin` role only (narrowest safe initial grant; admins own
-- new configuration capabilities). Ordinary workflow editors are UNCHANGED — a
-- user with workflows.write does NOT receive this. Idempotent per org, so every
-- existing tenant is backward-compatible without disturbing other grants.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', 'operational_expectations.author', true
FROM public.orgs AS o
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = 'admin'
      AND g.permission_key = 'operational_expectations.author'
);

-- 2. Concurrent-idempotency hardening (CREATE OR REPLACE) ---------------------
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
    v_key         text := nullif(p_act->>'idempotency_key', '');
    v_fingerprint text := p_act->>'payload_fingerprint';
    v_existing    public.operational_expectations%ROWTYPE;
    v_new         public.operational_expectations%ROWTYPE;
    v_mutation_id uuid := gen_random_uuid();
    v_event_id    uuid;
    v_verb        text := p_act->>'verb';
    v_modality    text := p_act->>'modality';
    v_standing    text := p_act->>'standing';
    v_transition  text := nullif(p_act->>'transition_type', '');
    v_supersedes  uuid := nullif(p_act->>'supersedes_expectation_id', '')::uuid;
    v_valid_from  timestamptz := (p_act->>'valid_from')::timestamptz;
BEGIN
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'oe_missing_idempotency_key' USING ERRCODE = '22023';
    END IF;

    -- Attempt the atomic insert directly. Both concurrency AND sequential retries
    -- resolve through the (org_id, idempotency_key) partial unique index: a second
    -- inserter BLOCKS on the in-flight winner, then raises unique_violation, which
    -- the handler reconciles. No FOR UPDATE over an absent key. The ledger row and
    -- the Authoring Act outbox row are inserted in the SAME transaction — on any
    -- error both roll back (exactly-once event).
    BEGIN
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
                'expectation_id', v_new.id, 'verb', v_verb, 'modality', v_modality,
                'transition_type', v_transition, 'standing', v_standing,
                'supersedes_expectation_id', v_supersedes, 'lineage_root_id', v_new.lineage_root_id,
                'subject_kind', v_new.subject_kind, 'valid_from', v_valid_from,
                'idempotency_key', v_key, 'footprint', v_new.footprint
            ),
            now(), v_valid_from
        );

        RETURN jsonb_build_object(
            'ok', true, 'disposition', 'created', 'idempotent', false,
            'expectation_id', v_new.id,
            'authoring_act_event_id', v_mutation_id,
            'verb', v_new.verb, 'modality', v_new.modality,
            'transition_type', v_new.transition_type, 'standing', v_new.standing,
            'supersedes_expectation_id', v_new.supersedes_expectation_id,
            'lineage_root_id', v_new.lineage_root_id, 'authored_at', v_new.authored_at
        );

    EXCEPTION WHEN unique_violation THEN
        -- Another transaction already claimed this (org_id, idempotency_key). The
        -- failed INSERT (and any partial outbox write) rolled back to the block
        -- savepoint. Reload the committed winner and reconcile.
        SELECT * INTO v_existing
        FROM public.operational_expectations
        WHERE org_id = p_org_id AND idempotency_key = v_key;

        IF NOT FOUND THEN
            -- The violation was not the idempotency key — do not mask it.
            RAISE;
        END IF;

        IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
            RAISE EXCEPTION 'oe_idempotency_conflict' USING ERRCODE = '23505';
        END IF;

        -- Identical retry / concurrent duplicate: return the winner's existing
        -- Authoring Act. No new row, no new event.
        SELECT mutation_id INTO v_event_id
        FROM public.mutation_events
        WHERE org_id = p_org_id AND domain = 'operational_expectations'
          AND subject_id = v_existing.id AND command_key = 'author_expectation'
        ORDER BY committed_at ASC
        LIMIT 1;

        RETURN jsonb_build_object(
            'ok', true, 'disposition', 'existing', 'idempotent', true,
            'expectation_id', v_existing.id,
            'authoring_act_event_id', COALESCE(v_event_id, v_existing.id),
            'verb', v_existing.verb, 'modality', v_existing.modality,
            'transition_type', v_existing.transition_type, 'standing', v_existing.standing,
            'supersedes_expectation_id', v_existing.supersedes_expectation_id,
            'lineage_root_id', v_existing.lineage_root_id, 'authored_at', v_existing.authored_at
        );
    END;
END;
$function$;

COMMENT ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) IS
    'P1 Wave B authoring intake RPC (hardened). Insert-with-conflict-catch: concurrent + sequential retries for one (org_id, idempotency_key) yield exactly one row + one Authoring Act; divergent-fingerprint reuse is oe_idempotency_conflict. Row + mutation_events outbox in one transaction. Grammar pre-validated in TS; Wave A constraints/trigger are the final guard. service_role only.';

REVOKE ALL ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.author_operational_expectation(uuid, uuid, jsonb) TO service_role;

-- Rollback (documented): disable oe.ledger.author (stops intake); authored history
-- is preserved (append-only, never deleted). The capability grant + RPC replacement
-- are additive; to fully retire, revoke the grant and restore the prior function.

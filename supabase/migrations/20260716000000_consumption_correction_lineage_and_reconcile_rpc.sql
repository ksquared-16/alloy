-- =============================================================================
-- Operational Expansion — Implementation Wave 1 (D12a)
-- Consumption correction lineage columns + atomic reconciliation RPC.
-- =============================================================================
-- Makes the correction/reversal path first-class in the fact->consumption
-- contract (RFC D12a). Adds two additive, nullable lineage columns and ONE
-- SECURITY DEFINER function that performs all correction reconciliation writes
-- in a single transaction (DP-1). Mirrors the house atomic-commit pattern
-- (execute_enrollment_status_mutation, agent_v0_commit_*_apply).
--
-- Additive + back-compatible: existing rows read as NULL lineage = "not a
-- correction". No backfill. No `charges` change (retirement reuses the existing
-- `void` status + `voided_at` + `metadata`). No attendance change. No RLS change.
--
-- Rollback: DROP FUNCTION reconcile_consumption_correction(uuid,uuid,jsonb);
--           ALTER TABLE resolved_obligations DROP COLUMN superseded_by_event_id;
--           ALTER TABLE consumption_events   DROP COLUMN corrects_event_id;
--           (+ their indexes/CHECK). Lossless — additive columns only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lineage columns (additive, nullable)
-- -----------------------------------------------------------------------------
ALTER TABLE public.consumption_events
    ADD COLUMN IF NOT EXISTS corrects_event_id uuid NULL
        REFERENCES public.consumption_events (id) ON DELETE RESTRICT;

ALTER TABLE public.resolved_obligations
    ADD COLUMN IF NOT EXISTS superseded_by_event_id uuid NULL
        REFERENCES public.consumption_events (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumption_events.corrects_event_id IS
    'D12a: the prior consumption event this correction/reversal event supersedes (lineage; the prior event remains in history). RESTRICT so a corrected event is not deleted out from under its correction.';
COMMENT ON COLUMN public.resolved_obligations.superseded_by_event_id IS
    'D12a: the correction event that superseded this obligation (provenance for supersession). SET NULL: losing the pointer must not delete the audit row.';

-- no-self-reference guard (mirrors child_attendance_events_no_self_reference)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'consumption_events_corrects_no_self'
          AND conrelid = 'public.consumption_events'::regclass
    ) THEN
        ALTER TABLE public.consumption_events
            ADD CONSTRAINT consumption_events_corrects_no_self
            CHECK (corrects_event_id IS NULL OR corrects_event_id <> id);
    END IF;
END $$;

-- partial indexes (match existing conventions)
CREATE INDEX IF NOT EXISTS idx_consumption_events_corrects
    ON public.consumption_events (org_id, corrects_event_id)
    WHERE corrects_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_resolved_obligations_superseded_by
    ON public.resolved_obligations (superseded_by_event_id)
    WHERE superseded_by_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Atomic correction reconciliation RPC (DP-1)
-- -----------------------------------------------------------------------------
-- One function call = one transaction. Under FOR UPDATE locks on the prior event
-- and its obligations it: upserts the correction's OWN consumption event (keyed on
-- the current fact, DP-3) linked via corrects_event_id to the immediate prior
-- (DP-4); reparents surviving same-key obligations to the new event; supersedes
-- absent-key obligations (+ superseded_by_event_id); retires the prior event; and
-- retires superseded obligations' DRAFT charges in place (draft -> void, DP-2).
-- All-or-nothing: any RAISE rolls the whole transaction back. No pricing here —
-- all amounts/keys/templates are pre-resolved by the TS planner.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_consumption_correction(
    p_org_id        uuid,
    p_actor_user_id uuid,
    p_plan          jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ce            jsonb := p_plan->'correction_event';
    v_prior_fact_id uuid := NULLIF(p_plan->>'prior_fact_id','')::uuid;
    v_source_family text := v_ce->>'source_family';
    v_prior_event_id uuid;
    v_e1            uuid;
    v_existing_e1   uuid;
    v_obl           jsonb;
    v_charge        jsonb;
    v_reso          text;
    v_obl_id        uuid;
    v_prev_event    uuid;
    v_prev_charge   uuid;
    v_new_charge_id uuid;
    v_new_keys      text[] := ARRAY[]::text[];
    v_reparented    uuid[] := ARRAY[]::uuid[];
    v_upserted      uuid[] := ARRAY[]::uuid[];
    v_superseded    uuid[] := ARRAY[]::uuid[];
    v_retired       uuid[] := ARRAY[]::uuid[];
    v_created_chg   uuid[] := ARRAY[]::uuid[];
    v_orphan        record;
    v_retire_id     text;
    v_chg           uuid;
BEGIN
    -- 1. Lock the prior consumption event by its fact anchor (source_entity_id).
    SELECT id INTO v_prior_event_id
    FROM consumption_events
    WHERE org_id = p_org_id
      AND source_entity_id = v_prior_fact_id
      AND (v_source_family IS NULL OR source_family = v_source_family)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_prior_event_id IS NULL THEN
        RAISE EXCEPTION 'reconcile_consumption:no_prior_event';
    END IF;

    -- Lock its obligations (serializes concurrent corrections of this lineage).
    PERFORM 1 FROM resolved_obligations
    WHERE org_id = p_org_id AND consumption_event_id = v_prior_event_id
    FOR UPDATE;

    -- 2. Upsert the correction's OWN consumption event by (org_id, idempotency_key).
    SELECT id INTO v_existing_e1
    FROM consumption_events
    WHERE org_id = p_org_id AND idempotency_key = (v_ce->>'idempotency_key')
    FOR UPDATE;

    IF v_existing_e1 IS NOT NULL THEN
        UPDATE consumption_events SET
            status            = COALESCE(v_ce->>'status', status),
            context           = COALESCE(v_ce->'context', context),
            corrects_event_id = v_prior_event_id,
            updated_by        = p_actor_user_id
        WHERE id = v_existing_e1;
        v_e1 := v_existing_e1;
    ELSE
        INSERT INTO consumption_events (
            org_id, location_id, event_type_id, source_family, event_key,
            source_entity_type, source_entity_id, subject_type, subject_id,
            occurs_on, effective_on, status, context, idempotency_key,
            corrects_event_id, created_by
        ) VALUES (
            p_org_id,
            NULLIF(v_ce->>'location_id','')::uuid,
            NULLIF(v_ce->>'event_type_id','')::uuid,
            v_ce->>'source_family',
            v_ce->>'event_key',
            v_ce->>'source_entity_type',
            (v_ce->>'source_entity_id')::uuid,
            v_ce->>'subject_type',
            NULLIF(v_ce->>'subject_id','')::uuid,
            (v_ce->>'occurs_on')::date,
            NULLIF(v_ce->>'effective_on','')::date,
            COALESCE(v_ce->>'status','resolved'),
            COALESCE(v_ce->'context','{}'::jsonb),
            v_ce->>'idempotency_key',
            v_prior_event_id,
            p_actor_user_id
        ) RETURNING id INTO v_e1;
    END IF;

    -- 3. Reparent + upsert each new obligation by (org_id, resolution_key).
    FOR v_obl IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan->'new_obligations','[]'::jsonb))
    LOOP
        v_reso := v_obl->>'resolution_key';
        v_new_keys := array_append(v_new_keys, v_reso);
        v_charge := v_obl->'charge';
        v_new_charge_id := NULL;

        SELECT id, consumption_event_id, draft_charge_id
        INTO v_obl_id, v_prev_event, v_prev_charge
        FROM resolved_obligations
        WHERE org_id = p_org_id AND resolution_key = v_reso
        FOR UPDATE;

        -- Charge op (pre-resolved; the RPC does no pricing).
        IF v_charge IS NOT NULL AND jsonb_typeof(v_charge) = 'object' THEN
            IF (v_charge->>'op') = 'recalc' THEN
                v_new_charge_id := COALESCE(NULLIF(v_charge->>'draft_charge_id','')::uuid, v_prev_charge);
                IF v_new_charge_id IS NOT NULL THEN
                    UPDATE charges SET
                        amount_cents = (v_charge->>'amount_cents')::bigint,
                        occurs_on    = NULLIF(v_charge->>'occurs_on','')::date,
                        billable_on  = NULLIF(v_charge->>'billable_on','')::date,
                        service_date = NULLIF(v_charge->>'service_date','')::date,
                        metadata     = COALESCE(v_charge->'metadata', metadata)
                    WHERE id = v_new_charge_id AND org_id = p_org_id AND status = 'draft';
                END IF;
            ELSIF (v_charge->>'op') = 'create' THEN
                INSERT INTO charges (
                    org_id, job_id, billable_source_type, billable_source_id,
                    charge_type, charge_category, status, currency_code, amount_cents,
                    service_date, occurs_on, billable_on, charge_template_id, service_id,
                    description, metadata
                ) VALUES (
                    p_org_id, NULL, 'enrollment_agreement', NULLIF(v_charge->>'billable_source_id','')::uuid,
                    COALESCE(v_charge->>'charge_type','fee'), v_charge->>'charge_category', 'draft',
                    COALESCE(v_charge->>'currency_code','USD'), (v_charge->>'amount_cents')::bigint,
                    NULLIF(v_charge->>'service_date','')::date, NULLIF(v_charge->>'occurs_on','')::date,
                    NULLIF(v_charge->>'billable_on','')::date, NULLIF(v_charge->>'charge_template_id','')::uuid,
                    NULLIF(v_charge->>'service_id','')::uuid, v_charge->>'description',
                    COALESCE(v_charge->'metadata','{}'::jsonb)
                ) RETURNING id INTO v_new_charge_id;
                v_created_chg := array_append(v_created_chg, v_new_charge_id);
            END IF;
        ELSE
            v_new_charge_id := v_prev_charge;
        END IF;

        IF v_obl_id IS NOT NULL THEN
            UPDATE resolved_obligations SET
                consumption_event_id = v_e1,
                charge_template_id   = NULLIF(v_obl->>'charge_template_id','')::uuid,
                service_id           = NULLIF(v_obl->>'service_id','')::uuid,
                amount_cents         = NULLIF(v_obl->>'amount_cents','')::bigint,
                currency_code        = COALESCE(v_obl->>'currency_code','USD'),
                responsibility_key   = v_obl->>'responsibility_key',
                occurs_on            = NULLIF(v_obl->>'occurs_on','')::date,
                billable_on          = NULLIF(v_obl->>'billable_on','')::date,
                period_start         = NULLIF(v_obl->>'period_start','')::date,
                period_end           = NULLIF(v_obl->>'period_end','')::date,
                status               = COALESCE(v_obl->>'status', status),
                review_required      = COALESCE((v_obl->>'review_required')::boolean, review_required),
                explanation          = COALESCE(v_obl->'explanation', explanation),
                obligation_kind      = v_obl->>'obligation_kind',
                draft_charge_id      = v_new_charge_id,
                superseded_by_event_id = NULL,
                review_status        = CASE WHEN (v_obl->>'review_status_stale')::boolean IS TRUE
                                            THEN 'stale' ELSE review_status END,
                updated_by           = p_actor_user_id
            WHERE id = v_obl_id;
            IF v_prev_event IS DISTINCT FROM v_e1 THEN
                v_reparented := array_append(v_reparented, v_obl_id);
            END IF;
            v_upserted := array_append(v_upserted, v_obl_id);
        ELSE
            INSERT INTO resolved_obligations (
                org_id, consumption_event_id, charge_template_id, service_id,
                amount_cents, currency_code, responsibility_key, occurs_on, billable_on,
                period_start, period_end, status, review_required, explanation,
                draft_charge_id, resolution_key, obligation_kind, review_status, created_by
            ) VALUES (
                p_org_id, v_e1, NULLIF(v_obl->>'charge_template_id','')::uuid,
                NULLIF(v_obl->>'service_id','')::uuid, NULLIF(v_obl->>'amount_cents','')::bigint,
                COALESCE(v_obl->>'currency_code','USD'), v_obl->>'responsibility_key',
                NULLIF(v_obl->>'occurs_on','')::date, NULLIF(v_obl->>'billable_on','')::date,
                NULLIF(v_obl->>'period_start','')::date, NULLIF(v_obl->>'period_end','')::date,
                COALESCE(v_obl->>'status','previewed'), COALESCE((v_obl->>'review_required')::boolean, false),
                COALESCE(v_obl->'explanation','{}'::jsonb), v_new_charge_id, v_reso,
                v_obl->>'obligation_kind',
                CASE WHEN COALESCE((v_obl->>'review_required')::boolean,false) THEN 'review_required' ELSE 'pending' END,
                p_actor_user_id
            ) RETURNING id INTO v_obl_id;
            v_upserted := array_append(v_upserted, v_obl_id);
        END IF;
    END LOOP;

    -- 4. Supersede orphans: prior obligations whose resolution_key is absent from
    --    the corrected pass. Collect their draft charges for retirement.
    FOR v_orphan IN
        SELECT id, resolution_key, draft_charge_id
        FROM resolved_obligations
        WHERE org_id = p_org_id
          AND consumption_event_id = v_prior_event_id
          AND (resolution_key IS NULL OR NOT (resolution_key = ANY (v_new_keys)))
    LOOP
        UPDATE resolved_obligations SET
            status                 = 'superseded',
            superseded_by_event_id = v_e1,
            review_status          = 'stale',
            updated_by             = p_actor_user_id
        WHERE id = v_orphan.id;
        v_superseded := array_append(v_superseded, v_orphan.id);
        IF v_orphan.draft_charge_id IS NOT NULL THEN
            v_retired := array_append(v_retired, v_orphan.draft_charge_id);
        END IF;
    END LOOP;

    -- Union in any explicitly-planned retire ids (idempotent; draft-only guard).
    IF p_plan->'retire_charge_ids' IS NOT NULL THEN
        FOR v_retire_id IN SELECT jsonb_array_elements_text(p_plan->'retire_charge_ids')
        LOOP
            IF NOT (v_retire_id::uuid = ANY (v_retired)) THEN
                v_retired := array_append(v_retired, v_retire_id::uuid);
            END IF;
        END LOOP;
    END IF;

    -- 5. Retire draft charges in place (draft -> void). Posted/non-draft => 0 rows.
    FOREACH v_chg IN ARRAY v_retired
    LOOP
        UPDATE charges SET
            status    = 'void',
            voided_at = now(),
            metadata  = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
                'retirement', jsonb_build_object(
                    'reason', 'obligation_superseded',
                    'actor_user_id', p_actor_user_id,
                    'superseded_by_consumption_event_id', v_e1,
                    'retired_at', now()
                ))
        WHERE id = v_chg
          AND org_id = p_org_id
          AND billable_source_type = 'enrollment_agreement'
          AND status = 'draft';
    END LOOP;

    -- 6. Retire the prior event.
    UPDATE consumption_events SET status = 'superseded', updated_by = p_actor_user_id
    WHERE id = v_prior_event_id AND org_id = p_org_id;

    RETURN jsonb_build_object(
        'ok', true,
        'consumption_event_id', v_e1,
        'prior_consumption_event_id', v_prior_event_id,
        'obligation_ids', to_jsonb(v_upserted),
        'reparented_obligation_ids', to_jsonb(v_reparented),
        'superseded_obligation_ids', to_jsonb(v_superseded),
        'retired_charge_ids', to_jsonb(v_retired),
        'created_charge_ids', to_jsonb(v_created_chg)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_consumption_correction(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_consumption_correction(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.reconcile_consumption_correction(uuid, uuid, jsonb) IS
    'Execute only from service_role. Atomic D12a correction reconciliation: upsert correction event (corrects_event_id), reparent same-key obligations, supersede absent-key obligations (superseded_by_event_id), retire prior event, retire superseded draft charges in place (draft->void). All-or-nothing.';

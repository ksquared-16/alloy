-- =============================================================================
-- PAYMENTS V1 · W6-B — APPLYING HELD MONEY IS ONE ACT, SO IT COMMITS ONCE.
--
-- `applyHeldFunds` wrote the allocation and then disposed the hold as two sequential client round
-- trips with no compensating path. If the second write failed, the money was applied to the charge
-- while STILL counted as restricted: the family's balance fell, `available = unapplied − held`
-- under-reported by the same amount, and nothing on any surface said why.
--
-- The invariant this function exists to hold, and the only one:
--
--     EITHER the allocation row and its `applied` disposition both exist, OR neither does.
--
-- ── WHAT THIS DOES NOT ADD, BECAUSE THE DATABASE ALREADY HOLDS IT ──
--
-- It is not the concurrency guard, and it must not be described as one. Two triggers already own
-- that ground and both lock before they sum:
--
--   * `enforce_payment_hold_disposition_bounds`  locks the hold; a hold cannot be disposed of
--                                                beyond what it held  (20260923120000)
--   * `enforce_payment_allocation_bounds`        locks the payment AND the charge; neither may be
--                                                over-applied  (20260903190000)
--
-- And `uq_payment_allocations_one_active_per_payment_charge` still refuses a second active
-- allocation of the same payment to the same charge, so a retried apply is refused here by exactly
-- the constraint that refuses it everywhere else.
--
-- This function therefore adds ONE thing that no trigger can: it puts both writes in a single
-- transaction. The bound check below is not the enforcement — it is a legible error raised before
-- the trigger raises a less legible one, and the source of the `remaining_cents` the caller shows
-- the operator.
--
-- It does not journal. The general ledger belongs to Financials and is recorded by the caller, the
-- same way an ordinary application records it. Moving it here would create a second GL path and make
-- hold application account differently from every other application, for no reason.
--
-- It does not decide what may be collected, who owes it, or whether the payer is right.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_held_funds_atomic(
    p_org_id uuid,
    p_hold_id uuid,
    p_charge_id uuid,
    p_amount_cents bigint,
    p_actor uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS TABLE (allocation_id uuid, disposition_id uuid, remaining_cents bigint)
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
    v_hold public.payment_holds;
    v_disposed bigint;
    v_remaining bigint;
    v_allocation_id uuid;
    v_disposition_id uuid;
BEGIN
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'an applied amount must be a positive whole number of cents'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Locked here so the remaining amount reported back cannot be stale by the time it is returned.
    -- The disposition trigger takes the same lock and is what actually enforces the bound.
    SELECT * INTO v_hold
    FROM public.payment_holds
    WHERE id = p_hold_id AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'held deposit % is not in organization %', p_hold_id, p_org_id
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT coalesce(sum(amount_cents), 0) INTO v_disposed
    FROM public.payment_hold_dispositions
    WHERE hold_id = v_hold.id;

    v_remaining := v_hold.amount_cents - v_disposed;

    IF p_amount_cents > v_remaining THEN
        RAISE EXCEPTION 'only % cents remain held on deposit %, so % cannot be applied',
            v_remaining, p_hold_id, p_amount_cents
            USING ERRCODE = 'check_violation';
    END IF;

    -- EVERY COLUMN THE ORDINARY ALLOCATOR WRITES.
    --
    -- An allocation created here must be indistinguishable from one `applyPaymentToCharge` creates.
    -- A row of a different shape — missing `allocation_type`, or naming no `target_entity_*` —
    -- would be a second kind of allocation wearing the same table, invisible to every reader that
    -- filters the canonical way. `target_entity_type` is the literal 'charge' the service writes as
    -- ALLOCATION_TARGET_CHARGE, and `allocation_type` is the only value its CHECK admits.
    INSERT INTO public.payment_allocations (
        org_id, payment_id, charge_id,
        target_entity_type, target_entity_id,
        allocated_amount_cents, status, allocation_type,
        allocated_at, notes, metadata, updated_at, created_by, updated_by
    )
    VALUES (
        p_org_id, v_hold.payment_id, p_charge_id,
        'charge', p_charge_id,
        p_amount_cents, 'active', 'payment_application',
        now(), p_notes, '{}'::jsonb, now(), p_actor, p_actor
    )
    RETURNING id INTO v_allocation_id;

    -- The restriction is discharged in the same transaction, naming the allocation it became.
    -- `payment_hold_dispositions_applied_names_allocation_chk` requires that name, which is only
    -- satisfiable because both writes are here.
    INSERT INTO public.payment_hold_dispositions (
        org_id, hold_id, kind, amount_cents, allocation_id, reason, disposed_by
    )
    VALUES (
        p_org_id, v_hold.id, 'applied', p_amount_cents, v_allocation_id, p_notes, p_actor
    )
    RETURNING id INTO v_disposition_id;

    RETURN QUERY SELECT v_allocation_id, v_disposition_id, (v_remaining - p_amount_cents);
END;
$function$;

COMMENT ON FUNCTION public.apply_held_funds_atomic(uuid, uuid, uuid, bigint, uuid, text) IS
    'Applies held money to a charge as ONE transaction: the ordinary payment_allocation and the `applied` hold disposition commit together or not at all. Bounds and concurrency are already held by the hold and allocation triggers; this adds only the atomicity of the pair. Journaling stays with the caller so hold application accounts the same way as every other application.';

-- -----------------------------------------------------------------------------
-- SELF-TEST — the DDL above either took effect or this migration fails.
--
-- A failed apply does not roll back DDL, so this asserts the SHAPE rather than assuming the
-- statements ran. Behaviour (a partial failure commits neither row) needs seeded money and is
-- proved in the certification suite, not here.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_args text;
BEGIN
    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_held_funds_atomic';

    IF v_args IS NULL THEN
        RAISE EXCEPTION 'apply_held_funds_atomic was not created';
    END IF;

    IF v_args <> 'uuid, uuid, uuid, bigint, uuid, text' THEN
        RAISE EXCEPTION 'apply_held_funds_atomic has the wrong signature: %', v_args;
    END IF;

    -- The two writes it must make, against the columns that actually exist. A rename on either
    -- table breaks this migration rather than the operator's deposit.
    PERFORM 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payment_hold_dispositions'
       AND column_name = 'disposed_by';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_hold_dispositions.disposed_by is missing';
    END IF;

    PERFORM 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payment_allocations'
       AND column_name = 'allocation_type';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_allocations.allocation_type is missing';
    END IF;
END $$;

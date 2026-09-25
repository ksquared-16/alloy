-- ============================================================================================
-- DOES THE PAYMENT-INSTRUMENT SCHEMA ACTUALLY REFUSE WHAT IT CLAIMS TO REFUSE?
--
-- `20260925200000_payment_instrument_ownership.sql` authored four database rules, and the schema was
-- verified live to the extent a credential-less reader can: every column present, no credential
-- column, `anon` refused. What could not be checked that way is BEHAVIOUR — a CHECK constraint only
-- proves itself by rejecting a write, and a unique index only proves itself by rejecting a duplicate.
--
-- This migration changes no product semantics. It exercises the rules and then throws its work away.
--
-- ── WHY A MIGRATION, AND WHY THIS SHAPE ──
--
-- The mounted QA application reads a different database from the one pre-merge migrations reach, so
-- the governed migration path is the only way to execute a write against the certification database
-- from a worker lane. The shape is the repository's existing self-test convention, taken from
-- `20260911260000_d2_no_self_inflicted_access_lockout.sql` ("Exercise the refusal AND the two cases
-- it must not touch, then roll it all back"): an inner block ends with a deliberate
-- `RAISE EXCEPTION` carrying its observations in the message, PL/pgSQL rolls that block back to its
-- implicit savepoint, and the outer block compares the observation string against what the authored
-- constraints require.
--
-- That deliberate raise IS the cleanup. Every fixture — the org, the household, the instruments —
-- is discarded with it, so nothing certification-shaped survives this migration. Re-runnable by
-- construction: it holds no DDL and commits no row.
-- ============================================================================================

DO $assert$
DECLARE
    v_org       uuid := '00000000-0000-4000-8000-0000fedcb101';
    v_org_other uuid := '00000000-0000-4000-8000-0000fedcb102';
    v_cust      uuid := '00000000-0000-4000-8000-0000fedcb201';
    v_cust_other uuid := '00000000-0000-4000-8000-0000fedcb202';
    v_mom       uuid := '00000000-0000-4000-8000-0000fedcb301';
    v_dad       uuid := '00000000-0000-4000-8000-0000fedcb302';
    v_outcome   text;

    -- Every probe starts as "not-run" so a block that never executed cannot read as a pass.
    r_unowned_reusable  text := 'not-run';
    r_unowned_onetime   text := 'not-run';
    r_half_type_only    text := 'not-run';
    r_half_id_only      text := 'not-run';
    r_owned_ok          text := 'not-run';
    r_ach_unverified    text := 'not-run';
    r_ach_verified      text := 'not-run';
    r_dup_same_org      text := 'not-run';
    r_dup_other_org     text := 'not-run';
    r_owner_not_party   text := 'not-run';
    r_revoked_state     text := 'not-run';
    r_revoked_reusable  text := 'not-run';
BEGIN
    BEGIN
        INSERT INTO public.orgs (id, name, slug) VALUES
            (v_org,       'Payment instrument self-test',   '_pi_selftest'),
            (v_org_other, 'Payment instrument self-test 2', '_pi_selftest_2');
        INSERT INTO public.customers (id, org_id, name) VALUES
            (v_cust,       v_org,       'Selftest Household'),
            (v_cust_other, v_org_other, 'Selftest Household Other');

        -- ── A. AN UNOWNED INSTRUMENT CANNOT BE REUSABLE ─────────────────────────────────────
        -- There is no payer to offer it to until somebody owns it. This is what stops a legacy
        -- household row becoming silently available to every adult on the account.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable)
            VALUES (v_org, v_cust, 'pm_selftest_unowned_reusable', 'card', true);
            r_unowned_reusable := 'ACCEPTED';
        EXCEPTION WHEN check_violation THEN
            r_unowned_reusable := 'refused';
        END;

        -- The other half of the same rule: unowned is a legitimate state when not reusable.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable)
            VALUES (v_org, v_cust, 'pm_selftest_unowned_onetime', 'card', false);
            r_unowned_onetime := 'accepted';
        EXCEPTION WHEN check_violation THEN
            r_unowned_onetime := 'REFUSED';
        END;

        -- ── B. THE OWNER FIELDS ARE A PAIR ──────────────────────────────────────────────────
        -- Half an owner is worse than none: it reads as owned to anything checking the type and as
        -- unowned to anything checking the id.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable, owner_entity_type)
            VALUES (v_org, v_cust, 'pm_selftest_half_type', 'card', false, 'person');
            r_half_type_only := 'ACCEPTED';
        EXCEPTION WHEN check_violation THEN
            r_half_type_only := 'refused';
        END;

        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable, owner_entity_id)
            VALUES (v_org, v_cust, 'pm_selftest_half_id', 'card', false, v_mom);
            r_half_id_only := 'ACCEPTED';
        EXCEPTION WHEN check_violation THEN
            r_half_id_only := 'refused';
        END;

        -- A properly owned, reusable card — the shape the whole model exists to allow.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id, brand, last4)
            VALUES (v_org, v_cust, 'pm_selftest_mom', 'card', true, 'person', v_mom, 'visa', '1111');
            r_owned_ok := 'accepted';
        EXCEPTION WHEN others THEN
            r_owned_ok := 'REFUSED:' || SQLSTATE;
        END;

        -- ── C. AN UNVERIFIED BANK ACCOUNT CANNOT BE REUSABLE ────────────────────────────────
        -- A card carries no mandate and a bank debit does; presenting an unverified account as
        -- reusable would offer a payer an instrument the provider will not honour.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id, verification_state)
            VALUES (v_org, v_cust, 'pm_selftest_ach_unver', 'us_bank_account', true,
                    'person', v_dad, 'mandate_required');
            r_ach_unverified := 'ACCEPTED';
        EXCEPTION WHEN check_violation THEN
            r_ach_unverified := 'refused';
        END;

        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id, verification_state, mandate_reference)
            VALUES (v_org, v_cust, 'pm_selftest_ach_ver', 'us_bank_account', true,
                    'person', v_dad, 'verified', 'mandate_selftest');
            r_ach_verified := 'accepted';
        EXCEPTION WHEN others THEN
            r_ach_verified := 'REFUSED:' || SQLSTATE;
        END;

        -- ── D. ONE PROVIDER INSTRUMENT, ONE ROW PER ORGANISATION ────────────────────────────
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id)
            VALUES (v_org, v_cust, 'pm_selftest_mom', 'card', true, 'person', v_dad);
            r_dup_same_org := 'ACCEPTED';
        EXCEPTION WHEN unique_violation THEN
            r_dup_same_org := 'refused';
        END;

        -- The index is scoped to the org, so the SAME provider reference under a DIFFERENT org is
        -- expected to be permitted. Recorded as observed rather than asserted either way.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id)
            VALUES (v_org_other, v_cust_other, 'pm_selftest_mom', 'card', true, 'person', v_mom);
            r_dup_other_org := 'accepted';
        EXCEPTION WHEN unique_violation THEN
            r_dup_other_org := 'refused';
        END;

        -- ── E. ACCOUNT CONTEXT IS NOT OWNERSHIP ─────────────────────────────────────────────
        -- `v_dad` is a person with no responsibility arrangement, no share and no allocation
        -- anywhere. If any constraint quietly equated the account with its payers, or required an
        -- owner to be a responsible party, this insert would fail.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id)
            VALUES (v_org, v_cust, 'pm_selftest_nonparty', 'card', true, 'person', v_dad);
            r_owner_not_party := 'accepted';
        EXCEPTION WHEN others THEN
            r_owner_not_party := 'REFUSED:' || SQLSTATE;
        END;

        -- ── F. LIFECYCLE ────────────────────────────────────────────────────────────────────
        -- A revoked instrument, with its actor and timestamp, is representable and keeps its owner
        -- and provider reference — a payment already made with it must stay explicable.
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id, status, revoked_at, revoked_by)
            VALUES (v_org, v_cust, 'pm_selftest_revoked', 'card', false, 'person', v_mom,
                    'revoked', now(), v_mom);
            r_revoked_state := 'accepted';
        EXCEPTION WHEN others THEN
            r_revoked_state := 'REFUSED:' || SQLSTATE;
        END;

        /*
         * OBSERVED, NOT ASSERTED. The authored schema does NOT forbid `status = 'revoked'` together
         * with `reusable = true` — nothing in it relates the two columns. The payer-scoped read
         * filters on both, so no revoked instrument is offered regardless; but the rule lives in the
         * query rather than the table, and this records which it is instead of implying a constraint
         * that was never written.
         */
        BEGIN
            INSERT INTO public.payment_instruments
                (org_id, customer_id, provider_instrument_ref, rail, reusable,
                 owner_entity_type, owner_entity_id, status)
            VALUES (v_org, v_cust, 'pm_selftest_revoked_reusable', 'card', true, 'person', v_mom, 'revoked');
            r_revoked_reusable := 'accepted';
        EXCEPTION WHEN check_violation THEN
            r_revoked_reusable := 'refused';
        END;

        -- This raise is the cleanup: everything above rolls back to this block's savepoint.
        RAISE EXCEPTION 'PISELFTEST A1=% A2=% B1=% B2=% B3=% C1=% C2=% D1=% D2=% E1=% F1=% F2=%',
            r_unowned_reusable, r_unowned_onetime,
            r_half_type_only, r_half_id_only, r_owned_ok,
            r_ach_unverified, r_ach_verified,
            r_dup_same_org, r_dup_other_org,
            r_owner_not_party,
            r_revoked_state, r_revoked_reusable;
    EXCEPTION WHEN raise_exception THEN
        v_outcome := SQLERRM;
    END;

    IF v_outcome IS DISTINCT FROM
        'PISELFTEST A1=refused A2=accepted B1=refused B2=refused B3=accepted '
        || 'C1=refused C2=accepted D1=refused D2=accepted E1=accepted F1=accepted F2=accepted'
    THEN
        RAISE EXCEPTION
            'PAYMENT INSTRUMENT ABORT: the authored invariants did not behave as authored; observed "%".',
            v_outcome;
    END IF;

    RAISE NOTICE 'payment_instruments: unowned and unverified-bank instruments cannot be reusable, an owner is all-or-nothing, a provider reference is unique per organisation and free across them, and ownership requires no responsibility.';
END
$assert$;

-- Nothing certification-shaped survives: the block above committed no row.
DO $residue$
DECLARE
    v_rows bigint;
BEGIN
    SELECT count(*) INTO v_rows
    FROM public.payment_instruments
    WHERE provider_instrument_ref LIKE 'pm_selftest%';
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'PAYMENT INSTRUMENT ABORT: % self-test row(s) survived; the probe must leave none.', v_rows;
    END IF;

    SELECT count(*) INTO v_rows FROM public.orgs WHERE slug LIKE '_pi_selftest%';
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'PAYMENT INSTRUMENT ABORT: % self-test org(s) survived.', v_rows;
    END IF;

    RAISE NOTICE 'payment_instruments self-test left no residue.';
END
$residue$;

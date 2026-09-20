-- =============================================================================
-- PAYMENTS V1 · W1 — THE AUTHORITY TO DECIDE WHERE A FAMILY'S MONEY SETTLES.
--
-- Connecting a payment provider is not "taking a payment with more steps". Taking a payment moves
-- money into an account somebody already chose; connecting a provider CHOOSES THAT ACCOUNT. Those
-- are different acts with different blast radii, and `fin.write` cannot separate them because it is
-- held by `ops` — the role that records cheques and collects cards all day.
--
-- ── WHY A NEW KEY, WHICH IS NOT THE DEFAULT ANSWER ──
--
-- The same question was asked and answered once already, in
-- `20260914113000_scheduling_jobs_financial_posting_authority.sql`: `fin.post` exists because a cash
-- receipt is not a rate-plan edit, and folding it into `fin.write` would have handed `ops` four
-- money operations it could not previously reach. The reasoning here is the mirror image —
-- `fin.write` is ALREADY held by ops, so reusing it would silently hand ops the power to redirect
-- settlement for the whole organisation.
--
-- The database already encodes the same judgement: `enforce_payment_merchant_account_immutability`
-- refuses to let anyone repoint an existing merchant at a different external account, precisely so
-- that where money lands cannot be changed quietly. This permission is that rule at the authority
-- layer.
--
-- ── WHAT IT IS NOT ──
--
-- Not a Financials read, not a payment write, not an adjustment, not posting. It confers exactly
-- one thing: establishing, refreshing and withdrawing an organisation's provider merchant
-- association. It is deliberately NOT granted to `ops`.
--
-- No change is made to `payment_provider_merchants`. The approved architecture is expressible in
-- its current shape, and W1 adds writers rather than columns.
-- =============================================================================

DO $$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'PAYMENTS W1 ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'PAYMENTS W1 ABORT: public.role_permission_grants is absent.';
    END IF;
    IF to_regclass('public.payment_provider_merchants') IS NULL THEN
        RAISE EXCEPTION 'PAYMENTS W1 ABORT: public.payment_provider_merchants is absent — W1 extends it, it does not create it.';
    END IF;
END $$;

INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('fin.provider', 'financials', 'Connect a payment provider',
     'Establish, refresh and withdraw the organization''s payment provider merchant association — which external merchant account collects family payments, and therefore whose bank account they settle into. Does not confer taking payments, adjustments, responsibility, subsidy or reporting.',
     true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ADMIN ONLY, and deliberately not ops. An organisation that wants a second holder grants it
-- explicitly, and that grant is itself an audited access change.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd ON pd.key = 'fin.provider'
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SELF-TEST. A migration that silently did nothing is the failure mode this repository has been
-- bitten by before, so the assertions run inside the same transaction that made the change.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_defined int;
    v_admin   int;
    v_ops     int;
    v_orgs    int;
BEGIN
    SELECT count(*) INTO v_defined
      FROM public.permission_definitions WHERE key = 'fin.provider' AND is_active;
    IF v_defined <> 1 THEN
        RAISE EXCEPTION 'PAYMENTS W1 SELF-TEST: fin.provider is not defined and active (found %)', v_defined;
    END IF;

    SELECT count(DISTINCT org_id) INTO v_orgs FROM public.role_definitions WHERE role_key = 'admin';

    SELECT count(*) INTO v_admin
      FROM public.role_permission_grants
     WHERE permission_key = 'fin.provider' AND role_key = 'admin' AND allowed;
    IF v_admin <> v_orgs THEN
        RAISE EXCEPTION 'PAYMENTS W1 SELF-TEST: expected % admin grants for fin.provider, found %', v_orgs, v_admin;
    END IF;

    SELECT count(*) INTO v_ops
      FROM public.role_permission_grants
     WHERE permission_key = 'fin.provider' AND role_key = 'ops' AND allowed;
    IF v_ops <> 0 THEN
        RAISE EXCEPTION 'PAYMENTS W1 SELF-TEST: fin.provider must not be granted to ops by default (found %)', v_ops;
    END IF;
END $$;

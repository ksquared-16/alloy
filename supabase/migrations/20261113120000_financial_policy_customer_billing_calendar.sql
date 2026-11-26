-- =============================================================================
-- THE CUSTOMER'S COMMERCIAL BILLING CALENDAR — A SCOPE, NOT A FRAMEWORK
--
-- The commercial billing period is the period THE CUSTOMER is billed for, so its calendar belongs
-- to the customer account. A location still configures the DEFAULT, because two locations may
-- legitimately bill on different cadences and anchors; what a location cannot do is own the period
-- of a household whose children attend two of them.
--
-- `financial_policies` is already the scoped, effective-dated configuration authority — most
-- specific wins over org -> location -> service -> rate_plan, with `value` jsonb, `is_active`,
-- `effective_start`/`effective_end` and a resolver that reports which scope answered. So this adds
-- a SCOPE and a TYPE to that table. It does not build a second configuration system.
--
-- ── WHY A NEW `billing_calendar` TYPE RATHER THAN THE EXISTING `billing_cadence` ──
--
-- `billing_cadence` has existed in this CHECK since 20260704120000 and looks like the natural seat.
-- It is not available: `financialPolicyTypes` records that `billing_cadence` is CONSUMED by
-- `consumptionService`. Authoring location-scoped `billing_cadence` rows to configure billing
-- periods would therefore change tuition generation as a side effect, and S1 is required to leave
-- every existing economic reader and writer alone. `billing_calendar` is a new type that nothing
-- consumes yet, which is exactly what a side-effect-free foundation needs.
--
-- Its `value` is `{ "cadence": <BillingCadence>, "anchor_on": <YYYY-MM-DD|null> }`. Monthly is
-- anchor-free by construction (a monthly commercial period IS the calendar month), so `anchor_on`
-- is only meaningful for the anchor-sensitive cadences.
--
-- CONFIGURATION ONLY. This migration posts no money, binds no charge and closes no period.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE CUSTOMER SCOPE
--
-- `ON DELETE CASCADE` matches how `location_id` and the other scope targets already behave: a
-- policy scoped to a thing that no longer exists is not a policy, it is a dangling rule.
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_policies
    ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.financial_policies.customer_id IS
    'Customer/household scope target. Set only when scope_type = ''customer''. A customer-scoped billing_calendar answers "what commercial calendar governs this combined account?" — it does NOT assert that the household belongs to any one location.';

-- Every CHECK below is dropped by fixed name before being recreated, so this migration is
-- re-runnable: a failed apply does not roll back DDL, so a second run must not trip over its own
-- first attempt.
ALTER TABLE public.financial_policies
    DROP CONSTRAINT IF EXISTS financial_policies_scope_type_check;
ALTER TABLE public.financial_policies
    ADD CONSTRAINT financial_policies_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'location'::text, 'service'::text, 'rate_plan'::text, 'customer'::text]));

ALTER TABLE public.financial_policies
    DROP CONSTRAINT IF EXISTS financial_policies_policy_type_check;
ALTER TABLE public.financial_policies
    ADD CONSTRAINT financial_policies_policy_type_check
        CHECK (policy_type = ANY (ARRAY[
            'proration'::text, 'billing_cadence'::text, 'grace_period'::text,
            'late_fee'::text, 'nsf_fee'::text, 'deposit'::text, 'refund'::text,
            'vacation_credit'::text, 'withdrawal'::text, 'write_off'::text,
            'adjustment_approval'::text, 'draft_expiration'::text, 'posting_review'::text,
            'due_date'::text,
            'billing_calendar'::text
        ]));

-- -----------------------------------------------------------------------------
-- 2. THE SHAPE RULE, RESTATED IN FULL
--
-- All-or-nothing per scope, exactly as before: a scope names its own target and no other. Every
-- pre-existing branch gains `customer_id IS NULL` — without that, an org-scoped row could carry a
-- customer and the resolver would have two readings of one row.
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_policies
    DROP CONSTRAINT IF EXISTS financial_policies_scope_shape;
ALTER TABLE public.financial_policies
    ADD CONSTRAINT financial_policies_scope_shape CHECK (
        (scope_type = 'org'
            AND location_id IS NULL AND service_id IS NULL AND rate_plan_id IS NULL AND customer_id IS NULL)
        OR (scope_type = 'location'
            AND location_id IS NOT NULL AND service_id IS NULL AND rate_plan_id IS NULL AND customer_id IS NULL)
        OR (scope_type = 'service'
            AND service_id IS NOT NULL AND location_id IS NULL AND rate_plan_id IS NULL AND customer_id IS NULL)
        OR (scope_type = 'rate_plan'
            AND rate_plan_id IS NOT NULL AND location_id IS NULL AND service_id IS NULL AND customer_id IS NULL)
        OR (scope_type = 'customer'
            AND customer_id IS NOT NULL AND location_id IS NULL AND service_id IS NULL AND rate_plan_id IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_financial_policies_org_customer
    ON public.financial_policies (org_id, customer_id) WHERE customer_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. SCOPE ORG PARITY, EXTENDED
--
-- The existing trigger already refuses a location, service or rate plan belonging to another
-- organization. A customer scope is the same hazard and gets the same refusal, in the same
-- function, rather than a second trigger that could disagree with this one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_financial_policy_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    loc_org uuid;
    svc_org uuid;
    plan_org uuid;
    cust_org uuid;
BEGIN
    IF NEW.location_id IS NOT NULL THEN
        SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;
        IF loc_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: location_id % not found', NEW.location_id USING ERRCODE = '23503';
        END IF;
        IF loc_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: location org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.service_id IS NOT NULL THEN
        SELECT s.org_id INTO svc_org FROM public.financial_services s WHERE s.id = NEW.service_id;
        IF svc_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: service_id % not found', NEW.service_id USING ERRCODE = '23503';
        END IF;
        IF svc_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: service org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.rate_plan_id IS NOT NULL THEN
        SELECT p.org_id INTO plan_org FROM public.childcare_rate_plans p WHERE p.id = NEW.rate_plan_id;
        IF plan_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: rate_plan_id % not found', NEW.rate_plan_id USING ERRCODE = '23503';
        END IF;
        IF plan_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: rate plan org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
        SELECT c.org_id INTO cust_org FROM public.customers c WHERE c.id = NEW.customer_id;
        IF cust_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: customer_id % not found', NEW.customer_id USING ERRCODE = '23503';
        END IF;
        IF cust_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: customer org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON TABLE public.financial_policies IS
    'Scoped, effective-dated financial rule config (proration, cadence, fees, deposits, refunds, posting review, billing calendar, …). Most-specific-wins: org -> location -> service -> rate_plan -> customer. Typed value in `value` jsonb. Configuration only: resolution is recomputable; this posts no money.';

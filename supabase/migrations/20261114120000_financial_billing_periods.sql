-- =============================================================================
-- THE CUSTOMER'S COMMERCIAL BILLING PERIOD — PERSISTED, AND FINALIZABLE
--
-- Until now a billing period was a DERIVED STRING. `billingPeriod.ts` computed a key from a date on
-- the row, `financial_journal_entries.billing_period_key` held a nullable text copy whose comment
-- says it is not derived from either temporal column, and nothing anywhere carried a status. So the
-- platform could say which month a charge fell in and could never say that the month was FINISHED.
-- Every `closePeriod` symbol in the codebase belongs to the ACCOUNTING calendar, which is a
-- reporting boundary and deliberately defers rather than refuses.
--
-- This is the commercial period: the one the customer is billed for and goes off of.
--
-- ── WHY CUSTOMER GRAIN ──
--
-- Household-grain economics are canonical, not incidental: `enforce_charge_correction_lineage`
-- admits exactly two childcare billable sources, 'enrollment_agreement' and 'customer'. A
-- customer-grain charge binds to the account and reaches no location at all — `charges` carries no
-- location, and neither do `customers` or `customer_members`. The deployed census found 28 such
-- charges, every one of them posted, and 3 households whose children attend two locations, so no
-- traversal rule could have named one location for them either. Payments and allocations are
-- likewise account-wide: one payment may settle obligations originating at two locations.
--
-- A LOCATION therefore configures the default calendar — cadence and anchor, which may legitimately
-- differ between locations — while the CUSTOMER owns the period and its finality. Those are two
-- different dimensions and this table keeps them apart: the period is the commercial clock, and
-- `calendar_source_location_id` records only which location's configuration supplied the bounds.
-- It does not assert that the household belongs to that location.
--
-- ── WHAT THIS IS NOT ──
--
-- Not an invoice, and deliberately no statement aggregate: the customer position stays derived from
-- charges, reductions, payments and allocations. Not an accounting period — that stays org-grain
-- and independent. Not a balance authority. And not yet CONSUMED: no charge writer, reduction
-- writer, payment writer, journal writer or Autopay path reads this table in S1. It is the
-- foundation, proved on its own before anything binds to it.
-- =============================================================================

-- A range question deserves a range constraint. Already created by 20260904180000; repeated so this
-- migration does not depend on the order of an unrelated one.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.financial_billing_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- The account whose commercial clock this is.
    customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,

    -- The identity `billingPeriod.ts` already mints: `YYYY-MM` for monthly, `<start>~<end>`
    -- otherwise. Kept EXACTLY, because it is already in charge resolution keys, stored service
    -- periods, ledger groupings and every month input, and a new convention would restate history.
    period_key text NOT NULL,

    -- The bounds, and the cadence that produced them. INCLUSIVE, matching
    -- `financial_accounting_periods`, which is why the exclusion below uses '[]'.
    cadence text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    -- Only the anchor-sensitive cadences tile from a date. A monthly commercial period IS the
    -- calendar month, so an anchor on a monthly period would be a fact nothing reads.
    anchor_on date,

    status text NOT NULL DEFAULT 'open',
    closed_at timestamptz,
    -- Null for a scheduled close: cadence decides when a commercial period ends, so the ordinary
    -- case has no operator. `close_actor` is what keeps that auditable without inventing a user.
    closed_by uuid,
    close_actor text,

    -- ── PROVENANCE: WHY WERE THESE THE BOUNDS? ──
    --
    -- `calendar_scope` is which scope answered — 'customer' for an explicit assignment, 'location'
    -- for an inherited default, 'org' for the fallback. `calendar_policy_id` is the row that
    -- answered, and `calendar_snapshot` freezes its resolved value, so a later edit to the policy
    -- cannot restate a period that has already been materialized. Same reasoning as the journal
    -- denormalising its accounting period key.
    calendar_scope text NOT NULL,
    calendar_policy_id uuid REFERENCES public.financial_policies (id) ON DELETE RESTRICT,
    calendar_source_location_id uuid REFERENCES public.locations (id) ON DELETE RESTRICT,
    calendar_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT financial_billing_periods_key_chk CHECK (btrim(period_key) <> ''),
    CONSTRAINT financial_billing_periods_span_chk CHECK (ends_on >= starts_on),
    CONSTRAINT financial_billing_periods_status_chk
        CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT financial_billing_periods_cadence_chk
        CHECK (cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'annual'::text])),

    -- Monthly is anchor-free; every other supported cadence tiles from an anchor and cannot be
    -- reproduced without one.
    CONSTRAINT financial_billing_periods_anchor_shape_chk CHECK (
        (cadence = 'monthly' AND anchor_on IS NULL)
        OR (cadence <> 'monthly' AND anchor_on IS NOT NULL)
    ),

    -- Closure is all-or-nothing. A half-closed period is one reporting could neither trust nor
    -- ignore, which is the same failure the journal's attribution shape check exists to prevent.
    CONSTRAINT financial_billing_periods_close_shape_chk CHECK (
        (status = 'open' AND closed_at IS NULL AND closed_by IS NULL AND close_actor IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL AND close_actor IS NOT NULL)
    ),
    CONSTRAINT financial_billing_periods_close_actor_chk
        CHECK (close_actor IS NULL OR close_actor = ANY (ARRAY['operator'::text, 'system'::text])),
    -- An operator close names the operator; a system close must not pretend to.
    CONSTRAINT financial_billing_periods_close_actor_shape_chk CHECK (
        close_actor IS NULL
        OR (close_actor = 'operator' AND closed_by IS NOT NULL)
        OR (close_actor = 'system' AND closed_by IS NULL)
    ),

    CONSTRAINT financial_billing_periods_calendar_scope_chk
        CHECK (calendar_scope = ANY (ARRAY['customer'::text, 'location'::text, 'org'::text])),
    -- An inherited default names the location it came from; the other scopes have no location to
    -- name, and naming one anyway would assert a household-to-location claim this table refuses to
    -- make.
    CONSTRAINT financial_billing_periods_calendar_shape_chk CHECK (
        (calendar_scope = 'location' AND calendar_source_location_id IS NOT NULL)
        OR (calendar_scope <> 'location' AND calendar_source_location_id IS NULL)
    ),

    -- One canonical period per account per identity.
    CONSTRAINT financial_billing_periods_customer_key_uq UNIQUE (org_id, customer_id, period_key),

    -- One account cannot have two commercial clocks over the same day. This is also what makes a
    -- cadence CHANGE safe: a new calendar may only materialize periods that do not overlap what is
    -- already materialized, so a change takes effect at the next unmaterialized boundary and
    -- history is never regrouped. Different customers may freely differ.
    CONSTRAINT financial_billing_periods_no_overlap
        EXCLUDE USING gist (customer_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_financial_billing_periods_org_customer
    ON public.financial_billing_periods (org_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_financial_billing_periods_customer_span
    ON public.financial_billing_periods (customer_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_financial_billing_periods_org_status
    ON public.financial_billing_periods (org_id, status);

COMMENT ON TABLE public.financial_billing_periods IS
    'The CUSTOMER''S commercial billing period — the period the customer is billed for, and the only authority for commercial finality. Customer grain because household-grain economics and account-wide payments have no single location. A location configures the default cadence/anchor; calendar_source_location_id records which configuration supplied the bounds and asserts no household-to-location membership. Distinct from financial_accounting_periods, which is an org-grain reporting boundary that defers rather than refuses. Bounds are inclusive. Not an invoice and not a balance authority.';

-- -----------------------------------------------------------------------------
-- ORG PARITY
--
-- A period whose customer belongs to another organization is a tenancy breach, and the same hazard
-- `validate_financial_policy_scope` already refuses for its scope targets.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_financial_billing_period_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    cust_org uuid;
    loc_org uuid;
    pol_org uuid;
BEGIN
    SELECT c.org_id INTO cust_org FROM public.customers c WHERE c.id = NEW.customer_id;
    IF cust_org IS NULL THEN
        RAISE EXCEPTION 'billing period scope: customer_id % not found', NEW.customer_id USING ERRCODE = '23503';
    END IF;
    IF cust_org <> NEW.org_id THEN
        RAISE EXCEPTION 'billing period scope: customer org mismatch' USING ERRCODE = '23514';
    END IF;

    IF NEW.calendar_source_location_id IS NOT NULL THEN
        SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.calendar_source_location_id;
        IF loc_org IS NULL THEN
            RAISE EXCEPTION 'billing period scope: location % not found', NEW.calendar_source_location_id USING ERRCODE = '23503';
        END IF;
        IF loc_org <> NEW.org_id THEN
            RAISE EXCEPTION 'billing period scope: location org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.calendar_policy_id IS NOT NULL THEN
        SELECT p.org_id INTO pol_org FROM public.financial_policies p WHERE p.id = NEW.calendar_policy_id;
        IF pol_org IS NULL THEN
            RAISE EXCEPTION 'billing period scope: calendar policy % not found', NEW.calendar_policy_id USING ERRCODE = '23503';
        END IF;
        IF pol_org <> NEW.org_id THEN
            RAISE EXCEPTION 'billing period scope: calendar policy org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_financial_billing_period_scope ON public.financial_billing_periods;
CREATE TRIGGER trg_validate_financial_billing_period_scope
    BEFORE INSERT OR UPDATE ON public.financial_billing_periods
    FOR EACH ROW EXECUTE FUNCTION public.validate_financial_billing_period_scope();

-- -----------------------------------------------------------------------------
-- A MATERIALIZED PERIOD'S BOUNDS ARE HISTORICAL FACT
--
-- The identity and the interval are what every economic row will bind to, so they may not be
-- rewritten under those rows. The rule lives here rather than in a service for the reason this
-- spine states everywhere money rules are concerned: a rule the service owns is a rule a second
-- writer can skip.
--
-- Status is the one thing that is SUPPOSED to move — open to closed, once, and never back. Reopening
-- is deliberately not expressible: if a closed commercial period must change, the canonical answer
-- is a prospective correction in a later open period, which is the next slice.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_financial_billing_period_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.period_key IS DISTINCT FROM OLD.period_key
        OR NEW.cadence IS DISTINCT FROM OLD.cadence
        OR NEW.starts_on IS DISTINCT FROM OLD.starts_on
        OR NEW.ends_on IS DISTINCT FROM OLD.ends_on
        OR NEW.anchor_on IS DISTINCT FROM OLD.anchor_on
    THEN
        RAISE EXCEPTION
            'billing_period_bounds_frozen: period % is materialized; its identity and interval cannot change. A later calendar change applies to periods not yet materialized.',
            OLD.id
            USING ERRCODE = '0A000';
    END IF;

    IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
        RAISE EXCEPTION
            'billing_period_closed: period % is commercially final and cannot be reopened; record a prospective correction in a later open period',
            OLD.id
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_financial_billing_period_immutability ON public.financial_billing_periods;
CREATE TRIGGER trg_enforce_financial_billing_period_immutability
    BEFORE UPDATE ON public.financial_billing_periods
    FOR EACH ROW EXECUTE FUNCTION public.enforce_financial_billing_period_immutability();

-- -----------------------------------------------------------------------------
-- RLS — a new public table without it grants `authenticated` a default SELECT.
-- Same shape as the accounting periods it sits beside.
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_billing_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_billing_periods_org_select ON public.financial_billing_periods;
CREATE POLICY financial_billing_periods_org_select ON public.financial_billing_periods
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_billing_periods_service ON public.financial_billing_periods;
CREATE POLICY financial_billing_periods_service ON public.financial_billing_periods
    FOR ALL TO service_role USING (true) WITH CHECK (true);

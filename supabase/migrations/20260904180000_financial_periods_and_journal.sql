-- =============================================================================
-- THREAD 5 — BILLING PERIODS + FINANCIAL JOURNAL
--
-- WHAT WAS ACTUALLY MISSING, MEASURED ON THE CERTIFICATION DATABASE
--
-- Thread 1 made a childcare charge postable, immutable and correctable once.
-- Thread 8 made money receivable and applicable exactly once. Between them the
-- platform can say what a family owes and what they have paid. What it could
-- not say is WHEN, for reporting: there was no accounting period anywhere in
-- the schema (`information_schema` returned NONE for every table or column
-- named for a period), and no posted financial history for childcare money at
-- all.
--
-- The GL that exists (`gl_journal_entries` / `gl_journal_lines`, driven by
-- `post_ledger_transaction`) is a real double-entry structure, but it belongs
-- to the job/Stripe vertical and is dormant: `post_ledger_transaction` is
-- called by no application code, and on the certification database with three
-- charges, four payments and three allocations it held ZERO rows.
--
-- `post_payment_to_ledger` — the one function whose name promised the missing
-- behavior — was proved live to do nothing but stamp a timestamp: posting a
-- childcare payment moved `ledger_transactions`, `gl_journal_entries` and
-- `gl_journal_lines` from 0 to 0 while setting `posted_to_ledger_at`. Its own
-- comment had said so since March ("extend to create ledger entries later").
-- Section 6 stops it advertising a consequence it does not have.
--
-- WHAT THIS IS, AND WHAT IT IS DELIBERATELY NOT
--
-- This is an append-only SUBLEDGER — a posted financial event history with
-- explicit period attribution. It is NOT double-entry accounting, and it is not
-- converted into any: the existing GL keeps that job, and this journal
-- establishes the seam an export to it would use.
--
-- It is also NOT a balance authority. Charges remain the authority for gross
-- owed and active allocations of posted payments remain the authority for what
-- reduces it (`jobPaymentBalances`, unchanged by this migration). The journal
-- says what happened and in which period; it never says what is owed. That is
-- why `obligation_delta_cents` is a separate column from `amount_cents` — a
-- receipt has an amount and changes nothing owed, and one column would have
-- invited a consumer to sum it and get a second, wrong answer.
-- =============================================================================

-- Overlap is a range question, and a range question deserves a range constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- 1. ACCOUNTING CALENDARS
--
-- The calendar is what makes "period" a configured fact rather than a guess off
-- a due date. `period_style` is descriptive: the periods themselves carry the
-- authoritative dates, so a 4/4/5 calendar is not a special code path — it is
-- rows whose boundaries are not month boundaries.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounting_calendars (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
    calendar_key text NOT NULL,
    name text NOT NULL,
    period_style text NOT NULL DEFAULT 'calendar_month',
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT financial_accounting_calendars_key_chk CHECK (btrim(calendar_key) <> ''),
    CONSTRAINT financial_accounting_calendars_style_chk
        CHECK (period_style = ANY (ARRAY['calendar_month'::text, 'four_four_five'::text, 'custom'::text])),
    CONSTRAINT financial_accounting_calendars_org_key_uq UNIQUE (org_id, calendar_key)
);

-- Attribution must be deterministic, so an organization has at most ONE active
-- calendar. Without this the resolver would have to pick, and "pick" is how a
-- posted row's period becomes a matter of query order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounting_calendars_one_active_per_org
    ON public.financial_accounting_calendars (org_id)
    WHERE is_active;

COMMENT ON TABLE public.financial_accounting_calendars IS
    'Reporting calendars for financial posting attribution. At most one active calendar per org, so accounting-period attribution is deterministic. A 4/4/5 calendar is period rows whose boundaries are not month boundaries; period_style is descriptive only.';

-- -----------------------------------------------------------------------------
-- 2. ACCOUNTING PERIODS
--
-- `starts_on`/`ends_on` are INCLUSIVE, which is why the exclusion constraint
-- uses '[]'. Periods within one calendar may not overlap; two calendars may
-- freely cover the same days, because a monthly billing view and a 4/4/5
-- reporting view are supposed to describe the same money differently.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounting_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
    calendar_id uuid NOT NULL REFERENCES public.financial_accounting_calendars(id) ON DELETE CASCADE,
    period_key text NOT NULL,
    label text,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    status text NOT NULL DEFAULT 'open',
    closed_at timestamptz,
    closed_by uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT financial_accounting_periods_key_chk CHECK (btrim(period_key) <> ''),
    CONSTRAINT financial_accounting_periods_status_chk
        CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT financial_accounting_periods_span_chk CHECK (ends_on >= starts_on),
    CONSTRAINT financial_accounting_periods_calendar_key_uq UNIQUE (calendar_id, period_key),
    CONSTRAINT financial_accounting_periods_no_overlap
        EXCLUDE USING gist (calendar_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_financial_accounting_periods_org_span
    ON public.financial_accounting_periods (org_id, starts_on, ends_on);

COMMENT ON TABLE public.financial_accounting_periods IS
    'Reporting periods for posted financial history. Boundaries are inclusive. Periods within one calendar cannot overlap (financial_accounting_periods_no_overlap); different calendars may cover the same days, which is how monthly parent billing coexists with a 4/4/5 reporting calendar.';

-- -----------------------------------------------------------------------------
-- 3. THE FINANCIAL JOURNAL
--
-- Append-only posted history. One row per financial consequence, attributed to
-- the accounting period the consequence is effective in, and idempotent by a
-- key the writer derives from the source row so a retry cannot double-record.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,

    -- Account scope: whose history this is. `customer_id` is the household/account
    -- where one is known; the billable source is the same polymorphic identity the
    -- charge and payment carry, so the journal never invents a third way to name a
    -- payer.
    customer_id uuid,
    billable_source_type text,
    billable_source_id uuid,

    -- Provenance: the row that caused this consequence.
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    entry_type text NOT NULL,

    -- `amount_cents` is the event's own amount and is always positive.
    -- `obligation_delta_cents` is what the event does to what the customer owes,
    -- and is the ONLY signed number here. A receipt has an amount and a delta of
    -- zero: money arriving is not money applied.
    amount_cents bigint NOT NULL,
    obligation_delta_cents bigint NOT NULL,
    currency text NOT NULL DEFAULT 'USD',

    -- The temporal facts, kept apart on purpose. `effective_on` is what the
    -- accounting period is resolved from; `posted_at` is when the system recorded
    -- it; `billing_period_key` is the customer-facing cycle and is NOT derived
    -- from either.
    effective_on date NOT NULL,
    posted_at timestamptz NOT NULL DEFAULT now(),
    billing_period_key text,

    -- Attribution, frozen at write time. The key is denormalised deliberately: a
    -- later calendar edit cannot restate what a closed period reported, because
    -- the row keeps the key it was posted under.
    accounting_calendar_id uuid REFERENCES public.financial_accounting_calendars(id) ON DELETE RESTRICT,
    accounting_period_id uuid REFERENCES public.financial_accounting_periods(id) ON DELETE RESTRICT,
    accounting_period_key text,
    period_attribution text NOT NULL DEFAULT 'attributed',

    -- Correction lineage, mirroring the charge spine: a correction points at what
    -- it corrects and neither row is ever rewritten.
    reverses_entry_id uuid REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,

    idempotency_key text NOT NULL,
    actor_user_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT financial_journal_entries_source_type_chk
        CHECK (source_type = ANY (ARRAY['charge'::text, 'payment'::text, 'payment_allocation'::text])),
    CONSTRAINT financial_journal_entries_entry_type_chk
        CHECK (entry_type = ANY (ARRAY[
            'charge_posted'::text,
            'charge_corrected'::text,
            'payment_received'::text,
            'payment_applied'::text,
            'payment_application_reversed'::text,
            'payment_refunded'::text
        ])),
    CONSTRAINT financial_journal_entries_amount_chk CHECK (amount_cents > 0),
    CONSTRAINT financial_journal_entries_attribution_chk
        CHECK (period_attribution = ANY (ARRAY['attributed'::text, 'no_calendar'::text])),
    -- Attribution is all-or-nothing: an attributed row names its period, an
    -- unattributed one names none. A half-filled attribution would be a period
    -- that reporting could neither trust nor ignore.
    CONSTRAINT financial_journal_entries_attribution_shape_chk CHECK (
        (period_attribution = 'attributed'
            AND accounting_period_id IS NOT NULL
            AND accounting_calendar_id IS NOT NULL
            AND accounting_period_key IS NOT NULL)
        OR (period_attribution = 'no_calendar'
            AND accounting_period_id IS NULL
            AND accounting_calendar_id IS NULL
            AND accounting_period_key IS NULL)
    ),
    CONSTRAINT financial_journal_entries_org_idempotency_uq UNIQUE (org_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_org_period
    ON public.financial_journal_entries (org_id, accounting_period_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_source
    ON public.financial_journal_entries (org_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_billing_period
    ON public.financial_journal_entries (org_id, billing_period_key)
    WHERE billing_period_key IS NOT NULL;

COMMENT ON TABLE public.financial_journal_entries IS
    'Append-only posted financial history for the childcare spine, attributed to an accounting period. A SUBLEDGER, not double-entry accounting, and NOT a balance authority: charges remain the authority for gross owed and active allocations of posted payments for what reduces it. Sum obligation_delta_cents for a period movement; never for a balance.';

COMMENT ON COLUMN public.financial_journal_entries.obligation_delta_cents IS
    'Effect on what the customer owes. charge_posted +amount; charge_corrected +/-amount; payment_received 0 (received is not applied); payment_applied -amount; payment_application_reversed +amount; payment_refunded 0.';

COMMENT ON COLUMN public.financial_journal_entries.accounting_period_key IS
    'Frozen at write time. A later calendar edit cannot restate what a period already reported.';

-- -----------------------------------------------------------------------------
-- 4. PERIOD INTEGRITY
-- -----------------------------------------------------------------------------

-- A period belongs to its calendar's organization. Without this a period could
-- be hung off another org's calendar and attribute that org's money.
CREATE OR REPLACE FUNCTION public.enforce_accounting_period_org_parity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    calendar_org uuid;
BEGIN
    SELECT c.org_id INTO calendar_org
      FROM public.financial_accounting_calendars c
     WHERE c.id = NEW.calendar_id;

    IF calendar_org IS NULL THEN
        RAISE EXCEPTION 'accounting period references calendar % which does not exist', NEW.calendar_id
            USING ERRCODE = '23503';
    END IF;

    IF calendar_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'accounting period and its calendar belong to different organizations'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_accounting_period_org_parity ON public.financial_accounting_periods;
CREATE TRIGGER trg_enforce_accounting_period_org_parity
    BEFORE INSERT OR UPDATE ON public.financial_accounting_periods
    FOR EACH ROW EXECUTE FUNCTION public.enforce_accounting_period_org_parity();

-- A period that has already reported cannot move. Reopening and closing are
-- lifecycle; re-dating is rewriting history, and the rows attributed to it were
-- posted under the old boundaries.
CREATE OR REPLACE FUNCTION public.enforce_accounting_period_boundaries_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    attributed bigint;
BEGIN
    IF NEW.starts_on IS NOT DISTINCT FROM OLD.starts_on
       AND NEW.ends_on IS NOT DISTINCT FROM OLD.ends_on
       AND NEW.period_key IS NOT DISTINCT FROM OLD.period_key
       AND NEW.calendar_id IS NOT DISTINCT FROM OLD.calendar_id THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO attributed
      FROM public.financial_journal_entries j
     WHERE j.accounting_period_id = OLD.id;

    IF attributed > 0 THEN
        RAISE EXCEPTION
            'accounting period % has % posted journal entries and its boundaries are frozen; open a new period instead',
            OLD.period_key, attributed
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_accounting_period_boundaries_frozen ON public.financial_accounting_periods;
CREATE TRIGGER trg_enforce_accounting_period_boundaries_frozen
    BEFORE UPDATE ON public.financial_accounting_periods
    FOR EACH ROW EXECUTE FUNCTION public.enforce_accounting_period_boundaries_frozen();

-- -----------------------------------------------------------------------------
-- 5. JOURNAL INTEGRITY
--
-- Attribution happens HERE rather than in the service, for the same reason the
-- reversal bound is an index rather than a read: a rule the service owns is a
-- rule a second writer can skip. The service mirrors these refusals to give an
-- operator a sentence instead of a constraint name.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attribute_financial_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    cal_id uuid;
    per record;
BEGIN
    SELECT c.id INTO cal_id
      FROM public.financial_accounting_calendars c
     WHERE c.org_id = NEW.org_id
       AND c.is_active
     LIMIT 1;

    -- An organization that has not adopted a reporting calendar still gets a
    -- complete history; it simply carries no period, and says so rather than
    -- being attributed to a period nobody configured.
    IF cal_id IS NULL THEN
        NEW.accounting_calendar_id := NULL;
        NEW.accounting_period_id := NULL;
        NEW.accounting_period_key := NULL;
        NEW.period_attribution := 'no_calendar';
        RETURN NEW;
    END IF;

    SELECT p.id, p.period_key, p.status INTO per
      FROM public.financial_accounting_periods p
     WHERE p.calendar_id = cal_id
       AND NEW.effective_on BETWEEN p.starts_on AND p.ends_on
     LIMIT 1;

    IF per.id IS NULL THEN
        RAISE EXCEPTION
            'accounting_period_unavailable: no period on the active calendar covers %', NEW.effective_on
            USING ERRCODE = '0A000';
    END IF;

    -- A CLOSED PERIOD DEFERS; IT DOES NOT REFUSE.
    --
    -- Refusing would make a REPORTING boundary able to block an OPERATIONAL act:
    -- a family could not be charged, or a cheque could not be recorded, because
    -- the books were closed. Books close after the fact and money does not wait
    -- for them. So the consequence is attributed to the earliest open period at
    -- or after the closed one — the standard "post to the next open period" —
    -- and the row records where it came from, so nobody has to infer later why
    -- an entry effective in P08 reports in P09.
    --
    -- What is NOT allowed is silence: if there is no open period to defer to,
    -- attribution is unavailable and the write is refused rather than guessed.
    IF per.status = 'closed' THEN
        SELECT p.id, p.period_key, p.status INTO per
          FROM public.financial_accounting_periods p
         WHERE p.calendar_id = cal_id
           AND p.status = 'open'
           AND p.starts_on > NEW.effective_on
         ORDER BY p.starts_on
         LIMIT 1;

        IF per.id IS NULL THEN
            RAISE EXCEPTION
                'accounting_period_closed: the period covering % is closed and no later open period exists',
                NEW.effective_on
                USING ERRCODE = '0A000';
        END IF;

        NEW.metadata := NEW.metadata || jsonb_build_object(
            'accounting_period_deferred', true,
            'accounting_period_deferred_from_date', NEW.effective_on
        );
    END IF;

    NEW.accounting_calendar_id := cal_id;
    NEW.accounting_period_id := per.id;
    NEW.accounting_period_key := per.period_key;
    NEW.period_attribution := 'attributed';
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_attribute_financial_journal_entry ON public.financial_journal_entries;
CREATE TRIGGER trg_attribute_financial_journal_entry
    BEFORE INSERT ON public.financial_journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.attribute_financial_journal_entry();

-- Posted history is posted. A correction is a NEW row pointing at what it
-- corrects — the same discipline the charge spine holds.
CREATE OR REPLACE FUNCTION public.enforce_financial_journal_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'financial journal entry % cannot be deleted; posted history is append-only', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RAISE EXCEPTION 'financial journal entry % cannot be updated; record a corrective entry instead', OLD.id
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_financial_journal_append_only ON public.financial_journal_entries;
CREATE TRIGGER trg_enforce_financial_journal_append_only
    BEFORE UPDATE OR DELETE ON public.financial_journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.enforce_financial_journal_append_only();

-- -----------------------------------------------------------------------------
-- 6. THE FUNCTION THAT ADVERTISED A CONSEQUENCE IT DID NOT HAVE
--
-- `post_payment_to_ledger` stamps `payments.posted_to_ledger_at` and does
-- nothing else — proved live, not read off the source: posting a childcare
-- payment left ledger_transactions, gl_journal_entries and gl_journal_lines at
-- zero rows. The behaviour is correct for what the job/Stripe path needs; the
-- NAME is what was wrong, and a name that promises journal posting is how
-- Thread 8 came to suspect the platform had a journal it did not have.
--
-- The stamp is preserved exactly, under a name that describes it. The trigger
-- keeps firing on the same events, so job payments are untouched.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_payment_posted_to_ledger_at(payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Status stamp only. This creates no journal effect, and never did.
  update public.payments
  set posted_to_ledger_at = now()
  where id = payment_id
    and posted_to_ledger_at is null;
end;
$function$;

COMMENT ON FUNCTION public.stamp_payment_posted_to_ledger_at(uuid) IS
    'Sets payments.posted_to_ledger_at. A STATUS STAMP, not a journal posting: it creates no ledger_transactions, gl_journal_entries or gl_journal_lines rows. Posted financial history for the childcare spine lives in financial_journal_entries. Renamed from post_payment_to_ledger in 20260904180000 because that name promised a consequence this function does not have.';

CREATE OR REPLACE FUNCTION public.trg_post_payment_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if new.posted_to_ledger_at is not null then
    return new;
  end if;

  if (new.posted_at is not null)
     and (old.posted_at is distinct from new.posted_at)
  then
    perform public.stamp_payment_posted_to_ledger_at(new.id);
    return new;
  end if;

  if (new.paid_at is not null)
     and (old.paid_at is distinct from new.paid_at)
  then
    perform public.stamp_payment_posted_to_ledger_at(new.id);
  end if;

  return new;
end;
$function$;

DROP FUNCTION IF EXISTS public.post_payment_to_ledger(uuid);

COMMENT ON COLUMN public.payments.posted_to_ledger_at IS
    'When the payment status stamp was applied. NOT a journal posting and not evidence of one: it is set by trg_post_payment_to_ledger on an UPDATE of posted_at/paid_at, so a payment inserted already-posted (the childcare path) never carries it. Posted financial history is financial_journal_entries.';

-- -----------------------------------------------------------------------------
-- 7. RLS — the P3.1 posture: org SELECT for financial roles, server-side writes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_accounting_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_accounting_calendars_org_select ON public.financial_accounting_calendars;
CREATE POLICY financial_accounting_calendars_org_select ON public.financial_accounting_calendars
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_accounting_calendars_service ON public.financial_accounting_calendars;
CREATE POLICY financial_accounting_calendars_service ON public.financial_accounting_calendars
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS financial_accounting_periods_org_select ON public.financial_accounting_periods;
CREATE POLICY financial_accounting_periods_org_select ON public.financial_accounting_periods
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_accounting_periods_service ON public.financial_accounting_periods;
CREATE POLICY financial_accounting_periods_service ON public.financial_accounting_periods
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS financial_journal_entries_org_select ON public.financial_journal_entries;
CREATE POLICY financial_journal_entries_org_select ON public.financial_journal_entries
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_journal_entries_service ON public.financial_journal_entries;
CREATE POLICY financial_journal_entries_service ON public.financial_journal_entries
    FOR ALL TO service_role USING (true) WITH CHECK (true);

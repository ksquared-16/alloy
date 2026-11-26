-- =============================================================================
-- TWO GENERATIONS OF COMMERCIAL PERIOD MEMBERSHIP, AND A ROW ALWAYS SAYS WHICH
--
-- S1 persisted the customer's canonical commercial calendar. S2 binds economics to it. The problem
-- S2 had to solve first was history, and the census settled it as a fact rather than a preference:
--
--   * assignment IS deterministic — all 132 historical charges resolve a customer, and all 132 are
--     placed by a DECLARED date (72 `billable_on`, 60 `service_date`, zero falling through to
--     `created_at`), so no historical row needs current configuration to be placed;
--   * representation is NOT free — one customer, 29944d3e, has a legacy December that OVERLAPS the
--     canonical biweekly period 2026-11-23~2026-12-06, and S1's exclusion constraint correctly
--     refuses one customer holding two commercial clocks over the same day.
--
-- That overlap is general, not incidental: any non-monthly canonical calendar necessarily overlaps
-- the legacy months holding its historical charges. So legacy history does NOT become canonical
-- period rows. It keeps the monthly label Alloy actually showed, and says so.
--
-- ── THE CUTOVER IS A PROPERTY OF THE ROW, NOT A DATE ──
--
-- `billing_period_generation` is the cutover mechanism. Not a deployment timestamp, not "today", and
-- not the nullness of `billing_period_id` — a null id cannot distinguish "legacy history" from "a
-- canonical row whose binding was skipped", and that difference is exactly what has to survive.
-- Every row carries its own generation forever:
--
--   legacy          · membership is the frozen historical monthly key; no canonical period row
--   canonical       · membership is a persisted `financial_billing_periods.id`
--   not_applicable  · this charge has no commercial period at all (the job/pricing vertical)
--
-- ── WHY `not_applicable` IS THE DEFAULT, AND WHY THAT IS NOT A LOOPHOLE ──
--
-- Three writers insert charges that are not on this spine — `cancellationFeeCharge`,
-- `pricingChangeAdjustmentCharge` and `upsertPrimaryDraftServiceCharge`. All three are job-grain and
-- none of them sets `billable_source_type` at all; job billing owns its own lifecycle, which is why
-- `enforce_charge_correction_lineage` already admits only the two childcare sources. They get the
-- default and stay untouched.
--
-- The childcare spine CANNOT take that default: `charges_billing_period_childcare_chk` forbids
-- `not_applicable` on an `enrollment_agreement` or `customer` charge. So the one writer that matters
-- must state a generation, and a writer that forgets fails LOUDLY on a constraint instead of quietly
-- creating a charge with no commercial period. That is the refusal section 5 asks for, enforced
-- where a second writer cannot skip it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CHARGES
-- -----------------------------------------------------------------------------
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS billing_period_id uuid
        REFERENCES public.financial_billing_periods (id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS legacy_billing_period_key text,
    ADD COLUMN IF NOT EXISTS billing_period_generation text NOT NULL DEFAULT 'not_applicable';

COMMENT ON COLUMN public.charges.billing_period_id IS
    'The customer''s canonical commercial billing period. Set only when billing_period_generation = ''canonical''. Immutable once set: a charge is corrected by a new economic fact, never moved to another period.';
COMMENT ON COLUMN public.charges.legacy_billing_period_key IS
    'HISTORICAL ONLY. The monthly period label Alloy actually presented for this charge before the canonical calendar existed. Provenance, never an authority: it cannot disagree with billing_period_id because the two never coexist.';
COMMENT ON COLUMN public.charges.billing_period_generation IS
    'Which semantics assigned this row''s commercial membership: legacy (frozen monthly key), canonical (persisted period id), or not_applicable (no commercial period — the job/pricing vertical). The cutover is this column, not a date.';

ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_billing_period_generation_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_billing_period_generation_chk
        CHECK (billing_period_generation = ANY (ARRAY['legacy'::text, 'canonical'::text, 'not_applicable'::text]));

-- All-or-nothing per generation, the same shape rule the journal uses for accounting attribution. A
-- half-filled membership is one no reader could trust or ignore.
ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_billing_period_shape_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_billing_period_shape_chk CHECK (
        (billing_period_generation = 'legacy'
            AND billing_period_id IS NULL AND legacy_billing_period_key IS NOT NULL)
        OR (billing_period_generation = 'canonical'
            AND billing_period_id IS NOT NULL)
        OR (billing_period_generation = 'not_applicable'
            AND billing_period_id IS NULL AND legacy_billing_period_key IS NULL)
    );

-- -----------------------------------------------------------------------------
-- 2. BACKFILL, FROM HISTORICAL FACTS ONLY
--
-- The fallback chain is `placeInBillingPeriod`'s own, and the identity is the calendar month, which
-- is what the legacy paths meant. Deliberately NOT resolved through any current calendar: not the
-- customer's, not the location's, and not a term anchor. Runs BEFORE the childcare constraint is
-- added, because that constraint is what the backfill exists to satisfy.
--
-- Idempotent: only rows still carrying the default are touched, so a re-run cannot restate a row
-- that already froze its membership.
-- -----------------------------------------------------------------------------
UPDATE public.charges c
   SET billing_period_generation = 'legacy',
       legacy_billing_period_key = to_char(
           coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date), 'YYYY-MM')
 WHERE c.billing_period_generation = 'not_applicable'
   AND c.billable_source_type = ANY (ARRAY['enrollment_agreement'::text, 'customer'::text]);

-- -----------------------------------------------------------------------------
-- 3. THE CHILDCARE CHECK IS NOT HERE — IT IS MIGRATION B, AND THE REASON IS ORDERING
--
-- `charges_billing_period_childcare_chk` is what stops a childcare charge arriving with no
-- commercial period, and it CANNOT ship in this migration. The incompatibility is two-sided:
--
--   * this migration first, old writers still serving -> every childcare insert omits the new
--     columns, takes the `not_applicable` default, and the CHECK would refuse it. Charge creation
--     breaks until the deploy lands.
--   * new writers first, this migration not yet applied -> the writers name three columns that do
--     not exist yet. Charge creation breaks until the migration lands.
--
-- So neither half is safe alone, and the safe sequence is expand, deploy, contract:
--
--   1. apply THIS migration (additive; old writers keep working, childcare rows take the default)
--   2. let the new writers deploy (they now populate the columns)
--   3. apply 20261116120000, which adds the CHECK and converts anything the window produced
--
-- Documented here rather than in a runbook because the next person to add a constraint to this
-- table needs to meet this reasoning at the table, not in a wiki.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_charges_billing_period
    ON public.charges (billing_period_id) WHERE billing_period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_charges_legacy_billing_period
    ON public.charges (org_id, legacy_billing_period_key) WHERE legacy_billing_period_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. REDUCTIONS
--
-- Direct binding rather than derivation through `charge_id`, and the reason is the slice AFTER this
-- one: a prospective December correction references a November charge while economically belonging
-- to December. Deriving the period from the source charge would make that unrepresentable, so the
-- reduction owns its own commercial period.
--
-- No default here. Every reduction reduces a childcare charge, so there is no exempt vertical to
-- accommodate, and a writer that omits the generation must fail rather than inherit one.
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_reduction_applications
    ADD COLUMN IF NOT EXISTS billing_period_id uuid
        REFERENCES public.financial_billing_periods (id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS legacy_billing_period_key text,
    ADD COLUMN IF NOT EXISTS billing_period_generation text;

COMMENT ON COLUMN public.financial_reduction_applications.billing_period_id IS
    'The canonical commercial period this reduction economically belongs to. Deliberately independent of the source charge''s period: a prospective correction belongs to an open later period while referencing a closed historical fact.';

-- Legacy reductions keep the monthly interpretation they were written under. `period_key` already
-- holds it, so this freezes what the row itself recorded rather than recomputing anything.
UPDATE public.financial_reduction_applications r
   SET billing_period_generation = 'legacy',
       legacy_billing_period_key = coalesce(r.period_key, to_char(r.period_start, 'YYYY-MM'))
 WHERE r.billing_period_generation IS NULL;

ALTER TABLE public.financial_reduction_applications
    ALTER COLUMN billing_period_generation SET NOT NULL;

ALTER TABLE public.financial_reduction_applications DROP CONSTRAINT IF EXISTS fin_reduction_billing_period_generation_chk;
ALTER TABLE public.financial_reduction_applications
    ADD CONSTRAINT fin_reduction_billing_period_generation_chk
        CHECK (billing_period_generation = ANY (ARRAY['legacy'::text, 'canonical'::text]));

ALTER TABLE public.financial_reduction_applications DROP CONSTRAINT IF EXISTS fin_reduction_billing_period_shape_chk;
ALTER TABLE public.financial_reduction_applications
    ADD CONSTRAINT fin_reduction_billing_period_shape_chk CHECK (
        (billing_period_generation = 'legacy'
            AND billing_period_id IS NULL AND legacy_billing_period_key IS NOT NULL)
        OR (billing_period_generation = 'canonical'
            AND billing_period_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_fin_reduction_billing_period
    ON public.financial_reduction_applications (billing_period_id) WHERE billing_period_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. MEMBERSHIP IS HISTORICAL FACT
--
-- Once a row's commercial membership is set it cannot be moved — not to another period, not to the
-- other generation, and not by rewriting the frozen legacy label. Correction is a NEW economic fact
-- through the existing `source_charge_id` / `reverses_id` lineage, which is the same doctrine the
-- posted-charge immutability trigger already enforces for amounts.
--
-- In the database, because a rule a service owns is a rule a second writer can skip. Three of the
-- four charge writers are outside this spine and would never have learned a TypeScript rule.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_charge_billing_period_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.billing_period_generation <> 'not_applicable'
       AND NEW.billing_period_generation IS DISTINCT FROM OLD.billing_period_generation THEN
        RAISE EXCEPTION
            'charge_billing_period_generation_frozen: charge % was assigned under % semantics; a row does not change generation',
            OLD.id, OLD.billing_period_generation
            USING ERRCODE = '0A000';
    END IF;

    IF OLD.billing_period_id IS NOT NULL
       AND NEW.billing_period_id IS DISTINCT FROM OLD.billing_period_id THEN
        RAISE EXCEPTION
            'charge_billing_period_frozen: charge % already belongs to commercial period %; correct it with a new economic fact rather than moving it',
            OLD.id, OLD.billing_period_id
            USING ERRCODE = '0A000';
    END IF;

    IF OLD.legacy_billing_period_key IS NOT NULL
       AND NEW.legacy_billing_period_key IS DISTINCT FROM OLD.legacy_billing_period_key THEN
        RAISE EXCEPTION
            'charge_legacy_billing_period_frozen: charge % recorded historical period %; history is not rewritten',
            OLD.id, OLD.legacy_billing_period_key
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_charge_billing_period_immutability ON public.charges;
CREATE TRIGGER trg_enforce_charge_billing_period_immutability
    BEFORE UPDATE ON public.charges
    FOR EACH ROW EXECUTE FUNCTION public.enforce_charge_billing_period_immutability();

CREATE OR REPLACE FUNCTION public.enforce_reduction_billing_period_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.billing_period_generation IS DISTINCT FROM OLD.billing_period_generation
       OR (OLD.billing_period_id IS NOT NULL AND NEW.billing_period_id IS DISTINCT FROM OLD.billing_period_id)
       OR (OLD.legacy_billing_period_key IS NOT NULL
           AND NEW.legacy_billing_period_key IS DISTINCT FROM OLD.legacy_billing_period_key) THEN
        RAISE EXCEPTION
            'reduction_billing_period_frozen: reduction % already belongs to its commercial period; record a new reduction rather than moving this one',
            OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_reduction_billing_period_immutability ON public.financial_reduction_applications;
CREATE TRIGGER trg_enforce_reduction_billing_period_immutability
    BEFORE UPDATE ON public.financial_reduction_applications
    FOR EACH ROW EXECUTE FUNCTION public.enforce_reduction_billing_period_immutability();

-- -----------------------------------------------------------------------------
-- 6. WHAT IS DELIBERATELY ABSENT
--
-- No rule ties a correction's period to its source charge's period. A future prospective correction
-- must be able to sit in an OPEN December while pointing at a CLOSED November, so
-- `correction.billing_period_id = source_charge.billing_period_id` is exactly the constraint that
-- must never exist. Stated here so a later slice does not add it by reflex.
--
-- No "period must be open" guard either. Commercial close is S4's, and this spine has no closed
-- period yet to guard against. The guard point is `enforce_charge_billing_period_immutability` and
-- the charge writer's resolution step; neither needs reshaping to add it.
-- -----------------------------------------------------------------------------

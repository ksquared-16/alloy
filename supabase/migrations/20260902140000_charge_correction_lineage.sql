-- =============================================================================
-- CHARGE CORRECTION LINEAGE — a posted charge is corrected ONCE, and never by a
-- correction of a correction.
--
-- `20260902130000` made posted money correctable: immutability without a lawful way to fix a
-- mistake is a dead end, so `charge.reverse` writes a NEW row through `source_charge_id`. It gave
-- the correction no BOUND, and an unbounded correction is its own way of inventing money:
--
--  * NOTHING STOPPED A SECOND REVERSAL. `createChildcareCorrection` checks only that its source is
--    posted. Reverse a $1,300 charge twice and the ledger holds +1300, -1300, -1300: the family is
--    owed $1,300 they were never charged. The card made this the likely path rather than an exotic
--    one — it offers `Reverse` on every posted row, and a reversed original still rendered as
--    `posted`, so the operator saw an apparently-unreversed charge and pressed the button again.
--
--  * A REVERSAL COULD BE REVERSED, without end. A correction row is posted money, so it offered
--    `Reverse` too. Each pair swings the balance by the full amount and the chain has no terminus,
--    so the provenance of a balance becomes a walk rather than a fact.
--
-- The rule is stated HERE because this is where money rules are authoritative: a service check
-- races with itself, and a UNIQUE INDEX does not. The service mirrors it for friendly errors.
--
-- No new financial concept, no new column, no new status. A correction is still a new row linked by
-- `source_charge_id`; this says how many of them a charge may have.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The lineage rule.
--
-- Scoped to the CHILDCARE billable sources, quantified over the set for the same reason
-- `20260902130000` was: a source the substrate admits is a source the rule protects. `job` rows are
-- exempt — job billing owns its own correction lifecycle and is not part of this spine.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_charge_correction_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    childcare_sources text[] := ARRAY['enrollment_agreement'::text, 'customer'::text];
    parent_source_charge_id uuid;
    parent_exists boolean;
    live_reversals integer;
BEGIN
    IF NEW.source_charge_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only this spine's money. A job correction is governed by job billing.
    IF NEW.billable_source_type IS NULL OR NOT (NEW.billable_source_type = ANY (childcare_sources)) THEN
        RETURN NEW;
    END IF;

    SELECT true, c.source_charge_id
      INTO parent_exists, parent_source_charge_id
      FROM public.charges c
     WHERE c.id = NEW.source_charge_id;

    -- A dangling correction has nothing to correct. `source_charge_id` carries no FK on this table,
    -- so this is the only place that says so.
    IF NOT COALESCE(parent_exists, false) THEN
        RAISE EXCEPTION 'charge correction references charge % which does not exist', NEW.source_charge_id
            USING ERRCODE = '23503';
    END IF;

    -- A CORRECTION IS RECORDED AGAINST THE ORIGINAL, never against another correction. Reversing a
    -- reversal reinstates a charge by side effect and admits another reversal after it; a charge
    -- that should stand again is re-billed as its own charge, which leaves a record of the decision.
    IF parent_source_charge_id IS NOT NULL THEN
        RAISE EXCEPTION 'charge % is itself a correction and cannot be corrected; record the correction against the original charge %',
            NEW.source_charge_id, parent_source_charge_id
            USING ERRCODE = '0A000';
    END IF;

    -- ONCE REVERSED, A CHARGE NO LONGER STANDS. It admits no further correction of any kind: a
    -- second reversal credits the family twice, and a credit against money already fully removed
    -- removes it again.
    SELECT count(*)
      INTO live_reversals
      FROM public.charges c
     WHERE c.source_charge_id = NEW.source_charge_id
       AND c.id IS DISTINCT FROM NEW.id
       AND c.status <> 'void'
       AND c.metadata ->> 'correction_kind' = 'reversal';

    IF live_reversals > 0 THEN
        RAISE EXCEPTION 'charge % has already been reversed and admits no further correction', NEW.source_charge_id
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_charge_correction_lineage() IS
    'A childcare charge correction (source_charge_id) points at an ORIGINAL charge that exists, is not itself a correction, and has not already been reversed. Job rows are governed by job billing and pass through.';

DROP TRIGGER IF EXISTS trg_enforce_charge_correction_lineage ON public.charges;
CREATE TRIGGER trg_enforce_charge_correction_lineage
    BEFORE INSERT OR UPDATE OF source_charge_id ON public.charges
    FOR EACH ROW EXECUTE FUNCTION public.enforce_charge_correction_lineage();

-- -----------------------------------------------------------------------------
-- 2. The race-proof backstop.
--
-- The trigger above reads the sibling rows, so two concurrent reversals of the same charge can both
-- see zero and both write. A partial UNIQUE INDEX cannot: one of them fails. This is the same shape
-- as posting's in-UPDATE `status = 'draft'` guard — the guarantee lives where concurrency is
-- actually resolved, and the friendly message lives in the service.
--
-- Deliberately NOT scoped by org_id: `source_charge_id` is a charge primary key, so an org
-- qualifier would only widen the rule to one reversal PER ORG.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_charges_one_live_reversal_per_source
    ON public.charges (source_charge_id)
    WHERE source_charge_id IS NOT NULL
      AND status <> 'void'
      AND metadata ->> 'correction_kind' = 'reversal';

COMMENT ON INDEX public.uq_charges_one_live_reversal_per_source IS
    'At most one live reversal per source charge. Two concurrent reversals of one charge would each credit the family in full; the trigger cannot see the other transaction, this can.';

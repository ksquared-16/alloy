-- =============================================================================
-- FINANCIAL TRANSACTION SPINE — actor attribution, and household parity for the
-- guarantees that already protect enrolment charges.
--
-- Two things this closes, both proven by inspection of the substrate rather than
-- inferred from naming:
--
-- 1. ACTOR ATTRIBUTION. `charges` carries `created_at` / `updated_at` / `posted_at`
--    but never recorded WHO. `payments`, `payment_allocations` and
--    `resolved_obligations` all carry `created_by` / `updated_by`; the charge — the
--    row that decides what a family owes — did not. `chargeLifecycleService` already
--    wrote `updated_by` on its recalculate path, against a column that does not
--    exist, so that path could only ever fail against the real database.
--
-- 2. HOUSEHOLD PARITY. `20260827120000_household_billable_source` admitted
--    `billable_source_type = 'customer'` so a family can be charged before anyone is
--    enrolled. It widened the CHECK constraints and stopped there: the posted-charge
--    immutability trigger and the RESTRICTIVE role gate were both written against
--    the literal 'enrollment_agreement', so a household charge could be edited in
--    place after posting and written by any authenticated member of the org. The
--    pre-enrolment charge was made representable without being made safe.
--
-- Neither adds a financial concept. Both extend guarantees the substrate already
-- states to the source kind it already admits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Actor attribution on the charge itself.
--
-- `posted_by` is its own column rather than a reuse of `updated_by`: posting is the
-- authoritative money transition, and "who last touched this row" is not an answer
-- to "who made this owed". Plain uuid with no FK, matching `payments.created_by`
-- and `resolved_obligations.created_by` — the actor is an auth user id, and a
-- deleted operator must not take a posted charge with them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS created_by uuid,
    ADD COLUMN IF NOT EXISTS updated_by uuid,
    ADD COLUMN IF NOT EXISTS posted_by uuid;

COMMENT ON COLUMN public.charges.created_by IS
    'Auth user that created this charge row. Drafts and correction rows alike.';
COMMENT ON COLUMN public.charges.updated_by IS
    'Auth user that last modified this charge row. Only a DRAFT is modifiable.';
COMMENT ON COLUMN public.charges.posted_by IS
    'Auth user that posted this charge — the actor of the authoritative money transition. Never overwritten, because posting happens once.';

-- -----------------------------------------------------------------------------
-- 2a. Posted-charge immutability now covers every childcare billable source.
--
-- The predicate is the SET of childcare sources rather than one literal, so the next
-- source kind admitted by the CHECK constraint is protected by the same rule instead
-- of silently escaping it. `job` rows are deliberately still exempt: job billing owns
-- its own lifecycle and is not part of this spine.
--
-- `posted_by` joins the frozen field list: rewriting the actor of a posted charge is
-- the same class of edit as rewriting its amount.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_childcare_charge_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    childcare_sources text[] := ARRAY['enrollment_agreement'::text, 'customer'::text];
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.billable_source_type = ANY (childcare_sources) AND OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'posted childcare charge % is immutable: DELETE not allowed; record a reversal/credit/replacement via source_charge_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: only governs posted childcare charges; drafts and job rows pass.
    IF OLD.billable_source_type = ANY (childcare_sources) AND OLD.status <> 'draft' THEN
        IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
            OR NEW.charge_category IS DISTINCT FROM OLD.charge_category
            OR NEW.charge_type IS DISTINCT FROM OLD.charge_type
            OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
            OR NEW.billable_source_type IS DISTINCT FROM OLD.billable_source_type
            OR NEW.billable_source_id IS DISTINCT FROM OLD.billable_source_id
            OR NEW.source_charge_id IS DISTINCT FROM OLD.source_charge_id
            OR NEW.service_date IS DISTINCT FROM OLD.service_date
            OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
            OR NEW.posted_by IS DISTINCT FROM OLD.posted_by THEN
            RAISE EXCEPTION 'posted childcare charge % is immutable: financial fields cannot change in place; record a reversal/credit/replacement via source_charge_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;
        -- Status may advance among posted states (driven by payments) but never
        -- revert to draft or void in place (void = a reversal row, not an edit).
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = ANY (ARRAY['draft'::text, 'void'::text]) THEN
            RAISE EXCEPTION 'posted childcare charge % cannot transition to % in place; record a reversal via source_charge_id', OLD.id, NEW.status
                USING ERRCODE = '0A000';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- The trigger definition is unchanged; recreated so a database that somehow lost it
-- converges to the same shape as one that never did.
DROP TRIGGER IF EXISTS trg_enforce_childcare_charge_immutability ON public.charges;
CREATE TRIGGER trg_enforce_childcare_charge_immutability
    BEFORE UPDATE OR DELETE ON public.charges
    FOR EACH ROW EXECUTE FUNCTION public.enforce_childcare_charge_immutability();

-- -----------------------------------------------------------------------------
-- 2b. The RESTRICTIVE childcare role gate covers the same set.
--
-- Identical shape to P3.1's gate — RESTRICTIVE, `authenticated` only, service_role
-- untargeted so server-side writes are unaffected — with `customer` added to the
-- guarded set. Without this a household money row was writable by any authenticated
-- org member, which is precisely the posture the P3.1 gate exists to deny.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
    fin_tables text[] := ARRAY['charges', 'ledger_transactions', 'gl_journal_lines'];
BEGIN
    FOREACH tbl IN ARRAY fin_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_childcare_write_rolegate ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_childcare_write_rolegate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
            || 'USING (billable_source_type IS NULL '
            || 'OR billable_source_type <> ALL (ARRAY[''enrollment_agreement''::text, ''customer''::text]) '
            || 'OR public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])) '
            || 'WITH CHECK (billable_source_type IS NULL '
            || 'OR billable_source_type <> ALL (ARRAY[''enrollment_agreement''::text, ''customer''::text]) '
            || 'OR public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );
    END LOOP;
END $$;

COMMENT ON FUNCTION public.enforce_childcare_charge_immutability() IS
    'Posted childcare charges (billable_source_type in enrollment_agreement | customer) are append-only: financial fields, posting stamp and posting actor are frozen, DELETE is refused, and status never reverts to draft/void in place. Corrections are NEW rows via source_charge_id. Job rows are governed by job billing and pass through.';

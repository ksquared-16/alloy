-- =============================================================================
-- HOUSEHOLD_BILLABLE_SOURCE — close the gap, using the polymorphic pair that already exists.
--
-- A family incurs charges BEFORE anyone is enrolled: a waitlist fee, a registration or application
-- fee, a deposit. Those have no enrollment agreement to hang off, so the Financials surface treated
-- the family as having "nothing billable" — an assumption the business rejects.
--
-- `customer` is an EXISTING canonical durable subject. Nothing Financials-only is invented, and no
-- childcare-specific `child_id` column is added: `billable_source_type` + `billable_source_id`
-- already carry the distinction, and none of the three kinds is privileged.
--
-- Whether a PARTICULAR charge requires an enrolment stays with its charge template and the
-- `charge.add` resolver. Tuition may require one; a waitlist fee must not.
-- =============================================================================

ALTER TABLE public.charges
    DROP CONSTRAINT IF EXISTS charges_billable_source_type_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text,
            'customer'::text
        ])
    );

ALTER TABLE public.ledger_transactions
    DROP CONSTRAINT IF EXISTS ledger_transactions_billable_source_type_chk;
ALTER TABLE public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text,
            'customer'::text
        ])
    );

COMMENT ON COLUMN public.charges.billable_source_type IS
    'Polymorphic billable source kind: job | enrollment_agreement | customer. None is privileged. `customer` carries pre-enrolment household charges (waitlist / registration / application fees, deposits), which is why an enrollment agreement is one source and never eligibility for Financials.';

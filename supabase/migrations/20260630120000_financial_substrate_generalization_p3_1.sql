-- =============================================================================
-- Financial substrate generalization — P3.1 (L5 Operational Consequences)
-- =============================================================================
-- Generalizes the EXISTING posting substrate (charges, ledger_transactions,
-- gl_journal_lines) so childcare Financial Resolution can later post against it
-- WITHOUT job-vertical coupling. Purely additive + childcare-scoped guards.
--
-- Doctrine: docs/platform/modules/billing-financials-platform.md
--           ("Ratified P3.1 implementation gates"),
--           docs/sprints/06_2026/operational_execution_p3_financial_resolution_planning.md (§11)
--
-- Ratified gates implemented here:
--   1. Additive `charge_category` taxonomy (legacy `charge_type` + its CHECK are
--      FROZEN and untouched).
--   2. Childcare posted-charge immutability (scoped to billable_source_type =
--      'enrollment_agreement'; corrections are NEW rows via source_charge_id).
--   3. Childcare financial writes are role-gated (RESTRICTIVE policy on the
--      childcare rows only; job rows + service_role are unaffected).
--   4. Generic billable-source dimension on charges / ledger_transactions /
--      gl_journal_lines (one ledger, one GL — NO second ledger, NO childcare table).
--   5. Currency posture: substrate already carries currency_code / currency; no
--      structural change (rate-plan currency arrives in P3.2). Documented only.
--
-- Explicitly NOT here: invoices, payments/billing UI, subsidy, rate plans,
-- service agreements, responsibility parties, expected-subsidy AR. Posting stays
-- separate from Financial Resolution. No job-vertical regression.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gate 1: additive charge_category (legacy charge_type + CHECK left untouched)
-- -----------------------------------------------------------------------------
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS charge_category text;

ALTER TABLE public.charges
    DROP CONSTRAINT IF EXISTS charges_charge_category_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_charge_category_chk CHECK (
        charge_category IS NULL OR charge_category = ANY (ARRAY[
            'tuition'::text,
            'deposit'::text,
            'consumable_fee'::text,
            'late_pickup'::text,
            'one_time'::text,
            'discount'::text,
            'credit'::text,
            'adjustment'::text,
            'fee'::text,
            'subsidy_offset'::text
        ])
    );

CREATE INDEX IF NOT EXISTS idx_charges_org_charge_category_partial
    ON public.charges USING btree (org_id, charge_category)
    WHERE charge_category IS NOT NULL;

COMMENT ON COLUMN public.charges.charge_category IS
    'Canonical financial taxonomy (P3.1). Additive; legacy charge_type is frozen for job compatibility. Childcare charges set charge_category.';

-- -----------------------------------------------------------------------------
-- Gate 4: generic billable-source dimension on charges
-- (job stays via job_id; enrollment_agreement arrives via billable_source_*)
-- -----------------------------------------------------------------------------
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS billable_source_type text;
ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS billable_source_id uuid;

-- Relax the job anchor so non-job (childcare) charges are representable.
ALTER TABLE public.charges
    ALTER COLUMN job_id DROP NOT NULL;

-- Backfill existing rows to the generic dimension as 'job' (idempotent).
UPDATE public.charges
    SET billable_source_type = 'job', billable_source_id = job_id
    WHERE billable_source_type IS NULL AND job_id IS NOT NULL;

ALTER TABLE public.charges
    DROP CONSTRAINT IF EXISTS charges_billable_source_type_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text
        ])
    );

-- A source identity must be present: legacy/job rows carry job_id; non-job rows
-- must carry a billable_source. (All existing rows satisfy this via job_id.)
ALTER TABLE public.charges
    DROP CONSTRAINT IF EXISTS charges_source_present_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_source_present_chk CHECK (
        job_id IS NOT NULL
        OR (billable_source_type IS NOT NULL AND billable_source_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_charges_org_billable_source_partial
    ON public.charges USING btree (org_id, billable_source_type, billable_source_id)
    WHERE billable_source_type IS NOT NULL;

COMMENT ON COLUMN public.charges.billable_source_type IS
    'Polymorphic billable source kind (P3.1): job | enrollment_agreement. Neither is privileged; job also retains job_id.';
COMMENT ON COLUMN public.charges.billable_source_id IS
    'Polymorphic billable source id (P3.1). For job rows equals job_id; for childcare equals the enrollment agreement id.';

-- -----------------------------------------------------------------------------
-- Gate 4: same generic dimension on the single ledger + GL (NO second ledger)
-- job_id is already nullable on both; these columns are purely additive.
-- -----------------------------------------------------------------------------
ALTER TABLE public.ledger_transactions
    ADD COLUMN IF NOT EXISTS billable_source_type text;
ALTER TABLE public.ledger_transactions
    ADD COLUMN IF NOT EXISTS billable_source_id uuid;
ALTER TABLE public.ledger_transactions
    DROP CONSTRAINT IF EXISTS ledger_transactions_billable_source_type_chk;
ALTER TABLE public.ledger_transactions
    ADD CONSTRAINT ledger_transactions_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text
        ])
    );
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_org_billable_source_partial
    ON public.ledger_transactions USING btree (org_id, billable_source_type, billable_source_id)
    WHERE billable_source_type IS NOT NULL;

ALTER TABLE public.gl_journal_lines
    ADD COLUMN IF NOT EXISTS billable_source_type text;
ALTER TABLE public.gl_journal_lines
    ADD COLUMN IF NOT EXISTS billable_source_id uuid;
ALTER TABLE public.gl_journal_lines
    DROP CONSTRAINT IF EXISTS gl_journal_lines_billable_source_type_chk;
ALTER TABLE public.gl_journal_lines
    ADD CONSTRAINT gl_journal_lines_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text
        ])
    );
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_org_billable_source_partial
    ON public.gl_journal_lines USING btree (org_id, billable_source_type, billable_source_id)
    WHERE billable_source_type IS NOT NULL;

COMMENT ON COLUMN public.ledger_transactions.billable_source_type IS
    'Generic billable-source dimension (P3.1): job | enrollment_agreement. One ledger for the org; no childcare-specific ledger.';
COMMENT ON COLUMN public.gl_journal_lines.billable_source_type IS
    'Generic billable-source dimension (P3.1): job | enrollment_agreement. One GL for the org; no childcare-specific GL.';

-- -----------------------------------------------------------------------------
-- Gate 2: childcare posted-charge immutability (scoped; jobs unaffected)
-- Draft childcare charges are freely recomputable. Once a childcare charge is
-- posted (status <> 'draft'), its financial fields are frozen and it cannot be
-- deleted or reverted in place — corrections are NEW rows via source_charge_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_childcare_charge_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.billable_source_type = 'enrollment_agreement' AND OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'posted childcare charge % is immutable: DELETE not allowed; record a reversal/credit/replacement via source_charge_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: only governs posted childcare charges; drafts and job rows pass.
    IF OLD.billable_source_type = 'enrollment_agreement' AND OLD.status <> 'draft' THEN
        IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
            OR NEW.charge_category IS DISTINCT FROM OLD.charge_category
            OR NEW.charge_type IS DISTINCT FROM OLD.charge_type
            OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
            OR NEW.billable_source_type IS DISTINCT FROM OLD.billable_source_type
            OR NEW.billable_source_id IS DISTINCT FROM OLD.billable_source_id
            OR NEW.source_charge_id IS DISTINCT FROM OLD.source_charge_id
            OR NEW.service_date IS DISTINCT FROM OLD.service_date THEN
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

DROP TRIGGER IF EXISTS trg_enforce_childcare_charge_immutability ON public.charges;
CREATE TRIGGER trg_enforce_childcare_charge_immutability
    BEFORE UPDATE OR DELETE ON public.charges
    FOR EACH ROW EXECUTE FUNCTION public.enforce_childcare_charge_immutability();

-- -----------------------------------------------------------------------------
-- Gate 3: childcare write posture — RESTRICTIVE role-gate on childcare rows only.
-- RESTRICTIVE policies AND with the existing permissive same-org policies, so:
--   * job rows (billable_source_type <> 'enrollment_agreement') are unaffected;
--   * childcare-row writes/reads via `authenticated` additionally require
--     has_org_role(owner/admin/ops) — no broad authenticated money writes;
--   * service_role is not targeted here, so server-side writes are unaffected.
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
            || 'USING (billable_source_type IS DISTINCT FROM ''enrollment_agreement'' '
            || 'OR public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])) '
            || 'WITH CHECK (billable_source_type IS DISTINCT FROM ''enrollment_agreement'' '
            || 'OR public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );
    END LOOP;
END $$;

-- =============================================================================
-- THE CONTRACT HALF: A CHILDCARE CHARGE MUST NAME ITS COMMERCIAL GENERATION
--
-- 20261115120000 expanded the schema additively so that neither the old writers nor the new ones
-- could be broken by the ordering. This closes it, and it may only be applied AFTER the writers that
-- populate `billing_period_generation` are deployed and serving.
--
-- Applying this while old writers are live would refuse every childcare charge, which is exactly the
-- window the split exists to avoid.
--
-- ── IT CONVERTS THE WINDOW RATHER THAN FAILING ON IT ──
--
-- Any childcare charge created between the expand and this contract carries the `not_applicable`
-- default. Those rows are real money and must not block the constraint, so they are frozen as
-- LEGACY from their own declared dates — the same historical reading 20261115120000 used for
-- genuine history. In a clean sequence this updates nothing; it exists so a slow deploy does not
-- turn into a failed migration.
-- =============================================================================

UPDATE public.charges c
   SET billing_period_generation = 'legacy',
       legacy_billing_period_key = to_char(
           coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date), 'YYYY-MM')
 WHERE c.billing_period_generation = 'not_applicable'
   AND c.billable_source_type = ANY (ARRAY['enrollment_agreement'::text, 'customer'::text]);

ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_billing_period_childcare_chk;
ALTER TABLE public.charges
    ADD CONSTRAINT charges_billing_period_childcare_chk CHECK (
        billable_source_type IS NULL
        OR NOT (billable_source_type = ANY (ARRAY['enrollment_agreement'::text, 'customer'::text]))
        OR billing_period_generation <> 'not_applicable'
    );

COMMENT ON CONSTRAINT charges_billing_period_childcare_chk ON public.charges IS
    'A charge on the childcare spine must state whether its commercial membership is legacy or canonical. The job/pricing vertical keeps the not_applicable default because it has no commercial period at all. This is what makes a writer that forgets to resolve a period fail loudly instead of quietly creating money that belongs to no period.';

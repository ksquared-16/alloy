-- =============================================================================
-- W7 BILLING CONFIGURATION CONVERGENCE — INVOICE TIMING BECOMES A BILLING POLICY
--
-- When an obligation is invoiced used to be a property of each charge template
-- (`billable_on_strategy`), so "how does this organisation bill?" had no single
-- answer and could not express "N days before the billing period begins" at all.
--
-- 1. `financial_policies` gains the `invoice_timing` type: an effective-dated,
--    scoped rule (org default, location override) relative to the BILLING PERIOD.
-- 2. `financial_charge_templates.billable_on_strategy` gains `billing_policy`,
--    and it becomes the DEFAULT: a template follows the organisation's rule
--    unless it names an exception. Existing templates keep the value they hold —
--    configuration is not rewritten by a migration; the W7 baseline repoints them
--    deliberately through the authoring path.
--
-- No charge is touched. Billing-period membership is not stored here, and no
-- already-bound obligation moves (Director decision: forward-correct only).
--
-- Re-runnable: every CHECK is dropped by fixed name before it is recreated,
-- because a failed apply does not roll back DDL.
-- =============================================================================

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
            'billing_calendar'::text,
            'invoice_timing'::text
        ]));

ALTER TABLE public.financial_charge_templates
    DROP CONSTRAINT IF EXISTS financial_charge_templates_billable_on_check;
ALTER TABLE public.financial_charge_templates
    ADD CONSTRAINT financial_charge_templates_billable_on_check
        CHECK (billable_on_strategy = ANY (ARRAY[
            'billing_policy'::text, 'immediate'::text, 'offset_days'::text, 'next_billing_cycle'::text
        ]));

ALTER TABLE public.financial_charge_templates
    ALTER COLUMN billable_on_strategy SET DEFAULT 'billing_policy';

COMMENT ON COLUMN public.financial_charge_templates.billable_on_strategy IS
    'When a charge from this template is invoiced. billing_policy (default) follows the organisation''s invoice_timing policy (org default, location override). The others are template EXCEPTIONS: immediate = on the service date; offset_days = billable_offset_days after the service date; next_billing_cycle = when the next billing period begins. The invoice date never precedes the day the charge is created, and it never decides billing-period membership — the service date does.';

COMMENT ON COLUMN public.charges.billable_on IS
    'The invoice date: when the obligation is billed/presented. Resolved by the date chain (resolveChargeDateChain) from the invoice-timing rule and never earlier than the day the charge was created. It does NOT decide the billing period — billing_period_id is bound from the service date.';

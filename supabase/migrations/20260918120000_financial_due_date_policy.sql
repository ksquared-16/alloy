-- ============================================================================================
-- WHEN IS PAYMENT EXPECTED? — the one date in the billing chain with no configured rule.
--
-- `financial_charge_templates` already configures when a charge becomes BILLABLE:
-- `billable_on_strategy` is immediate | offset_days | next_billing_cycle, with
-- `billable_offset_days` beside it. That is the invoice/bill date, and it is a configured fact.
--
-- `charges.due_date` had no equivalent anywhere. It is supplied by whichever caller happens to
-- create the charge, which means an organisation cannot state its own terms — "due on the 1st",
-- "net 10" — and two charges created by two paths can carry two different unstated conventions.
-- Recurring generation had no rule to follow at all, so generated tuition carried whatever the
-- consumption path left there.
--
-- ── WHY A POLICY AND NOT A TEMPLATE COLUMN ──
--
-- Due terms are how an ORGANISATION runs its billing, not a property of one charge kind: a tenant
-- saying "everything is due on the first of the period" should not have to restate that on every
-- template it ever authors, and should not silently get a different answer from a template somebody
-- forgot to set. `financial_policies` is already the owner of exactly this kind of fact — it
-- carries `proration`, `billing_cadence`, `posting_review` and `grace_period`, all of them rules
-- about how money behaves here — and it is already effective-dated and scopable to org, location,
-- service or rate plan, which is the narrowing a template column could not express.
--
-- It is also already SURFACED. `/organization/financials?chapter=policies` renders
-- `POLICY_TYPE_REGISTRY[type].fields` generically, so this type becomes operator-configurable
-- without a new route, a new screen or a bespoke form. That is the configuration boundary the
-- thread is required to respect.
--
-- ── WHY THE CHECK IS REPLACED RATHER THAN DROPPED ──
--
-- The constraint is the only thing standing between this column and a typo becoming a policy type
-- nothing resolves. It is re-declared with one more permitted value, not removed. The existing
-- twelve are listed again verbatim so this migration is readable as the whole truth about what a
-- policy type may be, rather than as a diff a reader has to reconstruct.
--
-- No data is rewritten. Nothing is backfilled. An organisation that configures no due-date policy
-- keeps exactly today's behaviour, which is why this is additive and safe to apply before the
-- application that reads it ships.
-- ============================================================================================

ALTER TABLE public.financial_policies
    DROP CONSTRAINT IF EXISTS financial_policies_policy_type_check;

ALTER TABLE public.financial_policies
    ADD CONSTRAINT financial_policies_policy_type_check
    CHECK (policy_type = ANY (ARRAY[
        'proration'::text, 'billing_cadence'::text, 'grace_period'::text,
        'late_fee'::text, 'nsf_fee'::text, 'deposit'::text, 'refund'::text,
        'vacation_credit'::text, 'withdrawal'::text, 'write_off'::text,
        'adjustment_approval'::text, 'draft_expiration'::text, 'posting_review'::text,
        -- NEW: when payment is expected, relative to the invoice date or the commercial period.
        'due_date'::text
    ]));

COMMENT ON CONSTRAINT financial_policies_policy_type_check ON public.financial_policies IS
    'The policy types this platform resolves. `due_date` answers when payment is expected — '
    'distinct from billable_on (when the charge is issued) and from grace_period (how long after '
    'due before lateness applies). Adding a value here without adding it to POLICY_TYPE_REGISTRY '
    'creates a policy an operator can store and nothing can resolve.';

-- =============================================================================
-- A financial reduction records WHICH policy decided it — from either substrate.
-- =============================================================================
-- `financial_reduction_applications` already intends policy-backed reductions:
-- it carries `resolved_obligation_id`, a policy snapshot, and a basis. But its
-- policy lineage assumes one substrate — `commercial_policy_id` — while the
-- production Operational Consumption path resolves its policy from
-- `financial_policies`. Attendance Thread 7's vacation credit is decided by a
-- `financial_policies` row of type `vacation_credit`, and the schema had nowhere
-- truthful to say so.
--
-- The two available workarounds were both lies. Writing `reduction_kind =
-- 'manual'` would record an automated commercial consequence as something an
-- operator granted by hand. Minting a synthetic `commercial_policies` row so the
-- existing FK could be satisfied would invent a policy nobody authored, and split
-- one decision across two substrates: eligibility resolved from
-- `financial_policies`, provenance claimed from `commercial_policies`. A
-- reduction has to be able to name the authority that actually decided it.
--
-- So the column is added beside its sibling rather than in place of it, and the
-- integrity rule becomes "exactly one policy authority" instead of "one specific
-- one".
--
-- SAFETY. A governed read-only census of the deployed primary was taken before
-- this was written (`thread7-reduction-provenance-census.sql`): the table holds
-- ZERO rows there, so no historical row can fail the stricter CHECK below, and
-- the tightened manual rule costs no existing data. A CHECK is validated against
-- every row when it is added, which is why that was read first rather than
-- discovered here.
--
-- NOT IN SCOPE. No second reduction table, no backfill, no migration of existing
-- `commercial_policy_id` values, no change to amounts, posting or journal
-- behaviour. This is a provenance and integrity change, not Commercial
-- convergence — that convergence is a downstream handoff and must carry
-- `policy_kind`, `resolved_obligation_id` and historical provenance across with
-- it.
-- =============================================================================

-- 1. The second policy authority -------------------------------------------
--
-- RESTRICT, matching `commercial_policy_id` exactly and for the reason that
-- column's own migration gives: a policy that produced money cannot be deleted
-- out from under it. `SET NULL` was the tempting alternative and is wrong — it
-- would erase which policy authorised historical money, leaving a reduction that
-- cannot explain itself. Note the consequence: `voidFinancialPolicy` hard-deletes,
-- so voiding a policy that has already produced a reduction is now refused by
-- this key. That refusal is correct; money already moved under that decision.
ALTER TABLE public.financial_reduction_applications
    ADD COLUMN IF NOT EXISTS financial_policy_id uuid
        REFERENCES public.financial_policies (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.financial_reduction_applications.financial_policy_id IS
    'The financial_policies row that authorised this reduction, when the deciding substrate was Financial Policy rather than Commercial Policy. Exactly one of commercial_policy_id / financial_policy_id is set on a policy reduction. Provenance, not a live pointer: it records who decided, and a later correction never rewrites it.';

-- Deliberately no index: the sibling `commercial_policy_id` has none either, and
-- this column is read as lineage on a row already found by id, charge or period.

-- 2. The reduction kind vocabulary ------------------------------------------
ALTER TABLE public.financial_reduction_applications
    DROP CONSTRAINT IF EXISTS financial_reduction_applications_policy_kind_check;

ALTER TABLE public.financial_reduction_applications
    ADD CONSTRAINT financial_reduction_applications_policy_kind_check
    CHECK (policy_kind = ANY (ARRAY[
        'waiver'::text,
        'sibling_discount'::text,
        'discount'::text,
        -- A vacation credit is not a generic discount: it gives back part of an
        -- agreed tuition because a child was operationally away, and an operator
        -- reading a reduction needs to see that rather than infer it.
        'vacation_credit'::text
    ]));

-- 3. Exactly one policy authority -------------------------------------------
--
-- The previous rule required `commercial_policy_id` specifically. Relaxing it to
-- "either" without further care would admit two failures: a policy reduction with
-- NO authority, which cannot explain itself, and one with BOTH, where nothing
-- says which decided. So the policy branch is an exclusive or, written as
-- inequality over the two IS NOT NULL booleans — true exactly when one holds.
--
-- The manual branch keeps its existing law (a reason) and gains the stronger
-- form the census proved safe: a manual reduction carries no policy id at all.
-- Nobody granted it under a policy, so a policy id on such a row could only be
-- misleading.
ALTER TABLE public.financial_reduction_applications
    DROP CONSTRAINT IF EXISTS financial_reduction_applications_kind_chk;

ALTER TABLE public.financial_reduction_applications
    ADD CONSTRAINT financial_reduction_applications_kind_chk
    CHECK (
        (
            reduction_kind = 'policy'
            AND policy_kind IS NOT NULL
            AND ((commercial_policy_id IS NOT NULL) <> (financial_policy_id IS NOT NULL))
        )
        OR (
            reduction_kind = 'manual'
            AND NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL
            AND commercial_policy_id IS NULL
            AND financial_policy_id IS NULL
        )
    );

-- =============================================================================
-- THE ADMINISTRATOR COULD UNAPPLY MONEY IT WAS NOT ALLOWED TO PUT BACK.
--
-- THE SYMPTOM. The same managed QA identity as `20260912150000` — `admin` in its org, department
-- scope all, site scope all, authenticated — is refused when it records or applies money:
--
--     ACTION_BLOCKED  Recording a payment requires fin.write.
--
-- while that role holds `fin.read`, `fin.adjust`, `fin.responsibility` and `fin.subsidy`. Measured,
-- not assumed: `/api/admin/rbac/grants?role_key=admin` returns the four and not the fifth.
--
-- WHY THIS IS WORSE THAN THE READ GAP IT FOLLOWS.
--
-- `20260912150000` withheld `fin.write` on purpose, and said so: widening mutation authority is "a
-- decision about who may move money, not a repair to a workspace that could not render". That was
-- the right call for a read repair. What it could not see is that the two financial capabilities are
-- not independent once money can be REALLOCATED.
--
-- Moving a payment from one charge to another is a reversal (`fin.adjust`) followed by an
-- application (`fin.write`). This role holds the first and not the second. So an administrator here
-- can take money off the charge it was answering, and can NEVER put it anywhere. The reversal
-- succeeds, the charge's obligation returns, and the money is left unapplied with no permitted way
-- forward. The half-authority is what strands it. Granting neither would be coherent; granting both
-- is coherent; granting exactly the destructive half is the one combination that loses money's
-- placement, and that is the combination this organization is in.
--
-- WHY GRANTING IT TO `admin` IS SAFE TO DO UNCONDITIONALLY.
--
-- The argument is the one `20260912150000` already established and does not need re-litigating: the
-- seed's own contract gives Organization Administrator "every ordinary organizational capability the
-- platform defines, with no deliberate platform-owner exclusion". `fin.write` is named outright in
-- the admin package of every default-role seed since W-12 — `20260807170000`, `20260910183000`,
-- `20260911140000`, `20260912030000`, `20260912114000`. For `admin`, a missing ordinary capability
-- cannot be a legitimate revocation, because the role's contract does not admit one. This org never
-- met the W-12 baseline (it was missing twenty-two keys), so "no row" here is an absence.
--
-- That reasoning is specific to `admin`. It would NOT justify the same grant to any other role.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
-- It grants `fin.write` to `admin` and nothing else. It does not touch another role, another
-- capability, or the remaining backlog of missing keys, which still belongs to the Access/RBAC
-- owner. It does not weaken a single server-side gate: `payment.record`, `payment.apply_to_charge`
-- and `payment.reverse_application` each still check their own permission on every call, and the
-- household guard in `applyPaymentToCharge` is unaffected — a grant decides who may ask, never what
-- the answer is.
--
-- Idempotent, org-scoped, and applied only where the role actually exists and is active.
-- =============================================================================

-- Validated against `permission_definitions`, the table the grants FK actually names (RL-7).
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, 'admin', pd.key, true
  FROM public.role_definitions rd
  JOIN public.permission_definitions pd
    ON pd.key = 'fin.write'
   AND pd.is_active
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = 'admin'
          AND g.permission_key = pd.key
   );

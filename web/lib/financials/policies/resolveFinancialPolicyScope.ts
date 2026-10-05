/**
 * THE POLICY SCOPE OF ONE ECONOMIC SUBJECT — resolved once, for every Financials writer.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────
 *
 * `resolveFinancialPolicy` narrows over five dimensions and ranks them
 * org < location < service < rate_plan < customer. A caller that cannot NAME a dimension can never
 * match a policy scoped to it — `matchesContext` compares the policy's column against the
 * context's, and an absent context value simply never equals a present policy value.
 *
 * Two separate instances of that were found:
 *
 *   · `resolveDueDate` passed only `serviceId`, so a `scope_type: "customer"` due-date policy
 *     resolved to `no_policy` no matter how it was configured. Repaired in the Adjustment slice for
 *     the correction path only.
 *   · `DueDateInputs` had no `locationId` at all, so a `scope_type: "location"` due-date policy
 *     could never resolve for ANY caller — correction, generated or manual.
 *
 * The second is why this module is a shared resolver rather than one more argument threaded through
 * one more call site. The omission was never about a single spelling: it is that each writer knew a
 * different subset of the subject, and none of them knew all of it.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────────────────────────
 *
 * It is not a second policy engine and it decides nothing. It answers one question — WHICH ACCOUNT
 * AND WHICH LOCATION is this charge about — so that the one canonical resolver can narrow properly.
 * Precedence, effective-dating and specificity all stay where they are.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveChargeCustomerId } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import type { FinancialPolicyRow, FinancialPolicyType } from "@/lib/financials/policies/financialPolicyTypes";

export type FinancialPolicyScope = {
    /** The account this charge belongs to. Null when it cannot be reached. */
    customerId: string | null;
    /**
     * The site this charge's enrolment attends.
     *
     * Null for a household-source charge — a waitlist or registration fee is the HOUSEHOLD's and
     * does not attend anywhere, so there is no location for a location-scoped rule to match. That
     * is a true answer rather than a missing one, and it must stay null: inventing a location for a
     * household charge would let a site's terms govern money that is not the site's.
     */
    locationId: string | null;
};

export const EMPTY_FINANCIAL_POLICY_SCOPE: FinancialPolicyScope = { customerId: null, locationId: null };

/**
 * ── IS IT WORTH A READ? ──────────────────────────────────────────────────────────────────────
 *
 * `previewTemplateCharge` runs once per consumption fact, so resolving the subject unconditionally
 * would add a database round trip to every generated charge in a batch — to narrow against
 * dimensions most organisations never scope by.
 *
 * The policies are already in hand when the question is asked, so the caller can see in advance
 * whether any rule of this type is scoped to an account or a site. If none is, the answer cannot
 * change and the read is skipped entirely. Correctness is not traded for the saving: the read
 * happens exactly when it can matter.
 *
 * `is_active === false` is excluded here the same way `isEffectiveOn` excludes it in the resolver,
 * so a retired account-scoped rule does not keep buying reads forever.
 */
export function policyScopeNarrowingNeeded(
    policies: readonly FinancialPolicyRow[],
    policyType: FinancialPolicyType,
): boolean {
    return policies.some(
        (p) =>
            p.policy_type === policyType
            && p.is_active !== false
            && (p.scope_type === "customer" || p.scope_type === "location"),
    );
}

/**
 * Resolve the account and site a charge's billable source belongs to.
 *
 * The customer comes from `resolveChargeCustomerId` — the same authority the billing-period binder
 * uses, including its member hop for an agreement that names a child rather than a household — so
 * there is exactly one rule for "which account is this". The site is read here because nothing else
 * needed it before.
 *
 * READ FAILURES PROPAGATE. `resolveChargeCustomerId` throws a `BillingPeriodBindingError` on a
 * failed read, and that is left to propagate: a due date resolved against a scope we failed to read
 * would silently be the ORG's answer for an account that has its own terms, which is a wrong
 * number presented as a right one.
 */
export async function resolveFinancialPolicyScope(
    supabase: SupabaseClient,
    args: { orgId: string; billableSourceType: string; billableSourceId: string },
): Promise<FinancialPolicyScope> {
    const type = (args.billableSourceType ?? "").trim();
    const id = (args.billableSourceId ?? "").trim();
    if (!id) return EMPTY_FINANCIAL_POLICY_SCOPE;

    const customerId = await resolveChargeCustomerId(supabase, {
        orgId: args.orgId,
        billableSourceType: type,
        billableSourceId: id,
    });

    /* Only an enrolment attends a site. A household source has none — see `locationId` above. */
    if (type !== "enrollment_agreement") return { customerId, locationId: null };

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("site_location_id")
        .eq("org_id", args.orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) {
        throw new Error(`financial policy scope: the enrolment's site could not be read (${error.message.trim()})`);
    }
    const site = ((data as { site_location_id: string | null } | null)?.site_location_id ?? "").trim();
    return { customerId, locationId: site || null };
}

/**
 * WHICH COMMERCIAL CALENDAR GOVERNS THIS CUSTOMER'S ACCOUNT?
 *
 * The billing period is the period the CUSTOMER is billed for, so the calendar belongs to the
 * account. A LOCATION configures the default, because two locations may legitimately bill on
 * different cadences and anchors. What a location cannot do is own the calendar of a household whose
 * children attend two of them — and that is not hypothetical: the deployed census found 3 of 10
 * households spanning two locations, and 28 posted charges bound to the household rather than to any
 * agreement, which reach no location at all.
 *
 * ── THE RESOLUTION ORDER, AND WHY AMBIGUITY IS AN ANSWER ──
 *
 *   1. an EXPLICIT customer calendar wins outright;
 *   2. otherwise a SINGLE-LOCATION account inherits that location's default;
 *   3. otherwise, with MORE THAN ONE active location and no explicit account calendar, this returns
 *      `ambiguous_locations` and names them.
 *
 * Step 3 deliberately does NOT fall back to the org default, does not take the first agreement, and
 * does not take the location of whichever child happens to be on screen. Any of those would invent a
 * commercial clock the operator never chose, and a clock is what finality is measured against. The
 * honest answer is that the account needs an explicit calendar, so this says so and lets the caller
 * refuse rather than guessing.
 *
 * An account with NO active location — a household between enrolments, which still holds posted
 * household-grain economics — falls to the org default, because there is no location to inherit from
 * and no ambiguity to refuse.
 *
 * ── PURE ──
 *
 * No IO. Policies and the account's active locations are supplied by the caller, so resolution is
 * recomputable and testable, exactly as `resolveFinancialPolicy` is. This decides nothing about
 * money: it decides which calendar applies.
 */
import {
    resolveFinancialPolicy,
    type PolicyResolutionContext,
} from "@/lib/financials/policies/resolveFinancialPolicy";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import { isPeriodBillableCadence, type BillingCadence } from "@/lib/financials/billingPeriod";

export const BILLING_CALENDAR_POLICY_TYPE = "billing_calendar" as const;

/** The calendar that governs an account, with the provenance a materialized period must record. */
export type ResolvedCustomerBillingCalendar = {
    kind: "resolved";
    cadence: BillingCadence;
    /** Null only for monthly, which is the calendar month and tiles from nothing. */
    anchorOn: string | null;
    /** Which scope answered — what `calendar_scope` records. */
    scope: "customer" | "location" | "org";
    policyId: string;
    /** Which location's configuration supplied the bounds. Set only when `scope` is "location". */
    sourceLocationId: string | null;
    /** The resolved value, frozen onto the period so a later policy edit cannot restate it. */
    snapshot: Record<string, unknown>;
};

export type CustomerBillingCalendarResolution =
    | ResolvedCustomerBillingCalendar
    /** More than one active location and no explicit account calendar. The caller must refuse. */
    | { kind: "ambiguous_locations"; locationIds: string[] }
    /** No calendar is configured at any applicable scope. */
    | { kind: "unconfigured"; reason: "no_policy" }
    /** A policy answered but its value cannot produce periods. Configuration that fails at use. */
    | { kind: "invalid_policy"; policyId: string; reason: "cadence_unsupported" | "anchor_missing" };

export type CustomerBillingCalendarInput = {
    policies: readonly FinancialPolicyRow[];
    /** Distinct locations the account has ACTIVE commercial relationships at, on `onDate`. */
    activeLocationIds: readonly string[];
    customerId: string;
    onDate: string;
};

function readCalendarValue(
    policy: FinancialPolicyRow,
    scope: "customer" | "location" | "org",
    sourceLocationId: string | null,
): CustomerBillingCalendarResolution {
    const value = (policy.value ?? {}) as Record<string, unknown>;
    const cadence = String(value.cadence ?? "").trim();
    if (!isPeriodBillableCadence(cadence)) {
        return { kind: "invalid_policy", policyId: policy.id, reason: "cadence_unsupported" };
    }
    const rawAnchor = value.anchor_on == null ? "" : String(value.anchor_on).trim();
    const anchorOn = /^\d{4}-\d{2}-\d{2}$/.test(rawAnchor) ? rawAnchor : null;
    /*
     * Monthly is anchor-free; every other supported cadence tiles FROM a date and cannot be
     * reproduced without one. The database states the same rule in
     * `financial_billing_periods_anchor_shape_chk`, so a caller cannot persist past this either.
     */
    if (cadence !== "monthly" && anchorOn == null) {
        return { kind: "invalid_policy", policyId: policy.id, reason: "anchor_missing" };
    }
    return {
        kind: "resolved",
        cadence: cadence as BillingCadence,
        anchorOn: cadence === "monthly" ? null : anchorOn,
        scope,
        policyId: policy.id,
        sourceLocationId: scope === "location" ? sourceLocationId : null,
        snapshot: { cadence, anchor_on: cadence === "monthly" ? null : anchorOn },
    };
}

export function resolveCustomerBillingCalendar(
    input: CustomerBillingCalendarInput,
): CustomerBillingCalendarResolution {
    const { policies, customerId, onDate } = input;
    const locations = [...new Set(input.activeLocationIds.filter((id) => !!id))];

    /*
     * STEP 1 — an explicit account calendar, asked for WITHOUT a location in context so that only a
     * customer-scoped (or org-scoped) row can match. The resolver reports which scope answered, so
     * "the account was explicitly configured" is read from `sourceScope` rather than assumed.
     */
    const accountOnly: PolicyResolutionContext = { customerId };
    const explicit = resolveFinancialPolicy(policies, BILLING_CALENDAR_POLICY_TYPE, accountOnly, onDate);
    if (explicit.resolved && explicit.sourceScope === "customer") {
        return readCalendarValue(explicit.policy, "customer", null);
    }

    /* STEP 3, checked before step 2 because ambiguity disqualifies inheritance entirely. */
    if (locations.length > 1) {
        return { kind: "ambiguous_locations", locationIds: locations.slice().sort() };
    }

    /*
     * STEP 2 — a single-location account inherits, and the org default remains the floor beneath it.
     * One resolver call covers both, and `sourceScope` says which one answered.
     */
    const theLocation = locations[0] ?? null;
    const withLocation: PolicyResolutionContext = { customerId, locationId: theLocation };
    const inherited = resolveFinancialPolicy(policies, BILLING_CALENDAR_POLICY_TYPE, withLocation, onDate);
    if (!inherited.resolved) return { kind: "unconfigured", reason: "no_policy" };
    if (inherited.sourceScope === "location") {
        return readCalendarValue(inherited.policy, "location", theLocation);
    }
    if (inherited.sourceScope === "org") {
        return readCalendarValue(inherited.policy, "org", null);
    }
    /*
     * A service- or rate_plan-scoped billing calendar is not meaningful: the commercial clock is the
     * account's, not the product's. Treated as unconfigured rather than silently honoured.
     */
    return { kind: "unconfigured", reason: "no_policy" };
}

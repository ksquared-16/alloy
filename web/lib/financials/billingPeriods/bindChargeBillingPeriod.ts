/**
 * BINDING AN ECONOMIC FACT TO THE CUSTOMER'S COMMERCIAL PERIOD.
 *
 * One helper, called by every writer that creates a charge on the childcare spine, because the
 * alternative is five writers each deciding what a commercial period is. The database refuses a
 * childcare charge whose `billing_period_generation` is still `not_applicable`
 * (`charges_billing_period_childcare_chk`), so a writer that forgets to call this fails loudly
 * instead of quietly creating money that belongs to no period.
 *
 * ── IT REFUSES RATHER THAN FALLING BACK ──
 *
 * When the customer's calendar cannot be resolved — a household attending two locations with no
 * explicit account calendar — this THROWS before the economic fact is written. It does not write a
 * legacy-key row to get past the problem. That would turn the historical compatibility path into an
 * escape hatch around the new authority, and legacy representation exists for history alone.
 *
 * It also never falls back to `YYYY-MM`, to the source agreement's location calendar, to the first
 * active agreement, or to the org default.
 *
 * ── THE SOURCE'S LOCATION IS NOT THE PERIOD'S AUTHORITY ──
 *
 * A charge may originate from an agreement at Location A while the account's commercial calendar is
 * the one the customer holds. Two charges sourced at two different locations can therefore belong to
 * the SAME customer period, which is the point. Source agreement, source location and service
 * provenance stay on the charge and are untouched here.
 *
 * ── WHERE S4 WILL ADD ITS GUARD ──
 *
 * `resolveChargeBillingPeriodBinding` is the single place that turns a customer and a date into a
 * period id. When commercial close exists, "the period must be open" belongs HERE, on the resolved
 * period, and needs no change to how resolution works.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { materializeCustomerBillingPeriods } from "@/lib/financials/billingPeriods/customerBillingPeriodService";

/** The childcare billable sources. Job billing owns its own lifecycle and is not on this spine. */
const CHILDCARE_SOURCES = new Set(["enrollment_agreement", "customer"]);

export class BillingPeriodBindingError extends Error {
    readonly code: string;
    readonly detail: Record<string, unknown>;
    constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
        super(message);
        this.name = "BillingPeriodBindingError";
        this.code = code;
        this.detail = detail;
    }
}

/** Exactly the columns a charge insert needs; nothing else is this helper's business. */
export type ChargeBillingPeriodBinding = {
    billing_period_id: string | null;
    legacy_billing_period_key: string | null;
    billing_period_generation: "canonical" | "not_applicable";
};

/** Off-spine charges carry no commercial period at all, and say so rather than carrying a null. */
export const NOT_APPLICABLE_BINDING: ChargeBillingPeriodBinding = {
    billing_period_id: null,
    legacy_billing_period_key: null,
    billing_period_generation: "not_applicable",
};

export function isChildcareBillableSource(sourceType: string | null | undefined): boolean {
    return CHILDCARE_SOURCES.has((sourceType ?? "").trim());
}

/**
 * The customer whose commercial calendar governs a charge.
 *
 * A `customer`-grain charge IS the household. An `enrollment_agreement`-grain charge reaches it
 * through the agreement, preferring the agreement's own `customer_id` and falling back to its
 * member's — the census proved all 104 agreement-grain charges resolve by one of the two.
 */
export async function resolveChargeCustomerId(
    supabase: SupabaseClient,
    args: { orgId: string; billableSourceType: string; billableSourceId: string },
): Promise<string | null> {
    const type = (args.billableSourceType ?? "").trim();
    const id = (args.billableSourceId ?? "").trim();
    if (!id) return null;
    if (type === "customer") return id;
    if (type !== "enrollment_agreement") return null;

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("customer_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new BillingPeriodBindingError("agreement_read_failed", error.message, { agreementId: id });
    const row = data as { customer_id: string | null; customer_member_id: string | null } | null;
    if (!row) return null;
    const direct = (row.customer_id ?? "").trim();
    if (direct) return direct;

    const memberId = (row.customer_member_id ?? "").trim();
    if (!memberId) return null;
    const { data: member, error: memberError } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("id", memberId)
        .maybeSingle();
    if (memberError) {
        throw new BillingPeriodBindingError("member_read_failed", memberError.message, { memberId });
    }
    return ((member as { customer_id: string | null } | null)?.customer_id ?? "").trim() || null;
}

/**
 * Resolve — and materialise, if the calendar says it should exist — the canonical period a new
 * charge belongs to.
 *
 * `placementDate` is the date the charge itself declares. It is the caller's, because the caller owns
 * the economics; what the caller may not supply is the period id.
 */
export async function resolveChargeBillingPeriodBinding(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        billableSourceType: string | null;
        billableSourceId: string | null;
        placementDate: string;
    },
): Promise<ChargeBillingPeriodBinding> {
    if (!isChildcareBillableSource(args.billableSourceType)) return NOT_APPLICABLE_BINDING;

    const customerId = await resolveChargeCustomerId(supabase, {
        orgId: args.orgId,
        billableSourceType: String(args.billableSourceType),
        billableSourceId: String(args.billableSourceId ?? ""),
    });
    if (!customerId) {
        throw new BillingPeriodBindingError(
            "customer_unresolved",
            "This charge does not reach a household, so it has no commercial billing period.",
            { billableSourceType: args.billableSourceType, billableSourceId: args.billableSourceId },
        );
    }

    const outcome = await materializeCustomerBillingPeriods(supabase, {
        orgId: args.orgId,
        customerId,
        onDate: args.placementDate,
    });
    if (outcome.kind === "not_materialized") {
        const r = outcome.resolution;
        if (r.kind === "ambiguous_locations") {
            throw new BillingPeriodBindingError(
                "billing_calendar_ambiguous",
                "This household attends more than one location and has no billing calendar of its own, so there is no single commercial period to bill into. Set the account's billing calendar first.",
                { customerId, locationIds: r.locationIds },
            );
        }
        throw new BillingPeriodBindingError(
            r.kind === "invalid_policy" ? "billing_calendar_invalid" : "billing_calendar_unconfigured",
            "This household has no usable billing calendar, so there is no commercial period to bill into.",
            { customerId, resolution: r },
        );
    }

    /*
     * The materialiser guarantees the current and next period. The one containing the placement date
     * is this charge's, and it is read from what was persisted rather than recomputed, so the id and
     * the bounds cannot disagree.
     */
    const { data, error } = await supabase
        .from("financial_billing_periods")
        .select("id, period_key, starts_on, ends_on")
        .eq("org_id", args.orgId)
        .eq("customer_id", customerId)
        .lte("starts_on", args.placementDate)
        .gte("ends_on", args.placementDate)
        .maybeSingle();
    if (error) throw new BillingPeriodBindingError("period_read_failed", error.message, { customerId });
    const period = data as { id: string } | null;
    if (!period) {
        throw new BillingPeriodBindingError(
            "period_not_materialized",
            "The household's billing calendar produced no period covering this charge's date.",
            { customerId, placementDate: args.placementDate, calendar: outcome.calendar },
        );
    }

    return {
        billing_period_id: period.id,
        legacy_billing_period_key: null,
        billing_period_generation: "canonical",
    };
}

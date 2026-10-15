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

import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import {
    materializeCustomerBillingPeriods,
    resolveCustomerPeriodForDate,
} from "@/lib/financials/billingPeriods/customerBillingPeriodService";
import type { ChargeDatePeriod } from "@/lib/financials/chargeDates/resolveChargeDateChain";

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
    return (await bindChargeBillingPeriodWithBounds(supabase, args)).binding;
}

/**
 * The binding AND the bounds of the period it bound — so a writer that derives dates from the period
 * (the date chain) reads them from the row it is about to reference, not from a second resolution.
 */
export async function bindChargeBillingPeriodWithBounds(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        billableSourceType: string | null;
        billableSourceId: string | null;
        placementDate: string;
    },
): Promise<{ binding: ChargeBillingPeriodBinding; period: ChargeDatePeriod | null }> {
    if (!isChildcareBillableSource(args.billableSourceType)) return { binding: NOT_APPLICABLE_BINDING, period: null };

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
        .select("id, period_key, starts_on, ends_on, status")
        .eq("org_id", args.orgId)
        .eq("customer_id", customerId)
        .lte("starts_on", args.placementDate)
        .gte("ends_on", args.placementDate)
        .maybeSingle();
    if (error) throw new BillingPeriodBindingError("period_read_failed", error.message, { customerId });
    const period = data as { id: string; period_key: string; starts_on: string; ends_on: string; status: string } | null;
    if (!period) {
        throw new BillingPeriodBindingError(
            "period_not_materialized",
            "The household's billing calendar produced no period covering this charge's date.",
            { customerId, placementDate: args.placementDate, calendar: outcome.calendar },
        );
    }

    /*
     * ── COMMERCIAL FINALITY, ENFORCED AT THE ONE PLACE THAT RESOLVES A PERIOD ──
     *
     * A closed period is finished. New economics do not go into it, and the refusal happens HERE,
     * before the caller writes anything, because this is the only function that turns a customer
     * and a date into a period id — so there is no second path for a writer to reach a closed
     * period through.
     *
     * The four tempting alternatives are all refused by doing it this way:
     *   * writing then reversing leaves two economic facts in a period that was supposed to be
     *     final, and a reversal is a decision, not a cleanup;
     *   * moving the charge to the next open period silently re-dates the family's money;
     *   * falling back to a legacy key turns the historical compatibility path into an escape hatch
     *     around finality, which is exactly what S2 refused to let it become;
     *   * using "the current open period" quietly answers a different question than the one the
     *     charge's own date asked.
     *
     * S5 owns the legitimate answer — a prospective correction in a later open period, pointing at
     * this one as provenance. This refusal is what makes that the only answer.
     */
    if (period.status === "closed") {
        throw new BillingPeriodBindingError(
            "billing_period_closed",
            "This billing period is closed. New charges cannot be added to it.",
            {
                customerId,
                billingPeriodId: period.id,
                periodKey: period.period_key,
                placementDate: args.placementDate,
            },
        );
    }

    return {
        binding: {
            billing_period_id: period.id,
            legacy_billing_period_key: null,
            billing_period_generation: "canonical",
        },
        period: {
            id: period.id,
            key: period.period_key,
            label: billingPeriodLabel(period.period_key),
            startsOn: period.starts_on,
            endsOn: period.ends_on,
            status: "open",
        },
    };
}

export type ChargePeriodPreview =
    | { kind: "resolved"; customerId: string; period: ChargeDatePeriod; calendarSourceLocationId: string | null }
    | { kind: "not_applicable" }
    | { kind: "unresolved"; code: string; message: string };

/**
 * THE PERIOD A CHARGE WOULD BIND TO — WITHOUT BINDING IT.
 *
 * The preview half of `bindChargeBillingPeriodWithBounds`: same customer resolution, same calendar,
 * same "a persisted period wins" rule, but it writes nothing and it REPORTS a refusal instead of
 * throwing, so a preview can say "this household has no billing calendar" rather than failing.
 */
export async function previewChargeBillingPeriod(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        billableSourceType: string | null;
        billableSourceId: string | null;
        placementDate: string;
    },
): Promise<ChargePeriodPreview> {
    if (!isChildcareBillableSource(args.billableSourceType)) return { kind: "not_applicable" };
    const customerId = await resolveChargeCustomerId(supabase, {
        orgId: args.orgId,
        billableSourceType: String(args.billableSourceType),
        billableSourceId: String(args.billableSourceId ?? ""),
    });
    if (!customerId) {
        return {
            kind: "unresolved",
            code: "customer_unresolved",
            message: "This charge does not reach a household, so it has no commercial billing period.",
        };
    }
    const found = await resolveCustomerPeriodForDate(supabase, {
        orgId: args.orgId,
        customerId,
        onDate: args.placementDate,
    });
    if (found.kind === "unresolved") {
        const r = found.resolution;
        return r.kind === "ambiguous_locations"
            ? {
                  kind: "unresolved",
                  code: "billing_calendar_ambiguous",
                  message: "This household attends more than one location and has no billing calendar of its own.",
              }
            : {
                  kind: "unresolved",
                  code: r.kind === "invalid_policy" ? "billing_calendar_invalid" : "billing_calendar_unconfigured",
                  message: "This household has no usable billing calendar, so there is no billing period to bill into.",
              };
    }
    return {
        kind: "resolved",
        customerId,
        period: {
            id: found.periodId,
            key: found.periodKey,
            label: billingPeriodLabel(found.periodKey),
            startsOn: found.startsOn,
            endsOn: found.endsOn,
            status: found.status,
        },
        calendarSourceLocationId: found.calendar?.sourceLocationId ?? null,
    };
}

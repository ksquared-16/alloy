/**
 * MONEY IN, AND MONEY IN THAT IS NOT DOING ANYTHING YET — across households, in scope.
 *
 * The position projection answers what is still owed. This answers the other half of an
 * operator's day: what arrived, and what arrived but has not been applied to anything.
 *
 * Both figures are Thread 8's, quoted rather than re-derived:
 *
 *   received  ... a POSTED, INBOUND childcare payment. `pending` has not arrived; `outbound`
 *                 is a refund and is reported separately, never as a negative receipt.
 *   unapplied ... `amountCents − appliedCents` on such a payment, where `appliedCents` is the
 *                 sum of its ACTIVE allocations — the exact definition `buildFinancialsCardVM`
 *                 renders on the account card, so the workspace and the card agree by
 *                 construction.
 *
 * ── LOCATION ──
 *
 * A childcare payment carries the same polymorphic billable source a charge does, so Thread 4's
 * contract applies to it unchanged: enrolment-backed money resolves to its agreement's site;
 * a household-sourced payment has no site and is org-scoped, visible only at org scope to an
 * org-wide operator; a payment whose location cannot be resolved is withheld. Nothing is placed
 * at a site because a site would have been convenient.
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not cash flow, not deposits, not a bank reconciliation, and not revenue. It is what the
 * payment rows say, scoped and summed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocationScope,
} from "@/lib/financials/workspace/financialWorkLocation";

export const FINANCIAL_PAYMENT_SCAN_CAP = 2000;

export type FinancialPaymentRow = {
    paymentId: string;
    direction: string;
    amountCents: number;
    appliedCents: number;
    /** `amountCents − appliedCents`, floored at zero. Money sitting on the account. */
    unappliedCents: number;
    currencyCode: string;
    customerId: string | null;
    receivedAt: string | null;
    postedAt: string | null;
    locationScope: FinancialWorkLocationScope;
    siteLocationId: string | null;
};

export type FinancialPaymentFlow = {
    rows: FinancialPaymentRow[];
    totals: {
        /** Posted inbound payments received inside the window. */
        receivedCents: number;
        /** Posted outbound payments (refunds) inside the window. Reported, never netted. */
        refundedCents: number;
        /** Posted inbound payments with money left unallocated, at this instant. */
        unappliedCents: number;
    };
    counts: { received: number; refunds: number; unapplied: number; households: number };
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
    window: { fromIso: string | null; toIso: string | null };
    truncated: boolean;
    scanCap: number;
};

export type FinancialPaymentFlowArgs = {
    orgId: string;
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    activeSiteLocationId?: string | null;
    /**
     * The window bounds `receivedCents` and `refundedCents` — money is counted when it
     * ARRIVED, not when somebody got round to applying it.
     *
     * `unappliedCents` deliberately ignores the window: a receipt that has been sitting
     * unapplied since last month is exactly the one an operator needs to see, and windowing it
     * away would make the oldest problem the most invisible.
     */
    receivedFromIso?: string | null;
    receivedToIso?: string | null;
    scanCap?: number;
};

export async function resolveFinancialPaymentFlow(
    supabase: SupabaseClient,
    args: FinancialPaymentFlowArgs,
): Promise<FinancialPaymentFlow> {
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const scanCap = Math.min(Math.max(args.scanCap ?? FINANCIAL_PAYMENT_SCAN_CAP, 1), FINANCIAL_PAYMENT_SCAN_CAP);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };
    const window = { fromIso: args.receivedFromIso ?? null, toIso: args.receivedToIso ?? null };

    const { data: paymentRows, error } = await supabase
        .from("payments")
        .select(
            "id, billable_source_type, billable_source_id, customer_id, amount_cents, currency, "
            + "status, direction, received_at, posted_at",
        )
        .eq("org_id", args.orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(scanCap);
    if (error) throw new Error(`financial payment flow read failed: ${error.message}`);
    const payments = ((paymentRows ?? []) as unknown) as Array<{
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        customer_id: string | null;
        amount_cents: number;
        currency: string;
        status: string;
        direction: string;
        received_at: string | null;
        posted_at: string | null;
    }>;
    const truncated = payments.length >= scanCap;

    const empty: FinancialPaymentFlow = {
        rows: [],
        totals: { receivedCents: 0, refundedCents: 0, unappliedCents: 0 },
        counts: { received: 0, refunds: 0, unapplied: 0, households: 0 },
        scope,
        window,
        truncated: false,
        scanCap,
    };
    if (payments.length === 0) return empty;

    const agreementIds = [
        ...new Set(
            payments.filter((p) => p.billable_source_type === "enrollment_agreement").map((p) => p.billable_source_id),
        ),
    ];
    const { data: agreementRows } = agreementIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id, customer_id, site_location_id")
              .eq("org_id", args.orgId)
              .in("id", agreementIds)
        : { data: [] };
    const agreements = new Map(
        (((agreementRows ?? []) as unknown) as Array<{ id: string; customer_id: string | null; site_location_id: string | null }>)
            .map((a) => [a.id, a]),
    );

    const visible = payments.flatMap((payment) => {
        const agreement = payment.billable_source_type === "enrollment_agreement"
            ? agreements.get(payment.billable_source_id) ?? null
            : null;
        const location = resolveFinancialWorkLocation({
            billableSourceType: payment.billable_source_type,
            agreementSiteLocationId: agreement?.site_location_id ?? null,
        });
        if (!location) return [];
        if (
            !isFinancialWorkVisible({
                location,
                siteScope: args.siteScope,
                allowedSiteLocationIds: args.allowedSiteLocationIds,
                activeSiteLocationId,
            })
        ) {
            return [];
        }
        return [{
            payment,
            customerId: payment.customer_id ?? agreement?.customer_id ?? null,
            locationScope: location.scope,
            siteLocationId: location.siteLocationId,
        }];
    });
    if (visible.length === 0) return { ...empty, truncated };

    /* APPLIED IS THE CARD'S DEFINITION: active allocations of this payment, summed. */
    const paymentIds = visible.map((v) => v.payment.id);
    const { data: allocationRows } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents, status")
        .eq("org_id", args.orgId)
        .in("payment_id", paymentIds);
    const appliedByPaymentId = new Map<string, number>();
    for (const a of ((allocationRows ?? []) as Array<{ payment_id: string; allocated_amount_cents: number; status: string | null }>)) {
        if ((a.status ?? "active") !== "active") continue;
        appliedByPaymentId.set(a.payment_id, (appliedByPaymentId.get(a.payment_id) ?? 0) + (Number(a.allocated_amount_cents) || 0));
    }

    const rows: FinancialPaymentRow[] = visible.map((v) => {
        const appliedCents = appliedByPaymentId.get(v.payment.id) ?? 0;
        const amountCents = Number(v.payment.amount_cents);
        return {
            paymentId: v.payment.id,
            direction: v.payment.direction,
            amountCents,
            appliedCents,
            unappliedCents: v.payment.direction === "inbound" ? Math.max(0, amountCents - appliedCents) : 0,
            currencyCode: v.payment.currency,
            customerId: v.customerId,
            receivedAt: v.payment.received_at,
            postedAt: v.payment.posted_at,
            locationScope: v.locationScope,
            siteLocationId: v.siteLocationId,
        };
    });

    const inWindow = (iso: string | null) => {
        if (!iso) return false;
        if (window.fromIso && iso < window.fromIso) return false;
        if (window.toIso && iso > window.toIso) return false;
        return true;
    };
    const received = rows.filter((r) => r.direction === "inbound" && inWindow(r.receivedAt));
    const refunds = rows.filter((r) => r.direction === "outbound" && inWindow(r.receivedAt));
    const unapplied = rows.filter((r) => r.unappliedCents > 0);

    return {
        rows,
        totals: {
            receivedCents: received.reduce((acc, r) => acc + r.amountCents, 0),
            refundedCents: refunds.reduce((acc, r) => acc + r.amountCents, 0),
            unappliedCents: unapplied.reduce((acc, r) => acc + r.unappliedCents, 0),
        },
        counts: {
            received: received.length,
            refunds: refunds.length,
            unapplied: unapplied.length,
            households: new Set(rows.map((r) => r.customerId).filter(Boolean)).size,
        },
        scope,
        window,
        truncated,
        scanCap,
    };
}

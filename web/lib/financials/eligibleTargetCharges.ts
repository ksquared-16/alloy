/**
 * WHERE A PAYMENT MAY GO — the charges a given receipt is allowed to answer.
 *
 * This exists so an operator moving money is offered real choices instead of typing an id. It is a
 * CHOOSER, not a boundary: `applyPaymentToCharge` already refuses a charge belonging to another
 * household, and that refusal is what makes a forged target safe. If this function and that guard
 * ever disagree, the guard is right. Omitting a charge here is a courtesy; refusing it there is the
 * rule.
 *
 * ── WHY THE HOUSEHOLD IS RESOLVED FIRST ──
 *
 * Candidates are narrowed to the payment's own household before any balance is read. That keeps the
 * per-charge balance reads bounded by what one family owes rather than by what the organisation owes,
 * and it means the expensive question is only asked about charges that could legally be answered.
 * Reusing `readChargeBalance` per candidate costs a query each, and is deliberate: outstanding is
 * canonical money arithmetic, and a second implementation of it here is exactly the kind of parallel
 * authority that drifts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";
import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { readChargeBalance } from "@/lib/financials/childcarePaymentService";

export type EligibleTargetCharge = {
    chargeId: string;
    /** What the operator reads on the row. Never an id. */
    label: string;
    serviceDate: string | null;
    outstandingCents: number;
    billableSourceType: string;
    billableSourceId: string;
};

type ChargeCandidate = {
    id: string;
    billable_source_type: string | null;
    billable_source_id: string | null;
    charge_category: string | null;
    description: string | null;
    service_date: string | null;
    status: string;
};

/** A readable name for a charge, preferring what the charge itself says it is. */
function labelFor(row: ChargeCandidate): string {
    const described = typeof row.description === "string" ? row.description.trim() : "";
    if (described) return described;
    const category = typeof row.charge_category === "string" ? row.charge_category.trim() : "";
    return category || "Charge";
}

/**
 * The charges this payment could be applied to, most recent service date first.
 *
 * Returns [] rather than throwing when the payment's household cannot be established: a chooser with
 * nothing in it is the honest presentation of "we cannot tell whose this money is", and the service
 * will refuse anyway if the operator forces a target.
 */
export async function resolveEligibleTargetCharges(
    supabase: SupabaseClient,
    input: { orgId: string; paymentId: string; excludeChargeIds?: readonly string[] },
): Promise<EligibleTargetCharge[]> {
    const orgId = input.orgId?.trim();
    const paymentId = input.paymentId?.trim();
    if (!orgId || !paymentId) return [];

    const { data: paymentRow, error: paymentError } = await supabase
        .from("payments")
        .select("id, billable_source_type, billable_source_id")
        .eq("org_id", orgId)
        .eq("id", paymentId)
        .maybeSingle();
    if (paymentError) return [];
    const payment = paymentRow as
        | { billable_source_type?: string | null; billable_source_id?: string | null }
        | null;
    if (!payment) return [];

    const household = await resolveBillableSourceHouseholdId(
        supabase,
        orgId,
        payment.billable_source_type ?? null,
        payment.billable_source_id ?? null,
    );
    if (!household) return [];

    const { data: chargeRows, error: chargeError } = await supabase
        .from("charges")
        .select("id, billable_source_type, billable_source_id, charge_category, description, service_date, status")
        .eq("org_id", orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES]);
    if (chargeError) return [];

    const exclude = new Set((input.excludeChargeIds ?? []).map((id) => id.trim()).filter(Boolean));
    const candidates = ((chargeRows ?? []) as ChargeCandidate[]).filter((c) => !exclude.has(c.id));

    /*
     * Household first, balance second. `resolveBillableSourceHouseholdId` is memoised per source here
     * because a family's charges overwhelmingly share one agreement, and asking the same question
     * once per charge is the N+1 this ordering exists to avoid.
     */
    const householdBySource = new Map<string, string | null>();
    const mine: ChargeCandidate[] = [];
    for (const c of candidates) {
        const key = `${c.billable_source_type ?? ""}:${c.billable_source_id ?? ""}`;
        if (!householdBySource.has(key)) {
            householdBySource.set(
                key,
                await resolveBillableSourceHouseholdId(
                    supabase,
                    orgId,
                    c.billable_source_type,
                    c.billable_source_id,
                ),
            );
        }
        if (householdBySource.get(key) === household) mine.push(c);
    }

    const eligible: EligibleTargetCharge[] = [];
    for (const c of mine) {
        const balance = await readChargeBalance(supabase, orgId, c.id);
        // A settled charge is not a place money can go.
        if (balance.outstandingCents <= 0) continue;
        eligible.push({
            chargeId: c.id,
            label: labelFor(c),
            serviceDate: c.service_date,
            outstandingCents: balance.outstandingCents,
            billableSourceType: c.billable_source_type ?? "",
            billableSourceId: c.billable_source_id ?? "",
        });
    }

    eligible.sort((a, b) => (b.serviceDate ?? "").localeCompare(a.serviceDate ?? ""));
    return eligible;
}

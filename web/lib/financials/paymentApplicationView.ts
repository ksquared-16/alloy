/**
 * WHAT AN OPERATOR NEEDS TO SEE BEFORE MOVING MONEY.
 *
 * The Financials surfaces can say what a family owes and what they have paid, but nothing renders the
 * APPLICATIONS themselves — which receipt answered which charge, and which of those were undone. You
 * cannot offer "move this payment" without first showing the operator the thing being moved, so this
 * composes that view.
 *
 * ── IT COMPOSES, IT DOES NOT CALCULATE ──
 *
 * Every money figure here comes from the canonical reader that already owns it:
 * `readPaymentRefundedCents`, `readPaymentUnappliedCents`, and the allocation rows themselves. The one
 * derived number, `activeAppliedCents`, is not a second opinion — it is the canonical equation
 * rearranged:
 *
 *     unapplied = amount − activeApplied − refunded      (the service's own law)
 *     activeApplied = amount − unapplied − refunded      (the same sentence)
 *
 * Summing the active allocations here instead would be a SECOND implementation of applied money, free
 * to drift from the one the balance readers use. Rearranging the equation cannot drift, because there
 * is still only one definition.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";
import {
    readPaymentRefundedCents,
    readPaymentUnappliedCents,
} from "@/lib/financials/childcarePaymentService";

export type PaymentApplicationView = {
    allocationId: string;
    chargeId: string | null;
    chargeLabel: string;
    chargeServiceDate: string | null;
    appliedCents: number;
    /** `active` money answers an obligation today; `reversed` is history that no longer counts. */
    status: string;
    allocatedAt: string | null;
    reversedAt: string | null;
    reversalReason: string | null;
};

export type PaymentView = {
    paymentId: string;
    amountCents: number;
    currency: string;
    receivedAt: string | null;
    paymentMethod: string | null;
    processor: string | null;
    processorTransactionId: string | null;
    referenceNumber: string | null;
    payerCustomerId: string | null;
    payerLabel: string | null;
    refundedCents: number;
    activeAppliedCents: number;
    unappliedCents: number;
    applications: PaymentApplicationView[];
};

type PaymentRowLite = {
    id: string;
    amount_cents: number;
    currency: string | null;
    status: string;
    direction: string;
    received_at: string | null;
    payment_method: string | null;
    processor: string | null;
    processor_transaction_id: string | null;
    reference_number: string | null;
    customer_id: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
};

const PAYMENT_VIEW_COLUMNS =
    "id, amount_cents, currency, status, direction, received_at, payment_method, processor, "
    + "processor_transaction_id, reference_number, customer_id, billable_source_type, billable_source_id";

/**
 * Every receipt belonging to one household, with the applications that explain where it went.
 *
 * Refund rows are excluded: an outbound payment carrying `refunds_payment_id` is money going back, not
 * a receipt to allocate, and showing it as one would invite an operator to "move" it.
 */
export async function resolveHouseholdPaymentViews(
    supabase: SupabaseClient,
    input: { orgId: string; customerId: string },
): Promise<PaymentView[]> {
    const orgId = input.orgId?.trim();
    const customerId = input.customerId?.trim();
    if (!orgId || !customerId) return [];

    const { data: paymentRows, error: paymentError } = await supabase
        .from("payments")
        .select(PAYMENT_VIEW_COLUMNS)
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .is("refunds_payment_id", null)
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES]);
    if (paymentError) return [];

    /* Household is resolved from the billable source, memoised — a family's receipts share sources. */
    const householdBySource = new Map<string, string | null>();
    const mine: PaymentRowLite[] = [];
    for (const row of (paymentRows ?? []) as unknown as PaymentRowLite[]) {
        const key = `${row.billable_source_type ?? ""}:${row.billable_source_id ?? ""}`;
        if (!householdBySource.has(key)) {
            householdBySource.set(
                key,
                await resolveBillableSourceHouseholdId(
                    supabase,
                    orgId,
                    row.billable_source_type,
                    row.billable_source_id,
                ),
            );
        }
        if (householdBySource.get(key) === customerId) mine.push(row);
    }
    if (!mine.length) return [];

    const paymentIds = mine.map((p) => p.id);
    const { data: allocRows } = await supabase
        .from("payment_allocations")
        .select("id, payment_id, charge_id, allocated_amount_cents, status, allocated_at, reversed_at, reversal_reason")
        .eq("org_id", orgId)
        .in("payment_id", paymentIds);
    const allocations = (allocRows ?? []) as Array<{
        id: string;
        payment_id: string;
        charge_id: string | null;
        allocated_amount_cents: number;
        status: string;
        allocated_at: string | null;
        reversed_at: string | null;
        reversal_reason: string | null;
    }>;

    const chargeIds = [...new Set(allocations.map((a) => a.charge_id).filter(Boolean))] as string[];
    const chargeById = new Map<string, { description: string | null; charge_category: string | null; service_date: string | null }>();
    if (chargeIds.length) {
        const { data: chargeRows } = await supabase
            .from("charges")
            .select("id, description, charge_category, service_date")
            .eq("org_id", orgId)
            .in("id", chargeIds);
        for (const c of (chargeRows ?? []) as Array<{ id: string; description: string | null; charge_category: string | null; service_date: string | null }>) {
            chargeById.set(c.id, c);
        }
    }

    /* The payer is the household the receipt was taken against — named, never inferred from a child. */
    const payerIds = [...new Set(mine.map((p) => p.customer_id).filter(Boolean))] as string[];
    const payerById = new Map<string, string>();
    if (payerIds.length) {
        const { data: customerRows } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", payerIds);
        for (const c of (customerRows ?? []) as Array<{ id: string; name: string | null }>) {
            if (c.name) payerById.set(c.id, c.name);
        }
    }

    const views: PaymentView[] = [];
    for (const p of mine) {
        const amountCents = Number(p.amount_cents) || 0;
        const refundedCents = await readPaymentRefundedCents(supabase, orgId, p.id);
        const unappliedCents = await readPaymentUnappliedCents(supabase, orgId, p.id, amountCents);
        views.push({
            paymentId: p.id,
            amountCents,
            currency: p.currency ?? "USD",
            receivedAt: p.received_at,
            paymentMethod: p.payment_method,
            processor: p.processor,
            processorTransactionId: p.processor_transaction_id,
            referenceNumber: p.reference_number,
            payerCustomerId: p.customer_id,
            payerLabel: p.customer_id ? (payerById.get(p.customer_id) ?? null) : null,
            refundedCents,
            // The canonical equation rearranged — not a second count of applied money.
            activeAppliedCents: amountCents - unappliedCents - refundedCents,
            unappliedCents,
            applications: allocations
                .filter((a) => a.payment_id === p.id)
                .map((a) => {
                    const charge = a.charge_id ? chargeById.get(a.charge_id) : undefined;
                    return {
                        allocationId: a.id,
                        chargeId: a.charge_id,
                        chargeLabel:
                            (charge?.description?.trim() || charge?.charge_category?.trim() || "Charge"),
                        chargeServiceDate: charge?.service_date ?? null,
                        appliedCents: Number(a.allocated_amount_cents) || 0,
                        status: a.status,
                        allocatedAt: a.allocated_at,
                        reversedAt: a.reversed_at,
                        reversalReason: a.reversal_reason,
                    };
                })
                // Newest first, so the application an operator just made is the one they see.
                .sort((x, y) => (y.allocatedAt ?? "").localeCompare(x.allocatedAt ?? "")),
        });
    }

    views.sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
    return views;
}

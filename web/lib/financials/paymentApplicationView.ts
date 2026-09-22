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
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";
import {
    readPaymentRefundedCents,
    readPaymentUnappliedCents,
} from "@/lib/financials/childcarePaymentService";
import { readAllPages, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";

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
    /**
     * The receipt's canonical state — `posted` or `pending`.
     *
     * Exposed because AVAILABILITY depends on it and was previously unanswerable from this view. A
     * pending receipt is money the platform has been told about, not money it has: counting it as
     * available prepaid would offer an operator funds that may never arrive.
     */
    status: string;
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
/*
 * The point at which this reader refuses rather than answering from part of the cohort. Far above
 * any real tenant's receipt history; reaching it means something is wrong, not large.
 */
const HOUSEHOLD_VIEW_SCAN_CAP = 25_000;

export async function resolveHouseholdPaymentViews(
    supabase: SupabaseClient,
    input: { orgId: string; customerId: string },
): Promise<PaymentView[]> {
    const orgId = input.orgId?.trim();
    const customerId = input.customerId?.trim();
    if (!orgId || !customerId) return [];

    /*
     * PAGED, AND ORDERED — the defect this read carried was not subtle, only quiet.
     *
     * It asked for every inbound childcare receipt in the ORGANISATION and filtered to the
     * household afterwards, in one unpaged, unordered query. PostgREST answers at most 1,000 rows,
     * so on a tenant with more receipts than that the server returned an arbitrary page and this
     * household's payment was present or absent depending on which rows came back. It surfaced as a
     * receipt the composition could not see — money a family had paid, missing from the surface
     * that explains where their money went.
     *
     * Ordering by `id` is what makes paging a sequence rather than a sample.
     *
     * The org-wide shape is left as it was: narrowing this to the household's own billable sources
     * first is a real improvement and a different change, and it is recorded rather than smuggled
     * in beside a correctness repair.
     */
    let paymentRows: unknown[];
    try {
        const { rows, truncated } = await readAllPages<Record<string, unknown>>(
            "household payment views",
            HOUSEHOLD_VIEW_SCAN_CAP,
            (fromIndex, toIndex) =>
                supabase
                    .from("payments")
                    .select(PAYMENT_VIEW_COLUMNS)
                    .eq("org_id", orgId)
                    .eq("direction", "inbound")
                    .is("refunds_payment_id", null)
                    .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                    .order("id", { ascending: true })
                    .range(fromIndex, toIndex) as never,
        );
        /*
         * An account's receipts may not be answered from part of the cohort: a missing one reads as
         * money never paid. The caller renders an empty list as "no receipts", so the honest answer
         * when the bound is reached is the same as when the read fails — nothing, rather than a
         * plausible subset.
         */
        if (truncated) return [];
        paymentRows = rows;
    } catch {
        return [];
    }

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
    /* Batched: this id list grows with the account and would otherwise overflow the request URI. */
    const allocRows = await readInBatches<Record<string, unknown>>(
        "applications of these receipts",
        paymentIds,
        (batch) => supabase
            .from("payment_allocations")
            .select("id, payment_id, charge_id, allocated_amount_cents, status, allocated_at, reversed_at, reversal_reason")
            .eq("org_id", orgId)
            .in("payment_id", batch) as never,
    );
    const allocations = (allocRows ?? []) as unknown as Array<{
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
        const chargeRows = await readInBatches<{ id: string; description: string | null; charge_category: string | null; service_date: string | null }>(
            "charges these applications name",
            chargeIds,
            (batch) => supabase
                .from("charges")
                .select("id, description, charge_category, service_date")
                .eq("org_id", orgId)
                .in("id", batch) as never,
        );
        for (const c of chargeRows) {
            chargeById.set(c.id, c);
        }
    }

    /* The payer is the household the receipt was taken against — named, never inferred from a child. */
    const payerIds = [...new Set(mine.map((p) => p.customer_id).filter(Boolean))] as string[];
    const payerById = new Map<string, string>();
    if (payerIds.length) {
        const customerRows = await readInBatches<{ id: string; name: string | null }>(
            "households these receipts were taken against",
            payerIds,
            (batch) => supabase
                .from("customers")
                .select("id, name")
                .eq("org_id", orgId)
                .in("id", batch) as never,
        );
        for (const c of customerRows) {
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
            status: p.status,
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
                        /*
                         * THE OPERATOR'S WORD FOR IT, NEVER THE KEY.
                         *
                         * This fell back to `charge_category` raw, so an application whose charge
                         * carried no description read as "materials_fee" on a surface an operator
                         * uses to explain money to a parent. The category catalog is the owner of
                         * that word — `chargeCategoryLabel` turns it into "Materials" — and it is
                         * resolved here rather than patched in a component, so every surface reading
                         * this view gets the same answer.
                         *
                         * The catalog reads an unknown category ALOUD rather than handing back the
                         * key — same words, minus the underscores — so no surface reading this view
                         * can print a stored category key.
                         *
                         * A DESCRIPTION IS NOT A CATEGORY, and it wins here on purpose. It is what a
                         * person typed about this charge, and rewriting somebody's own words to look
                         * tidier would be the surface editing the record. A description that reads
                         * like a key is a fact about what was written, not about this code.
                         */
                        chargeLabel:
                            charge?.description?.trim()
                            || (charge?.charge_category?.trim()
                                ? chargeCategoryLabel(charge.charge_category.trim())
                                : "")
                            || "Charge",
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

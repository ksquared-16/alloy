/**
 * THE PAYMENT VIEWS STOP DISCOVERING THIS FAMILY BY SCANNING PAST EVERY OTHER ONE.
 *
 * `resolveHouseholdPaymentViews` read every inbound receipt in the ORGANISATION and then resolved
 * each billable source's household one at a time to decide which were ours. Measured on the
 * certification tenant: 3,517 receipts over four pages to keep 3,198, and 65 sequential lookups to
 * decide — roughly 150 sequential round trips, and the 1,131-4,211 ms that became the Financials
 * pole once the rest of the card got fast.
 *
 * These hold the SHAPE. Row-for-row equality of the views themselves, both ways, against the real
 * tenant is `paymentViewsAcquisitionParity.live.test.ts`; this is the part a unit run can hold.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveHouseholdPaymentViews } from "@/lib/financials/paymentApplicationView";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const MIGRATION = "../supabase/migrations/20261025120000_financials_bundle_payment_views.sql";

/** Records every table it is asked for, so a read that should not happen is visible. */
function countingClient() {
    const reads: string[] = [];
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "in", "is", "not", "gte", "lte", "order", "limit", "range"]) chain[k] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null });
        reads.push(table);
        return chain;
    };
    return { client: { from: (t: string) => builder(t) } as never, reads };
}

const SUPPLIED = {
    payments: [
        { id: "pay-1", direction: "inbound", refunds_payment_id: null, amount_cents: 5_000, currency: "USD",
          status: "succeeded", payment_method: "card", processor: "stripe", received_at: "2026-09-01T00:00:00Z",
          processor_transaction_id: "tx-1", reference_number: "R1", customer_id: "cust-1",
          billable_source_type: "customer", billable_source_id: "cust-1" },
        /* An outbound refund the resolver must exclude — its rule, not the function's. */
        { id: "pay-2", direction: "outbound", refunds_payment_id: "pay-1", amount_cents: -1_000, currency: "USD",
          status: "succeeded", customer_id: "cust-1", billable_source_type: "customer", billable_source_id: "cust-1" },
    ],
    allocations: [
        { id: "al-1", payment_id: "pay-1", charge_id: "chg-1", allocated_amount_cents: 5_000,
          status: "active", allocated_at: "2026-09-01T00:00:00Z", reversed_at: null, reversal_reason: null },
    ],
    charges: [{ id: "chg-1", description: "Tuition", charge_category: "tuition", service_date: "2026-09-01" }],
    payers: [{ id: "cust-1", name: "The Household" }],
    refunds: [
        /* A refund of 1,000 against pay-1, and a voided one the authority must ignore. */
        { id: "pay-2", refunds_payment_id: "pay-1", amount_cents: 1_000, status: "succeeded" },
        { id: "pay-3", refunds_payment_id: "pay-1", amount_cents: 9_999, status: "voided" },
    ],
};

describe("the views are acquired, not discovered", () => {
    it("supplied rows cost NO remote read at all", async () => {
        const { client, reads } = countingClient();
        const views = await resolveHouseholdPaymentViews(client, { orgId: "org", customerId: "cust-1" }, SUPPLIED);
        expect(reads, `it still read: ${reads.join(", ")}`).toEqual([]);
        expect(views.length, "and still produced the view").toBe(1);
    });

    it("the resolver keeps its own inbound/not-a-refund rule — it did not move into SQL", async () => {
        const { client } = countingClient();
        const views = await resolveHouseholdPaymentViews(client, { orgId: "org", customerId: "cust-1" }, SUPPLIED);
        expect(views.map((v) => v.paymentId), "the outbound refund is excluded here, not by the function")
            .toEqual(["pay-1"]);
        const fn = read(MIGRATION);
        expect(fn, "the function must NOT filter direction — that is the resolver's rule")
            .not.toMatch(/direction\s*=\s*'inbound'/);
    });

    it("the refunded and unapplied sums are the Payments authority's, over supplied rows", async () => {
        /*
         * These were an awaited read EACH, PER RECEIPT. The arithmetic did not move into Financials
         * and did not move into SQL: `status <> voided` is still applied by
         * `readPaymentRefundedCents`, which is why the voided 9,999 below must not count.
         */
        const { client, reads } = countingClient();
        const [view] = await resolveHouseholdPaymentViews(client, { orgId: "org", customerId: "cust-1" }, SUPPLIED);
        expect(reads, "and still no read per receipt").toEqual([]);
        expect(view.refundedCents, "the voided refund is excluded by the authority, not by SQL").toBe(1_000);
        /* 5,000 received - 5,000 applied - 1,000 refunded. */
        expect(view.unappliedCents).toBe(-1_000);
    });

    it("the charge and payer a view names come from the supplied rows", async () => {
        const { client } = countingClient();
        const [view] = await resolveHouseholdPaymentViews(client, { orgId: "org", customerId: "cust-1" }, SUPPLIED);
        expect(JSON.stringify(view), "the charge description travelled").toContain("Tuition");
        expect(JSON.stringify(view), "and the payer's name").toContain("The Household");
    });

    it("without supplied rows it still scans and still resolves the household itself", async () => {
        /* The old path is kept as the comparison oracle's other half; it must still be the old path. */
        const { client, reads } = countingClient();
        await resolveHouseholdPaymentViews(client, { orgId: "org", customerId: "cust-1" });
        expect(reads, "the unsupplied path is the org-wide scan it always was").toContain("payments");
    });
});

describe("the acquisition function's privilege posture is explicit", () => {
    const fn = read(MIGRATION);

    it("EXECUTE is revoked from PUBLIC", () => {
        /*
         * PostgreSQL grants EXECUTE to PUBLIC by default and the deployed catalog confirmed it
         * (`=X/postgres`). RLS is on and the function is SECURITY INVOKER, so PUBLIC could never
         * read what it was not already entitled to — but a default is not a decision.
         */
        expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.financials_account_fact_bundle\([^)]*\) FROM PUBLIC/);
    });

    it("EXECUTE is granted to the inspected runtime caller, and only that", () => {
        /* The inspected contract: one caller, the card route, through a service-role client. */
        expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION public\.financials_account_fact_bundle\([^)]*\)\s*TO service_role/);
        expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.financials_account_fact_bundle\([^)]*\) FROM authenticated/);
    });

    it("SECURITY INVOKER and the pinned search_path survive the change", () => {
        expect(fn, "a DEFINER function would remove RLS for every non-service caller").toContain("SECURITY INVOKER");
        expect(fn).toContain("SET search_path = public, pg_temp");
        expect(fn, "org isolation is load-bearing on every statement").not.toMatch(/FROM public\.payments p\s*\n\s*WHERE p\.billable/);
    });
});

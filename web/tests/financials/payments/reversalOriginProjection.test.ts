/**
 * WHO TOOK THE MONEY BACK — carried from the column all the way to what an operator reads.
 *
 * `payments.reversal_origin` is the canonical answer to that question. It has a vocabulary CHECK
 * behind it, it is written on every outbound row, and until this suite existed it was WRITTEN AND
 * NEVER READ BACK by the service layer: `PAYMENT_COLUMNS` did not name it, so every `PaymentRow`
 * the service handed out carried `undefined` for the one fact that distinguishes an operator's
 * refund from a bank's return.
 *
 * ── WHY THE PREVIOUS ATTEMPT AT THIS WAS A FALSE GREEN ──
 *
 * There WAS an assertion — `expect(result.refund.reversal_origin).toBe("provider")` — and it
 * passed against a broken SELECT. The shared mock returns the whole inserted object from an
 * insert-returning-select and ignores the column list entirely, so the assertion was reading the
 * value the TEST had just written, through the mock, rather than the value the product had read
 * back from the database. It measured the mock's fidelity. It was removed rather than left green,
 * and this file is what replaces it.
 *
 * `projectingPayments` below is the repair: it makes the fake behave like PostgREST on the one
 * table under test — a select returns the columns it asked for and nothing else. With it in place,
 * dropping `reversal_origin` from `PAYMENT_COLUMNS` makes these cases fail, which is the whole
 * point of them.
 *
 * ── THE THREE LINKS ──
 *
 *   1. the column is SELECTED, so a `PaymentRow` carries the database's value  (service)
 *   2. the receipt row says Refunded or Returned accordingly                   (presentation)
 *   3. Financial Activity says "Payment refunded" or "Payment returned"        (workspace feed)
 *
 * and, at every link, an origin that cannot be established reads as the neutral thing. Nothing is
 * guessed from the processor: a Stripe refund and a Stripe dispute are indistinguishable there.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    recordChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";
import { presentPayment } from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import type { FinancialsPaymentRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { resolveFinancialActivity } from "@/lib/financials/workspace/resolveFinancialActivity";

const HOUSEHOLD_ID = "cust-1";
const AGREEMENT_ID = "agr-1";

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * A FAKE THAT PROJECTS, so the SELECT is load-bearing
 *
 * Scoped to `payments` deliberately. Every other read in these paths goes through a different
 * column list, and projecting all of them would turn this suite into a test of the mock rather than
 * of the column it exists to pin — a failure somewhere else would read as this defect returning.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;
type Chain = Record<string, (...args: never[]) => unknown>;

function project(data: unknown, columns: readonly string[] | null): unknown {
    if (!columns || data == null) return data;
    if (Array.isArray(data)) return data.map((row) => project(row, columns));
    const row = data as Row;
    const out: Row = {};
    /*
     * A column that was ASKED FOR always comes back, null when the row has no value — that is what
     * PostgREST does, and it is the half that matters here: the difference between `null` and
     * `undefined` on a `PaymentRow` is the difference between "this receipt reverses nothing" and
     * "nobody selected the column".
     */
    for (const column of columns) out[column] = column in row ? row[column] : null;
    return out;
}

function projectingPayments(supabase: SupabaseClient): SupabaseClient {
    const inner = supabase as unknown as { from: (table: string) => Chain };
    const wrapped = Object.create(supabase as object) as Record<string, unknown>;
    wrapped.from = (table: string) => {
        const chain = inner.from(table);
        if (table !== "payments") return chain;
        let columns: string[] | null = null;
        return new Proxy(chain, {
            get(target, prop, receiver) {
                if (prop === "select") {
                    return (cols?: string) => {
                        // An embedded select ("a, rel(b)") is a different grammar; none is used here.
                        if (typeof cols === "string" && !cols.includes("(")) {
                            columns = cols.split(",").map((c) => c.trim()).filter(Boolean);
                        }
                        (target.select as (c?: string) => unknown)(cols);
                        return receiver;
                    };
                }
                if (prop === "maybeSingle" || prop === "single") {
                    return async () => {
                        const result = await (target[prop] as () => Promise<{ data: unknown }>)();
                        return { ...result, data: project(result.data, columns) };
                    };
                }
                if (prop === "then") {
                    return (onFulfilled: (v: { data: unknown }) => unknown) =>
                        (target.then as (f: (v: { data: unknown }) => unknown) => unknown)(
                            (value) => onFulfilled({ ...value, data: project(value.data, columns) }),
                        );
                }
                const value = Reflect.get(target, prop) as unknown;
                if (typeof value === "function") {
                    return (...args: unknown[]) => {
                        const out = (value as (...a: unknown[]) => unknown).apply(target, args);
                        // Every filter returns the chain; keep the projecting wrapper on it.
                        return out === target ? receiver : out;
                    };
                }
                return value;
            },
        }) as unknown as Chain;
    };
    return wrapped as unknown as SupabaseClient;
}

function setup() {
    const store = createOperationalEnrollmentMockStore({
        child_enrollment_agreements: [{
            id: AGREEMENT_ID, org_id: ORG_ID, customer_id: HOUSEHOLD_ID, customer_member_id: "member-1",
        }],
    });
    const extra = store as unknown as Record<string, Row[]>;
    extra.payment_holds = [];
    extra.payment_hold_dispositions = [];
    return projectingPayments(createOperationalEnrollmentMockSupabase(store));
}

async function receipt(supabase: SupabaseClient, key: string, cents: number) {
    const { payment } = await recordChildcarePayment(supabase, {
        orgId: ORG_ID, billableSourceType: "enrollment_agreement", billableSourceId: AGREEMENT_ID,
        customerId: HOUSEHOLD_ID, amountCents: cents, paymentMethod: "ach", idempotencyKey: key,
    });
    return payment;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 1 — THE SERVICE READS THE COLUMN BACK
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the reversal's cause survives the round trip through the database", () => {
    it("carries `provider` on a returned debit, read back through the SELECT", async () => {
        const supabase = setup();
        const p = await receipt(supabase, "r-provider", 40_000);
        const { refund } = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 40_000,
            idempotencyKey: "ret-1", reversalOrigin: "provider",
        });
        // Not the value this test wrote: the fake returns only the columns the product asked for.
        expect(refund.reversal_origin).toBe("provider");
    });

    it("carries `operator` when nobody said otherwise, because a refund is somebody's decision", async () => {
        const supabase = setup();
        const p = await receipt(supabase, "r-operator", 40_000);
        const { refund } = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 15_000, idempotencyKey: "ref-1",
        });
        expect(refund.reversal_origin).toBe("operator");
    });

    it("carries it on a row READ back, not only on the one just written", async () => {
        const supabase = setup();
        const p = await receipt(supabase, "r-reread", 40_000);
        await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 10_000,
            idempotencyKey: "ret-2", reversalOrigin: "provider",
        });
        /*
         * The retry path returns the EXISTING refund, loaded by idempotency key through
         * `PAYMENT_COLUMNS` — a pure read, with no insert payload anywhere near it. This is the
         * case the false green could never have covered.
         */
        const retry = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 10_000,
            idempotencyKey: "ret-2", reversalOrigin: "provider",
        });
        expect(retry.alreadyRefunded).toBe(true);
        expect(retry.refund.reversal_origin).toBe("provider");
    });

    it("leaves the receipt itself with no cause, because a receipt reverses nothing", async () => {
        const supabase = setup();
        const p = await receipt(supabase, "r-receipt", 40_000);
        const { original } = await refundChildcarePayment(supabase, {
            orgId: ORG_ID, paymentId: p.id, amountCents: 5_000, idempotencyKey: "ref-2",
        });
        expect(original.reversal_origin ?? null).toBeNull();
        // And the column WAS asked for — `undefined` here would mean the SELECT had dropped it.
        expect("reversal_origin" in (original as unknown as Row)).toBe(true);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 2 — THE RECEIPT ROW SAYS WHICH ONE IT WAS
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function outbound(origin: "operator" | "provider" | null): FinancialsPaymentRow {
    return {
        paymentId: "out-1",
        direction: "outbound",
        refundsPaymentId: "in-1",
        reversalOrigin: origin,
        amountCents: 8_000,
        currencyCode: "USD",
        status: "posted",
        method: "ach",
        processor: "stripe",
        receivedAt: "2026-09-20T00:00:00Z",
        postedAt: "2026-09-20T00:00:00Z",
        appliedCents: 0,
        unappliedCents: 0,
        payerLabel: null,
        applications: [],
        reference: null,
        notes: null,
    };
}

describe("what the receipt row calls it", () => {
    it("says Returned for a provider reversal, so nobody looks for the operator who did it", () => {
        const p = presentPayment(outbound("provider"));
        expect(p.kind).toBe("return");
        expect(p.statusLabel).toBe("Returned");
    });

    it("says Refunded for an operator reversal", () => {
        const p = presentPayment(outbound("operator"));
        expect(p.kind).toBe("refund");
        expect(p.statusLabel).toBe("Refunded");
    });

    it("says Refunded when the cause is not recorded, rather than inventing a bank", () => {
        // Historical rows written before the column existed. Neutral, not wrong.
        const p = presentPayment(outbound(null));
        expect(p.kind).toBe("refund");
        expect(p.statusLabel).toBe("Refunded");
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 3 — FINANCIAL ACTIVITY SAYS WHICH ONE IT WAS
 *
 * `payment_refunded` is the entry type for BOTH, and correctly so: the consequence is identical and
 * that is what the journal records. The cause is read through the link the entry already carries.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function journalEntry(id: string, paymentId: string): Row {
    return {
        id, org_id: ORG_ID, customer_id: HOUSEHOLD_ID,
        // Household-account grain: org-scoped, so it is visible without a site fixture.
        billable_source_type: "customer", billable_source_id: HOUSEHOLD_ID,
        source_type: "payment", source_id: paymentId,
        entry_type: "payment_refunded",
        amount_cents: 8_000, obligation_delta_cents: 8_000, currency: "USD",
        effective_on: "2026-09-20", posted_at: `2026-09-20T00:00:0${id.slice(-1)}Z`,
        billing_period_key: null, accounting_calendar_id: null, accounting_period_id: null,
        accounting_period_key: null, period_attribution: "no_calendar",
        reverses_entry_id: null, idempotency_key: `j-${id}`, actor_user_id: null,
        metadata: {}, created_at: "2026-09-20T00:00:00Z",
    };
}

async function activityLabels(payments: Row[], entries: Row[]): Promise<string[]> {
    const store = createOperationalEnrollmentMockStore({});
    /* Three tables the typed factory does not name. Seeded the way its siblings seed holds. */
    const extra = store as unknown as Record<string, Row[]>;
    extra.customers = [{ id: HOUSEHOLD_ID, org_id: ORG_ID, name: "Certopp Family" }];
    extra.payments = payments;
    extra.financial_journal_entries = entries;
    const supabase = createOperationalEnrollmentMockSupabase(store);
    const feed = await resolveFinancialActivity(supabase, {
        orgId: ORG_ID, siteScope: "all", allowedSiteLocationIds: [],
    });
    return feed.rows.map((r) => r.label);
}

describe("what Financial Activity calls it", () => {
    it("says Payment returned for a bank reversal, and Payment refunded for an operator's", async () => {
        const labels = await activityLabels(
            [
                { id: "pay-1", org_id: ORG_ID, refunds_payment_id: "in-1", reversal_origin: "provider" },
                { id: "pay-2", org_id: ORG_ID, refunds_payment_id: "in-2", reversal_origin: "operator" },
            ],
            [journalEntry("e1", "pay-1"), journalEntry("e2", "pay-2")],
        );
        expect(labels).toContain("Payment returned");
        expect(labels).toContain("Payment refunded");
    });

    it("keeps the neutral label when the cause is not recorded", async () => {
        const labels = await activityLabels(
            [{ id: "pay-3", org_id: ORG_ID, refunds_payment_id: "in-3", reversal_origin: null }],
            [journalEntry("e3", "pay-3")],
        );
        expect(labels).toEqual(["Payment refunded"]);
    });

    it("keeps the neutral label when the payment row cannot be found at all", async () => {
        // A row outside the org, or one the read could not reach. Silence is not evidence of a bank.
        const labels = await activityLabels([], [journalEntry("e4", "pay-missing")]);
        expect(labels).toEqual(["Payment refunded"]);
    });

    it("does not go asking `payments` about entries that are not about a payment", async () => {
        /*
         * `source_id` means a different table for every other entry type. A charge id looked up in
         * `payments` would be a wrong question with a plausible-looking empty answer.
         */
        const charged = { ...journalEntry("e5", "charge-1"), entry_type: "charge_posted", source_type: "charge" };
        const labels = await activityLabels([], [charged]);
        expect(labels).toEqual(["Charge posted"]);
    });
});

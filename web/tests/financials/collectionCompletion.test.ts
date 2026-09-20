/**
 * COLLECTION COMPLETION — the two projections and the one refund rule, without a provider.
 *
 * Expected settlement and the ACH refund rule are both places where a PROVIDER FACT becomes an
 * ALLOY FACT, and both are where that translation can quietly go wrong: a date that becomes money,
 * or a provider limitation that reaches an operator as a vendor's excuse.
 *
 * Provenance and the payer invariant are proved against the real database in the live suite, where
 * the constraints that enforce them actually exist.
 */
import { describe, expect, it } from "vitest";

import { expectedSettlementFromIntent } from "@/lib/financials/payments/collectionAttempt";
import { collectionPresentation } from "@/lib/financials/payments/collectionLifecycle";
import { requestProviderRefund } from "@/lib/financials/payments/refundCollection";

describe("the expected settlement projection", () => {
    /** Stripe's own definition: the date the transaction's net funds become available. */
    it("reads the provider's balance transaction date, as a DAY", () => {
        const at = Math.floor(Date.UTC(2026, 8, 24, 17, 30, 0) / 1000);
        expect(expectedSettlementFromIntent({ latest_charge: { balance_transaction: { available_on: at } } }))
            .toBe("2026-09-24");
    });

    /**
     * NULL IS A CORRECT ANSWER, NOT A MISSING ONE.
     *
     * A card charge settles without a meaningful expectation, and an unexpanded response carries no
     * date at all. Inventing one — "today plus four" — would put Alloy's guess where the provider's
     * statement belongs, and an operator would tell a family a date nobody promised.
     */
    it.each([
        ["no charge at all", {}],
        ["an unexpanded charge", { latest_charge: "ch_1" }],
        ["an unexpanded balance transaction", { latest_charge: { balance_transaction: "txn_1" } }],
        ["a charge with no balance transaction", { latest_charge: { balance_transaction: null } }],
        ["a zero timestamp", { latest_charge: { balance_transaction: { available_on: 0 } } }],
    ])("answers null for %s", (_label, intent) => {
        expect(expectedSettlementFromIntent(intent as never)).toBeNull();
    });
});

/** A store with exactly the rows the refund eligibility path reads. */
function refundStore(payment: Record<string, unknown>, attempt: Record<string, unknown> | null) {
    let inserted = false;
    return {
        get inserted() { return inserted; },
        from(table: string) {
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.eq = () => self;
            self.in = () => self;
            self.is = () => self;
            self.neq = () => self;
            self.order = () => self;
            self.limit = () => self;
            /* The refund row the path writes before calling the provider. */
            self.insert = () => { inserted = true; return self; };
            self.update = () => self;
            self.single = async () => ({ data: { id: "ref-1" }, error: null });
            self.maybeSingle = async () => ({
                data: table === "payments" ? payment : table === "payment_collection_attempts" ? attempt : null,
                error: null,
            });
            self.then = (resolve: (v: unknown) => unknown) =>
                /* `payments` is also read as a LIST when totalling prior refunds — none here. */
                Promise.resolve({ data: [], error: null }).then(resolve);
            return self;
        },
    };
}

const POSTED_PAYMENT = {
    id: "pay-1",
    org_id: "org-1",
    amount_cents: 30_000,
    currency: "USD",
    status: "posted",
    direction: "inbound",
    payment_method: "ach",
    processor: "stripe",
    processor_transaction_id: "pi_1",
    refunds_payment_id: null,
};

describe("a bank payment is refunded in full or not at all", () => {
    it("REFUSES a partial bank refund before the provider is ever called", async () => {
        let providerCalled = false;
        const out = await requestProviderRefund(
            refundStore(POSTED_PAYMENT, { id: "att-1", provider_account_ref: "acct_1", currency: "USD", rail: "ach" }) as never,
            { orgId: "org-1", paymentId: "pay-1", amountCents: 10_000 },
            async () => { providerCalled = true; return { status: 200, body: {} }; },
        );

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("partial_ach_refund");
        expect(providerCalled, "eligibility refuses BEFORE provider execution").toBe(false);
    });

    /**
     * THE SENTENCE IS ALLOY'S PRODUCT RULE, NOT A VENDOR'S EXCUSE.
     *
     * "Stripe doesn't support partial ACH refunds" sends an operator to argue with a company they
     * have no relationship with. A provider limitation becomes Alloy behaviour at the adapter
     * boundary, and what an operator hears is what Alloy does.
     */
    it("says it in Alloy's words, naming neither the provider nor the rail's plumbing", async () => {
        const out = await requestProviderRefund(
            refundStore(POSTED_PAYMENT, { id: "att-1", provider_account_ref: "acct_1", currency: "USD", rail: "ach" }) as never,
            { orgId: "org-1", paymentId: "pay-1", amountCents: 10_000 },
            async () => ({ status: 200, body: {} }),
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.message).toMatch(/bank payment can only be refunded in full/i);
        for (const leak of ["Stripe", "ACH", "us_bank_account", "partial_ach_refund"]) {
            expect(out.message).not.toContain(leak);
        }
    });

    it("permits the FULL amount on the same bank payment", async () => {
        let providerCalled = false;
        await requestProviderRefund(
            refundStore(POSTED_PAYMENT, { id: "att-1", provider_account_ref: "acct_1", currency: "USD", rail: "ach" }) as never,
            { orgId: "org-1", paymentId: "pay-1", amountCents: 30_000 },
            async () => { providerCalled = true; return { status: 200, body: { id: "re_1", status: "succeeded" } }; },
        );
        expect(providerCalled, "a full bank refund reaches the existing refund path").toBe(true);
    });

    it("leaves CARD partial refunds alone", async () => {
        let providerCalled = false;
        await requestProviderRefund(
            refundStore({ ...POSTED_PAYMENT, payment_method: "card" }, { id: "att-1", provider_account_ref: "acct_1", currency: "USD", rail: "card" }) as never,
            { orgId: "org-1", paymentId: "pay-1", amountCents: 10_000 },
            async () => { providerCalled = true; return { status: 200, body: { id: "re_1", status: "succeeded" } }; },
        );
        expect(providerCalled, "the card rail keeps its existing bounded behaviour").toBe(true);
    });

    /**
     * THE RAIL COMES FROM CANONICAL PROVENANCE, NOT FROM OPERATOR-ENTERED TEXT.
     *
     * `payments.payment_method` is free text on manual rails. If the rule read that, a receipt typed
     * as "ACH" would block a legitimate card refund, and one typed "card" would let a partial bank
     * refund through to fail at the provider.
     */
    it("reads the rail from the collection attempt, not from the payment's method text", async () => {
        let providerCalled = false;
        await requestProviderRefund(
            /* The payment SAYS card; the attempt that actually collected it says bank. */
            refundStore({ ...POSTED_PAYMENT, payment_method: "card" }, { id: "att-1", provider_account_ref: "acct_1", currency: "USD", rail: "ach" }) as never,
            { orgId: "org-1", paymentId: "pay-1", amountCents: 10_000 },
            async () => { providerCalled = true; return { status: 200, body: {} }; },
        );
        expect(providerCalled, "provenance wins over the method text").toBe(false);
    });
});

describe("what an operator reads about a collection in progress", () => {
    it("shows the expected date beside processing, and the method by its safe display", () => {
        const out = collectionPresentation({
            state: "processing",
            rail: "ach",
            expectedSettlementOn: "2026-09-24",
            methodBrand: "TEST BANK",
            methodLast4: "6789",
        });
        expect(out.statusLine).toBe("Processing · Expected Sep 24");
        expect(out.methodLine).toBe("TEST BANK •••• 6789");
        /* And it never says the money arrived. */
        expect(out.statusLine).not.toMatch(/received/i);
    });

    it("omits a date the provider never gave, rather than inventing one", () => {
        const out = collectionPresentation({ state: "processing", rail: "card", methodBrand: "visa", methodLast4: "4242" });
        expect(out.statusLine).toBe("Processing");
        expect(out.methodLine).toBe("visa •••• 4242");
    });

    /** Once the money is settled or gone, what was once expected is a distraction. */
    it.each(["received", "failed", "returned", "canceled"] as const)("drops the expectation once the collection is %s", (state) => {
        const out = collectionPresentation({ state, rail: "ach", expectedSettlementOn: "2026-09-24" });
        expect(out.statusLine).not.toMatch(/Expected/);
    });

    it("names the rail when the method has no brand, and nothing when there is no method", () => {
        expect(collectionPresentation({ state: "processing", rail: "ach", methodLast4: "6789" }).methodLine)
            .toBe("Bank account •••• 6789");
        expect(collectionPresentation({ state: "processing", rail: "card" }).methodLine).toBeNull();
    });

    it("never leaks a provider reference into either line", () => {
        const out = collectionPresentation({
            state: "processing", rail: "ach", expectedSettlementOn: "2026-09-24",
            methodBrand: "TEST BANK", methodLast4: "6789",
        });
        for (const leak of ["pm_", "pi_", "acct_", "us_bank_account", "Stripe"]) {
            expect(`${out.statusLine} ${out.methodLine}`).not.toContain(leak);
        }
    });
});

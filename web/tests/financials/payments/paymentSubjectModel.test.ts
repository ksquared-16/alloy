/**
 * RESPONSIBILITY IS NOT PAYER, AND A HARDCODED NULL IS NOT A BUSINESS FACT.
 *
 * Two defects this locks. The card used to read `paymentSetup: null` — a literal with no producer —
 * as "No payment method on file", a claim about a family made from a constant. And the only list of
 * people the card had was persisted RESPONSIBILITY, so an operator recording a grandparent's cheque
 * had nobody to name but the person who owes the money.
 */
import { describe, expect, it } from "vitest";

import {
    resolvePayerCandidates,
    resolvePaymentSetup,
} from "@/lib/financials/payments/paymentSubjectModel";

type Row = Record<string, unknown>;

/** A fake whose builder answers per table, so each test states only the rows it cares about. */
function fakeSupabase(opts: {
    contacts?: Row[];
    contactsError?: string;
    merchant?: Row | null;
    merchantError?: string;
    methods?: Row[];
    methodsError?: string;
}) {
    const table = (name: string) => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        for (const m of ["select", "eq", "in", "order", "limit", "is"]) builder[m] = chain;
        const answer = () => {
            if (name === "customer_persons") {
                return opts.contactsError
                    ? { data: null, error: { message: opts.contactsError } }
                    : { data: opts.contacts ?? [], error: null };
            }
            if (name === "payment_provider_merchants") {
                return opts.merchantError
                    ? { data: null, error: { message: opts.merchantError } }
                    : { data: opts.merchant ?? null, error: null };
            }
            return opts.methodsError
                ? { data: null, error: { message: opts.methodsError } }
                : { data: opts.methods ?? [], error: null };
        };
        builder.maybeSingle = () => ({ then: (r: (v: unknown) => unknown) => r(answer()) });
        builder.then = (r: (v: unknown) => unknown) => r(answer());
        return builder;
    };
    return { from: (name: string) => table(name) } as never;
}

const ARGS = { orgId: "org", customerId: "cust" };

const person = (id: string, first: string, last: string, over: Row = {}): Row => ({
    person_id: id,
    role_type: "guardian",
    is_primary: false,
    status: "active",
    end_date: null,
    persons: { first_name: first, last_name: last },
    ...over,
});

describe("payer candidates", () => {
    it("offers every current household adult, not only the responsible one", async () => {
        const supabase = fakeSupabase({
            contacts: [
                person("p-dana", "Dana", "Alvarez", { is_primary: true }),
                person("p-rosa", "Rosa", "Alvarez"),
            ],
        });
        const { candidates, readFailed } = await resolvePayerCandidates(supabase, {
            ...ARGS,
            responsiblePersonIds: ["p-dana"],
        });
        expect(readFailed).toBe(false);
        expect(candidates.map((c) => c.name)).toEqual(["Dana Alvarez", "Rosa Alvarez"]);
        expect(candidates.find((c) => c.personId === "p-rosa")?.alsoResponsible,
            "Rosa can pay without owing anything").toBe(false);
        expect(candidates.find((c) => c.personId === "p-dana")?.alsoResponsible).toBe(true);
    });

    it("orders by primary contact then name — never by who is responsible", async () => {
        const supabase = fakeSupabase({
            contacts: [
                person("p-zoe", "Zoe", "Alvarez"),
                person("p-abe", "Abe", "Alvarez"),
                person("p-rosa", "Rosa", "Alvarez", { is_primary: true }),
            ],
        });
        const { candidates } = await resolvePayerCandidates(supabase, {
            ...ARGS,
            /* Zoe owes the money. If responsibility ordered this list she would be first. */
            responsiblePersonIds: ["p-zoe"],
        });
        expect(candidates.map((c) => c.name)).toEqual(["Rosa Alvarez", "Abe Alvarez", "Zoe Alvarez"]);
    });

    /*
     * Found mounted: the chooser offered "Ana Alvarez · child" as the person who paid the bill.
     * `customer_persons` is nominally the adult edge, and the certification tenant has children on
     * it anyway.
     */
    it("never offers a child as the person who paid", async () => {
        const supabase = fakeSupabase({
            contacts: [
                person("p-dana", "Dana", "Alvarez", { role_type: "parent", is_primary: true }),
                person("p-ana", "Ana", "Alvarez", { role_type: "child" }),
                person("p-rosa", "Rosa", "Alvarez", { role_type: "guardian" }),
            ],
        });
        const { candidates } = await resolvePayerCandidates(supabase, ARGS);
        expect(candidates.map((c) => c.name)).toEqual(["Dana Alvarez", "Rosa Alvarez"]);
    });

    it("drops relationships that have ended or gone inactive", async () => {
        const supabase = fakeSupabase({
            contacts: [
                person("p-dana", "Dana", "Alvarez"),
                person("p-old", "Former", "Guardian", { end_date: "2026-01-01" }),
                person("p-off", "Inactive", "Contact", { status: "inactive" }),
            ],
        });
        const { candidates } = await resolvePayerCandidates(supabase, ARGS);
        expect(candidates.map((c) => c.personId)).toEqual(["p-dana"]);
    });

    it("lists one person once, however many roles they hold", async () => {
        const supabase = fakeSupabase({
            contacts: [
                person("p-dana", "Dana", "Alvarez", { role_type: "guardian" }),
                person("p-dana", "Dana", "Alvarez", { role_type: "emergency_contact" }),
            ],
        });
        const { candidates } = await resolvePayerCandidates(supabase, ARGS);
        expect(candidates).toHaveLength(1);
    });

    /* "We could not look" and "this family has nobody who can pay" are different answers. */
    it("reports a failed read as failed rather than as an empty household", async () => {
        const supabase = fakeSupabase({ contactsError: "connection reset" });
        const { candidates, readFailed } = await resolvePayerCandidates(supabase, ARGS);
        expect(candidates).toEqual([]);
        expect(readFailed).toBe(true);
    });
});

describe("payment capabilities", () => {
    it("always offers Record payment — cash and cheque need no provider", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: null }), ARGS);
        expect(setup.recordPayment.state).toBe("available");
        expect(setup.recordPayment.reason).toBeNull();
    });

    it("separates unsupported from not configured", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: null }), ARGS);
        /*
         * Alloy has no implementation at all for autopay, and says so. That is still the only
         * `unsupported` capability, and it stays one until W5.
         */
        expect(setup.autopay.state).toBe("unsupported");
        expect(setup.autopay.reason, "and the reason is about Alloy, not about the family")
            .toMatch(/no autopay model/i);

        /*
         * MANAGING METHODS MOVED SIDES, and that is the point of W2.
         *
         * It reported `unsupported` truthfully for as long as Alloy had no canonical table and no
         * writer. It has both now, so an organisation with no merchant is `not_configured` — a
         * state an operator can ACT on — rather than told Alloy cannot do this at all.
         */
        expect(setup.manageMethods.state).toBe("not_configured");

        /* Alloy HAS an implementation for these; this organisation has not set it up. */
        expect(setup.takePaymentCard.state).toBe("not_configured");
        expect(setup.takePaymentAch.state).toBe("not_configured");
    });

    it("managing methods becomes available once the organisation has a merchant", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "ready", ach_readiness: "ready" } }),
            ARGS,
        );
        /* Having NO method on file is not an incapacity — it is an empty list. */
        expect(setup.manageMethods.state).toBe("available");
        expect(setup.methodSummary.hasUsableMethod).toBe(false);
    });

    it("reports a ready merchant as available, and a restricted one as failed", async () => {
        const ready = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "ready", ach_readiness: "ready" } }),
            ARGS,
        );
        expect(ready.takePaymentCard.state).toBe("available");
        expect(ready.takePaymentAch.state).toBe("available");

        const restricted = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "restricted", ach_readiness: null } }),
            ARGS,
        );
        expect(restricted.takePaymentCard.state).toBe("failed");
        expect(restricted.takePaymentCard.reason).toMatch(/restricted/i);
    });

    it("distinguishes card-ready from bank-debit-ready on one merchant", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "ready", ach_readiness: "pending" } }),
            ARGS,
        );
        expect(setup.takePaymentCard.state).toBe("available");
        expect(setup.takePaymentAch.state).toBe("not_configured");
        expect(setup.takePaymentAch.reason).toMatch(/pending/i);
    });

    it("treats an onboarding merchant as pending, never as absent", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "onboarding_incomplete", ach_readiness: null } }),
            ARGS,
        );
        expect(setup.takePaymentCard.state).toBe("pending");
    });

    /*
     * THE HARDCODED NULL. "No payment method on file" is a claim, and the card made it about every
     * household from a constant. It may only be said when the absence was actually looked for AND
     * putting a method on file is something this organisation could do.
     */
    it("stays silent about methods when no provider could hold one", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: null, methods: [] }), ARGS);
        expect(setup.methodsOnFile).toEqual([]);
        expect(setup.summaryLine, "silence, not a claim of absence").toBeNull();
    });

    it("says a method is absent only when one could exist", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({ merchant: { processor: "stripe", readiness: "ready", ach_readiness: null }, methods: [] }),
            ARGS,
        );
        expect(setup.summaryLine).toBe("No payment method on file");
    });

    it("names the method on file, preferring the default", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({
                merchant: { processor: "stripe", readiness: "ready", ach_readiness: null },
                methods: [
                    { id: "m1", display_brand: "Amex", display_last4: "0005", is_default: false, rail: "card", usability_state: "usable", verification_state: "verified" },
                    { id: "m2", display_brand: "Visa", display_last4: "4242", is_default: true, rail: "card", usability_state: "usable", verification_state: "verified" },
                ],
            }),
            ARGS,
        );
        expect(setup.summaryLine).toBe("Visa •••• 4242");
        expect(setup.methodsOnFile).toHaveLength(2);
        expect(setup.methodSummary.defaultCardId).toBe("m2");
        expect(setup.methodSummary.usableRails).toEqual(["card"]);
    });

    /**
     * A REMOVED METHOD IS NOT A METHOD ON FILE.
     *
     * `methodsOnFile` deliberately still lists it, so a surface can say "removed" rather than
     * silently dropping it — which means anything asking "do they have one" must ask the summary.
     */
    it("a household whose only card was removed has no usable method", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({
                merchant: { processor: "stripe", readiness: "ready", ach_readiness: null },
                methods: [
                    { id: "m1", display_brand: "Visa", display_last4: "4242", is_default: false, rail: "card", usability_state: "revoked", verification_state: "verified" },
                ],
            }),
            ARGS,
        );
        expect(setup.methodsOnFile).toHaveLength(1);
        expect(setup.methodSummary.hasUsableMethod).toBe(false);
        expect(setup.summaryLine).toBe("No payment method on file");
    });

    /** A bank account awaiting a deposit is more informative than silence, and is not usable. */
    it("a bank account awaiting verification is said out loud and is not usable", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({
                merchant: { processor: "stripe", readiness: "ready", ach_readiness: "ready" },
                methods: [
                    { id: "m1", display_brand: "TEST BANK", display_last4: "6789", is_default: false, rail: "ach", usability_state: "blocked", verification_state: "pending" },
                ],
            }),
            ARGS,
        );
        expect(setup.methodSummary.hasUsableMethod).toBe(false);
        expect(setup.methodSummary.awaitingVerification).toBe(1);
        expect(setup.summaryLine).toBe("Bank account awaiting verification");
    });

    it("never reports a merchant read failure as a configured merchant", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchantError: "timeout" }), ARGS);
        expect(setup.merchant).toBeNull();
        expect(setup.takePaymentCard.state).toBe("not_configured");
    });
});

/**
 * A RAIL NEEDS THE MERCHANT BEFORE IT NEEDS ITSELF (N2).
 *
 * `ach_readiness` answered "can this organisation take a bank debit" on its own, so a merchant
 * Stripe had restricted — or one that had never finished onboarding — still reported bank debit as
 * available, because its ACH capability happened to say `ready`. Collection refused it correctly,
 * so no money was ever at risk. What was wrong was what the operator had been told, and a control
 * that opens onto nothing is worse than an absent one.
 *
 * The rule now reads merchant-level readiness FIRST, in the same order `resolveCollectionMerchant`
 * enforces on the server — and when the merchant is the blocker, ACH says so rather than blaming
 * the rail and sending an operator to fix the wrong thing.
 */
describe("rail availability requires the merchant AND the rail", () => {
    const merchantWith = (readiness: string | null, achReadiness: string | null): Row => ({
        processor: "stripe",
        readiness,
        ach_readiness: achReadiness,
        is_active: true,
    });

    it("offers a bank debit only when the merchant can collect and ACH is enabled", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: merchantWith("ready", "ready") }), ARGS);
        expect(setup.takePaymentCard.state).toBe("available");
        expect(setup.takePaymentAch.state).toBe("available");
        expect(setup.takePaymentAch.reason).toBeNull();
    });

    it("refuses the bank rail when the merchant can collect but ACH is not enabled — and names the rail", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: merchantWith("ready", null) }), ARGS);
        expect(setup.takePaymentCard.state).toBe("available");
        expect(setup.takePaymentAch.state).toBe("not_configured");
        expect(setup.takePaymentAch.reason).toMatch(/bank debit/i);
    });

    it("refuses the bank rail when onboarding is unfinished, even with ACH ready — and blames the merchant", async () => {
        const setup = await resolvePaymentSetup(
            fakeSupabase({ merchant: merchantWith("onboarding_incomplete", "ready") }),
            ARGS,
        );
        expect(setup.takePaymentCard.state).toBe("pending");
        expect(setup.takePaymentAch.state, "a merchant that cannot charge cannot charge on any rail").toBe("pending");
        expect(setup.takePaymentAch.reason, "the blocker named is the account, not the rail").toMatch(/onboarding/i);
    });

    it("refuses the bank rail on a restricted merchant, even with ACH ready", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchant: merchantWith("restricted", "ready") }), ARGS);
        expect(setup.takePaymentCard.state).toBe("failed");
        expect(setup.takePaymentAch.state).toBe("failed");
        expect(setup.takePaymentAch.reason).toMatch(/restricted/i);
    });

    it("fails closed on an unknown merchant readiness, and on no merchant at all", async () => {
        const unknown = await resolvePaymentSetup(
            fakeSupabase({ merchant: merchantWith("something_new_from_the_provider", "ready") }),
            ARGS,
        );
        expect(unknown.takePaymentAch.state).not.toBe("available");

        const none = await resolvePaymentSetup(fakeSupabase({ merchant: null }), ARGS);
        expect(none.takePaymentCard.state).toBe("not_configured");
        expect(none.takePaymentAch.state).toBe("not_configured");
        expect(none.takePaymentAch.reason).toMatch(/no payment provider is connected/i);
    });
});

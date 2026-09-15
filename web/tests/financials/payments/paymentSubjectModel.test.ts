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
        /* Alloy has no implementation at all for these two. */
        expect(setup.autopay.state).toBe("unsupported");
        expect(setup.manageMethods.state).toBe("unsupported");
        /* Alloy HAS an implementation for these; this organisation has not set it up. */
        expect(setup.takePaymentCard.state).toBe("not_configured");
        expect(setup.takePaymentAch.state).toBe("not_configured");
        expect(setup.autopay.reason, "and the reason is about Alloy, not about the family")
            .toMatch(/no autopay model/i);
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
                    { id: "m1", brand: "Amex", last4: "0005", is_default: false },
                    { id: "m2", brand: "Visa", last4: "4242", is_default: true },
                ],
            }),
            ARGS,
        );
        expect(setup.summaryLine).toBe("Visa •••• 4242");
        expect(setup.methodsOnFile).toHaveLength(2);
    });

    it("never reports a merchant read failure as a configured merchant", async () => {
        const setup = await resolvePaymentSetup(fakeSupabase({ merchantError: "timeout" }), ARGS);
        expect(setup.merchant).toBeNull();
        expect(setup.takePaymentCard.state).toBe("not_configured");
    });
});

// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    FINANCIALS_PAYMENT_METHODS_CHANGED,
    announcePaymentMethodsChanged,
    onPaymentMethodsChanged,
} from "@/lib/financials/payments/paymentMethodEvents";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ADAPTER = "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts";
const VM = "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts";
const METHODS = "components/operationalCards/PaymentMethodsSection.tsx";
const AUTOPAY = "components/operationalCards/AutopaySection.tsx";

describe("one stored method projects one way — the Take Payment contradiction", () => {
    it("never manufactures 'No payment method on file' from a null it did not look up", () => {
        /*
         * THE DEFECT, EXACTLY. The adapter read `vm.payers[].method`, which the VM hardcodes to
         * null, and turned that null into a positive claim. An operator saw that sentence beside a
         * Manage payments panel showing `visa •••• 4242 · Ready`.
         *
         * `paymentSubjectModel` states the rule this violated: the sentence is a CLAIM, and is
         * only said "when a household genuinely has no stored method".
         */
        const src = code(ADAPTER);
        expect(
            src,
            "the adapter must not author this sentence; paymentSubjectModel decides it",
        ).not.toMatch(/\?\?\s*["']No payment method on file["']/);
    });

    it("falls back to the canonical summary line, which DID look", () => {
        const src = code(ADAPTER);
        expect(src).toMatch(/paymentCapabilities\?\.summaryLine/);
    });

    it("keeps null meaning silence, not a claim", () => {
        /*
         * `FinancialsPayer.method` is a non-nullable string, so "nothing to say" is the empty
         * string. What matters is that an unknown renders as NOTHING rather than as a sentence.
         */
        const src = code(ADAPTER);
        const at = src.indexOf("const payers:");
        expect(at).toBeGreaterThan(-1);
        const block = src.slice(at, at + 400);
        expect(block).toMatch(/method:\s*p\.method\s*\?\?\s*methodLine\s*\?\?\s*""/);
    });

    it("the VM still declines to invent a PER-PAYER answer it cannot resolve", () => {
        /*
         * The account-level line is the honest fallback. `methodsOnFile` is household-scoped with
         * no payer id, so a per-payer line would be a guess — which is the mistake the original
         * note correctly refused to make, even though its stated reason has since expired.
         */
        const src = code(VM);
        expect(src).toMatch(/method:\s*null/);
    });
});

describe("a stored method change reaches the sibling surface — the Autopay contradiction", () => {
    it("Payment methods announces canonical changes", () => {
        const src = code(METHODS);
        expect(src).toMatch(/announcePaymentMethodsChanged\(customerId\)/);
    });

    it("does NOT announce add/begin, which writes nothing canonical", () => {
        const src = code(METHODS);
        expect(src).toMatch(/command === "add" && payload\.stage === "begin"/);
        expect(src).toMatch(/!beganOnly/);
    });

    it("Autopay listens and re-reads", () => {
        const src = code(AUTOPAY);
        expect(src).toMatch(/onPaymentMethodsChanged\(customerId/);
    });

    it("Autopay still derives eligibility from the same authority, not from the event", () => {
        /*
         * The event says WHEN to ask again and nothing else. If it ever carried the methods
         * themselves there would be two answers to one question.
         */
        const src = code(AUTOPAY);
        expect(src).toMatch(/\/api\/admin\/financials\/payment-methods/);
        expect(src).toMatch(/usabilityState === "usable"/);
    });

    it("delivers to the right account and ignores another", () => {
        const seen: string[] = [];
        const offA = onPaymentMethodsChanged("acct-A", () => seen.push("A"));
        const offB = onPaymentMethodsChanged("acct-B", () => seen.push("B"));

        announcePaymentMethodsChanged("acct-A");
        expect(seen).toEqual(["A"]);

        announcePaymentMethodsChanged("acct-B");
        expect(seen).toEqual(["A", "B"]);

        offA();
        announcePaymentMethodsChanged("acct-A");
        expect(seen, "an unsubscribed listener must stop hearing").toEqual(["A", "B"]);
        offB();
    });

    it("ignores an empty customer id rather than announcing to everyone", () => {
        const seen: string[] = [];
        const off = onPaymentMethodsChanged("acct-A", () => seen.push("A"));
        announcePaymentMethodsChanged("");
        expect(seen).toEqual([]);
        off();
    });

    it("names the event once, so a listener and a dispatcher cannot drift apart", () => {
        expect(FINANCIALS_PAYMENT_METHODS_CHANGED).toBe("alloy:financials-payment-methods-changed");
        for (const f of [METHODS, AUTOPAY]) {
            expect(code(f), `${f} uses the helpers, not a raw event name`).not.toMatch(
                /alloy:financials-payment-methods-changed/,
            );
        }
    });
});

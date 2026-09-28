import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const ACTION = "lib/adminV2/actions/definitions/financialPaymentActions.ts";
const MODEL = "lib/financials/payments/paymentSubjectModel.ts";
const ATTEMPT = "lib/financials/payments/collectionAttempt.ts";

describe("an operator never re-enters a card the family already gave us", () => {
    it("offers the stored methods as a choice on a provider rail", () => {
        const src = code(CARD);
        expect(src).toMatch(/testId="financials-payment-stored-method"/);
        expect(src).toMatch(/eligibleStoredMethods/);
    });

    it("offers 'Use another card' as an explicit alternate, not the only path", () => {
        const src = read(CARD);
        expect(src).toMatch(/Use another card/);
        expect(src).toMatch(/Use another bank account/);
    });

    it("only offers a chooser where a provider rail can actually collect", () => {
        /* Cash and cheque record money that already arrived; there is no method to choose. */
        const src = code(CARD);
        expect(src).toMatch(/payMethod !== "card" && payMethod !== "ach"/);
    });

    it("selects the single usable method, else the account default for that rail", () => {
        const src = code(CARD);
        expect(src).toMatch(/eligibleStoredMethods\.find\(\(m\) => m\.isDefault\)/);
        expect(src).toMatch(/eligibleStoredMethods\[0\]/);
    });

    it("re-derives the selection when the rail or payer changes", () => {
        /*
         * A stale id here is precisely the mismatch the server refuses: a method that was eligible
         * a moment ago may not belong to the payer now named.
         */
        const src = code(CARD);
        const at = src.indexOf("eligibleStoredMethods.length");
        expect(at).toBeGreaterThan(-1);
        expect(src.slice(at - 400, at)).toMatch(/useEffect/);
    });
});

describe("the payer owns the method — enforced, not merely displayed", () => {
    it("scopes the offered methods to the named payer", () => {
        const src = code(CARD);
        expect(src).toMatch(/m\.payerEntityId === payPayerPersonId/);
    });

    it("does not attach an un-owned legacy method to a named payer", () => {
        /* `!m.payerEntityId` is allowed ONLY because the row names no owner at all. */
        const src = code(CARD);
        expect(src).toMatch(/!m\.payerEntityId \|\| m\.payerEntityId === payPayerPersonId/);
    });

    it("carries the payer with the method so the server can refuse a mismatch", () => {
        const src = code(CARD);
        expect(src).toMatch(/payment_method_id: payStoredMethodId/);
        expect(src).toMatch(/payer_person_id: payPayerPersonId/);
    });

    it("the SERVER is the authority that refuses delegated use", () => {
        /*
         * The UI filter is a courtesy — it stops offering a choice that would be rejected. The
         * refusal itself lives in the service and must stay there.
         */
        const src = code(ATTEMPT);
        expect(src).toMatch(/method_payer_mismatch/);
        expect(src).toMatch(/storedMethod\.payerEntityId !== t\(input\.payerPersonId\)/);
    });

    it("the canonical read carries the owner, so the filter has something true to use", () => {
        const src = code(MODEL);
        expect(src).toMatch(/payer_entity_type, payer_entity_id/);
        expect(src).toMatch(/payerEntityId: t\(m\.payer_entity_id\)/);
    });
});

describe("a stored method is charged, not re-collected", () => {
    it("passes the chosen method through the action to the service", () => {
        const src = code(ACTION);
        expect(src).toMatch(/paymentMethodId: t\(payload\.payment_method_id\)/);
    });

    it("reports back WHICH method was used, so the surface knows what happened", () => {
        const src = code(ACTION);
        expect(src).toMatch(/payment_method_id: created\.paymentMethodId/);
    });

    it("does NOT open card entry after an off-session charge", () => {
        /*
         * The service confirms a stored method off-session. Opening Stripe's fields afterwards
         * would ask the operator to enter a card that has already been charged.
         */
        const src = code(CARD);
        const at = src.indexOf("if (d.payment_method_id)");
        expect(at).toBeGreaterThan(-1);
        const block = src.slice(at, at + 400);
        expect(block).toMatch(/setCardStage\("idle"\)/);
        expect(block, "and it re-reads rather than announcing a receipt").toMatch(/await load\(\)/);
        expect(block, "it must not claim recognition it has not seen").not.toMatch(/"recognized"/);
    });

    it("still opens entry for a NEW instrument", () => {
        const src = code(CARD);
        expect(src).toMatch(/setCardStage\("entry"\)/);
    });
});

describe("safe presentation only", () => {
    it("labels a method by brand, last four and expiry — never a provider id", () => {
        const src = code(CARD);
        const at = src.indexOf("function storedMethodLabel");
        expect(at).toBeGreaterThan(-1);
        const fn = src.slice(at, at + 900);
        expect(fn).toMatch(/brand/);
        expect(fn).toMatch(/last4/);
        expect(fn).toMatch(/Expires/);
        /* A `pm_` or any provider reference must never reach a label. */
        expect(fn).not.toMatch(/provider|processor|pm_|providerMethodRef/i);
    });
});

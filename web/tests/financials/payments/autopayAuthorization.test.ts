import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const AUTOPAY = "components/operationalCards/AutopaySection.tsx";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const METHODS = "components/operationalCards/PaymentMethodsSection.tsx";
const ROUTE = "app/api/admin/financials/payment-methods/route.ts";
const ARRANGEMENT = "lib/financials/payments/autopayArrangement.ts";

describe("the empty payer dropdown", () => {
    it("no longer builds the payer list from a prop nobody passed", () => {
        /*
         * THE DEFECT. `payers` came from `payerEntityId` alone, and the only mount site never
         * passed it — so the list was always empty and the dropdown had nothing in it. The
         * canonical candidates existed the whole time; Take Payment beside it was already using
         * them.
         */
        const src = code(AUTOPAY);
        expect(src).toMatch(/payerCandidates/);
        expect(src).toMatch(/\(payerCandidates \?\? \[\]\)\.length/);
    });

    it("the mount site now passes the canonical candidates", () => {
        const src = code(CARD);
        expect(src).toMatch(/payerCandidates=\{vm\?\.payerCandidates/);
    });

    it("derives payers from household membership, never from responsibility", () => {
        const src = code(AUTOPAY);
        expect(src, "responsibility must not select a payer").not.toMatch(/alsoResponsible|responsib\w*\s*\?/i);
    });
});

describe("one answer is not a question", () => {
    it("renders a single payer read-only instead of a one-option selector", () => {
        const src = code(AUTOPAY);
        expect(src).toMatch(/payers\.length === 1/);
        expect(src).toMatch(/autopay-payer-readonly/);
    });

    it("renders a single eligible method read-only too", () => {
        const src = code(AUTOPAY);
        expect(src).toMatch(/eligible\.length === 1/);
        expect(src).toMatch(/autopay-method-readonly/);
    });

    it("stops asking for Set as default when there is nothing to choose between", () => {
        /* One usable method IS the effective default; pressing a button did not make it truer. */
        const src = code(METHODS);
        expect(src).toMatch(/usableCount > 1/);
    });
});

describe("the payer owns the method, in the form as well as the server", () => {
    it("filters eligible methods by the selected payer", () => {
        const src = code(AUTOPAY);
        expect(src).toMatch(/m\.payerEntityId === payerEntityId/);
    });

    it("re-derives the selection when the payer changes", () => {
        const src = code(AUTOPAY);
        const at = src.indexOf("setMethod((current)");
        expect(at).toBeGreaterThan(-1);
        expect(src.slice(at - 200, at)).toMatch(/useEffect/);
    });

    it("the route projects the owner, so the filter has something true to use", () => {
        const src = code(ROUTE);
        expect(src).toMatch(/payerEntityId: m\.payerEntityId/);
    });

    it("the SERVER remains the final guard", () => {
        const src = code(ARRANGEMENT);
        expect(src).toMatch(/payer_entity_id/);
    });
});

describe("business language, not schema", () => {
    it("states the amount policy rather than offering a choice", () => {
        const src = read(AUTOPAY);
        expect(src).toMatch(/Amount due/);
        expect(src).toMatch(/Autopay collects the amount due when the scheduled collection runs\./);
        /* V1 has one policy; a fixed amount or a percentage would change economics. */
        expect(code(AUTOPAY)).not.toMatch(/fixed_amount|percent/i);
    });

    it("asks when to collect in due-date language", () => {
        const src = read(AUTOPAY);
        expect(src).toMatch(/When should Autopay collect\?/);
        expect(src).toMatch(/On each due date/);
        expect(src).toMatch(/Before each due date/);
        expect(src).toMatch(/After each due date/);
    });

    it("never exposes the raw offset, and never a negative number", () => {
        const src = read(AUTOPAY);
        expect(src, "the implementation primitive is gone").not.toMatch(/Days relative to the due date/);
        expect(code(AUTOPAY), "no negative bound is offered to an operator").not.toMatch(/min="-30"/);
        /* The offset is DERIVED from the operator's words. */
        expect(code(AUTOPAY)).toMatch(/whenKind === "before" \? -Math\.abs/);
    });

    it("expresses the limit as a decision, then a number", () => {
        const src = read(AUTOPAY);
        expect(src, "the old label is gone").not.toMatch(/Maximum per collection/);
        expect(src).toMatch(/Payment limit/);
        expect(src).toMatch(/No limit/);
        expect(src).toMatch(/Set a maximum/);
        expect(src).toMatch(/Maximum payment/);
        expect(src).toMatch(/If the amount due is greater than this limit/);
    });

    it("answers the start date instead of asking it", () => {
        const src = read(AUTOPAY);
        expect(src).toMatch(/Today, for collections due from now on/);
        expect(src).toMatch(/Charges already past due are not collected retroactively\./);
        /* Future-dating stays reachable — answered is not removed. */
        expect(src).toMatch(/autopay-start-change/);
    });
});

describe("review, then consent", () => {
    it("states the whole authorization before the button", () => {
        const src = code(AUTOPAY);
        const at = src.indexOf('data-testid="autopay-review"');
        expect(at).toBeGreaterThan(-1);
        const submit = src.indexOf('data-testid="autopay-setup-submit"');
        expect(submit, "review comes before consent").toBeGreaterThan(at);
        const block = src.slice(at, submit);
        for (const line of ["Payer", "Payment method", "Amount", "When", "Payment limit"]) {
            expect(block, `review states ${line}`).toContain(line);
        }
    });

    it("only Authorize Autopay creates consent", () => {
        const src = read(AUTOPAY);
        expect(src).toMatch(/Authorize Autopay/);
        const plain = code(AUTOPAY);
        /* One submit, and it is the consent. Nothing else posts an enrollment. */
        expect((plain.match(/type="submit"/g) ?? []).length).toBe(1);
    });

    it("wears Bend Pine, like every primary in this surface", () => {
        const src = code(AUTOPAY);
        const at = src.indexOf('data-testid="autopay-setup-submit"');
        const block = src.slice(at, at + 400);
        expect(block).toMatch(/bg-alloy-bend-pine/);
    });

    it("refuses to submit an incomplete limit", () => {
        /* Choosing "Set a maximum" and leaving it blank is not "no limit". */
        const src = code(AUTOPAY);
        expect(src).toMatch(/limitIncomplete/);
        expect(src).toMatch(/limitKind === "max" && !maxAmount\.trim\(\)/);
    });
});

describe("boundaries this slice must not cross", () => {
    it("adds no recurrence or billing-frequency choice", () => {
        const src = code(AUTOPAY);
        expect(src).not.toMatch(/every\s*x|frequency|recurrence|billing_period/i);
    });

    it("keeps storing a method separate from authorizing Autopay", () => {
        /* Two canonical acts. The form composes the journey; it does not merge the consents. */
        const src = code(AUTOPAY);
        expect(src).not.toMatch(/payment_method\.add|paymentMethodCommands/);
    });
});

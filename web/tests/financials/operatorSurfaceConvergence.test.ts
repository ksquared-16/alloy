/**
 * The operator surfaces, locked where the requirement actually lives.
 *
 * Source ORDER is the honest build-side proof for "administration comes before the ledger": the
 * mounted geometry is the final word, but a component that renders administration after the
 * ledger cannot produce the right geometry however the CSS is written, and this catches the
 * regression the moment someone moves the block back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const OVERVIEW = "app/adminV2/financials/sections/FinancialsOverview.tsx";
const ADD_CHARGE = "components/operationalCards/AddChargeCommand.tsx";

describe("administration comes before the ledger", () => {
    const src = statements(code(DETAIL));
    const at = (needle: string) => {
        const i = src.indexOf(needle);
        expect(i, `${needle} is present`).toBeGreaterThan(-1);
        return i;
    };

    it("responsibility, discounts and payment methods all precede the ledger", () => {
        /*
         * Measured before any of this: administration sat after 116 ledger rows, so managing who
         * pays or what reduces a bill meant scrolling past every transaction on the account.
         *
         * Three shapes have now answered that. Four stacked sections above the ledger fixed the
         * order and read as a settings screen. Two compact rows fixed the weight and still spent
         * permanent height restating a Responsibility KPI at the top of the same card. What is
         * left is ONE relationship row — payer, what they owe, how they can pay, what reduces it,
         * and the doors — with responsibility stated by its KPI and managed from the filter.
         *
         * The ordering rule never changed: everything administrable is reachable before the
         * record, not after it.
         */
        const ledger = at("data-financials-ledger-hydrating");
        expect(at('data-financials-payer-row="true"'), "the relationship row precedes the ledger")
            .toBeLessThan(ledger);
        expect(at('data-financials-manage-payments="open"'), "payment management precedes it")
            .toBeLessThan(ledger);
        expect(at('data-financials-manage-discounts="gear"'), "discount management precedes it")
            .toBeLessThan(ledger);
        expect(at('data-financials-manage-responsibility="gear"'), "responsibility management precedes it")
            .toBeLessThan(ledger);
    });

    it("and before the ledger's own controls, not merely above the rows", () => {
        const lenses = at('data-financials-lenses="true"');
        expect(at('data-financials-payer-row="true"')).toBeLessThan(lenses);
        expect(at('data-financials-row-group="discount"')).toBeLessThan(lenses);
    });

    it("autopay stays with the methods it qualifies", () => {
        /*
         * AND THE METHODS MOVED. Autopay qualifies a payment method, so when payment methods left
         * Details for the Manage payments depth card, autopay went with them — a standing autopay
         * line beside a method the operator can no longer see states a dependency on something
         * absent. The rule is unchanged: the two are never separated.
         */
        const detail = statements(code(DETAIL));
        expect(detail, "autopay does not stand alone in Details")
            .not.toContain('data-financials-admin-item="autopay"');
        expect(detail, "nor does an autopay section").not.toContain("<AutopaySection");

        const host = statements(code("components/admin/focusPanel/cards/FinancialsCard.tsx"));
        const at2 = host.indexOf('if (overlay === "payments_admin"');
        expect(at2, "the payments depth card exists").toBeGreaterThan(-1);
        const card = host.slice(at2, at2 + 2200);
        expect(card, "the methods are there").toContain("<PaymentMethodsSection");
        expect(card, "and autopay is there with them").toContain("<AutopaySection");
    });

    it("administration is one row, not a stack of anything", () => {
        /*
         * THE REASON EACH PREVIOUS SHAPE FAILED. Four sections above the ledger is the same defect
         * as four below it; two full-width rows is a smaller version of it. There is exactly one
         * permanent row, and no section- or row-shaped administration survives beside it.
         */
        expect((src.match(/data-financials-payer-row="true"/g) ?? []).length).toBe(1);
        for (const gone of [
            'data-financials-administration="compact"',
            'data-financials-admin-item="responsibility"',
            'data-financials-discounts="detail"',
            'data-financials-payment-methods="detail"',
            'data-financials-autopay="detail"',
        ]) {
            expect(src, `${gone} is permanent administration, and that is what this replaced`)
                .not.toContain(gone);
        }
    });
});

describe("Overview asks for action in the product's own language", () => {
    const src = statements(code(OVERVIEW));

    it("the actionable control is the canonical primary action", () => {
        expect(src).toContain("ConfigurationPrimaryButton");
        expect(src, "and not the navy it used to be").not.toMatch(/bg-alloy-midnight text-white/);
    });

    it("no Financials-only green is hard-coded ON THE ACTION", () => {
        /*
         * SCOPED TO THE ACTION, because the file legitimately contains Bend Pine elsewhere: a
         * 1.5px status dot marks inbound money, and recolouring semantic indicators is exactly
         * what this slice was told not to do. The rule is about the control an operator presses —
         * it takes its colour from the shared primitive, never from a class written here.
         */
        const actionBlocks = src.split("data-financials-overview-open").slice(1)
            .map((chunk) => chunk.slice(0, 400));
        expect(actionBlocks.length, "the action exists").toBeGreaterThan(0);
        for (const block of actionBlocks) {
            expect(block, "the action names no colour of its own")
                .not.toMatch(/bg-alloy-bend-pine|bg-alloy-pine|bg-green|bg-alloy-midnight/);
        }
    });

    it("a section with nothing waiting keeps its quiet treatment", () => {
        expect(src).toMatch(/waiting \?/);
        expect(src).toContain("bg-white");
    });
});

describe("Add Charge asks only what it needs", () => {
    const src = statements(code(ADD_CHARGE));

    it("the config read-out is gone", () => {
        expect(src).not.toContain("dated by the event");
        expect(src).not.toContain("billed next cycle");
        expect(src, "the strip itself, not just its words").not.toContain("alloy-os-addcharge__config");
    });

    it("the posting prose is gone, and the review case still speaks", () => {
        expect(src).not.toContain("Posts on confirm");
        expect(src, "a review requirement changes what Confirm does, so it is still said")
            .toContain("Creates a draft — not yet owed");
    });

    it("the posting SEMANTICS are untouched", () => {
        // Removing the sentence must not remove the rule it described.
        expect(src).toContain("reviewRequired");
    });
});

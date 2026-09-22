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
         * Measured before this change: the administration sat after 116 ledger rows, so managing
         * who pays or what reduces a bill meant scrolling past every transaction on the account.
         *
         * Moving those sections above the ledger fixed the scroll and created a worse problem —
         * a stack of configuration sections between the commands and the record, so the card read
         * as a settings screen with a ledger at the bottom. The three facts now state themselves
         * on ONE row and each opens a depth card, which is why the section markers this rule used
         * to read are gone. The ordering rule itself is unchanged.
         */
        const ledger = at("data-financials-ledger-hydrating");
        const admin = at('data-financials-administration="compact"');
        expect(admin, "the administration region precedes the ledger").toBeLessThan(ledger);
        /*
         * PAYMENT STATE IS NOT AN ADMINISTRATION ITEM ANY MORE, and that is the correction rather
         * than a gap: how a payer can pay is a fact about the PAYER, so it states itself on the
         * relationship row and is managed from there. Responsibility and discounts are per-child
         * questions and keep their own rows. All three still precede the ledger, which is what
         * this rule was ever about.
         */
        expect(at('data-financials-payer-row="true"'), "payment state precedes the ledger")
            .toBeLessThan(ledger);
        expect(at('data-financials-manage-payments="open"'), "and so does the way to change it")
            .toBeLessThan(ledger);
        for (const item of ["responsibility", "discount"]) {
            expect(at(`data-financials-admin-item="${item}"`), `${item} states itself before the ledger`)
                .toBeLessThan(ledger);
        }
    });

    it("and before the ledger's own controls, not merely above the rows", () => {
        const lenses = at('data-financials-lenses="true"');
        expect(at('data-financials-administration="compact"')).toBeLessThan(lenses);
        expect(at('data-financials-admin-item="discount"')).toBeLessThan(lenses);
    });

    it("autopay stays with the methods it qualifies", () => {
        /*
         * AND THE METHODS MOVED. Autopay qualifies a payment method, so when payment methods left
         * Details for the Manage payments depth card, autopay had to go with them — a standing
         * autopay line in Details beside a method the operator can no longer see from Details
         * states a dependency on something absent.
         *
         * The rule is unchanged: the two are never separated. What changed is where both live.
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

    it("administration is one row, not a stack of sections", () => {
        /*
         * THE REASON THE PREVIOUS SHAPE FAILED. Four sections above the ledger is the same defect
         * as four sections below it: the operator's record is not what the card is about any more.
         * There is exactly one administration container, and no section-shaped administration
         * blocks survive beside it.
         */
        expect((src.match(/data-financials-administration="compact"/g) ?? []).length).toBe(1);
        for (const gone of [
            'data-financials-discounts="detail"',
            'data-financials-payment-methods="detail"',
            'data-financials-autopay="detail"',
        ]) {
            expect(src, `${gone} is a section, and sections are what this replaced`).not.toContain(gone);
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

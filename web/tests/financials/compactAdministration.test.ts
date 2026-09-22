/**
 * ADMINISTRATION IS A COMPACT ROW AND THREE DOORS — not a configuration wall.
 *
 * The previous pass moved four stacked sections from below the ledger to above it, which fixed the
 * ORDER and left the shape wrong. These lock the shape: Details carries compact STATE, management
 * happens on a depth surface, and the ledger is never displaced by an editor.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const code = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

const DETAIL = statements(code("components/operationalCards/FinancialsDetailCard.tsx"));
const CARD = statements(code("components/admin/focusPanel/cards/FinancialsCard.tsx"));

describe("Details renders no administration editor", () => {
    it("neither management panel is rendered inside Details", () => {
        /*
         * The hard requirement: opening management must create a sibling depth surface, never
         * insert the editor into the Details document flow. A panel that is not even imported here
         * cannot be rendered here.
         */
        expect(DETAIL, "no responsibility editor in Details").not.toContain("<FinancialsResponsibilityPanel");
        expect(DETAIL, "no discount editor in Details").not.toContain("<FinancialsDiscountPanel");
    });

    it("payment method and autopay setup are not permanent bands in Details", () => {
        expect(DETAIL, "no methods section inline").not.toContain("<PaymentMethodsSection");
        expect(DETAIL, "no autopay band inline").not.toContain("<AutopaySection");
    });

    it("Add card and Add bank account are not in the main card", () => {
        /* They belong behind Manage payments, inside the Payments surface that owns them. */
        expect(DETAIL).not.toMatch(/Add card|Add bank account/);
    });

    it("the four stacked administration sections are gone", () => {
        for (const marker of [
            'data-financials-payment-methods="detail"',
            'data-financials-autopay="detail"',
            'data-financials-discounts="detail"',
        ]) {
            expect(DETAIL, `${marker} is no longer a section in Details`).not.toContain(marker);
        }
    });
});

describe("what Details does carry is compact state and doors", () => {
    it("one administration region, not several", () => {
        expect(DETAIL).toContain('data-financials-administration="compact"');
        const regions = DETAIL.split('data-financials-administration="compact"').length - 1;
        expect(regions, "exactly one region").toBe(1);
    });

    it("it states responsibility, discount and a way to manage payments", () => {
        expect(DETAIL).toContain('data-financials-responsibility-summary="true"');
        expect(DETAIL).toContain('data-financials-discount-summary="true"');
        expect(DETAIL).toContain('data-financials-manage-payments="open"');
    });

    it("both gears open a surface rather than local state", () => {
        expect(DETAIL).toContain("administration.onManageResponsibility");
        expect(DETAIL).toContain("administration.onManageDiscount");
        expect(DETAIL, "the filter gear no longer unfolds an inline editor")
            .not.toContain("setManageResponsibilityOpen(true)");
    });

    it("administration still precedes the ledger", () => {
        const admin = DETAIL.indexOf('data-financials-administration="compact"');
        const lenses = DETAIL.indexOf('data-financials-lenses="true"');
        const ledger = DETAIL.indexOf("data-financials-ledger-hydrating");
        expect(admin).toBeGreaterThan(-1);
        expect(admin).toBeLessThan(lenses);
        expect(admin).toBeLessThan(ledger);
    });
});

describe("the doors are real depth surfaces", () => {
    it("each is a surface on the same stack Add Charge and Payment use", () => {
        for (const kind of ["responsibility_admin", "discount_admin", "payments_admin"]) {
            expect(CARD, `${kind} is a surface kind`).toContain(`kind: "${kind}"`);
            /*
             * THE GUARD MUST STILL GUARD. Asserting only that the string appears let a planted
             * `false && overlay === "responsibility_admin"` pass cleanly — the overlay would never
             * render, administration would fall back into Details, and the lock would not notice.
             * The check has to OPEN the statement.
             */
            expect(CARD, `${kind} opens its own early return`)
                .toMatch(new RegExp(`if \\(overlay === "${kind}"`));
            expect(CARD, `${kind} is not short-circuited off`)
                .not.toMatch(new RegExp(`(false|0) &&\\s*overlay === "${kind}"`));
        }
    });

    it("each is hosted by the platform card, which is what the depth layer grants clicks to", () => {
        for (const key of ["responsibility_admin", "discount_admin", "payments_admin"]) {
            expect(CARD).toContain(`data-universal-card-key="${key}"`);
        }
        // The command modal class is what makes it the same visual family as Add and Payment.
        const commandShells = CARD.split('modalClass="command"').length - 1;
        expect(commandShells, "every command shell, including the three new ones").toBeGreaterThanOrEqual(5);
    });

    it("the standing surface is not confused with the per-charge one", () => {
        /* `responsibility` is a ledger row's resolve/reallocate; `responsibility_admin` is the
           household's standing arrangement. Different acts, different names. */
        expect(CARD).toContain('kind: "responsibility"; chargeId: string');
        expect(CARD).toContain('kind: "responsibility_admin"');
    });

    it("dismissal runs through the stack, so one Escape pops one layer", () => {
        expect(CARD).toContain("dismissOneLevel()");
        expect(CARD).toContain("onHostedClose={pop}");
    });
});

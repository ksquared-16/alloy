import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MOUNT = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const METHODS = "components/operationalCards/PaymentMethodsSection.tsx";
const AUTOPAY = "components/operationalCards/AutopaySection.tsx";

/**
 * THE MOUNT IS THE SUBJECT, NOT THE COMPONENT.
 *
 * Three times in one Payments sprint the same failure occurred: a canonical authority existed, a
 * component was written to consume it, a sibling surface already rendered it — and the production
 * mount passed nothing, so absence became the operator's truth.
 *
 *   1. `buildFinancialsCardVM` hardcoded `payers[].method = null` and the adapter turned that null
 *      into "No payment method on file" beside a visible stored card.
 *   2. `AutopaySection` derived its payer list from a prop the only mount never supplied, so the
 *      selector was structurally always empty.
 *   3. `PaymentMethodsSection` was mounted with `customerId` alone, so the Stripe billing-name
 *      prefill it implements never received a name and silently did nothing.
 *
 * Every one of those passed a component test, because a component test supplies the prop itself.
 * These assertions read the PRODUCTION MOUNT. They fail if production stops passing the data,
 * which is the only failure that ever actually happened.
 */
function mountBlock(component: string): string {
    const src = code(MOUNT);
    const at = src.indexOf(`<${component}`);
    expect(at, `${component} is mounted in ${MOUNT}`).toBeGreaterThan(-1);
    /* Bounded by the element's own close, not a character count. */
    const end = src.indexOf("/>", at);
    expect(end).toBeGreaterThan(at);
    return src.slice(at, end);
}

describe("production mounts supply the canonical authority their components expect", () => {
    it("PaymentMethodsSection receives the canonical payer name", () => {
        const block = mountBlock("PaymentMethodsSection");
        expect(block, "payerName drives the Stripe billing-name prefill").toMatch(/payerName=\{/);
        expect(block).toMatch(/payerCandidates/);
    });

    it("PaymentMethodsSection receives the canonical payer identity", () => {
        const block = mountBlock("PaymentMethodsSection");
        expect(block).toMatch(/payerEntityId=\{/);
    });

    it("AutopaySection still receives the canonical payer candidates", () => {
        /* Regression 2. It must not silently revert to the empty-selector state. */
        const block = mountBlock("AutopaySection");
        expect(block).toMatch(/payerCandidates=\{/);
    });

    it("the payer comes from household membership, never from responsibility", () => {
        /*
         * `payerCandidates` is the household-membership authority. Sourcing the payer from
         * `responsibility.parties` would collapse who-pays into who-owes — the one thing the
         * payment model forbids.
         */
        for (const component of ["PaymentMethodsSection", "AutopaySection"]) {
            const block = mountBlock(component);
            expect(block, `${component} must not be fed from responsibility`).not.toMatch(
                /responsibility|parties/i,
            );
        }
    });

    it("the components still declare the props the mount supplies", () => {
        /* A mount passing a prop the component dropped is the same defect wearing the other hat. */
        expect(code(METHODS)).toMatch(/payerName\?:/);
        expect(code(METHODS)).toMatch(/payerEntityId\?:/);
        expect(code(AUTOPAY)).toMatch(/payerCandidates\?:/);
    });

    it("no Payments mount hardcodes a null where canonical truth belongs", () => {
        /*
         * `payerCandidates={null}` or `payerName={null}` would satisfy every assertion above while
         * reproducing the defect exactly. A literal null is banned; an optional-chained read of the
         * view model is not.
         */
        for (const component of ["PaymentMethodsSection", "AutopaySection"]) {
            const block = mountBlock(component);
            expect(block, `${component} must not be mounted with a literal null`).not.toMatch(
                /(payerName|payerEntityId|payerCandidates)=\{\s*null\s*\}/,
            );
        }
    });
});

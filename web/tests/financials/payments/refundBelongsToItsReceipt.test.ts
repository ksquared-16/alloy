import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const CSS = "app/adminV2/components/alloyOsRuntime.css";

describe("a refund is an action ON a receipt", () => {
    it("is scoped to the payment it acts on", () => {
        const src = code(CARD);
        expect(src).toMatch(/data-financials-refund-payment=\{p\.paymentId\}/);
    });

    it("is drawn subordinate, not as a peer of the commands", () => {
        /*
         * It already lived inside its row; what made it read as a peer was wearing the full
         * command treatment, so it competed with "Take or record payment" and "Add" as a third
         * boxed button of equal weight.
         */
        const src = code(CARD);
        const at = src.indexOf('data-financials-command="payment.refund"');
        expect(at).toBeGreaterThan(-1);
        const block = src.slice(at - 300, at);
        expect(block).toMatch(/alloy-os-financials__action--onrow/);
    });

    it("the subordinate treatment is a real rule, not a class name with nothing behind it", () => {
        const css = read(CSS);
        expect(css).toMatch(/\.alloy-os-financials__action--onrow\s*\{/);
        const at = css.indexOf(".alloy-os-financials__action--onrow {");
        const rule = css.slice(at, at + 400);
        expect(rule, "the filled box is what said 'start something here'").toMatch(/background:\s*transparent/);
        expect(rule).toMatch(/border-color:\s*transparent/);
    });

    it("stays reachable — subordinate is not hidden", () => {
        const css = read(CSS);
        const at = css.indexOf(".alloy-os-financials__action--onrow {");
        const rule = css.slice(at, at + 400);
        expect(rule, "no display:none, no visibility tricks").not.toMatch(/display:\s*none|visibility:\s*hidden/);
        expect(css, "and it still answers to hover").toMatch(/\.alloy-os-financials__action--onrow:hover/);
    });

    it("the top-level commands keep the command treatment", () => {
        /* Only the receipt-scoped action is demoted; the acts that BEGIN something are not. */
        const src = code(CARD);
        const at = src.indexOf('data-financials-command="payment.record"');
        expect(at).toBeGreaterThan(-1);
        const block = src.slice(at - 300, at);
        expect(block).toMatch(/alloy-os-financials__action/);
        expect(block).not.toMatch(/--onrow/);
    });

    it("refund economics are untouched — this is presentation only", () => {
        const src = code(CARD);
        /* The refundable ceiling and the action key are unchanged. */
        expect(src).toMatch(/p\.refundableCents/);
        expect(src).toMatch(/payment\.refund/);
    });
});

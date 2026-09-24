/**
 * ONE FINANCIAL ACCOUNT PRODUCT, TWO HOSTS.
 *
 * Focus Panel → Financials Details and Financials Workspace → Accounts are two placements of one
 * account. They were already reading the same canonical view model and still looked like different
 * generations of the product, because the workspace could not REACH the shared presentation:
 * `showDetailsAction={false}` left `onDetails` undefined and the `detail` surface unreachable, and
 * the relationship row, the discount gear, Manage payments and the responsibility gear all live
 * there. So the workspace grew its own composition beside the card to compensate.
 *
 * These locks hold the shape that fixed it: the difference between the hosts is a PROP, and the
 * presentation is one implementation neither host may fork again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const SHARED = "components/operationalCards/FinancialsDetailCard.tsx";
const ACCOUNTS_PLACEMENT = "app/adminV2/financials/sections/FinancialsAccounts.tsx";
const ACCOUNTS_SUMMARY = "app/adminV2/financials/FinancialsAccountDetail.tsx";

describe("the two hosts differ by a prop, not by an implementation", () => {
    it("both hosts render the same card", () => {
        expect(code(ACCOUNTS_SUMMARY), "the workspace composes the shared card")
            .toContain("FinancialsCard");
        expect(code(CARD), "and the card renders the shared account surface")
            .toContain("<FinancialsDetailCard");
    });

    it("the workspace opens on that surface rather than behind a disabled action", () => {
        /*
         * THE DEFECT, NAMED. `showDetailsAction={false}` is correct for a workspace — there is
         * nothing to drill in FROM when the account is the subject — but on its own it made the
         * shared surface unreachable rather than default.
         */
        const summary = code(ACCOUNTS_SUMMARY);
        expect(summary).toMatch(/detailsAreTheSurface=\{summaryVariant === "account"\}/);
        const card = code(CARD);
        expect(card, "which seeds the same stack the Focus Panel pushes onto")
            .toMatch(/detailsAreTheSurface \? \[\{ kind: "detail" \}\] : \[\]/);
    });

    it("the workspace cannot be popped off its own subject", () => {
        /*
         * Dismissing a depth card returns the operator to the account they were working. In the
         * workspace that account IS Details, and popping past it would strand them on a compact
         * summary they never asked for and cannot leave — the workspace has no Details action to
         * get back with.
         */
        const card = code(CARD);
        expect(card).toMatch(/if \(detailsAreTheSurface && st\.length <= 1\) return st;/);
    });

    it("the workspace renders no second account body", () => {
        /*
         * `FinancialsAccountWorkspaceDetail` was roughly a thousand lines answering questions the
         * shared surface already answers, from the same view model — its own lens bar, period
         * grouping, rows and an inline Responsibility editor. The placement must never compose a
         * second body beside the card again.
         */
        const placement = code(ACCOUNTS_PLACEMENT);
        expect(placement, "no second body component").not.toMatch(/<FinancialsAccountWorkspaceDetail/);
        expect(placement, "and no ledger of its own").not.toMatch(/<LedgerPeriods|<PaymentsLens/);
    });
});

describe("every management capability reaches both hosts through one surface", () => {
    /*
     * Not asserted per host — asserted ONCE, on the surface both hosts render. That is the whole
     * point: a capability cannot be present in one host and missing from the other when there is
     * only one implementation of it.
     */
    it.each([
        ["the relationship row", 'data-financials-payer-row="true"'],
        ["the discount summary", 'data-financials-discount-summary="true"'],
        ["the discount gear", 'data-financials-manage-discounts="gear"'],
        ["Manage payments", 'data-financials-manage-payments="open"'],
        ["the responsibility gear", 'data-financials-manage-responsibility="gear"'],
        ["the ledger lenses", 'data-financials-lenses="true"'],
    ])("%s is on the shared surface", (_what, marker) => {
        expect(code(SHARED)).toContain(marker);
    });

    it.each([
        ["Responsibility", "responsibility_admin"],
        ["Discounts", "discount_admin"],
        ["Payments", "payments_admin"],
        ["Add Charge", "add_charge"],
        ["Payment", "payment"],
    ])("%s opens as a depth surface on the shared stack", (_what, kind) => {
        const card = code(CARD);
        expect(card, `${kind} is a surface`).toMatch(new RegExp(`if \\(overlay === "${kind}"`));
        expect(card, `${kind} is not short-circuited off`)
            .not.toMatch(new RegExp(`(false|0) &&\\s*overlay === "${kind}"`));
    });

    it("no inline management survives on the shared surface", () => {
        /* §5: neither host may embed what the other opens as a centred card. */
        const shared = code(SHARED);
        for (const inline of [
            "<FinancialsResponsibilityPanel",
            "<FinancialsDiscountPanel",
            "<PaymentMethodsSection",
            "<AutopaySection",
        ]) {
            expect(shared, `${inline} must open as a depth card in both hosts`).not.toContain(inline);
        }
    });
});

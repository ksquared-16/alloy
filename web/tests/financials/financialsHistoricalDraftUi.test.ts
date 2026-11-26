/**
 * THE FINANCIALS ADAPTER for the shared workflow verifier — what an operator must SEE on the fixture child's
 * Financials card. Snapshots are synthetic captures in the driver's shape; no browser. A fake driver proves only that
 * the adapter's assertions say what they claim, never that the page renders it.
 */
import { describe, expect, it } from "vitest";

import { durableRecordHref } from "@/lib/runtime/focus/durableRecordRoute";

import { CATALOG_AMOUNT_CENTS, IDS, TEMPLATE_AMOUNT_CENTS } from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import { FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER as A, HISTORICAL_DRAFT_UI_ROUTE } from "../../scripts/qa/financialsHistoricalDraftUi";
import { validateAdapter } from "../../scripts/qa/qaWorkflowVerifier.mjs";

const DRAFT = "7a1b2c3d-0000-4000-8000-00000000d001";
const money = (c: number) => (c / 100).toFixed(2);
const row = (id: string, amount: string, state: string | null) => ({ attrs: { "data-financials-ledger-row": id }, text: `Registration ${amount}`, parts: { amount: `$${amount}`, state } });
const POSTED = row("7a1b2c3d-0000-4000-8000-00000000d0ff", "120.00", "posted");
const judge = (rows: unknown[] | undefined, ctx: { draftChargeId: string } = { draftChargeId: DRAFT }, routeId = "child_financials") =>
    A.assert(routeId, { ledger_rows: rows as never }, ctx);
const failed = (checks: Array<{ ok: boolean; check: string }>) => checks.filter((c) => !c.ok).map((c) => c.check);

describe("financials_historical_draft UI adapter", () => {
    it("is a valid adapter with ONE fixed route: the product's own durable-record address for the fixture household's Financials lead", () => {
        expect(validateAdapter(A)).toEqual({ ok: true });
        // The household's record, not the child's: a child record composes no Financials (financialsUiSurfaceDiagnosis).
        expect(A.routes).toEqual([{ id: "child_financials", path: durableRecordHref("household", IDS.customer, "financials") }]);
        expect(HISTORICAL_DRAFT_UI_ROUTE.startsWith("/")).toBe(true);
        // Details first (the ledger exists only on the Details surface), then the collapsed periods it renders.
        expect(A.reveal).toEqual(['[data-financials-nav="details"]:not([disabled]), [data-financials-details="true"]', '[data-financials-period-toggle][aria-expanded="false"]']);
        // The capture that is judged is still exactly the ledger rows; the rest are diagnostic counts.
        expect(A.capture.map((c) => c.name)).toEqual(["ledger_rows", "financials_cards", "details_actions", "details_surfaces", "period_toggles", "financials_unavailable"]);
    });

    it("passes when the draft row renders once, at the template price, still a draft, and the Catalog price is no charge", () => {
        for (const state of ["scheduled", "attention", "legacy"]) {
            const checks = judge([row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), state), POSTED]);
            expect(failed(checks)).toEqual([]);
            expect(checks).toHaveLength(4);
        }
    });

    it.each([
        ["the draft row is absent", [POSTED], ["rendered once (found 0)", "template price", "still a draft"]],
        ["the draft row renders twice", [row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled"), row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled")], ["rendered once (found 2)"]],
        ["the draft shows the Catalog price (the hazard)", [row(DRAFT, money(CATALOG_AMOUNT_CENTS), "scheduled")], ["template price", "is not a charge on the child (rows=1)"]],
        ["the draft became a posted charge", [row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "posted")], ["still a draft (state=not-a-draft)"]],
        ["the draft has no state part", [row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), null)], ["still a draft (state=not-a-draft)"]],
        ["the Catalog price appears as another charge", [row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled"), row("7a1b2c3d-0000-4000-8000-00000000d0aa", money(CATALOG_AMOUNT_CENTS), "posted")], ["is not a charge on the child (rows=1)"]],
    ])("fails when %s", (_l, rows, expected) => {
        const f = failed(judge(rows));
        for (const e of expected) expect(f.some((c) => c.includes(e)), `${e} in ${JSON.stringify(f)}`).toBe(true);
    });

    it("never judges without the draft id from the domain read, nor on another route; an empty capture fails", () => {
        expect(failed(judge([row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled")], { draftChargeId: "" }))).toEqual(["ui historical draft: no draft charge id from the domain read"]);
        expect(failed(judge([row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled")], { draftChargeId: "not-a-uuid" }))).toHaveLength(1);
        expect(failed(judge([row(DRAFT, money(TEMPLATE_AMOUNT_CENTS), "scheduled")], undefined, "other_route"))).toHaveLength(1);
        expect(failed(judge(undefined))).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
    });
});

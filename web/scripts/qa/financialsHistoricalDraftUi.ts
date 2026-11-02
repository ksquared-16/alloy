/**
 * THE FINANCIALS ADAPTER for the shared QA workflow verifier (`qaWorkflowVerifier.mjs`): what an operator must SEE
 * for the historical-draft hazard to be fixed — on the fixture household's account (the child's account: Financials is
 * the household's), the one historical draft (the template's 7500) is a draft row of its own, and the same-name Catalog
 * item's 9900 never became a charge.
 *
 * Narrow by construction: one route built by the product's own durable-record address builder from the fixture's
 * fixed household id; DOM read only through the ledger's stable data attributes (`FinancialsLedger.tsx`); the only
 * interaction is two read-only disclosures, in order: the card's own `Details` drill-down, then collapsed period
 * disclosures (the draft is dated 2026-03-16, so its period may render collapsed). The draft's charge id comes from
 * the domain read (`readHistoricalDraftUiSubject`), never from a caller.
 *
 * WHY THE HOUSEHOLD RECORD, NOT THE CHILD'S. A durable child record composes only the Children card
 * (`deriveChildFocusPanelCards`) and mounts no Financials at all — the governed run of f13d7915 (qar_1d07b1e6ddba)
 * rendered that record, signed in, and captured financials_cards=0. Financials reaches a durable record only as the
 * household's Financials LEAD (the surface Billing opens); `?card=financials` on a household record addresses that
 * lead (`durableRecordLeadCardFor`).
 *
 * Why `Details` first: the lead mounts the Financials card in its compact placement (no `detailsAreTheSurface`), and
 * the ledger — every `[data-financials-ledger-row]` — is rendered only by the Details
 * surface (`FinancialsCard` → `FinancialsDetailCard` → `FinancialsLedger`). Without opening it the capture is empty
 * whatever the account holds. The other captures are never asserted: on a failure the verifier reports their counts,
 * which say which stage of that path the page reached.
 */
import { durableRecordHref } from "@/lib/runtime/focus/durableRecordRoute";

import { CATALOG_AMOUNT_CENTS, IDS, TEMPLATE_AMOUNT_CENTS } from "./financialsHistoricalDraftFixtureCore";

export type LedgerRowCapture = { attrs: Record<string, string | null>; text: string; parts: Record<string, string | null> };
export type HistoricalDraftUiContext = { draftChargeId: string };
type Check = { ok: boolean; check: string };

const money = (cents: number) => (cents / 100).toFixed(2);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Charge states the ledger renders for a charge that is still a draft (`financialsChargeStateFor`). */
const DRAFT_STATES = new Set(["scheduled", "attention", "legacy"]);

export const HISTORICAL_DRAFT_UI_ROUTE = durableRecordHref("household", IDS.customer, "financials");
/**
 * The card's `Details →` drill-down, in each placement that offers it: the approved summary's control in both its
 * compact and standard presentations (`operationalCards/FinancialsCard`, `data-financials-nav="details"`) and the
 * focus-panel card's own fallback (`data-financials-details`). A disabled one is a read already in flight.
 */
export const FINANCIALS_DETAILS_REVEAL = '[data-financials-nav="details"]:not([disabled]), [data-financials-details="true"]';
/** A collapsed ledger period (`FinancialsLedgerPeriod`). */
export const FINANCIALS_PERIOD_REVEAL = '[data-financials-period-toggle][aria-expanded="false"]';

export const FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER = Object.freeze({
    key: "financials_historical_draft",
    routes: Object.freeze([Object.freeze({ id: "child_financials", path: HISTORICAL_DRAFT_UI_ROUTE })]),
    capture: Object.freeze([
        Object.freeze({
            name: "ledger_rows",
            selector: "[data-financials-ledger-row]",
            attrs: Object.freeze(["data-financials-ledger-row"]),
            parts: Object.freeze({
                amount: Object.freeze({ selector: ".alloy-os-billingdetail__amount" }),
                state: Object.freeze({ selector: "[data-charge-state]", attr: "data-charge-state" }),
            }),
        }),
        /* Diagnostic stages, never asserted: card mounted → Details offered → Details surface → periods. */
        Object.freeze({ name: "financials_cards", selector: "[data-financials-card]", attrs: Object.freeze(["data-financials-overlay"]) }),
        Object.freeze({ name: "details_actions", selector: FINANCIALS_DETAILS_REVEAL }),
        Object.freeze({ name: "details_surfaces", selector: '[data-financials-overlay="detail"]' }),
        Object.freeze({ name: "period_toggles", selector: "[data-financials-period-toggle]", attrs: Object.freeze(["aria-expanded"]) }),
        Object.freeze({ name: "financials_unavailable", selector: "[data-financials-unavailable]" }),
    ]),
    /*
     * Disclosure only, in order: open the card's Details (a read — the verifier's GET-only policy holds it to that),
     * then each collapsed period, whose rows are not in the DOM until it is opened. The driver waits for the page to
     * go network-quiet between the two, because the periods arrive with the Details read.
     */
    reveal: Object.freeze([FINANCIALS_DETAILS_REVEAL, FINANCIALS_PERIOD_REVEAL]),
    assert(routeId: string, snapshot: Record<string, LedgerRowCapture[] | undefined>, context: HistoricalDraftUiContext): Check[] {
        const rows = Array.isArray(snapshot.ledger_rows) ? snapshot.ledger_rows : [];
        const id = String(context?.draftChargeId || "");
        if (routeId !== "child_financials" || !UUID_RE.test(id)) return [{ ok: false, check: "ui historical draft: no draft charge id from the domain read" }];
        const mine = rows.filter((r) => r.attrs?.["data-financials-ledger-row"] === id);
        const draft = mine[0];
        const amount = String(draft?.parts?.amount ?? "");
        const state = String(draft?.parts?.state ?? "");
        const catalogAsCharge = rows.filter((r) => String(r.parts?.amount ?? "").includes(money(CATALOG_AMOUNT_CENTS))).length;
        return [
            { ok: mine.length === 1, check: `ui historical draft row draft=${id} rendered once (found ${mine.length})` },
            { ok: Boolean(draft) && amount.includes(money(TEMPLATE_AMOUNT_CENTS)), check: `ui historical draft shows the template price ${money(TEMPLATE_AMOUNT_CENTS)}` },
            { ok: Boolean(draft) && DRAFT_STATES.has(state), check: `ui historical draft is still a draft (state=${DRAFT_STATES.has(state) ? state : "not-a-draft"})` },
            { ok: catalogAsCharge === 0, check: `ui the same-name Catalog price ${money(CATALOG_AMOUNT_CENTS)} is not a charge on the child (rows=${catalogAsCharge})` },
        ];
    },
});

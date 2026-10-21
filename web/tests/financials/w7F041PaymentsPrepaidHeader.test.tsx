// @vitest-environment jsdom
/**
 * W7-F041..F046 — ONE RESPONSIBILITY DOOR, PAYMENT DESTINATIONS, A SHORTER HEADER, TRACEABLE
 * PREPAID, A PAYMENT COMMAND THAT TAKES PAYMENTS, AND NO ISO DATES.
 *
 * F041: "Manage responsibility →" duplicated the gear beside "Anyone responsible"; the gear is the door.
 * F042: no receipt was ever journaled to an account; "payment GL" resolved today's mapping for every
 *       past receipt. Destinations are now asset-only configuration, stamped on the receipt.
 * F043: not yet due / prepaid / held claimed a full-width row under the three figures.
 * F044: "$125 prepaid available" had no drill-down — prepaid is unapplied posted receipts, unexplained.
 * F045: the Payment command listed every prior receipt with Refund above the form to take money.
 * F046: the Adjust charge selector and charge previews printed YYYY-MM-DD.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

import FinancialsDetailCard, { FinancialsAccountSummary } from "@/components/operationalCards/FinancialsDetailCard";
import { FINANCIALS_CURRENT } from "@/lib/cardLab/cardLabFixtures";
import type { FinancialsEvidence } from "@/lib/cardLab/cardLabTypes";
import { readPaymentLedgerFacts, resolveReceiptAccount } from "@/lib/financials/payments/paymentLedgerFacts";
import { presentPayment } from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import { chargeDateChainPreviewLines } from "@/lib/financials/chargeDates/describeChargeDateChain";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const summary = {
    dueNow: "$2,005.00",
    pastDueNote: "$2,005.00 past due",
    pastDueBeyondDue: false,
    balance: "$2,081.00",
    balanceScope: "October 2026",
    balanceNote: "$2,121.00 charged · $40.00 paid",
    scheduled: "$2,440.00",
    context: [
        { key: "not-yet-due", text: "$225.00 not yet due · next Oct 31, 2026" },
        { key: "prepaid", text: "$125.00 prepaid available" },
        { key: "held", text: "$50.00 held deposit" },
    ],
};
const evidence: FinancialsEvidence = { ...FINANCIALS_CURRENT, period: { ...FINANCIALS_CURRENT.period, summary } };

describe("F041 · one door to responsibility", () => {
    it("the labelled link is gone; the gear beside the filter carries the name as tooltip and accessible name", () => {
        const detail = code(DETAIL);
        expect(detail).not.toContain('data-financials-manage-responsibility="open"');
        expect(detail).toMatch(/aria-label="Manage responsibility"\s*title="Manage responsibility"\s*data-financials-manage-responsibility="gear"/);
    });

    it("the gear is present under every lens — the only door must not vanish with a filter", () => {
        const detail = code(DETAIL);
        const at = detail.indexOf('data-financials-manage-responsibility="gear"');
        expect(detail.slice(at - 900, at)).toMatch(/\{administration \? \(\s*<button/);
        expect(detail.slice(at - 900, at)).not.toMatch(/lens !== "payments" && administration/);
    });

    it("Manage payments sits in the end group of a full-width relationship row, after Payment / Add", () => {
        const detail = code(DETAIL);
        const actions = detail.indexOf('<div className="alloy-os-fdetail__actions">');
        const payers = detail.indexOf('data-financials-payer-row="true"');
        const facts = detail.indexOf('<div className="alloy-os-fdetail__rollup-facts">');
        expect(actions).toBeGreaterThan(facts);
        expect(payers, "the row follows the commands, spanning the rollup").toBeGreaterThan(actions);
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css).toMatch(/\.alloy-os-fdetail__rollup > \.alloy-os-fdetail__payers \{\s*flex: 1 0 100%;/);
    });
});

describe("F043 · secondary facts never claim a row", () => {
    it("not yet due stacks under Due now's past-due note; standalone, prepaid and held sit beside the figures", () => {
        act(() => root.render(<FinancialsAccountSummary evidence={evidence} />));
        const strip = host.querySelector("[data-financials-account-summary-strip]")!;
        expect(host.querySelector(".alloy-os-fdetail__summarycontext"), "no full-width context row").toBeNull();
        const dueNow = host.querySelector('[data-testid="summary-due-now"]')!;
        expect(dueNow.querySelector('[data-testid="summary-due-now-note"]')!.textContent).toBe("$2,005.00 past due");
        expect(dueNow.querySelector('[data-testid="summary-not-yet-due"]')!.textContent).toBe("$225.00 not yet due · next Oct 31, 2026");
        const side = strip.querySelector("[data-financials-summary-context]")!;
        expect(side.parentElement, "inside the strip, beside the figures").toBe(strip);
        expect([...side.querySelectorAll("[data-financials-summary-context-item]")].map((n) => n.textContent)).toEqual([
            "$125.00 prepaid available",
            "$50.00 held deposit",
        ]);
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css).toMatch(/\.alloy-os-fdetail__statnotes \{\s*display: flex;\s*flex-direction: column;\s*\}/);
    });

    it("in Details, holdings sit under Payment / Add so the three figures keep one row (747ad20d proof)", () => {
        act(() => root.render(<FinancialsDetailCard evidence={evidence} periods={[]} onOpenPrepaid={() => {}} />));
        const strip = host.querySelector("[data-financials-account-summary-strip]")!;
        expect(strip.querySelector("[data-financials-summary-context]"), "not in the strip").toBeNull();
        const holdings = host.querySelector(".alloy-os-fdetail__actions > [data-financials-summary-context]");
        expect(holdings, "under the commands").not.toBeNull();
        expect(holdings!.textContent).toContain("$125.00 prepaid available");
        expect(holdings!.textContent).toContain("$50.00 held deposit");
    });

    it("every figure is still the adapter's — no calculation moved", () => {
        act(() => root.render(<FinancialsAccountSummary evidence={evidence} />));
        expect(host.querySelector('[data-testid="summary-balance-note"]')!.textContent).toBe("$2,121.00 charged · $40.00 paid");
        expect(host.textContent).toContain("$2,081.00");
        expect(host.textContent).toContain("$2,440.00");
    });
});

describe("found during deployed proof (5cb6b2ed)", () => {
    it("the command column is a grid, so holdings under Payment / Add never widen it", () => {
        /* A wrapping flex box's max-content is every item on one line: 491px, Scheduled wrapped. */
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css).toMatch(/\.alloy-os-fdetail__rollup \.alloy-os-fdetail__actions \{[^}]*display: grid;\s*grid-template-columns: repeat\(2, auto\);/);
        expect(css).toMatch(/\.alloy-os-fdetail__actions > \.alloy-os-fdetail__statside \{\s*grid-column: 1 \/ -1;/);
    });
});

describe("found during deployed proof (747ad20d)", () => {
    it("Escape closes Manage responsibility in Accounts: focus in a depth card is not an inner layer there", () => {
        const accounts = code("app/adminV2/financials/FinancialsAccountDetail.tsx");
        expect(accounts).toMatch(/const focusOnlyInDepthCard =\s*!hasOpenTransientPopup\(document\)\s*&& Boolean\(\(document\.activeElement as Element \| null\)\?\.closest\?\.\(FINANCIALS_DEPTH_CARD_SELECTOR\)\);/);
    });
});

describe("F044 · prepaid opens the receipts it is made of", () => {
    it("the prepaid figure is a door when the host can open it", () => {
        const onOpenPrepaid = vi.fn();
        act(() => root.render(<FinancialsAccountSummary evidence={evidence} onOpenPrepaid={onOpenPrepaid} />));
        const btn = host.querySelector<HTMLButtonElement>("[data-financials-prepaid-open]")!;
        expect(btn.textContent).toContain("$125.00 prepaid available");
        act(() => btn.click());
        expect(onOpenPrepaid).toHaveBeenCalledTimes(1);
    });

    it("Details passes the opener through, and the card opens the prepaid layer", () => {
        act(() => root.render(<FinancialsDetailCard evidence={evidence} periods={[]} onOpenPrepaid={() => {}} />));
        expect(host.querySelector("[data-financials-prepaid-open]")).not.toBeNull();
        expect(code(CARD)).toMatch(/onOpenPrepaid=\{\(\) => push\(\{ kind: "prepaid_detail" \}\)\}/);
    });

    it("the layer lists the resolver's AVAILABLE positions, each with payer, date, original, applied and remaining", () => {
        const card = code(CARD);
        const at = card.indexOf('if (overlay === "prepaid_detail" && vm)');
        expect(at).toBeGreaterThan(-1);
        const block = card.slice(at, at + 7000);
        expect(block).toMatch(/vm\.prepaid\.positions \?\? \[\]\)\s*\.filter\(\(pos\) => pos\.availability === "available" && pos\.unappliedCents - pos\.heldCents > 0\)/);
        for (const k of ["payer", "received", "method", "original", "applied", "remaining"]) {
            expect(block, k).toContain(`k: "${k}"`);
        }
        expect(block).toMatch(/push\(\{ kind: "payment_detail", paymentId: pos\.paymentId \}\)/);
        expect(block).toContain("It does not expire");
    });
});

describe("F042 · a payment method settles into an ASSET, recorded when the money arrives", () => {
    const mappingDb = (row: unknown, opts: { throws?: boolean } = {}) => ({
        from: () => {
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () => {
                if (opts.throws) throw new Error("down");
                return { data: row, error: null };
            };
            return chain;
        },
    }) as never;

    it("resolves the method's active asset destination", async () => {
        const stamp = await resolveReceiptAccount(
            mappingDb({ gl_account_id: "a1", is_active: true, gl_accounts: { id: "a1", code: "1010", name: "Stripe clearing", type: "asset", is_active: true } }),
            "o",
            "card",
        );
        expect(stamp).toEqual({ mapping_key: "receipts_card", gl_account_id: "a1", code: "1010", name: "Stripe clearing" });
    });

    it("a revenue account is never a destination — and no mapping is stamped as none configured", async () => {
        const revenue = await resolveReceiptAccount(
            mappingDb({ gl_account_id: "r1", is_active: true, gl_accounts: { id: "r1", code: "4030", name: "Supply Fees", type: "revenue", is_active: true } }),
            "o",
            "cash",
        );
        expect(revenue).toEqual({ mapping_key: "receipts_cash", gl_account_id: null, code: null, name: null });
        expect(await resolveReceiptAccount(mappingDb(null), "o", "check")).toEqual({ mapping_key: "receipts_check", gl_account_id: null, code: null, name: null });
    });

    it("a failed read stamps nothing and never blocks the receipt", async () => {
        expect(await resolveReceiptAccount(mappingDb(null, { throws: true }), "o", "cash")).toBeNull();
        expect(await resolveReceiptAccount(mappingDb(null), "o", "bitcoin")).toBeNull();
    });

    it("the receipt writer stamps it on the payment and its journal entry", () => {
        const svc = code("lib/financials/childcarePaymentService.ts");
        expect(svc).toMatch(/const receiptAccount = await resolveReceiptAccount\(supabase, orgId, input\.paymentMethod\);/);
        expect(svc).toMatch(/\{ \.\.\.\(input\.metadata \?\? \{\}\), receipt_account: receiptAccount \}/);
        expect(svc).toMatch(/receipt_account: receiptAccountOf\(payment\)/);
    });

    it("the ledger reads the stamp; an unstamped receipt stays Unmapped (history is not back-filled)", async () => {
        const db = {
            from: (table: string) => {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.then = (ok: (v: unknown) => unknown) =>
                    Promise.resolve(
                        table === "payments"
                            ? { data: [
                                { id: "new", payment_method: "check", reference_number: "1234", metadata: { receipt_account: { mapping_key: "receipts_check", gl_account_id: "a2", code: "1020", name: "Undeposited funds" } }, payment_collection_attempts: [] },
                                { id: "old", payment_method: "cash", reference_number: null, metadata: {}, payment_collection_attempts: [] },
                            ], error: null }
                            : { data: [], error: null },
                    ).then(ok);
                return chain;
            },
        } as never;
        const facts = await readPaymentLedgerFacts(db, "o", "h");
        expect(facts.get("new")!.receiptAccount).toEqual({ mapping_key: "receipts_check", gl_account_id: "a2", code: "1020", name: "Undeposited funds" });
        expect(facts.get("new")!.methodDisplay, "a check reads by its number").toBe("Check #1234");
        expect(facts.get("old")!.receiptAccount).toBeUndefined();
        const vm = code("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toMatch(/: "before_stamping"\) as FinancialsPaymentGlState/);
        expect(vm, "no live mapping lookup for payments").not.toMatch(/const account = glMappingKey \? accountByMappingKey/);
    });

    it("the mappings route refuses a non-asset destination for a payment method", () => {
        const route = code("app/api/admin/financials/gl-mappings/route.ts");
        expect(route).toMatch(/PAYMENT_MAPPING_KEYS\.has\(mappingKey\) && \(account as \{ type\?: string \}\)\.type !== "asset"/);
    });

    it("W7-F047: configured with the method under Organization → Financials → Payments, asset accounts only", () => {
        const ws = code("components/adminV2/settings/financials/accounting/AccountingWorkspace.tsx");
        expect(ws, "no second entry point under Accounting").not.toContain("payment_methods");
        const settings = code("components/adminV2/settings/financials/PaymentMethodsSettings.tsx");
        expect(settings).toMatch(/\(gj\.accounts \?\? \[\]\)\.filter\(\(a\) => a\.is_active && a\.type === "asset"\)/);
        expect(settings).toMatch(/fetch\("\/api\/admin\/financials\/gl-mappings", \{\s*method: "PUT"/);
    });
});

describe("F045 · the Payment command takes payments; refunds are a secondary tab", () => {
    const card = code(CARD);

    it("the command renders the band tabbed, opening on Payment", () => {
        expect(card).toMatch(/\{paymentBandFor\(false, undefined, true\)\}/);
        expect(card).toMatch(/setPaymentTab\("payment"\);\s*setRefundPickId\(""\);/);
    });

    it("no prior receipt is listed on the Payment tab; Refunds lists one chosen payment", () => {
        expect(card).toMatch(/vm\.payments\.length && \(!tabbed \|\| \(paymentTab === "refunds" && refundPickId\)\)/);
        expect(card).toMatch(/\.filter\(\(p\) => !tabbed \|\| p\.paymentId === refundPickId \|\| p\.refundsPaymentId === refundPickId\)/);
        expect(card).toMatch(/testId="financials-refund-payment"/);
        expect(card).toMatch(/p\.kind === "receipt" && p\.offersRefund/);
    });

    it("refund stays the existing governed act", () => {
        expect(card).toMatch(/"payment\.refund"/);
    });

    it("one eligible payer is defaulted; several must be answered — a person or, explicitly, not known", () => {
        expect(card).toMatch(/if \(onlyPayerId && !payPayerPersonId\) setPayPayerPersonId\(onlyPayerId\);/);
        expect(card).toMatch(/disabled=\{running \|\| \(payerCandidateCount > 0 && !payPayerPersonId\)\}/);
        expect(card).toContain('{ value: HOUSEHOLD_PAYER, label: "Not known — record to the household" }');
        expect(card).toMatch(/payer_entity_id: namedPayerId/);
    });

    it("the tenders the schema supports are offered, with the check number recorded", () => {
        for (const v of ['"cash"', '"check"', '"money_order"', '"manual"', '"other"', '"ach"', '"card"']) {
            expect(card).toContain(`value: ${v}`);
        }
        expect(card).toMatch(/reference_number: payReference\.trim\(\)/);
        expect(presentPayment({ paymentId: "p", direction: "inbound", refundsPaymentId: null, reversalOrigin: null, amountCents: 100, currencyCode: "USD", status: "posted", method: "manual", processor: null, receivedAt: null, postedAt: null, appliedCents: 0, unappliedCents: 100, payerLabel: null, applications: [] } as never).methodLabel).toBe("External payment");
    });

    it("the held-deposit Refund opens the receipt's record instead of changing no pixel", () => {
        const at = card.indexOf("const openRefundHeldFunds = useCallback(");
        expect(card.slice(at, at + 2600)).toMatch(/push\(\{ kind: "payment_detail", paymentId: receipt\.paymentId \}\)/);
    });
});

describe("F046 · human dates in the touched flows", () => {
    it("the Adjust charge selector formats its date", () => {
        expect(code(CARD)).toMatch(/\(r\.date \? ` · \$\{humanDay\(r\.date\)\}` : ""\)/);
        expect(code(CARD)).toMatch(/Oldest unpaid \{humanDay\(pastDue\.oldestDueDate\)\}/);
    });

    it("charge previews and the subsidy authorization preview carry no YYYY-MM-DD", () => {
        const lines = chargeDateChainPreviewLines(
            {
                period: { key: "2026-11", label: "November 2026", startsOn: "2026-11-01", endsOn: "2026-11-30" },
                invoice: { actual: "2026-11-05", intended: "2026-10-25", late: true, rule: { strategy: "days_before_period_start", offsetDays: 7, source: { kind: "organization" } } },
                due: { actual: "2026-11-05", ruleDate: "2026-11-01", clampedToInvoice: true, rolledToNextPeriod: false, resolution: { reason: "policy", strategy: "fixed_day_of_month", offsetDays: 1, sourceScope: "organization" } },
                posting: { gate: "awaits_period", notBefore: "2026-11-01" },
            } as never,
            false,
        );
        for (const l of lines) expect(l, l).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(code("lib/adminV2/actions/definitions/financialSubsidyActions.ts")).toMatch(/Authorized from \$\{humanDay\(t\(p\?\.coverage_start\)\)\}/);
    });
});

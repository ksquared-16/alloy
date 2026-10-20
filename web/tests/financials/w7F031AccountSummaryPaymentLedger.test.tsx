// @vitest-environment jsdom
/**
 * W7-F031 / F032 / F033 — THE ACCOUNT SUMMARY, PAYMENT ROWS, AND THE REALLOCATION LAYER.
 *
 * F031: eight peer figures (Current balance, Due, Not yet due, Scheduled, Past due, Responsibility,
 * Paid, Available prepaid) became three answers with their context. Census: Current balance is THIS
 * period's Responsibility − Paid; Past due spans every period; Due is current collectible bounded
 * below by past due (capped at collectible) — so past due can exceed Due, and the note says so.
 * F032: a payment row named the household as its "payer", had no account, and a second "Applied" line.
 * F033: Move / Apply / Release / Reverse adjustment opened as inline bands above the card.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

import FinancialsDetailCard from "@/components/operationalCards/FinancialsDetailCard";
import { FINANCIALS_CURRENT } from "@/lib/cardLab/cardLabFixtures";
import type { FinancialsEvidence, FinancialsLedgerPeriod } from "@/lib/cardLab/cardLabTypes";
import { paymentGlMappingKey, PAYMENT_METHOD_GL_MAPPING_KEY, readPaymentLedgerFacts } from "@/lib/financials/payments/paymentLedgerFacts";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

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

const evidence = (summary: NonNullable<FinancialsEvidence["period"]["summary"]>): FinancialsEvidence => ({
    ...FINANCIALS_CURRENT,
    period: { ...FINANCIALS_CURRENT.period, summary },
});

describe("F031 · three answers, each with its context", () => {
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
        ],
    };

    it("renders Due now, Balance · <period> and Scheduled — and no other peer figure", () => {
        act(() => root.render(<FinancialsDetailCard evidence={evidence(summary)} periods={[]} />));
        const labels = [...host.querySelectorAll(".alloy-os-fdetail__strip .alloy-os-fdetail__statlabel")].map((n) => n.textContent);
        expect(labels).toEqual(["Due now", "Balance · October 2026", "Scheduled"]);
        expect(host.querySelector('[data-testid="summary-due-now-note"]')!.textContent).toBe("$2,005.00 past due");
        expect(host.querySelector('[data-testid="summary-balance-note"]')!.textContent).toBe("$2,121.00 charged · $40.00 paid");
        /* W7-F043: not yet due rides Due now's note line; prepaid stacks beside the figures — no row of its own. */
        expect(host.querySelector('[data-testid="summary-not-yet-due"]')!.textContent).toBe("$225.00 not yet due · next Oct 31, 2026");
        expect([...host.querySelectorAll("[data-financials-summary-context-item]")].map((n) => n.textContent)).toEqual([
            "$125.00 prepaid available",
        ]);
        for (const gone of ["Current balance", "Responsibility", "Paid", "Available prepaid", "Not yet due"]) {
            expect(labels, gone).not.toContain(gone);
        }
    });

    it("past due is said once — not as a peer figure and not again as a header chip", () => {
        act(() => root.render(<FinancialsDetailCard evidence={evidence(summary)} periods={[]} />));
        expect(host.textContent!.match(/past due/g)!.length).toBe(1);
        expect(code("components/operationalCards/FinancialsDetailCard.tsx")).toMatch(/statusChip=\{undefined\}/);
    });

    it("the adapter states relationships from the figures it already computed — no figure changes", () => {
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        /* Due is the same expression as before, computed once and reused. */
        expect(adapter).toMatch(/const dueNowCents = Math\.max\(\s*0,\s*vm\.collectible\.currentlyCollectibleCents - \(vm\.notYetDue\?\.amountCents \?\? 0\),\s*Math\.min\(vm\.pastDue\?\.amountCents \?\? 0, vm\.collectible\.currentlyCollectibleCents\),\s*\);/);
        expect(adapter).toMatch(/dueNow: money\(dueNowCents, currency\),/);
        /* Past due beyond Due is SAID, not hidden. */
        expect(adapter).toMatch(/input\.pastDue\.amountCents > dueNowCents \? " · includes earlier periods" : ""/);
        /* Balance is explained by exactly the two figures it is the difference of. */
        expect(adapter).toMatch(/balanceNote: `\$\{money\(reconciliation\.responsibilityCents, currency\)\} charged · \$\{money\(reconciliation\.paymentsCents, currency\)\} paid`/);
        expect(adapter).toMatch(/balanceScope: vm\.period\.label/);
    });

    it("the Accounts header renders the same component, so a figure has one name everywhere", () => {
        expect(code("components/operationalCards/FinancialsCard.tsx")).toContain("<FinancialsAccountSummary evidence={evidence} />");
    });
});

describe("F032 · a payment row is a native ledger event", () => {
    const periods: FinancialsLedgerPeriod[] = [
        {
            key: "2026-10", start: "2026-10-01", end: "2026-10-31", label: "October 2026", summary: "Balance $0.00", open: true,
            entries: [
                {
                    when: "Oct 6, 2026", dateIso: "2026-10-06", subject: "—", subjectMemberId: null, type: "payment",
                    glCode: "1010 · Card clearing", responsibleParty: null, responsibilityUnassigned: false,
                    label: "Payment", amount: "−$75.00", kind: "credit", status: "Received", lens: "payments",
                    payment: {
                        paymentId: "p1", kind: "receipt", statusLabel: "Received", methodLabel: "Visa •••• 4242",
                        payerLabel: "Certt Certhouse", payerIsPerson: true, allocationLabel: "Applied", unapplied: false, openable: true,
                    },
                },
            ],
        },
    ];

    it("Date | Payment | — | settlement account | amount | Received | payer | method — and no second line", () => {
        act(() => root.render(<FinancialsDetailCard evidence={FINANCIALS_CURRENT} periods={periods} onOpenPayment={() => {}} />));
        const row = host.querySelector('[data-financials-ledger-row="payment:p1"]')!;
        const cells = [...row.children].map((c) => c.textContent);
        expect(cells.slice(1)).toEqual(["Oct 6, 2026", "Payment", "—", "1010 · Card clearing", "−$75.00", "Received", "Certt Certhouse", "Visa •••• 4242"]);
        expect(row.querySelector(".alloy-os-billingdetail__outstanding"), "no Applied sub-line").toBeNull();
        expect(row.querySelector("[data-financials-row-action]"), "no unexplained money-moving icon on the row").toBeNull();
        expect(row.querySelector('[data-financials-responsibility="party"]')!.getAttribute("title")).toBe("Paid by Certt Certhouse");
        expect(host.querySelector(".alloy-os-billingdetail__row--head")!.textContent).toContain("Party");
    });

    it("each payment method settles into its own mappable account, configured where charge accounts are", () => {
        expect(paymentGlMappingKey("card")).toBe("receipts_card");
        expect(paymentGlMappingKey("cash")).toBe("receipts_cash");
        expect(paymentGlMappingKey("bitcoin")).toBeNull();
        expect(Object.keys(PAYMENT_METHOD_GL_MAPPING_KEY).sort()).toEqual(["ach", "card", "cash", "check", "manual", "money_order", "other", "subsidy"]);
        const route = code("app/api/admin/financials/gl-mappings/route.ts");
        expect(route).toMatch(/categoryLabel: PAYMENT_METHOD_LABELS\[method as keyof typeof PAYMENT_METHOD_LABELS\],\s*mappingKey,\s*group: "payment" as const/);
        expect(route).toMatch(/\.\.\.Object\.values\(PAYMENT_METHOD_GL_MAPPING_KEY\)/);
        /* W7-F042: the ledger reads the destination STAMPED at receipt, never today's mapping. */
        const vm = code("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toMatch(/const stamp = facts\?\.receiptAccount;/);
        expect(vm).toMatch(/glCode: stamp\?\.gl_account_id \? stamp\.code : null,/);
    });

    it("the payer is the payment's own payer_entity; card details come from its collection's stored method", async () => {
        const calls: string[] = [];
        const db = {
            from: (table: string) => {
                const chain: Record<string, unknown> = {};
                let sel = "";
                chain.select = (x: string) => ((sel = x), chain);
                chain.eq = (k: string, v: unknown) => (calls.push(`${table}.${k}=${v}`), chain);
                chain.in = () => { throw new Error("household-keyed: no .in() on payment ids"); };
                chain.then = (ok: (v: unknown) => unknown) =>
                    Promise.resolve(
                        table === "payments"
                            ? { data: [
                                { id: "p1", payer_entity_type: "person", payer_entity_id: "per1", payment_collection_attempts: [{ payment_methods: { display_brand: "visa", display_last4: "4242" } }] },
                                { id: "p2", payer_entity_type: null, payer_entity_id: null, payment_collection_attempts: [] },
                            ], error: null }
                            : { data: [{ person_id: "per1", persons: { first_name: "Certt", last_name: "Certhouse" } }], error: null },
                    ).then(ok);
                void sel;
                return chain;
            },
        } as never;
        const facts = await readPaymentLedgerFacts(db, "o", "h1");
        expect(facts.get("p1")).toEqual({ payerName: "Certt Certhouse", payerKind: "person", methodDisplay: "Visa •••• 4242" });
        expect(facts.get("p2")).toEqual({ payerName: null, payerKind: null, methodDisplay: null });
        expect(calls).toContain("payments.customer_id=h1");
        expect(calls).toContain("customer_persons.customer_id=h1");
    });
});

describe("F033 · money-moving acts open as command layers", () => {
    const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");

    it("no inline panel renders above the account card any more", () => {
        const floor = card.slice(card.indexOf("if (detailFloorWanted && vm && reconciliation)"), card.indexOf("<FinancialsDetailCard", card.indexOf("if (detailFloorWanted && vm && reconciliation)")));
        expect(floor).not.toContain("alloy-os-fdetail__movepanel");
        expect(floor).not.toContain('data-testid="payment-move-panel"');
        expect(floor).not.toContain('data-testid="adjustment-reverse-panel"');
        expect(floor).not.toContain('data-testid="deposit-release-panel"');
    });

    it("each act is a labelled command layer in the canonical shell, keeping its governed actions", () => {
        for (const kind of ["payment_application", "release_held", "reverse_adjustment"]) {
            const at = card.indexOf(`data-financials-overlay="${kind}"`);
            expect(at, kind).toBeGreaterThan(-1);
            expect(card.slice(at, at + 900), kind).toMatch(/modalClass="command"/);
        }
        expect(card).toMatch(/movePending \? "Reallocate payment" : applyPending\?\.hold \? "Apply held deposit" : "Apply payment"/);
        expect(card).toMatch(/await runAction\("payment\.reverse_application", \{/);
        expect(card).toMatch(/await runAction\("payment\.apply_to_charge", \{/);
        expect(card).toContain('testId="payment-move-target"');
    });

    it("opening pushes the layer; clearing the act (cancel, confirm, partial move, Escape) closes only it", () => {
        expect(card).toMatch(/setMovePending\(args\);\s*push\(\{ kind: "payment_application" \}\);/);
        expect(card).toMatch(/setReleasePending\(args\);\s*push\(\{ kind: "release_held" \}\);/);
        expect(card).toMatch(/setReversePending\(args\);\s*push\(\{ kind: "reverse_adjustment" \}\);/);
        expect(card).toMatch(/\(overlay === "payment_application" && !movePending && !applyPending\)[\s\S]{0,200}pop\(\);/);
        expect(card).toMatch(/overlay !== "payment_application" && overlay !== "release_held" && overlay !== "reverse_adjustment"/);
    });

    it("Payment Details is the entry point: Reallocate on an applied charge, Apply to a charge for unapplied money", () => {
        expect(card).toMatch(/data-financials-payment-reallocate=\{a\.allocationId\}[\s\S]{0,300}openMovePayment\(\{ paymentId: receipt\.paymentId, allocationId: a\.allocationId \}\)/);
        expect(card).toMatch(/data-financials-payment-apply=\{receipt\.paymentId\}[\s\S]{0,300}openApplyPayment\(\{ paymentId: receipt\.paymentId \}\)/);
    });
});

// @vitest-environment jsdom
/**
 * W7-F026 — THE ACCOUNT'S FINANCIAL ACTIVITY IS ONE TIMELINE.
 *
 * Director QA, on Financials → Work → Accounts and Focus Panel → Financials → Details: the ledger
 * held charges; payments were a second table under the Payments lens and a PAYMENT band at the
 * bottom ("No payment method on file / Take or record payment →"); an "Upcoming" heading sat over
 * nothing. Both surfaces render `FinancialsDetailCard` over `adaptFinancialsVmToLedgerPeriods`, so
 * the repair is one aggregation and one renderer, proven here at both.
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
import { adaptFinancialsVmToLedgerPeriods } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { billingPeriodFromKey } from "@/lib/financials/billingPeriod";
import { FINANCIALS_CURRENT } from "@/lib/cardLab/cardLabFixtures";
import type { FinancialsLedgerPeriod } from "@/lib/cardLab/cardLabTypes";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const charge = (id: string, date: string, periodKey: string, over: Record<string, unknown> = {}) => ({
    chargeId: id,
    date,
    periodKey,
    subjectName: "Tilly",
    subjectMemberId: "kid-1",
    categoryKey: "tuition",
    categoryLabel: "Tuition",
    description: `Tuition ${id}`,
    glCode: null,
    glAccountName: null,
    amountCents: 120000,
    lifecycleStatus: "posted",
    status: "posted",
    responsiblePartyName: "Tess Tuition",
    responsibilityUnassigned: false,
    correctsChargeId: null,
    correctionKind: null,
    reduction: null,
    offersReverse: false,
    ...over,
});

const receipt = (id: string, receivedAt: string, over: Record<string, unknown> = {}) => ({
    paymentId: id,
    direction: "inbound",
    refundsPaymentId: null,
    reversalOrigin: null,
    amountCents: 50000,
    currencyCode: "USD",
    status: "posted",
    method: "check",
    processor: null,
    receivedAt,
    postedAt: receivedAt,
    appliedCents: 50000,
    unappliedCents: 0,
    heldCents: 0,
    payerLabel: "Tess Tuition",
    applications: [],
    reference: null,
    notes: null,
    ...over,
});

/** September (past), October (current) and November (future, a scheduled draft). */
function vm(): FinancialsCardVM {
    const group = (key: string, rows: unknown[]) => ({ period: billingPeriodFromKey(key), rows, totalCents: 0 });
    return {
        ledgerPeriods: [
            group("2026-11", [charge("nov", "2026-11-01", "2026-11", { lifecycleStatus: "draft", status: "draft" })]),
            group("2026-10", [charge("oct", "2026-10-01", "2026-10"), charge("mat", "2026-10-14", "2026-10", { categoryKey: "consumable_fee", categoryLabel: "Materials", description: "Materials" })]),
            group("2026-09", [charge("sep", "2026-09-01", "2026-09")]),
        ],
        payments: [
            receipt("p-oct", "2026-10-05T17:00:00Z"),
            receipt("p-unapplied", "2026-10-15T17:00:00Z", { appliedCents: 0, unappliedCents: 50000 }),
            receipt("p-sep", "2026-09-03T17:00:00Z"),
            /* A month with money and no charge — August. */
            receipt("p-aug", "2026-08-20T17:00:00Z"),
            receipt("r-oct", "2026-10-16T17:00:00Z", { direction: "outbound", refundsPaymentId: "p-oct", reversalOrigin: "operator", amountCents: 1000, appliedCents: 0, unappliedCents: 0 }),
        ],
        openCollections: [
            { attemptId: "att-1", rail: "ach", processorState: "processing", providerActionType: null, chargeId: "oct", amountCents: 20000, currencyCode: "USD", updatedAt: "2026-10-18T10:00:00Z" },
        ],
    } as unknown as FinancialsCardVM;
}

describe("one aggregation — payments are placed in the billing period their date falls in", () => {
    const periods = adaptFinancialsVmToLedgerPeriods({ vm: vm(), currency: "USD", openPeriodKey: "2026-10" });
    const byKey: Record<string, FinancialsLedgerPeriod> = Object.fromEntries(periods.map((p) => [p.key, p]));

    it("receipts, refunds and in-flight collections join the charges of their own period", () => {
        const oct = byKey["2026-10"]!;
        expect(oct.entries.filter((e) => e.payment).map((e) => e.payment!.paymentId).sort()).toEqual(["att-1", "p-oct", "p-unapplied", "r-oct"]);
        expect(byKey["2026-09"]!.entries.some((e) => e.payment?.paymentId === "p-sep")).toBe(true);
        expect(byKey["2026-11"]!.entries.every((e) => !e.payment)).toBe(true);
    });

    it("a period's activity is chronological, newest first, charges and payments interleaved", () => {
        expect(byKey["2026-10"]!.entries.map((e) => e.dateIso)).toEqual(["2026-10-18", "2026-10-16", "2026-10-15", "2026-10-14", "2026-10-05", "2026-10-01"]);
    });

    it("a month with money and no charge still appears, and does not claim a charge balance", () => {
        expect(byKey["2026-08"]).toMatchObject({ label: "August 2026", summary: "No charges" });
        expect(periods.map((p) => p.key)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08"]);
    });

    it("current period open, nearest future period with activity open, older periods collapsed", () => {
        expect(periods.map((p) => [p.key, p.open])).toEqual([["2026-11", true], ["2026-10", true], ["2026-09", false], ["2026-08", false]]);
    });

    it("a payment row carries type, status, payer/method and a compact allocation state — never the allocations", () => {
        const oct = byKey["2026-10"]!.entries;
        const applied = oct.find((e) => e.payment?.paymentId === "p-oct")!;
        expect(applied).toMatchObject({ label: "Payment", lens: "payments", status: "Received", amount: "−$500.00" });
        expect(applied.payment).toMatchObject({ kind: "receipt", methodLabel: "Check", payerLabel: "Tess Tuition", allocationLabel: "Applied", openable: true });
        expect(oct.find((e) => e.payment?.paymentId === "p-unapplied")!.payment).toMatchObject({ allocationLabel: "$500.00 unapplied", unapplied: true });
        expect(oct.find((e) => e.payment?.paymentId === "r-oct")).toMatchObject({ label: "Refund", amount: "$10.00" });
        expect(oct.find((e) => e.payment?.paymentId === "att-1")!.payment).toMatchObject({ kind: "collection", openable: false });
    });

    it("charges are untouched: same rows, same periods, same lens classification", () => {
        expect(byKey["2026-11"]!.entries.map((e) => [e.chargeId, e.status, e.lens])).toEqual([["nov", "draft", "charges"]]);
    });
});

describe("one renderer — Details over the timeline (the same component both surfaces mount)", () => {
    let host: HTMLDivElement;
    let root: Root;
    const onOpenPayment = vi.fn();

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        onOpenPayment.mockReset();
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    const render = (lens: "all" | "payments" | "charges") => {
        const periods = adaptFinancialsVmToLedgerPeriods({ vm: vm(), currency: "USD", openPeriodKey: "2026-10" });
        act(() => {
            root.render(<FinancialsDetailCard evidence={FINANCIALS_CURRENT} periods={periods} lens={lens} onOpenPayment={onOpenPayment} />);
        });
    };
    const openRowKeys = () => [...host.querySelectorAll("[data-financials-row-open]")].map((n) => n.getAttribute("data-financials-row-open"));
    const lensCount = (key: string) => host.querySelector(`[data-financials-lens="${key}"] .alloy-os-fdetail__lenscount`)?.textContent;

    it("All shows payments among the charges of the open periods, and no Upcoming or payment band", () => {
        render("all");
        expect(openRowKeys()).toEqual(expect.arrayContaining(["payment:p-oct", "payment:p-unapplied", "payment:r-oct"]));
        expect(host.textContent).not.toContain("Upcoming");
        expect(host.querySelector("[data-financials-payment-band]")).toBeNull();
        expect(host.querySelector("[data-financials-payments-ledger]")).toBeNull();
    });

    it("Payments is a filter across every period, not a second table", () => {
        render("payments");
        const periods = [...host.querySelectorAll("[data-financials-ledger-period]")].map((n) => n.getAttribute("data-financials-ledger-period"));
        expect(periods).toEqual(["October 2026", "September 2026", "August 2026"]);
        expect(lensCount("payments")).toBe("6");
        expect(openRowKeys().every((k) => k?.startsWith("payment:"))).toBe(true);
    });

    it("Charges shows no payment rows", () => {
        render("charges");
        expect(openRowKeys().some((k) => k?.startsWith("payment:"))).toBe(false);
    });

    it("clicking a payment row opens Payment Details for that receipt", () => {
        render("all");
        const open = host.querySelector('[data-financials-row-open="payment:p-oct"]') as HTMLButtonElement;
        act(() => open.click());
        expect(onOpenPayment).toHaveBeenCalledWith({ paymentId: "p-oct" });
    });
});

describe("the hosts converge on one Payment Details and one Payment entry", () => {
    const host = code("components/admin/focusPanel/cards/FinancialsCard.tsx");

    it("Details opens the payment_detail surface, whose body is the band scoped to that receipt", () => {
        expect(host).toContain('onOpenPayment={({ paymentId }) => push({ kind: "payment_detail", paymentId })}');
        expect(host).toContain("paymentBandFor(false, surface.paymentId)");
        expect(host).toMatch(/filter\(\(p\) => !scopedTo \|\| p\.paymentId === scopedTo \|\| p\.refundsPaymentId === scopedTo\)/);
    });

    it("the top Payment action is the one entry; Details no longer receives the band", () => {
        expect(host).toContain("onPayment={openSettle}");
        expect(host).not.toContain("paymentBand={");
    });

    it("no Upcoming section and no separate payments table survive in Details", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).not.toContain("alloy-os-fdetail__upcoming");
        expect(detail).not.toContain("data-financials-payments-ledger");
        expect(detail).not.toContain('if (lens === "payments") return [];');
    });
});

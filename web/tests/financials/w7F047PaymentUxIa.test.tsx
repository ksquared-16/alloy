// @vitest-environment jsdom
/**
 * W7-F047..F049 — PAYMENT METHODS AS ONE SETTINGS STORY, A PAYMENT COMMAND THAT IS ONE FORM, AND THE
 * METHOD ON FILE AS THE DOOR TO MANAGING PAYMENTS.
 *
 * F047: methods were split across Payments (two rail cards: card / bank availability) and Accounting
 *       (a Payment Methods tool: destinations). Now one table in Payments: accepted · processor ·
 *       destination; acceptance is enforced by the record and collect actions.
 * F048: "Take or record payment →" floated above the form, the charge was named four times, the
 *       commit read "Record manual payment", and the Refunds tab collapsed to one compressed row.
 * F049: "visa •••• 4242" sat beside a "Manage payments →" text link — two elements for one thing.
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
import PaymentMethodsSettings from "@/components/adminV2/settings/financials/PaymentMethodsSettings";
import { FINANCIALS_CURRENT } from "@/lib/cardLab/cardLabFixtures";
import type { FinancialsEvidence } from "@/lib/cardLab/cardLabTypes";
import {
    ACCEPTED_METHODS_METADATA_KEY,
    disabledMethodsFrom,
    setPaymentMethodAccepted,
} from "@/lib/financials/payments/acceptedPaymentMethods";

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
    vi.unstubAllGlobals();
});

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};

describe("F047 · which methods are accepted — policy over future intake only", () => {
    it("reads the disabled list defensively and ignores anything it does not recognise", () => {
        expect([...disabledMethodsFrom({ [ACCEPTED_METHODS_METADATA_KEY]: { disabled: ["check", "bitcoin", 7, "ach"] } })].sort()).toEqual(["ach", "check"]);
        expect(disabledMethodsFrom(null).size).toBe(0);
        expect(disabledMethodsFrom({ other: true }).size).toBe(0);
    });

    it("turning one off preserves every other key in the organization's metadata", async () => {
        let written: Record<string, unknown> | null = null;
        const db = {
            from: () => {
                const chain: Record<string, unknown> = {};
                chain.select = () => chain;
                chain.eq = () => chain;
                chain.maybeSingle = async () => ({ data: { metadata: { populations: { v: 1 }, [ACCEPTED_METHODS_METADATA_KEY]: { disabled: ["other"] } } }, error: null });
                chain.upsert = async (row: { metadata: Record<string, unknown> }) => ((written = row.metadata), { error: null });
                return chain;
            },
        } as never;
        const disabled = await setPaymentMethodAccepted(db, "o", "money_order", false);
        expect([...disabled].sort()).toEqual(["money_order", "other"]);
        expect(written!.populations).toEqual({ v: 1 });
        expect(written![ACCEPTED_METHODS_METADATA_KEY]).toEqual({ disabled: ["money_order", "other"] });
    });

    it("the record and collect actions refuse a method that is turned off", () => {
        const actions = code("lib/adminV2/actions/definitions/financialPaymentActions.ts");
        expect(actions).toMatch(/\(await readDisabledPaymentMethods\(supabase as SupabaseClient, ctx\.orgId\)\)\.has\(method\)\) \{\s*return \{ ok: false, correlationId, status: 409, error: methodNotAcceptedMessage\(method\) \};/);
        expect(actions).toMatch(/\(await readDisabledPaymentMethods\(supabase as SupabaseClient, ctx\.orgId\)\)\.has\(rail\)\) \{\s*return \{ ok: false, correlationId, status: 409, error: methodNotAcceptedMessage\(rail\) \};/);
    });

    it("the settings route reads with fin.read and writes with fin.write", () => {
        const route = code("app/api/admin/financials/accepted-payment-methods/route.ts");
        expect(route).toMatch(/export async function GET[\s\S]*assertFinancialsReadAllowed/);
        expect(route).toMatch(/export async function PUT[\s\S]*assertFinancialsWriteAllowed/);
    });

    it("one table in Payments states accepted, processor and destination per method", async () => {
        const calls: Array<{ url: string; body?: string }> = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
            calls.push({ url, body: init?.body });
            if (url.endsWith("/accepted-payment-methods") && init?.method === "PUT") return new Response(JSON.stringify({ ok: true, accepted: false }), { status: 200 });
            if (url.endsWith("/accepted-payment-methods")) {
                return new Response(JSON.stringify({ methods: [
                    { method: "card", label: "Card", accepted: true, processor: "stripe", mappingKey: "receipts_card" },
                    { method: "ach", label: "Bank transfer", accepted: true, processor: "stripe", mappingKey: "receipts_ach" },
                    { method: "cash", label: "Cash", accepted: true, processor: null, mappingKey: "receipts_cash" },
                ] }), { status: 200 });
            }
            return new Response(JSON.stringify({
                accounts: [
                    { id: "a1", code: "1010", name: "Stripe clearing", type: "asset", is_active: true },
                    { id: "r1", code: "4000", name: "Tuition", type: "revenue", is_active: true },
                ],
                mappings: [
                    { mappingKey: "receipts_card", glAccountId: "a1", group: "payment" },
                    { mappingKey: "receipts_cash", glAccountId: null, group: "payment" },
                    { mappingKey: "tuition_revenue", glAccountId: "r1", group: "charge" },
                ],
            }), { status: 200 });
        }));
        await act(async () => root.render(<PaymentMethodsSettings providerConnected cardAvailable bankAvailable={false} />));
        await flush();
        const row = (m: string) => host.querySelector(`[data-testid="payment-method-row-${m}"]`)!;
        expect(row("card").querySelector('[data-testid="payment-method-processor-card"]')!.textContent).toBe("Stripe · ready");
        expect(row("ach").querySelector('[data-testid="payment-method-processor-ach"]')!.textContent).toBe("Stripe · not enabled for this account");
        expect(row("cash").querySelector('[data-testid="payment-method-processor-cash"]')!.textContent).toBe("Recorded by staff — no processor");
        expect(row("card").getAttribute("data-payment-method-destination")).toBe("mapped");
        expect(row("cash").getAttribute("data-payment-method-destination")).toBe("unmapped");
        await act(async () => { host.querySelector<HTMLInputElement>('[data-testid="payment-method-accepted-cash"]')!.click(); });
        await flush();
        expect(calls.some((c) => c.url.endsWith("/accepted-payment-methods") && c.body === JSON.stringify({ method: "cash", accepted: false }))).toBe(true);
        expect(row("cash").getAttribute("data-payment-method-accepted")).toBe("false");
    });

    it("Payments hosts the table; Accounting no longer carries a second entry point", () => {
        expect(code("components/adminV2/settings/financials/PaymentsProviderChapter.tsx")).toContain("<PaymentMethodsSettings");
        expect(code("components/adminV2/settings/financials/accounting/AccountingWorkspace.tsx")).not.toContain("payment_methods");
    });
});

describe("F048 · the Payment command is one form", () => {
    const card = code(CARD);

    it("W7-F050 supersedes Apply toward: no charge is chosen for ordinary money; the list is the exception", () => {
        expect(card).toMatch(/\{payAllocation === "charge" \? \(/);
        expect(card).toContain('testId="financials-payment-apply-toward"');
        expect(card).toMatch(/\{payableRows\.length && !tabbed \? \(\s*<DropdownMenu>/);
        expect(card).toMatch(/\+ \(r\.date \? ` · \$\{humanDay\(r\.date\)\}` : ""\)\s*\+ ` · \$\{money\(r\.outstandingCents, r\.currencyCode\)\} outstanding`/);
    });

    it("the commit is Confirm payment; only a NEW card or bank account says what happens next", () => {
        expect(card).not.toContain("Record manual payment");
        expect(card).toMatch(/\(payMethod === "card" \|\| payMethod === "ach"\) && !payStoredMethodId\s*\? payMethod === "ach" \? "Continue to bank details" : "Continue to card details"\s*: "Confirm payment"/);
    });

    it("Cancel closes the command; a recorded payment closes it too", () => {
        expect(card).toMatch(/setPayTarget\(null\);\s*if \(tabbed\) pop\(\);/);
        expect(card).toMatch(/if \(actionKey === "payment\.record"\) \{\s*setStack\(\(st\) => \(st\.length && st\[st\.length - 1\]!\.kind === "payment" \? st\.slice\(0, -1\) : st\)\);/);
    });

    it("only accepted methods are offered", () => {
        expect(card).toMatch(/\]\.filter\(\(o\) => o\.value\.startsWith\("stored:"\) \|\| !disabledMethods\.has\(o\.value\)\)/);
        expect(card).toMatch(/&& !disabledMethods\.has\(m\.rail\)/);
    });

    it("payer defaulting is unchanged", () => {
        expect(card).toMatch(/if \(onlyPayerId && !payPayerPersonId\) setPayPayerPersonId\(onlyPayerId\);/);
    });

    it("Refunds is the same card: choosing a payment opens its refund form at once", () => {
        const at = card.indexOf('testId="financials-refund-payment"');
        const block = card.slice(at, at + 2200);
        expect(block).toMatch(/setRefundTarget\(\{\s*paymentId: p\.paymentId,/);
        expect(block).toMatch(/setRefundAmount\(\(p\.refundableCents \/ 100\)\.toFixed\(2\)\)/);
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css).toMatch(/\.alloy-os-financials__band\[data-financials-payment-tab\] \{\s*min-height: 26rem;/);
        expect(css).toMatch(/\[data-financials-payment-tab="refunds"\] \.alloy-os-financials__payment \{\s*flex-direction: column;/);
    });
});

describe("F049 · the method on file is the door to managing payments", () => {
    const admin = {
        discountSummary: "No discounts",
        onManagePayments: vi.fn(),
        onManageResponsibility: vi.fn(),
        onManageDiscount: vi.fn(),
    };

    it("one payer: the chip IS the method, and opens payment administration", () => {
        const onManagePayments = vi.fn();
        const evidence: FinancialsEvidence = { ...FINANCIALS_CURRENT, payers: [{ name: "Certt Certhouse", share: "100%", method: "visa •••• 4242" }] };
        act(() => root.render(<FinancialsDetailCard evidence={evidence} periods={[]} administration={{ ...admin, onManagePayments }} />));
        const doors = host.querySelectorAll('[data-financials-manage-payments="open"]');
        expect(doors.length, "one control, not a method plus a link").toBe(1);
        expect(doors[0]!.textContent).toBe("visa •••• 4242");
        expect(doors[0]!.getAttribute("aria-label")).toBe("Manage payments — visa •••• 4242");
        expect(host.textContent).not.toContain("Manage payments");
        act(() => (doors[0] as HTMLButtonElement).click());
        expect(onManagePayments).toHaveBeenCalledTimes(1);
    });

    it("several payers keep their methods on their own line; the shared door reads Payment methods", () => {
        act(() => root.render(<FinancialsDetailCard evidence={FINANCIALS_CURRENT} periods={[]} administration={admin} />));
        const door = host.querySelector('[data-financials-manage-payments="open"]')!;
        expect(door.textContent).toBe("Payment methods");
        expect(door.hasAttribute("data-financials-method-state")).toBe(false);
    });
});

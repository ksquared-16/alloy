// @vitest-environment jsdom
/**
 * THE AMOUNT OVERRIDE, RENDERED — what an operator sees and what each surface sends.
 *
 *   · Add Charge shows the Catalog price with "Change amount" (only to a user who may adjust); on, it
 *     states Catalog price → this charge (difference), requires a reason, and will not submit until
 *     the amount and reason are valid.
 *   · Bulk charge names the recipients that receive an override one by one: only their requests carry
 *     `amount_override`; every other recipient is charged the Catalog price; each row and the totals
 *     say which is which.
 *
 * DOM evidence, not browser evidence: no dev server, no session, no database. The server's own
 * judgement of permission, amount and reason is `catalogAmountOverride.test.ts`.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = { permissionKeys: ["fin.write", "fin.adjust"] as string[] };
vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuthOptional: () => ({ permissionKeys: [...auth.permissionKeys] }),
}));

const { default: FinancialsBulkAddCharge } = await import("@/app/adminV2/financials/sections/FinancialsBulkAddCharge");
const { default: AddChargeCommand } = await import("@/components/operationalCards/AddChargeCommand");
const { adaptAddChargeSpecimen, adaptChargeTemplateOption } = await import("@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard");
import type { CatalogChargeOption } from "@/lib/financials/catalogCharges/catalogChargeOffer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FEE: CatalogChargeOption = {
    id: "p-fee", label: "Field Day Fee", categoryKey: "fee", categoryLabel: "Fee", amountStrategy: "fixed", amountCents: 2500,
    currencyCode: "USD", reviewRequired: false, occursOnStrategy: "now", billableOnStrategy: "billing_policy",
    source: "catalog", availability: "offerable", unavailableReason: null, accountLabel: "4020 · Activity Fees",
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    auth.permissionKeys = ["fin.write", "fin.adjust"];
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
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
/* A React-controlled input only hears a value set through the native setter plus an input event. */
function type(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);

describe("Add › Charge — this charge's amount", () => {
    function renderCommand(amountOverride: Record<string, unknown> | null, amount = "") {
        const templates = [adaptChargeTemplateOption(FEE, "USD")];
        const selected = templates[0]!;
        const onSubmit = vi.fn();
        act(() => {
            root.render(
                <AddChargeCommand
                    templates={templates}
                    specimen={adaptAddChargeSpecimen({
                        template: selected, subjectLabel: "Household", amount: amount || selected.amount || "—", note: "",
                        period: "June 2026", balanceCents: 0, currency: "USD", previewSummary: null, previewChanges: [],
                    })}
                    controls={{
                        selectedTemplateId: selected.key, onSelectTemplate: () => {},
                        subjects: [], selectedSubjectId: null, onSelectSubject: () => {},
                        amount, onAmount: () => {}, note: "", onNote: () => {}, eventDate: "", onEventDate: () => {},
                        amountOverride: amountOverride as never,
                        onSubmit, onCancel: () => {}, running: false, error: null,
                    }}
                />,
            );
        });
        return { onSubmit };
    }

    it("shows the Catalog price, locked, with Change amount — and nothing to override without the authority", () => {
        const onToggle = vi.fn();
        renderCommand({ active: false, catalogAmountCents: 2500, amountCents: null, reason: "", onReason: () => {}, error: null, onToggle });
        expect(q("[data-addcharge-amount-note]")?.textContent).toContain("$25.00");
        act(() => q<HTMLButtonElement>('[data-addcharge-override-toggle="on"]')!.click());
        expect(onToggle).toHaveBeenCalledWith(true);
        expect(q("[data-addcharge-override-amount]")).toBeNull();

        renderCommand(null);
        expect(q("[data-addcharge-override]")).toBeNull();
    });

    it("on: an editable amount, Catalog price → this charge (difference), a reason, and 'this charge only'", () => {
        renderCommand({ active: true, catalogAmountCents: 2500, amountCents: 3150, reason: "Includes bus seat", onReason: () => {}, error: null, onToggle: () => {} }, "31.50");
        expect(q<HTMLInputElement>("[data-addcharge-override-amount]")?.value).toBe("31.50");
        expect(q("[data-addcharge-override-summary]")?.textContent).toMatch(/Catalog price \$25\.00 → this charge \$31\.50 \(\+\$6\.50\).*this charge only; the Catalog item is unchanged/);
        expect(q<HTMLInputElement>("[data-addcharge-override-reason]")?.value).toBe("Includes bus seat");
        expect(q<HTMLButtonElement>("[data-addcharge-submit]")?.disabled).toBe(false);
    });

    it("an override that is not yet valid states why and cannot be submitted", () => {
        renderCommand({ active: true, catalogAmountCents: 2500, amountCents: null, reason: "", onReason: () => {}, error: "Enter the amount in dollars and cents, like 30.00.", onToggle: () => {} }, "30.555");
        expect(q("[data-addcharge-override-error]")?.textContent).toContain("dollars and cents");
        expect(q<HTMLButtonElement>("[data-addcharge-submit]")?.disabled).toBe(true);
    });
});

describe("Bulk charge — exactly which recipients receive an override", () => {
    function stubNetwork() {
        const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            calls.push({ url, body });
            if (url.startsWith("/api/admin/financials/bulk-charge-targets")) {
                return new Response(JSON.stringify({
                    ok: true, businessDate: "2026-06-29", catalog: { ok: true, options: [{ ...FEE, unavailableForSubjects: {} }] },
                    households: [
                        { customerId: "h1", householdName: "Household One", children: [{ customerMemberId: "k1", name: "Ada" }] },
                        { customerId: "h2", householdName: "Household Two", children: [{ customerMemberId: "k2", name: "Ben" }] },
                    ],
                }));
            }
            if (url === "/api/admin/actions/execute") {
                return new Response(JSON.stringify({ ok: true, data: { execution_result: { eligibility: { eligible: true }, preview: { summary: "Field Day Fee", changes: [] } } } }));
            }
            return new Response("{}", { status: 404 });
        }));
        return calls;
    }
    async function open() {
        const calls = stubNetwork();
        act(() => root.render(<FinancialsBulkAddCharge siteLocationId="" onCommitted={() => {}} />));
        await flush();
        act(() => q<HTMLButtonElement>('[data-testid="bulk-charge-template"] button')!.click());
        act(() => [...document.body.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.startsWith("Field Day Fee"))!.click());
        act(() => q<HTMLInputElement>('input[aria-label="Select Household One"]')!.click());
        act(() => q<HTMLInputElement>('input[aria-label="Select Household Two"]')!.click());
        return calls;
    }

    it("only the ticked recipient's request carries the override; the other is charged the Catalog price, and both say so", async () => {
        const calls = await open();
        type(q<HTMLInputElement>('[data-financials-bulk-charge-override-amount="true"]')!, "30.00");
        type(q<HTMLInputElement>('[data-financials-bulk-charge-override-reason="true"]')!, "Late registration");
        act(() => q<HTMLInputElement>('[data-financials-bulk-charge-override-target="h1"]')!.click());

        const rowAmount = (id: string) => q(`[data-financials-bulk-charge-target="${id}"] [data-financials-bulk-charge-row-amount]`);
        expect(rowAmount("h1")?.getAttribute("data-financials-bulk-charge-row-amount")).toBe("override");
        expect(rowAmount("h1")?.textContent).toBe("Override $30.00");
        expect(rowAmount("h2")?.textContent).toBe("Catalog $25.00");

        await act(async () => q<HTMLButtonElement>('[data-financials-bulk-charge-preview-run="true"]')!.click());
        await flush();
        const previews = calls.filter((c) => c.url === "/api/admin/actions/execute").map((c) => c.body!.payload as Record<string, unknown>);
        expect(previews).toHaveLength(2);
        expect(previews.find((p) => p.customer_id === "h1")?.amount_override).toEqual({ amount_cents: 3000, reason: "Late registration" });
        expect(previews.find((p) => p.customer_id === "h2")).not.toHaveProperty("amount_override");
        for (const p of previews) expect(p).not.toHaveProperty("amount_cents");

        expect(q('[data-financials-bulk-charge-override-tally="true"]')?.textContent).toMatch(
            /1 account \(1 charge\) at the override \$30\.00 · 1 charge at the Catalog price \$25\.00 · Reason: Late registration\. The Catalog item does not change\./,
        );
        expect(q('[data-financials-bulk-charge-confirm="true"]')?.textContent).toBe("Create 2 charges · $55.00");
    });

    it("an invalid override amount, or no reason, is stated and blocks the preview", async () => {
        await open();
        act(() => q<HTMLInputElement>('[data-financials-bulk-charge-override-target="h1"]')!.click());
        type(q<HTMLInputElement>('[data-financials-bulk-charge-override-amount="true"]')!, "30.555");
        expect(q('[data-financials-bulk-charge-override-error="true"]')?.textContent).toContain("dollars and cents");
        expect(q<HTMLButtonElement>('[data-financials-bulk-charge-preview-run="true"]')?.disabled).toBe(true);
        type(q<HTMLInputElement>('[data-financials-bulk-charge-override-amount="true"]')!, "30.00");
        expect(q('[data-financials-bulk-charge-override-error="true"]')?.textContent).toContain("Say why");
        expect(q<HTMLButtonElement>('[data-financials-bulk-charge-preview-run="true"]')?.disabled).toBe(true);
    });

    it("without the adjustment authority there is no override control, and no request carries one", async () => {
        auth.permissionKeys = ["fin.write"];
        const calls = await open();
        expect(q('[data-financials-bulk-charge-override="true"]')).toBeNull();
        expect(q("[data-financials-bulk-charge-override-target]")).toBeNull();
        await act(async () => q<HTMLButtonElement>('[data-financials-bulk-charge-preview-run="true"]')!.click());
        await flush();
        for (const c of calls.filter((x) => x.url === "/api/admin/actions/execute")) expect(c.body!.payload).not.toHaveProperty("amount_override");
    });
});

describe("the account card asks preview and commit the same question", () => {
    it("both send amountOverrideFields; the override is offered only under the adjustment authority, and never across items", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "components/admin/focusPanel/cards/FinancialsCard.tsx"), "utf8");
        expect(src.match(/\.\.\.amountOverrideFields\((source|pending\.source)\)/g)).toEqual(["...amountOverrideFields(source)", "...amountOverrideFields(pending.source)"]);
        expect(src).toContain("adminAuth?.permissionKeys?.includes(CATALOG_AMOUNT_OVERRIDE_PERMISSION)");
        expect(src).toMatch(/an override never carries across\. \*\/\s*if \(overrideOn\) \{\s*resetAmountOverride\(\);/);
        /* The commit closes over the override on screen. */
        expect(src).toMatch(/overrideOn,\s*overrideCents,\s*overrideReason,\s*\]\);/);
    });
});

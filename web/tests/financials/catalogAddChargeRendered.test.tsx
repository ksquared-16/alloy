// @vitest-environment jsdom
/**
 * THE CATALOG ADD CHARGE SURFACES, RENDERED — the operator-visible half of the policy.
 *
 * Mounts the real `AddChargeCommand` (the account card's command) and the real
 * `FinancialsBulkAddCharge` in a DOM, with the network stubbed, and reads what an operator would
 * see and what the surface would send:
 *
 *   · Charge type lists ONLY items this operator can add here, by name and price — unsupported and
 *     blocked catalog items are not choices and carry no explanatory text; an item refused for the
 *     current selection only stays choosable, its reason said once beside Applies to;
 *   · with nothing chargeable, a short actionable empty state instead of unusable options;
 *   · the amount is the catalog's configured amount;
 *   · Bulk defaults its service date to the ORGANISATION's business date from the server;
 *   · Bulk sends `catalog_product_id` (never `template_id`, never an amount), and a household the
 *     domain refuses in preview is shown refused, with no confirm offered for it.
 *
 * This is DOM evidence, not browser evidence: no dev server, no session, no database.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialsBulkAddCharge from "@/app/adminV2/financials/sections/FinancialsBulkAddCharge";
import AddChargeCommand from "@/components/operationalCards/AddChargeCommand";
import {
    adaptAddChargeSpecimen,
    adaptChargeTemplateOption,
    addChargeTypeChoices,
} from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import type { CatalogChargeOption } from "@/lib/financials/catalogCharges/catalogChargeOffer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function option(id: string, over: Partial<CatalogChargeOption> = {}): CatalogChargeOption {
    return {
        id, label: `Item ${id}`, categoryKey: "fee", categoryLabel: "Fee", amountStrategy: "fixed", amountCents: 2500,
        currencyCode: "USD", reviewRequired: false, occursOnStrategy: "now", billableOnStrategy: "billing_policy",
        source: "catalog", availability: "offerable", unavailableReason: null, accountLabel: "4010 · Activity Revenue",
        ...over,
    };
}
const OPTIONS: CatalogChargeOption[] = [
    option("p-fee", { label: "Alpha Fee", amountCents: 2500 }),
    option("p-monthly", { label: "Monthly Fee", availability: "unsupported", accountLabel: null, unavailableReason: "Monthly — a recurring Catalog item. Add charge adds one-time fees only, and recurring Catalog items are not billed by any flow yet. To charge it here, set its frequency to One-time." }),
    option("p-unmapped", { label: "Unmapped Fee", availability: "blocked", accountLabel: null, unavailableReason: "Revenue category “Unmapped” is not mapped to a GL account. Map it in Organization › Financials › GL Codes." }),
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
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
const optionsIn = (scope: ParentNode) => [...scope.querySelectorAll<HTMLElement>("[role=option]")];

describe("Add › Charge on the account card", () => {
    const mount = (templates: ReturnType<typeof adaptChargeTemplateOption>[], selectionRefusal: string | null = null) => {
        const selected = templates[0]!;
        const onSelect = vi.fn();
        act(() => {
            root.render(
                <AddChargeCommand
                    templates={templates}
                    selectionRefusal={selectionRefusal}
                    specimen={adaptAddChargeSpecimen({
                        template: selected, subjectLabel: "Household", amount: selected.amount ?? "—", note: "",
                        period: "June 2026", balanceCents: 0, currency: "USD", previewSummary: null, previewChanges: [],
                    })}
                    controls={{
                        selectedTemplateId: selected.key, onSelectTemplate: onSelect,
                        subjects: [], selectedSubjectId: null, onSelectSubject: () => {},
                        amount: "", onAmount: () => {}, note: "", onNote: () => {}, eventDate: "", onEventDate: () => {},
                        onSubmit: () => {}, onCancel: () => {}, running: false, error: null,
                    }}
                />,
            );
        });
        return onSelect;
    };

    it("offers only chargeable items: unsupported and blocked ones are dropped, a selection-only refusal stays choosable", () => {
        const options = [
            ...OPTIONS,
            option("p-elsewhere", { label: "Site Fee" }),
        ].map((o) => adaptChargeTemplateOption(o, "USD"));
        /* As the host judges them for THIS selection: Site Fee is refused here, chargeable to someone. */
        const judged = options.map((o) => (o.key === "p-elsewhere" ? { ...o, unavailableReason: "Ada: offered at a different location." } : o));
        const choices = addChargeTypeChoices(judged, ["offerable", "unsupported", "blocked", "offerable"], false);
        expect(choices.map((c) => c.key)).toEqual(["p-fee", "p-elsewhere"]);
        expect(choices.every((c) => c.unavailableReason === null)).toBe(true);
        /* Editing a template draft offers exactly that draft's template. */
        expect(addChargeTypeChoices(judged.slice(0, 1), [undefined], true).map((c) => c.key)).toEqual(["p-fee"]);
    });

    it("lists the choices by name and price with no explanatory text, and states the account", () => {
        const choices = addChargeTypeChoices(
            OPTIONS.map((o) => adaptChargeTemplateOption(o, "USD")),
            OPTIONS.map((o) => o.availability),
            false,
        );
        mount(choices);
        const text = host.textContent ?? "";
        expect(text).toContain("Posts to 4010 · Activity Revenue");
        expect(text).not.toContain("catalog fees");
        expect(text).not.toContain("Monthly Fee");
        expect(text).not.toContain("not available here");
        expect(text).not.toContain("recurring Catalog item");
        expect(host.querySelector('[data-testid="addcharge-unavailable"]')).toBeNull();

        act(() => host.querySelector<HTMLButtonElement>('[data-testid="addcharge-template"] button')!.click());
        const opts = optionsIn(document.body);
        expect(opts.map((o) => o.textContent)).toEqual(["Alpha Fee · $25.00"]);
        expect(opts[0]!.getAttribute("aria-disabled")).toBeNull();
    });

    it("says a selection-only refusal once, beside Applies to, and offers no Add for it", () => {
        const [alpha] = OPTIONS.map((o) => adaptChargeTemplateOption(o, "USD"));
        mount([alpha!], "Ada: offered at a different location.");
        expect(host.querySelector("[data-addcharge-selection-refusal]")?.textContent).toBe("Ada: offered at a different location.");
        expect(host.querySelector<HTMLButtonElement>("[data-addcharge-submit]")?.disabled).toBe(true);
    });
});

describe("Bulk charge", () => {
    function stubNetwork(previewAnswer: (payload: Record<string, unknown>) => Record<string, unknown>) {
        const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
            const body = init?.body ? JSON.parse(String(init.body)) : null;
            calls.push({ url, body });
            if (url.startsWith("/api/admin/financials/bulk-charge-targets")) {
                return new Response(JSON.stringify({
                    ok: true,
                    businessDate: "2026-06-29",
                    catalog: { ok: true, options: OPTIONS },
                    households: [
                        { customerId: "h1", householdName: "Household One", children: [{ customerMemberId: "k1", name: "Ada" }] },
                        { customerId: "h2", householdName: "Household Two", children: [{ customerMemberId: "k2", name: "Ben" }] },
                    ],
                }));
            }
            if (url === "/api/admin/actions/execute") {
                return new Response(JSON.stringify({ ok: true, data: { execution_result: previewAnswer(body.payload) } }));
            }
            return new Response("{}", { status: 404 });
        }));
        return calls;
    }

    it("offers the catalog, defaults to the business date, sends catalog_product_id, and shows a domain refusal as refused", async () => {
        const calls = stubNetwork((payload) =>
            payload.customer_id === "h2"
                ? { eligibility: { eligible: true }, preview: { summary: "x", changes: [], blocked: { reason: "This catalog item is offered at a different location from this charge's." } } }
                : { eligibility: { eligible: true }, preview: { summary: "Alpha Fee $25.00", changes: ["Service date Jun 29, 2026"] } },
        );
        act(() => root.render(<FinancialsBulkAddCharge siteLocationId="" onCommitted={() => {}} />));
        await flush();

        expect(calls.some((c) => c.url.includes("charge-templates"))).toBe(false);
        const date = host.querySelector('[data-testid="bulk-charge-service-date"] input') as HTMLInputElement | null;
        expect(date?.value ?? host.querySelector('[data-testid="bulk-charge-service-date"]')?.textContent ?? "").toMatch(/2026-06-29|Jun 29, 2026|06\/29\/2026/);
        /* Only what can be charged is offered — by name and price, with no reasons beside it. */
        expect(host.textContent).not.toContain("Monthly Fee");
        expect(host.textContent).not.toContain("not mapped to a GL account");
        expect(host.querySelector('[data-financials-bulk-charge-empty="true"]')).toBeNull();

        act(() => host.querySelector<HTMLButtonElement>('[data-testid="bulk-charge-template"] button')!.click());
        const opts = optionsIn(document.body).filter((o) => o.getAttribute("data-option-value"));
        expect(opts.map((o) => o.textContent)).toEqual(["Alpha Fee · $25.00"]);
        act(() => opts.find((o) => o.textContent?.startsWith("Alpha Fee"))!.click());
        expect(host.querySelector('[data-financials-bulk-charge-amount="configured"]')?.textContent).toBe("$25.00 · configured in Catalog");
        expect(host.textContent).toContain("Posts to 4010 · Activity Revenue");

        act(() => host.querySelector<HTMLInputElement>('input[aria-label="Select Household One"]')!.click());
        act(() => host.querySelector<HTMLInputElement>('input[aria-label="Select Household Two"]')!.click());
        await act(async () => host.querySelector<HTMLButtonElement>('[data-financials-bulk-charge-preview-run="true"]')!.click());
        await flush();

        const previews = calls.filter((c) => c.url === "/api/admin/actions/execute").map((c) => c.body!);
        expect(previews).toHaveLength(2);
        for (const p of previews) {
            expect(p.mode).toBe("preview");
            expect((p.payload as Record<string, unknown>).catalog_product_id).toBe("p-fee");
            expect(p.payload).not.toHaveProperty("template_id");
            expect(p.payload).not.toHaveProperty("amount_cents");
        }
        const row = (id: string) => host.querySelector(`[data-financials-bulk-charge-target="${id}"] [data-financials-bulk-charge-row-state]`);
        expect(row("h1")?.getAttribute("data-financials-bulk-charge-row-state")).toBe("previewed");
        expect(row("h2")?.getAttribute("data-financials-bulk-charge-row-state")).toBe("refused");
        expect(row("h2")?.textContent).toContain("different location");
        const confirm = host.querySelector('[data-financials-bulk-charge-confirm="true"]');
        /* Only the one ready household is offered for creation: one charge at the configured price. */
        expect(confirm?.textContent).toBe("Create 1 charge · $25.00");
    });
});

describe("Bulk charge with nothing chargeable", () => {
    it("shows one actionable line instead of unusable options", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) =>
            url.startsWith("/api/admin/financials/bulk-charge-targets")
                ? new Response(JSON.stringify({ ok: true, businessDate: "2026-06-29", catalog: { ok: true, options: OPTIONS.slice(1) }, households: [] }))
                : new Response("{}", { status: 404 }),
        ));
        act(() => root.render(<FinancialsBulkAddCharge siteLocationId="" onCommitted={() => {}} />));
        await flush();
        expect(host.querySelector('[data-financials-bulk-charge-empty="true"]')?.textContent)
            .toBe("Add a one-time item with a GL Code in Organization › Financials › Catalog.");
        expect(host.querySelector<HTMLButtonElement>('[data-testid="bulk-charge-template"] button')?.disabled).toBe(true);
        expect(host.textContent).not.toContain("Monthly Fee");
    });
});

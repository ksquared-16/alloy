/** @vitest-environment jsdom */

/**
 * BP V2 Slice 6 — where the EXISTING Financials card starts when a Billing row opens a household.
 * Pure decision + render proof: the card is mocked here only to observe the props this host hands it;
 * the live suite proves the source verification against real data.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cardProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/admin/focusPanel/cards/FinancialsCard", () => ({
    default: (p: Record<string, unknown>) => {
        cardProps.push(p);
        return <div data-financials-card-mock="true" />;
    },
}));

import DurableRecordFinancialsLead, { financialsLeadStart } from "@/components/presentation/durableRecord/DurableRecordFinancialsLead";
import type { HouseholdFinancialFocus } from "@/lib/runtime/focus/householdFinancialFocusSource";

const HOUSEHOLD = { householdId: "h-1", label: "Rivera", contacts: [], children: [], truth: { customer_id: "h-1" } } as never;

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => createRoot(container!).render(node));
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
    cardProps.length = 0;
});

describe("financialsLeadStart — one verified source, one starting point, never a substitute", () => {
    it("a charge of this household opens the card's existing Charge Details on THAT charge", () => {
        expect(financialsLeadStart({ kind: "charge", id: "c-1", status: "ok", label: "October tuition", chargeStatus: "draft" })).toEqual({
            openCharge: { chargeId: "c-1", label: "October tuition" }, openCollection: null, notice: null, status: "charge",
        });
        expect(financialsLeadStart({ kind: "charge", id: "c-2", status: "ok", label: null, chargeStatus: "posted" }).openCharge).toEqual({ chargeId: "c-2", label: "Charge" });
    });

    it("an unrecorded collection opens the Payment surface with that attempt marked; a recorded one is said, not opened", () => {
        expect(financialsLeadStart({ kind: "collection_attempt", id: "a-1", status: "ok", recognized: false, processorState: "succeeded" })).toMatchObject({
            openCollection: { attemptId: "a-1" }, openCharge: null, notice: null, status: "collection",
        });
        const recorded = financialsLeadStart({ kind: "collection_attempt", id: "a-1", status: "ok", recognized: true, processorState: "succeeded" });
        expect(recorded).toMatchObject({ openCollection: null, openCharge: null, status: "collection_recorded" });
        expect(recorded.notice).toMatch(/recorded by Financials/);
    });

    it.each(["not_found", "other_household"] as const)("%s → the account at rest and one honest sentence; nothing else selected", (status) => {
        const s = financialsLeadStart({ kind: "charge", id: "c-9", status } as HouseholdFinancialFocus);
        expect(s).toMatchObject({ openCharge: null, openCollection: null, status });
        expect(s.notice).toMatch(/no longer on this household's account/);
    });

    it("without fin.read nothing is opened and nothing is said here (the card states its own refusal)", () => {
        expect(financialsLeadStart({ kind: "charge", id: "c-1", status: "forbidden" })).toEqual({ openCharge: null, openCollection: null, notice: null, status: "forbidden" });
    });

    it("no source → the card at rest", () => {
        expect(financialsLeadStart(null)).toEqual({ openCharge: null, openCollection: null, notice: null, status: "none" });
    });
});

describe("DurableRecordFinancialsLead hands the EXISTING card its seed and refresh", () => {
    it("charge source: the card receives openCharge and a household operational context", () => {
        const onChanged = vi.fn();
        const el = render(<DurableRecordFinancialsLead household={HOUSEHOLD} focus={{ kind: "charge", id: "c-1", status: "ok", label: "Tuition", chargeStatus: "draft" }} onChanged={onChanged} />);
        expect(el.querySelector("[data-durable-record-lead='financials']")?.getAttribute("data-financial-focus")).toBe("charge");
        const p = cardProps.at(-1)!;
        expect(p.openCharge).toEqual({ chargeId: "c-1", label: "Tuition" });
        expect(p.openCollection).toBeNull();
        expect((p.model as { key: string }).key).toBe("financials");
        expect((p.context as { subject: { type: string; id: string } }).subject).toMatchObject({ type: "household", id: "h-1" });
        (p.onSurfacesClosed as () => void)();
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("stale source: the notice renders and the card opens on nothing", () => {
        const el = render(<DurableRecordFinancialsLead household={HOUSEHOLD} focus={{ kind: "charge", id: "c-9", status: "not_found" }} />);
        expect(el.querySelector("[data-financial-focus-notice]")?.getAttribute("data-financial-focus-notice")).toBe("not_found");
        expect(cardProps.at(-1)!.openCharge).toBeNull();
        expect(cardProps.at(-1)!.openCollection).toBeNull();
    });
});

// @vitest-environment jsdom
/**
 * The Annual fees panel, rendered: says it is not active, shows who and when, and offers nothing
 * that charges.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialsAnnualCatalogBilling from "@/app/adminV2/financials/sections/FinancialsAnnualCatalogBilling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const period = (start: string, end: string) => ({ key: `${start}~${end}`, start, end, label: "" });
const recipient = (child: string, dueOn: string, state: string, over: Record<string, unknown> = {}) => ({
    childMemberId: child, customerId: `hh-${child}`, agreementId: `ag-${child}`, locationId: null, programKey: null,
    anchor: "2025-09-01", anchorSource: "tuition_term", period: period(dueOn, "2027-08-31"), dueOn, amountCents: 20000,
    state, existingChargeId: state === "already_charged" ? "ch" : null, occurrenceKey: `tpl:catalog:supply:${dueOn}:ag-${child}`, ...over,
});

const BODY = {
    active: false,
    timing: "Proposed: due on each child's enrollment anniversary, full price, one charge per child per year.",
    asOf: "2026-11-03",
    items: [
        {
            productId: "supply", name: "Annual Supply Fee", amountCents: 20000, locationId: null, programKey: null, status: "scheduled", reason: null,
            recipients: [recipient("c1", "2026-09-01", "due"), recipient("c2", "2026-09-01", "already_charged"), recipient("c1", "2027-09-01", "upcoming")],
            excluded: [{ childMemberId: "c3", agreementId: "ag-c3", reason: "No enrollment start date to anchor the annual period on." }],
        },
        { productId: "reg", name: "Registration Fee", amountCents: 10000, locationId: null, programKey: null, status: "not_required", reason: "Not marked Required, so nobody is charged automatically.", recipients: [], excluded: [] },
    ],
    names: { children: { c1: "Ada Lovelace", c2: "Ben Ito", c3: "Cy Park" }, households: { "hh-c1": "Lovelace", "hh-c2": "Ito" } },
};

describe("Annual fees panel", () => {
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BODY })));
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    });

    it("states not active and the proposed timing first, then who, when and how much per item", async () => {
        await act(async () => root.render(<FinancialsAnnualCatalogBilling />));
        await act(async () => {});
        const text = host.textContent ?? "";
        expect(host.querySelector('[data-financials-annual-catalog-active="false"]')).not.toBeNull();
        expect(text).toContain("Not active — nobody is charged until this is reviewed and turned on.");
        expect(text).toContain("Proposed: due on each child's enrollment anniversary");
        const supply = host.querySelector('[data-financials-annual-item="supply"]')!;
        expect(supply.textContent).toContain("1 would be charged now · 1 already charged this year");
        const states = [...supply.querySelectorAll("[data-financials-annual-recipient-state]")].map((n) => [
            n.getAttribute("data-financials-annual-recipient"), n.getAttribute("data-financials-annual-recipient-state"),
        ]);
        expect(states).toEqual([["c1", "due"], ["c2", "already_charged"], ["c1", "upcoming"]]);
        expect(supply.textContent).toContain("Ada Lovelace · Lovelace");
        expect(supply.textContent).toContain("Cy Park — No enrollment start date");
        expect(host.querySelector('[data-financials-annual-item="reg"]')!.textContent).toContain("Not marked Required");
    });

    it("has no control that charges anyone", async () => {
        await act(async () => root.render(<FinancialsAnnualCatalogBilling />));
        await act(async () => {});
        expect(host.querySelectorAll("button")).toHaveLength(0);
        const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
        expect(fetchMock.mock.calls.every(([, init]) => !init || !("method" in (init as object)) || (init as RequestInit).method === "GET")).toBe(true);
    });
});

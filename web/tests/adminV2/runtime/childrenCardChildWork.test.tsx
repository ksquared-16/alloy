// @vitest-environment jsdom
/**
 * E2E-18 — a tracked child's own work is opened from the Children card through the destination Search
 * uses; an untracked child (E2E-21) says its work is still the family's; a child view returns to the
 * family. Selection creates nothing and never resolves a sibling.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

const { hookState, focusSpy, dispatchSpy } = vi.hoisted(() => ({
    hookState: { value: { status: "idle" } as Record<string, unknown>, lastArg: null as string | null },
    focusSpy: vi.fn(),
    dispatchSpy: vi.fn(),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/children/useChildWorkDestination", () => ({
    useChildWorkDestination: (id: string | null) => {
        hookState.lastArg = id;
        return id ? hookState.value : { status: "idle" };
    },
}));
vi.mock("@/lib/runtime/focus/useOperatorRecordFocus", () => ({ useOperatorRecordFocus: () => focusSpy }));
vi.mock("@/lib/runtime/focus/operatorFocusSelection", async () => {
    const actual = await vi.importActual<typeof import("@/lib/runtime/focus/operatorFocusSelection")>("@/lib/runtime/focus/operatorFocusSelection");
    return { ...actual, dispatchOperatorFocusSelection: (...a: unknown[]) => dispatchSpy(...a) };
});
vi.mock("@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions", () => ({
    useTenantFieldDefinitions: () => ({ tenantFieldDefinitions: [], loading: false }),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc", () => ({ usePublishedFocusPanelSummaryDoc: () => null }));

import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { operatorFocusSelectionFromDestination } from "@/lib/runtime/focus/operatorFocusSelection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const model = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as unknown as FocusPanelCardModel;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
    vi.clearAllMocks();
    hookState.value = { status: "idle" };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
});

function demo(truthExtra: Record<string, unknown> = {}) {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    const ctx = buildOperationalContext({
        subjectId: String(vm.entity.id), title: vm.header.title, subjectVm: vm,
        truth: { ...record, ...truthExtra }, perspective: null, statusLabel: "Lead", canMutate: true,
    });
    return ctx;
}
function render(ctx: ReturnType<typeof demo>) {
    act(() => root!.render(<ChildrenCard model={model} context={ctx} mutation={{ canEdit: true } as never} coordination={{ requestFocus: vi.fn(), reportPerspective: vi.fn(), dismiss: vi.fn(), back: vi.fn(), request: null, activeDepth: null, dismissed: null, previousFocus: null } as never} />));
}
function focusFirstChild() {
    // The roster row's own activate control (IdentityRecordSummary), as an operator clicks it.
    const row = host!.querySelector<HTMLButtonElement>("[data-children-roster] .identity-record-summary__activate");
    if (!row) throw new Error("no child row to activate");
    act(() => row.click());
}

describe("Children card — a tracked child's own work", () => {
    it("asks for the focused child's destination and opens it with the shared selection", () => {
        const selection = operatorFocusSelectionFromDestination({
            target: "focus_panel", card_key: "children", host_entity_type: "opportunities", host_entity_id: "opp-1",
            host_work_unit_key: "enrollment-pipeline", host_work_view_id: "view-waitlist", operational_member_id: "pi-alpha",
        })!;
        hookState.value = { status: "ready", selection };
        render(demo());
        focusFirstChild();
        const btn = host!.querySelector<HTMLButtonElement>('[data-children-action="open-child-work"]');
        expect(hookState.lastArg).toBeTruthy(); // asked for the FOCUSED child's member id
        expect(btn?.textContent).toMatch(/'s work →$/);
        act(() => btn!.click());
        expect(dispatchSpy).toHaveBeenCalledWith(selection);
    });

    it("an untracked child says its work is the family's — no navigation offered", () => {
        hookState.value = { status: "none" };
        render(demo());
        focusFirstChild();
        expect(host!.querySelector('[data-children-action="open-child-work"]')).toBeNull();
        expect(host!.querySelector('[data-children-child-work="family-position"]')?.textContent).toMatch(/family's for now/);
        expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it("on a child view, '← Family work' returns to the family's record", () => {
        render(demo({ "child.customer_member_id": "cm-alpha", "child.family_opportunity_id": "opp-family" }));
        const back = host!.querySelector<HTMLButtonElement>('[data-children-action="family-work"]');
        expect(back).not.toBeNull();
        act(() => back!.click());
        expect(focusSpy).toHaveBeenCalledWith({ entity_type: "opportunities", entity_id: "opp-family" });
    });

    it("on the family view there is no family-return control", () => {
        render(demo());
        expect(host!.querySelector('[data-children-action="family-work"]')).toBeNull();
    });
});

describe("one destination → selection mapping", () => {
    it("maps a child-grain destination to host + Work View + participation row; refuses a hostless one", () => {
        expect(operatorFocusSelectionFromDestination({
            target: "focus_panel", card_key: "children", item_id: "cm-alpha", host_entity_type: "opportunities",
            host_entity_id: "opp-1", host_work_unit_key: "wu", host_work_view_id: "view-waitlist", operational_member_id: "pi-alpha",
        })).toEqual({
            entity_type: "opportunities", entity_id: "opp-1", host_work_unit_key: "wu", host_work_view_id: "view-waitlist",
            operational_member_id: "pi-alpha", card_focus: { card_key: "children", item_id: "cm-alpha", context_key: null },
        });
        expect(operatorFocusSelectionFromDestination({ target: "focus_panel", card_key: "children" })).toBeNull();
    });
});

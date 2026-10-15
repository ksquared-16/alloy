// @vitest-environment jsdom
/**
 * E2E-03 / E2E-07 / E2E-08 — ONE COMMAND, MANY PLACEMENTS.
 *
 * Human QA found two Add Child experiences: the process card's capture-first form, and Manage →
 * Add Child, which opened the legacy 4-step relationship wizard in the drawer action-modal host and
 * submitted through a different writer. The registry already said which one is the operator's
 * (`add_child` declares `interactionHost: "inline_form"`); the Manage path never read it.
 *
 * These tests pin the convergence:
 *   - the rule is registry metadata, and it covers Add Child and nothing it should not (not Schedule
 *     Tour, not Add Parent);
 *   - Manage → Add Child hands the resolved action to the Current Work workspace and never runs the
 *     relationship executor; Manage → Add Parent still runs exactly as before;
 *   - the workspace hosts a carried-in Add Child even where the stage's template does not list it;
 *   - Children "+ Add Child" and Household "+ Add Contact" invoke THE action Manage resolved, through
 *     the handler Manage uses — and offer nothing when the record has no such action or no access.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

const { applySpy } = vi.hoisted(() => ({ applySpy: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/runtime/focus/useOperatorRecordFocus", () => ({ useOperatorRecordFocus: () => vi.fn() }));
vi.mock("@/lib/admin/actions/applyRegistryResolvedActionClient", () => ({
    applyRegistryResolvedActionClient: (...a: unknown[]) => applySpy(...a),
}));
vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({ completeOutcome: vi.fn(), busy: false, error: null, clearError: vi.fn() }),
}));
vi.mock("@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions", () => ({
    useTenantFieldDefinitions: () => ({ tenantFieldDefinitions: [], loading: false }),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc", () => ({
    usePublishedFocusPanelSummaryDoc: () => null,
}));

import {
    ADMIN_V2_OPEN_CURRENT_WORK_ACTION,
    findRecordAction,
    isCurrentWorkHostedRecordAction,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/openCurrentWorkAction";
import { useOpportunityDrawerVmHeaderActions } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const action = (key: string, label: string): ResolvedActionForClient => ({
    key,
    label,
    description: null,
    action_type: "ui_intent",
    icon: null,
    style: null,
    display_style: "button",
    payload: { ui_intent: "relationship_action" },
    workflow_id: null,
});
const ADD_CHILD = action("add_child", "Add Child");
// Manage → "Add Parent" is `add_family_member` (measured on deployed staging from the Manage item's
// own key). The relationship wizard's `add_parent_guardian` is a different command Manage does not offer.
const ADD_PARENT = action("add_family_member", "Add Parent");
const ADD_PARENT_GUARDIAN = action("add_parent_guardian", "Add Parent / Guardian");
const slots = (...overflow: ResolvedActionForClient[]): ResolvedActionsBySlot => ({
    primary: [],
    secondary: [],
    overflow,
    right_rail: [],
    row_inline: [],
    header: [],
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const realFetch = globalThis.fetch;

beforeEach(() => {
    applySpy.mockReset();
    applySpy.mockResolvedValue({ ok: true });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 })) as typeof fetch;
});

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    globalThis.fetch = realFetch;
});

function coordination(partial: Partial<FocusPanelCoordination> = {}): FocusPanelCoordination {
    return {
        focusTargets: new Set(["current_work", "children", "household"]),
        request: null,
        requestFocus: vi.fn(),
        activeDepth: null,
        reportPerspective: vi.fn(),
        dismissed: null,
        dismiss: vi.fn(),
        previousFocus: null,
        back: vi.fn(),
        ...partial,
    } as FocusPanelCoordination;
}

function demoContext(recordHeaderActions: ResolvedActionsBySlot | null) {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    const ctx = buildOperationalContext({
        subjectId: String(vm.entity.id),
        title: vm.header.title,
        subjectVm: vm,
        truth: record,
        perspective: null,
        statusLabel: "Lead",
        canMutate: true,
    });
    return { ...ctx, recordHeaderActions };
}

describe("the rule is registry metadata, scoped to relationship capabilities", () => {
    it("hosts Add Child in the workspace — and not Schedule Tour, change location or Add Parent", () => {
        expect(isCurrentWorkHostedRecordAction({ key: "add_child" })).toBe(true);
        expect(isCurrentWorkHostedRecordAction({ key: "schedule_tour" })).toBe(false);
        expect(isCurrentWorkHostedRecordAction({ key: "change_lead_location" })).toBe(false);
        expect(isCurrentWorkHostedRecordAction({ key: "add_parent_guardian" })).toBe(false);
        expect(isCurrentWorkHostedRecordAction({ key: "add_family_member" })).toBe(false);
        expect(isCurrentWorkHostedRecordAction({ key: "add_emergency_contact" })).toBe(false);
    });

    it("finds the record's resolved action by key in any slot, and nothing when absent", () => {
        expect(findRecordAction(slots(ADD_PARENT, ADD_CHILD), "add_child")).toBe(ADD_CHILD);
        expect(findRecordAction(slots(ADD_PARENT), "add_child")).toBeNull();
        expect(findRecordAction(null, "add_child")).toBeNull();
    });
});

describe("Manage", () => {
    function Harness({ onReady }: { onReady: (select: (a: ResolvedActionForClient) => Promise<void>) => void }) {
        const { onActionSelect } = useOpportunityDrawerVmHeaderActions({
            opportunityId: "opp-1",
            actionHost: { showSuccess: vi.fn(), showError: vi.fn(), clearPreflight: vi.fn(), applyPreflightBlocked: vi.fn() },
        } as never);
        onReady(onActionSelect as (a: ResolvedActionForClient) => Promise<void>);
        return null;
    }

    async function select(a: ResolvedActionForClient) {
        let run: ((x: ResolvedActionForClient) => Promise<void>) | null = null;
        act(() => root!.render(<Harness onReady={(s) => (run = s)} />));
        await act(async () => {
            await run!(a);
        });
    }

    it("Add Child opens in the Current Work workspace — the relationship wizard/executor never runs", async () => {
        const seen: unknown[] = [];
        const listener = (e: Event) => seen.push((e as CustomEvent).detail);
        window.addEventListener(ADMIN_V2_OPEN_CURRENT_WORK_ACTION, listener);
        await select(ADD_CHILD);
        window.removeEventListener(ADMIN_V2_OPEN_CURRENT_WORK_ACTION, listener);
        expect(seen).toEqual([{ opportunity_id: "opp-1", action: ADD_CHILD }]);
        expect(applySpy).not.toHaveBeenCalled();
    });

    it("Add Parent still runs through the registry exactly as before", async () => {
        const seen: unknown[] = [];
        const listener = (e: Event) => seen.push(e);
        window.addEventListener(ADMIN_V2_OPEN_CURRENT_WORK_ACTION, listener);
        await select(ADD_PARENT);
        window.removeEventListener(ADMIN_V2_OPEN_CURRENT_WORK_ACTION, listener);
        expect(seen).toHaveLength(0);
        expect(applySpy).toHaveBeenCalledTimes(1);
        expect(applySpy.mock.calls[0]![0]).toBe(ADD_PARENT);
    });
});

describe("the Current Work workspace hosts a carried-in action", () => {
    const model = {
        key: "current_work",
        title: "Current Work",
        insight: "",
        tier: "work",
        span: "row",
        density: "compact",
        visible: true,
        archetype: "status",
    } as unknown as FocusPanelCardModel;

    async function mountWorkspace(intent: unknown) {
        const ctx = demoContext(null);
        await act(async () => {
            root!.render(
                <CurrentWorkCard
                    model={model}
                    context={ctx}
                    coordination={coordination({
                        currentWorkWorkspace: { open: true, intent: intent as never },
                        openCurrentWorkWorkspace: vi.fn(),
                        closeCurrentWorkWorkspace: vi.fn(),
                        clearCurrentWorkWorkspaceIntent: vi.fn(),
                    })}
                    mutation={{ canEdit: true } as never}
                />,
            );
        });
        // The Add Child panel is a dynamic chunk — wait for it rather than for a microtask.
        for (let i = 0; i < 40 && !host!.querySelector('[data-testid="current-work-add-child"]'); i++) {
            await act(async () => {
                await new Promise((r) => setTimeout(r, 50));
            });
        }
    }

    it("Manage's Add Child opens the process card's Add Child panel even when the stage template does not list it", async () => {
        await mountWorkspace({ kind: "action", actionKey: "add_child", resolved: ADD_CHILD });
        expect(host!.querySelector('[data-testid="current-work-add-child"]')).not.toBeNull();
        expect(document.body.textContent).not.toContain("Link existing");
    });

    it("a bare key the surface does not carry still opens nothing (no substitute command)", async () => {
        await mountWorkspace({ kind: "action", actionKey: "add_child" });
        expect(host!.querySelector('[data-testid="current-work-add-child"]')).toBeNull();
    });
});

describe("card placements invoke the action Manage resolved", () => {
    const childrenModel = { key: "children", title: "Children", tier: "context", span: 2, iconName: "baby" } as unknown as FocusPanelCardModel;
    const householdModel = { key: "household", title: "Household", tier: "context", span: 2, iconName: "users" } as unknown as FocusPanelCardModel;

    function renderCard(kind: "children" | "household", opts: { slots: ResolvedActionsBySlot | null; canEdit: boolean }) {
        const invokeHeaderAction = vi.fn();
        const ctx = demoContext(opts.slots);
        const props = {
            context: ctx,
            coordination: coordination({ invokeHeaderAction }),
            mutation: { canEdit: opts.canEdit } as never,
        };
        act(() => {
            root!.render(
                kind === "children" ?
                    <ChildrenCard model={childrenModel} {...props} />
                :   <HouseholdCard model={householdModel} {...props} />,
            );
        });
        return invokeHeaderAction;
    }

    it("Children + Add Child invokes Manage's resolved Add Child", () => {
        const invoke = renderCard("children", { slots: slots(ADD_CHILD), canEdit: true });
        const button = host!.querySelector<HTMLButtonElement>('[data-children-action="add-child"]');
        expect(button?.textContent).toBe("+ Add Child");
        act(() => button!.click());
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke.mock.calls[0]![0]).toBe(ADD_CHILD);
    });

    it("Household + Add Contact invokes Manage's resolved Add Parent", () => {
        const invoke = renderCard("household", { slots: slots(ADD_PARENT), canEdit: true });
        const button = host!.querySelector<HTMLButtonElement>('[data-household-action="add-contact"]');
        expect(button?.textContent).toBe("+ Add Contact");
        act(() => button!.click());
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke.mock.calls[0]![0]).toBe(ADD_PARENT);
    });

    it("Household + Add Contact does not bind the relationship wizard's add_parent_guardian", () => {
        renderCard("household", { slots: slots(ADD_PARENT_GUARDIAN), canEdit: true });
        expect(host!.querySelector('[data-household-action="add-contact"]')).toBeNull();
    });

    it("offers nothing when the record has no such action", () => {
        renderCard("children", { slots: slots(ADD_PARENT), canEdit: true });
        expect(host!.querySelector('[data-children-action="add-child"]')).toBeNull();
        renderCard("household", { slots: slots(ADD_CHILD), canEdit: true });
        expect(host!.querySelector('[data-household-action="add-contact"]')).toBeNull();
    });

    it("offers nothing without edit access", () => {
        renderCard("children", { slots: slots(ADD_CHILD), canEdit: false });
        expect(host!.querySelector('[data-children-action="add-child"]')).toBeNull();
        renderCard("household", { slots: slots(ADD_PARENT), canEdit: false });
        expect(host!.querySelector('[data-household-action="add-contact"]')).toBeNull();
    });
});

describe("the Add person form both Add Contact placements open is reachable", () => {
    it("caps the panel to the viewport and scrolls the fields between a fixed header and footer", async () => {
        // Layout is measured on deployed staging (jsdom has none); this pins the structure that
        // measurement depends on, so a revert to an uncapped, unscrollable panel is caught here.
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(`${process.cwd()}/components/admin/opportunity/actions/AddPersonModal.tsx`, "utf8");
        // E2E-14: the cap is the height the shell publishes below the app chrome.
        expect(src).toMatch(/panelClassName="[^"]*\bmax-h-\[var\(--alloy-action-modal-max-h\)\][^"]*\bflex-col\b/);
        expect(src).toMatch(/data-add-person-modal-body="true"/);
        expect(src).toMatch(/className="min-h-0 flex-1 space-y-3 overflow-y-auto[^"]*" data-add-person-modal-body/);
    });
});

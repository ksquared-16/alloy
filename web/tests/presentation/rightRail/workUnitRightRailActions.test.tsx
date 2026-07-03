/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openDrawer = vi.fn();
const applyMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/contexts/AdminDrawerContext", () => ({
    useAdminDrawer: () => ({ drawer: { type: "opportunities", id: "opp-7" }, openDrawer }),
}));
vi.mock("@/lib/admin/actions/applyRegistryResolvedActionClient", () => ({
    applyRegistryResolvedActionClient: (...args: unknown[]) => applyMock(...args),
}));
vi.mock("@/components/platform/commands/createLead/CreateLeadCommandSurface", () => ({
    CreateLeadCommandSurface: () => null,
}));
// Render the registered node inline so we can assert what reaches the shell command rail.
vi.mock("@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar", () => ({
    WorkspaceCommandRailRegistrar: ({ actions }: { actions: ReactNode }) => (
        <div data-registrar-surface="work_unit">{actions}</div>
    ),
}));
vi.mock("@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection", () => ({
    CommandRailCollapsibleActionsSection: ({
        actionCount,
        children,
    }: {
        actionCount: number | null;
        children: ReactNode;
    }) => <div data-actions-section data-action-count={String(actionCount)}>{children}</div>,
}));

import { WorkUnitRightRailActions } from "@/components/presentation/rightRail/WorkUnitRightRailActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function action(key: string, label: string): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type: "open_form",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => createRoot(container!).render(node));
    return container;
}
afterEach(() => {
    applyMock.mockClear();
    openDrawer.mockClear();
    if (container) {
        container.remove();
        container = null;
    }
});

const TWO = [action("create_lead", "Create Lead"), action("schedule_tour", "Schedule Tour")];

describe("WorkUnitRightRailActions → shell command rail", () => {
    it("registers an 'Actions (N)' section with one row per configured action", () => {
        const el = render(
            <WorkUnitRightRailActions actions={TWO} departmentId="dept-1" workUnitId="wu-1" />,
        );
        // Registered into the command rail (not a center rail), with the count for the header.
        expect(el.querySelector("[data-registrar-surface='work_unit']")).not.toBeNull();
        expect(el.querySelector("[data-actions-section]")?.getAttribute("data-action-count")).toBe("2");
        const rows = el.querySelectorAll("button[data-right-rail-action]");
        expect(rows).toHaveLength(2);
        expect(el.querySelector('[data-right-rail-action="create_lead"]')?.textContent).toBe("Create Lead");
        expect(el.querySelector('[data-right-rail-action="schedule_tour"]')?.textContent).toBe("Schedule Tour");
    });

    it("registers NOTHING when the payload is empty (rail shows its own default, not a fake empty)", () => {
        const el = render(
            <WorkUnitRightRailActions actions={[]} departmentId="dept-1" workUnitId="wu-1" />,
        );
        expect(el.querySelector("[data-actions-section]")).toBeNull();
        expect(el.querySelectorAll("button[data-right-rail-action]")).toHaveLength(0);
    });

    it("executes through the EXISTING runtime with a work_unit context + baked scope", () => {
        const el = render(
            <WorkUnitRightRailActions actions={TWO} departmentId="dept-1" workUnitId="wu-1" />,
        );
        const btn = el.querySelector('[data-right-rail-action="create_lead"]')!;
        act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(applyMock).toHaveBeenCalledTimes(1);
        const [passedAction, host] = applyMock.mock.calls[0];
        expect(passedAction.key).toBe("create_lead");
        expect(host.context).toEqual({ surface: "work_unit", department_id: "dept-1", work_unit_id: "wu-1" });
        expect(host.entityId).toBe("opp-7"); // record-scoped actions target the open Focus Panel record
        expect(typeof host.openCreateLead).toBe("function"); // reuses the existing runtime path
    });
});

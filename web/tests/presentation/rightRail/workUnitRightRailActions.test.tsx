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
vi.mock("@/contexts/WorkUnitSlugRouteContext", () => ({
    useWorkUnitSlugRouteOptional: () => ({ departmentId: "dept-1", workUnitId: "wu-1" }),
}));
vi.mock("@/lib/admin/actions/applyRegistryResolvedActionClient", () => ({
    applyRegistryResolvedActionClient: (...args: unknown[]) => applyMock(...args),
}));
vi.mock("@/components/platform/commands/createLead/CreateLeadCommandSurface", () => ({
    CreateLeadCommandSurface: () => null,
}));

import { WorkUnitRightRailActions } from "@/components/presentation/rightRail/WorkUnitRightRailActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function action(key: string, label: string, display_style = "button"): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type: "open_form",
        icon: null,
        style: null,
        display_style,
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

describe("WorkUnitRightRailActions", () => {
    it("renders one control per configured action, labelled + tagged by key", () => {
        const el = render(
            <WorkUnitRightRailActions
                actions={[action("create_lead", "Create Lead"), action("schedule_tour", "Schedule Tour")]}
            />,
        );
        const buttons = el.querySelectorAll("button[data-right-rail-action]");
        expect(buttons).toHaveLength(2);
        expect(el.querySelector('[data-right-rail-action="create_lead"]')?.textContent).toBe("Create Lead");
        expect(el.querySelector('[data-right-rail-action="schedule_tour"]')?.textContent).toBe("Schedule Tour");
    });

    it("executes a click through the EXISTING action runtime with a work_unit surface context", () => {
        const create = action("create_lead", "Create Lead");
        const el = render(<WorkUnitRightRailActions actions={[create]} />);
        const btn = el.querySelector('[data-right-rail-action="create_lead"]')!;
        act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(applyMock).toHaveBeenCalledTimes(1);
        const [passedAction, host] = applyMock.mock.calls[0];
        expect(passedAction).toBe(create);
        expect(host.context).toEqual({ surface: "work_unit", department_id: "dept-1", work_unit_id: "wu-1" });
        // Record-scoped actions target the open Focus Panel record.
        expect(host.entityId).toBe("opp-7");
        // Reuses the existing runtime — no new execution path invented.
        expect(typeof host.openCreateLead).toBe("function");
    });

    it("maps display_style menu_item → secondary control (else primary)", () => {
        const el = render(
            <WorkUnitRightRailActions
                actions={[action("a", "Primary", "button"), action("b", "Menu", "menu_item")]}
            />,
        );
        const primary = el.querySelector('[data-right-rail-action="a"]')!;
        const secondary = el.querySelector('[data-right-rail-action="b"]')!;
        // Primary is the filled juniper control; secondary is the white outline control.
        expect(primary.className).toContain("text-white");
        expect(secondary.className).toContain("bg-white");
        expect(secondary.className).not.toContain("text-white");
        // Both use the shared motion primitive for immediate acknowledgement.
        expect(primary.className).toContain("motion-control");
        expect(secondary.className).toContain("motion-control");
    });
});

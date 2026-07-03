/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/contexts/AdminDrawerContext", () => ({ useAdminDrawer: () => ({ openDrawer: vi.fn() }) }));
// Mock the platform modal so we can assert it mounts with the right scope.
vi.mock("@/components/platform/commands/createLead/CreateLeadCommandSurface", () => ({
    CreateLeadCommandSurface: ({
        open,
        departmentId,
        surface,
    }: {
        open: boolean;
        departmentId: string | null;
        surface?: string;
    }) =>
        open ? (
            <div data-create-lead-modal="true" data-dept={departmentId ?? ""} data-surface={surface ?? ""} />
        ) : null,
}));

import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => createRoot(container!).render(node));
    return container;
}
function fireOpen(detail: Record<string, unknown>) {
    act(() => {
        window.dispatchEvent(new CustomEvent("adminv2:open-create-lead", { detail }));
    });
}
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
});

describe("CreateLeadEventHost", () => {
    it("opens the Create Lead modal on adminv2:open-create-lead with the event's department + surface", () => {
        const el = render(<CreateLeadEventHost />);
        expect(el.querySelector("[data-create-lead-modal]")).toBeNull(); // closed until the event
        fireOpen({ department_id: "dept-1", work_unit_id: "wu-1" });
        const modal = el.querySelector("[data-create-lead-modal]");
        expect(modal).not.toBeNull();
        expect(modal?.getAttribute("data-dept")).toBe("dept-1");
        expect(modal?.getAttribute("data-surface")).toBe("work_unit"); // work_unit_id present → work_unit
    });

    it("uses the workspace surface when no work_unit_id", () => {
        const el = render(<CreateLeadEventHost />);
        fireOpen({ department_id: "dept-1" });
        expect(el.querySelector("[data-create-lead-modal]")?.getAttribute("data-surface")).toBe("workspace");
    });

    it("ignores an event with no department (Create Lead needs a target department)", () => {
        const el = render(<CreateLeadEventHost />);
        fireOpen({ work_unit_id: "wu-1" });
        expect(el.querySelector("[data-create-lead-modal]")).toBeNull();
    });
});

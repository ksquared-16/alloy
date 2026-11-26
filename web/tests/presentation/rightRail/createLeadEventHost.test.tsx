/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
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

const startSpy = vi.fn();
vi.mock("@/contexts/BosCommandSessionContext", () => ({
    dispatchStartBosCommandSession: (invocation: unknown) => startSpy(invocation),
}));

const flagState = { enabled: true };
vi.mock("@/lib/bos/commandSession/bosCreateLeadSessionFlag", () => ({
    isBosCreateLeadSessionEnabled: () => flagState.enabled,
}));

import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(node);
    });
    return container;
}
function fireOpen(detail: Record<string, unknown>) {
    act(() => {
        window.dispatchEvent(new CustomEvent("adminv2:open-create-lead", { detail }));
    });
}
afterEach(() => {
    act(() => {
        root?.unmount();
    });
    root = null;
    if (container) {
        container.remove();
        container = null;
    }
    startSpy.mockClear();
    flagState.enabled = true;
});

describe("CreateLeadEventHost — BOS session primary", () => {
    it("starts a BOS command session instead of mounting the modal", () => {
        flagState.enabled = true;
        const el = render(<CreateLeadEventHost />);
        fireOpen({ department_id: "dept-1", work_unit_id: "wu-1" });
        expect(el.querySelector("[data-create-lead-modal]")).toBeNull();
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(startSpy.mock.calls[0]?.[0]).toMatchObject({
            actionKey: "create_lead",
            displayLabel: "Create Lead",
            placement: "work_unit_actions",
            workspace: { departmentId: "dept-1", workUnitId: "wu-1", surface: "work_unit" },
        });
    });

    it("uses workspace placement when no work_unit_id", () => {
        flagState.enabled = true;
        render(<CreateLeadEventHost />);
        fireOpen({ department_id: "dept-1" });
        expect(startSpy.mock.calls[0]?.[0]).toMatchObject({
            placement: "workspace_actions_menu",
            workspace: { surface: "workspace", workUnitId: null },
        });
    });

    it("ignores an event with no department", () => {
        flagState.enabled = true;
        render(<CreateLeadEventHost />);
        fireOpen({ work_unit_id: "wu-1" });
        expect(startSpy).not.toHaveBeenCalled();
    });
});

describe("CreateLeadEventHost — modal compatibility fallback", () => {
    it("opens the Create Lead modal when the BOS session flag is off", () => {
        flagState.enabled = false;
        const el = render(<CreateLeadEventHost />);
        fireOpen({ department_id: "dept-1", work_unit_id: "wu-1" });
        const modal = el.querySelector("[data-create-lead-modal]");
        expect(modal).not.toBeNull();
        expect(modal?.getAttribute("data-dept")).toBe("dept-1");
        expect(modal?.getAttribute("data-surface")).toBe("work_unit");
        expect(startSpy).not.toHaveBeenCalled();
    });
});

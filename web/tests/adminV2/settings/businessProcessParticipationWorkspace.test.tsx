/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/workspace/workspaceDataFetch", () => ({ workspaceDataFetchInit: () => ({}) }));

import BusinessProcessParticipationWorkspace from "@/components/adminV2/settings/businessProcess/BusinessProcessParticipationWorkspace";

const CONFIG = {
    version: 1,
    subject_type: "child",
    context_type: "opportunity",
    inherits_context_stage: true,
    participant_creation: "one_per_child_member",
    available_views: ["family", "child", "candidate"],
};

let container: HTMLElement | null = null;
async function render(node: ReactNode): Promise<HTMLElement> {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(node);
    });
    // flush the mount fetch effect
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
    vi.restoreAllMocks();
});

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            new Response(JSON.stringify({ participation_v1: CONFIG, stages: [{ key: "lead", label: "New Lead" }], is_default: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        ),
    );
});

describe("BusinessProcessParticipationWorkspace — operator concepts only", () => {
    it("renders Identity (locked), Stage Behavior (editable), Creation (locked), Views, Runtime", async () => {
        const el = await render(<BusinessProcessParticipationWorkspace departmentId="dept-1" processId="p1" />);
        // Identity — documents, locked
        expect(el.querySelector('[data-testid="participation-subject"]')?.textContent).toBe("Child");
        expect(el.querySelector('[data-testid="participation-context"]')?.textContent).toBe("Household");
        // Stage behavior — the editable inherit toggle, on
        const toggle = el.querySelector('[data-testid="participation-inherit-stage"]') as HTMLInputElement | null;
        expect(toggle?.checked).toBe(true);
        // Participant creation — locked statement, not a control
        expect(el.querySelector('[data-testid="participation-creation"]')?.textContent).toContain("One participant is created for each child");
        // Available views chips present
        expect(el.querySelector('[data-testid="participation-view-family"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="participation-view-candidate"]')).not.toBeNull();
        // Runtime — plain English, no engine terms
        const runtime = el.querySelector('[data-testid="participation-runtime"]')?.textContent ?? "";
        expect(runtime).toContain("automatically creates one participant for each child");
        expect(runtime).not.toContain("process_instances");
        // NEVER expose engine internals anywhere in the DOM
        expect(el.textContent).not.toContain("process_instances");
        expect(el.textContent).not.toContain("ProcessParticipant");
        expect(el.textContent).not.toContain("opportunity_customer_members");
    });
});

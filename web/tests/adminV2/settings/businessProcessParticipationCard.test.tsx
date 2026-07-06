/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/workspace/workspaceDataFetch", () => ({ workspaceDataFetchInit: () => ({}) }));

import BusinessProcessParticipationCard from "@/components/adminV2/settings/businessProcess/BusinessProcessParticipationCard";

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

describe("BusinessProcessParticipationCard — compact process-definition card", () => {
    it("renders read-only Tracks/Context/Creates facts, the inherit toggle (on), and one runtime note", async () => {
        const el = await render(<BusinessProcessParticipationCard departmentId="dept-1" processId="p1" />);
        // read-only facts
        expect(el.textContent).toContain("Child");
        expect(el.textContent).toContain("Household");
        expect(el.querySelector('[data-testid="participation-creation"]')?.textContent).toContain("One participant per child");
        // the ONE editable control — the inherit toggle, on
        const toggle = el.querySelector('[data-testid="participation-inherit-stage"]') as HTMLInputElement | null;
        expect(toggle?.checked).toBe(true);
        // one runtime note, plain English
        const runtime = el.querySelector('[data-testid="participation-runtime"]')?.textContent ?? "";
        expect(runtime).toContain("keeps each child");
    });

    it("drops the removed surface: no Operational States editor, no editable Available Views", async () => {
        const el = await render(<BusinessProcessParticipationCard departmentId="dept-1" processId="p1" />);
        // Operational States editor is gone
        expect(el.querySelector('[data-testid="participation-state-labels"]')).toBeNull();
        expect(el.textContent).not.toContain("Stage labels");
        // Available Views is no longer an editable control
        expect(el.querySelector('[data-testid="participation-available-views"]')).toBeNull();
        expect(el.querySelector('[data-testid="participation-view-family"]')).toBeNull();
        expect(el.querySelector('[data-testid="participation-view-candidate"]')).toBeNull();
    });

    it("never exposes engine internals in the DOM", async () => {
        const el = await render(<BusinessProcessParticipationCard departmentId="dept-1" processId="p1" />);
        expect(el.textContent).not.toContain("process_instances");
        expect(el.textContent).not.toContain("ProcessParticipant");
        expect(el.textContent).not.toContain("opportunity_customer_members");
    });
});

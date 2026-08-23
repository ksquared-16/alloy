/**
 * @vitest-environment jsdom
 */
/**
 * R14 — the KPI band's assignment metric reads `Tasks assigned`, and still counts what it always did.
 *
 * The label lives inside the component, so this drives the REAL `WorkItemsKpiStrip` with only its two
 * data collaborators stubbed. The corpus deliberately contains another operator's task and unassigned
 * work: the band must count assignment by ANY operator, which is exactly why it cannot be labelled as
 * the current operator's work — and why it is not comparable to the rail's `Assigned to me`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const { openTasks } = vi.hoisted(() => ({ openTasks: vi.fn() }));

vi.mock("@/lib/agent/taskAssist/operationalTasksWorkspaceCache", () => ({
    getCachedWorkspaceOperationalTasks: () => null,
    loadWorkspaceOperationalTasks: async () => ({ tasks: openTasks(), error: null }),
}));
vi.mock("@/lib/agent/taskAssist/taskAssistV11OpportunityApi", () => ({
    fetchOperationalTasksSummary: async () => ({ ok: true }),
    readJson: async () => ({ ok: true, counts: { due_soon: 3, overdue: 4 } }),
}));

const { default: WorkItemsKpiStrip } = await import("@/app/adminV2/tasks/WorkItemsKpiStrip");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string, assignee: string | null, status = "open") => ({
    id,
    title: id,
    status,
    assigned_to_user_id: assignee,
    due_at: "2026-08-24T12:00:00.000Z",
});

let container: HTMLDivElement | null = null;
afterEach(() => {
    container?.remove();
    container = null;
});

async function render() {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<WorkItemsKpiStrip />);
    });
    await act(async () => { await Promise.resolve(); });
    return container;
}

/** Pair each band label with the number rendered beside it. */
function bandPairs(root: HTMLElement): Record<string, string> {
    const leaves = [...root.querySelectorAll("*")].filter(
        (e) => e.children.length === 0 && (e.textContent ?? "").trim(),
    );
    const text = leaves.map((e) => (e.textContent ?? "").trim());
    const out: Record<string, string> = {};
    text.forEach((t, i) => {
        if (/^[A-Za-z]/.test(t) && i > 0 && /^\d+$/.test(text[i - 1]!)) out[t] = text[i - 1]!;
    });
    return out;
}

describe("R14 — KPI band vocabulary and population", () => {
    it("1: the assignment metric reads `Tasks assigned`, not `Assigned` or `All assigned`", async () => {
        openTasks.mockReturnValue([task("a", "user-me"), task("b", "user-other"), task("c", null)]);
        const root = await render();
        const labels = Object.keys(bandPairs(root));
        expect(labels).toContain("Tasks assigned");
        expect(labels).not.toContain("Assigned");
        expect(labels).not.toContain("All assigned");
        expect(labels).not.toContain("Assigned to anyone");
        expect(labels).not.toContain("Mine");
    });

    it("3 + 6: it still counts open tasks assigned to ANY operator, from operational tasks only", async () => {
        openTasks.mockReturnValue([
            task("mine", "user-me"),
            task("theirs", "user-other"),
            task("unassigned", null),
            task("done", "user-me", "completed"),
        ]);
        const root = await render();
        const pairs = bandPairs(root);
        // 2 open assigned (mine + theirs); the completed one and the unassigned one are excluded.
        expect(pairs["Tasks assigned"]).toBe("2");
        // Unassigned open work remains the band's `Waiting` bucket — unchanged by this item.
        expect(pairs["Waiting"]).toBe("1");
        // Summary-sourced metrics are untouched.
        expect(pairs["Due Soon"]).toBe("3");
        expect(pairs["Overdue"]).toBe("4");
    });

    it("10: an all-unassigned corpus counts zero assigned", async () => {
        openTasks.mockReturnValue([task("u1", null), task("u2", null)]);
        const root = await render();
        expect(bandPairs(root)["Tasks assigned"]).toBe("0");
    });

    it("12: the band exposes its meaning through visible text, and stays non-interactive", async () => {
        openTasks.mockReturnValue([task("a", "user-me")]);
        const root = await render();
        expect(root.textContent).toContain("Tasks assigned");
        // The KPI is a read-only band: renaming it must not have made it a control.
        expect(root.querySelectorAll("button, a, [role='button'], [role='tab']").length).toBe(0);
    });
});

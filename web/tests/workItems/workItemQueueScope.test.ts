import { describe, expect, it } from "vitest";

import { deriveWorkItemsProcessGroups } from "@/lib/agent/taskAssist/myTasksProcessGroups";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    applyWorkItemQueueScope,
    countTasksForFolder,
    countTasksForSource,
    countTasksForView,
    filterTasksByView,
    resolveServerFilterForView,
    WORK_ITEM_PRIMARY_VIEW_KEYS,
    WORK_ITEM_VIEW_DEFS,
    type WorkItemQueueScope,
} from "@/lib/workItems/workItemQueueScope";

const DEPT_ID = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<MyTasksTaskRow>): MyTasksTaskRow {
    return {
        id: overrides.id ?? "task-1",
        title: overrides.title ?? "Follow up",
        description: overrides.description ?? null,
        due_at: overrides.due_at ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        status: overrides.status ?? "open",
        source: overrides.source ?? "manual",
        entity_id: overrides.entity_id ?? null,
        entity_type: overrides.entity_type ?? null,
        assigned_to_user_id: overrides.assigned_to_user_id ?? null,
        created_at: overrides.created_at ?? "2026-07-10T18:00:00.000Z",
        department_id: overrides.department_id,
        lifecycle_stage_key: overrides.lifecycle_stage_key,
        lifecycle_provenance: overrides.lifecycle_provenance,
    };
}

describe("workItemQueueScope", () => {
    const now = Date.now();
    const tasks: MyTasksTaskRow[] = [
        row({ id: "mine-manual", assigned_to_user_id: "u1", source: "manual", due_at: new Date(now + 2 * 60 * 60 * 1000).toISOString() }),
        row({ id: "mine-bos", assigned_to_user_id: "u1", source: "task_assist", due_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
        row({ id: "unassigned", assigned_to_user_id: null, source: "manual", due_at: new Date(now + 6 * 60 * 60 * 1000).toISOString() }),
        row({ id: "bp-row", assigned_to_user_id: "u2", source: "manual", department_id: DEPT_ID, lifecycle_stage_key: "tour_scheduled" }),
        row({ id: "done", status: "completed", assigned_to_user_id: "u1", source: "manual" }),
    ];

    const groups = deriveWorkItemsProcessGroups(tasks, { fallbackProcessLabel: "Enrollment" });

    it("applies folder + view + source filters", () => {
        const scope: WorkItemQueueScope = {
            folder: "all_work",
            view: "mine",
            source: "manual",
            sort: "title",
        };

        // u1 + manual + not the BOS row and not the unassigned one.
        const rows = applyWorkItemQueueScope(tasks, scope, groups, "u1");
        expect(rows.map((r) => r.id).sort()).toEqual(["done", "mine-manual"]);
    });

    /**
     * The process lens is a real axis: narrowing to Enrollment must drop work that carries no
     * Business Process dimensions, not merely reorder it.
     */
    it("the process lens narrows to that process's work", () => {
        const scope: WorkItemQueueScope = {
            folder: "enrollment",
            view: "completed",
            source: "all",
            sort: "title",
        };
        const rows = applyWorkItemQueueScope(tasks, scope, groups, "u1");
        expect(rows.map((r) => r.id)).not.toContain("mine-manual");
    });

    it("returns deterministic counts for process lenses, views, and sources", () => {
        // "inbox" is gone: it was the "Assigned to me" view under a second name, and "projects"
        // matched no process and returned an empty list on every render.
        expect(countTasksForFolder(tasks, "all_work", groups)).toBe(4);

        expect(countTasksForView(tasks, "due_soon")).toBeGreaterThanOrEqual(1);
        expect(countTasksForView(tasks, "completed")).toBe(1);

        expect(countTasksForSource(tasks, "manual")).toBe(3);
        expect(countTasksForSource(tasks, "bos")).toBe(1);
        expect(countTasksForSource(tasks, "recurring")).toBe(0);
    });
});

describe("resolveWorkItemQueueEmptyState", () => {
    it("explains Processing + Mine intersection emptiness", async () => {
        const { resolveWorkItemQueueEmptyState } = await import("@/lib/workItems/workItemQueueScope");
        const state = resolveWorkItemQueueEmptyState({
            folder: "all_work",
            view: "mine",
            source: "processing",
            sort: "due_date",
        });
        expect(state.message).toBe("No Processing work is assigned to you.");
        expect(state.helper).toContain("Unassigned");
    });

    it("explains source-only emptiness without blaming Mine", async () => {
        const { resolveWorkItemQueueEmptyState } = await import("@/lib/workItems/workItemQueueScope");
        const state = resolveWorkItemQueueEmptyState({
            folder: "all_work",
            view: "unassigned",
            source: "processing",
            sort: "due_date",
        });
        expect(state.message).toBe("No open work from Processing.");
    });

    it("keeps Mine-only empty copy when no source filter is active", async () => {
        const { resolveWorkItemQueueEmptyState } = await import("@/lib/workItems/workItemQueueScope");
        const state = resolveWorkItemQueueEmptyState({
            folder: "all_work",
            view: "mine",
            source: "all",
            sort: "due_date",
        });
        expect(state.message).toBe("No work items assigned to you");
    });
});

describe("Waiting is not offered as navigation", () => {
    /**
     * The lens is guaranteed empty — nothing in the model carries a waiting state — so offering it
     * taught operators that nothing is ever waiting. The KEY and its filter branches stay for
     * compatibility; only the affordance is gone.
     */
    it("is absent from the selectable views", () => {
        expect(WORK_ITEM_VIEW_DEFS.map((d) => d.key)).not.toContain("waiting");
        expect(WORK_ITEM_PRIMARY_VIEW_KEYS).not.toContain("waiting");
    });

    it("still resolves rather than crashing if a stored scope names it", () => {
        const anyOpenWork = [row({ id: "w1", assigned_to_user_id: "u1", source: "manual" })];
        expect(filterTasksByView(anyOpenWork, "waiting", "u1")).toEqual([]);
        expect(resolveServerFilterForView("waiting")).toBe("open");
    });
});

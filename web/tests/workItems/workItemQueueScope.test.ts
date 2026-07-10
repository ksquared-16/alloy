import { describe, expect, it } from "vitest";

import { deriveWorkItemsProcessGroups } from "@/lib/agent/taskAssist/myTasksProcessGroups";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    applyWorkItemQueueScope,
    countTasksForFolder,
    countTasksForSource,
    countTasksForView,
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
            folder: "inbox",
            view: "due_soon",
            source: "manual",
            sort: "title",
        };

        const rows = applyWorkItemQueueScope(tasks, scope, groups, "u1");
        expect(rows.map((r) => r.id)).toEqual(["mine-manual"]);
    });

    it("returns deterministic counts for folders, views, and sources", () => {
        expect(countTasksForFolder(tasks, "inbox", groups, "u1")).toBe(2);
        expect(countTasksForFolder(tasks, "all_work", groups, "u1")).toBe(4);

        expect(countTasksForView(tasks, "due_soon")).toBeGreaterThanOrEqual(1);
        expect(countTasksForView(tasks, "completed")).toBe(1);

        expect(countTasksForSource(tasks, "manual")).toBe(3);
        expect(countTasksForSource(tasks, "bos")).toBe(1);
        expect(countTasksForSource(tasks, "recurring")).toBe(0);
    });
});

import { formatOperationalTaskDueDisplay } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";

export type WorkItemActivityEntry = {
    id: string;
    label: string;
    detail?: string;
    at?: string;
    kind: "created" | "assignment" | "due" | "status" | "bp" | "note" | "processing" | "gap";
};

export function projectWorkItemActivity(task: MyTasksTaskRow): WorkItemActivityEntry[] {
    const entries: WorkItemActivityEntry[] = [];

    if (task.created_at?.trim()) {
        entries.push({
            id: "created",
            kind: "created",
            label: "Work item created",
            at: task.created_at,
        });
    }

    if (task.assigned_to_user_id?.trim()) {
        entries.push({
            id: "assignment",
            kind: "assignment",
            label: "Assigned",
            detail: task.assignee_label?.trim() || task.assigned_to_user_id,
        });
    }

    if (task.due_at?.trim()) {
        entries.push({
            id: "due",
            kind: "due",
            label: "Due",
            detail: formatOperationalTaskDueDisplay(task.due_at),
            at: task.due_at,
        });
    }

    if (task.status?.trim()) {
        entries.push({
            id: "status",
            kind: "status",
            label: "Status",
            detail: task.status,
        });
    }

    if (isBusinessProcessStageWorkTaskRow(task)) {
        entries.push({
            id: "bp",
            kind: "bp",
            label: "Business Process work",
            detail: [task.department_id, task.lifecycle_stage_key].filter(Boolean).join(" · ") || undefined,
        });
    }

    if (task.description?.trim()) {
        entries.push({
            id: "note",
            kind: "note",
            label: "Notes",
            detail: task.description.trim(),
        });
    }

    if (task.processing_case_id?.trim()) {
        entries.push({
            id: "processing",
            kind: "processing",
            label: "Processing case linked",
            detail: task.processing_lane?.trim() || "needs_review",
        });
    }

    if (entries.length === 0) {
        entries.push({
            id: "gap",
            kind: "gap",
            label: "No activity history available yet",
            detail: "Full audit timeline projection is deferred until unified operational events are exposed.",
        });
    }

    return entries;
}

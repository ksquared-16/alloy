/**
 * Work Items V3 — queue scope (folders, views, sources, sort).
 * Client-side lenses over fetched task rows; no schema changes in Slice 1.
 */

import {
    filterTasksByProcessGroup,
    WORK_ITEMS_ALL_GROUP_KEY,
    type WorkItemsProcessGroup,
} from "@/lib/agent/taskAssist/myTasksProcessGroups";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export type WorkItemFolderKey =
    | "inbox"
    | "all_work"
    | "enrollment"
    | "compliance"
    | "projects";

export type WorkItemViewKey =
    | "mine"
    | "unassigned"
    | "waiting"
    | "due_today"
    | "due_soon"
    | "overdue"
    | "completed";

export type WorkItemSourceKey =
    | "all"
    | "business_process"
    | "manual"
    | "bos"
    | "recurring"
    | "processing"
    | "communications";

export type WorkItemSortKey = "due_date" | "title" | "recently_updated";

export type WorkItemQueueScope = {
    folder: WorkItemFolderKey;
    view: WorkItemViewKey;
    source: WorkItemSourceKey;
    sort: WorkItemSortKey;
};

export const DEFAULT_WORK_ITEM_QUEUE_SCOPE: WorkItemQueueScope = {
    folder: "all_work",
    view: "mine",
    source: "all",
    sort: "due_date",
};

export const WORK_ITEM_FOLDER_DEFS: { key: WorkItemFolderKey; label: string }[] = [
    { key: "inbox", label: "Inbox" },
    { key: "all_work", label: "All Work" },
    { key: "enrollment", label: "Enrollment" },
    { key: "compliance", label: "Compliance" },
    { key: "projects", label: "Projects" },
];

export const WORK_ITEM_VIEW_DEFS: { key: WorkItemViewKey; label: string }[] = [
    { key: "mine", label: "Mine" },
    { key: "unassigned", label: "Unassigned" },
    { key: "waiting", label: "Waiting" },
    { key: "due_today", label: "Due Today" },
    { key: "due_soon", label: "Due Soon" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
];

export type WorkItemSourceDef = {
    key: WorkItemSourceKey;
    label: string;
    available: boolean;
    deferredReason?: string;
};

export const WORK_ITEM_SOURCE_DEFS: WorkItemSourceDef[] = [
    { key: "business_process", label: "Business Processes", available: true },
    { key: "manual", label: "Manual", available: true },
    { key: "bos", label: "BOS", available: true },
    {
        key: "recurring",
        label: "Recurring",
        available: false,
        deferredReason: "Recurring schedules ship in a later slice",
    },
    {
        key: "processing",
        label: "Processing",
        available: true,
    },
    {
        key: "communications",
        label: "Communications",
        available: false,
        deferredReason: "Communications-sourced work arrives in a later slice",
    },
];

export function resolveServerFilterForView(view: WorkItemViewKey): OperationalTaskWorkspaceFilter {
    switch (view) {
        case "mine":
            return "assigned_to_me";
        case "unassigned":
            return "unassigned";
        case "due_today":
            return "due_today";
        case "overdue":
            return "overdue";
        case "completed":
            return "completed";
        case "waiting":
        case "due_soon":
        default:
            return "open";
    }
}

function isOpenTask(task: MyTasksTaskRow): boolean {
    const st = (task.status ?? "").trim().toLowerCase();
    return st !== "completed" && st !== "canceled" && st !== "cancelled";
}

function folderProcessGroupKey(folder: WorkItemFolderKey, groups: WorkItemsProcessGroup[]): string {
    if (folder === "all_work" || folder === "inbox") return WORK_ITEMS_ALL_GROUP_KEY;
    const needle =
        folder === "enrollment" ? "enrollment"
        : folder === "compliance" ? "compliance"
        : folder === "projects" ? "project"
        : null;
    if (!needle) return WORK_ITEMS_ALL_GROUP_KEY;
    const match = groups.find((g) => !g.isGeneral && g.label.toLowerCase().includes(needle));
    return match?.key ?? `__missing_${folder}`;
}

export function filterTasksByFolder(
    tasks: MyTasksTaskRow[],
    folder: WorkItemFolderKey,
    groups: WorkItemsProcessGroup[],
    currentUserId: string | null
): MyTasksTaskRow[] {
    if (folder === "inbox") {
        const uid = currentUserId?.trim();
        if (!uid) return [];
        return tasks.filter((t) => isOpenTask(t) && t.assigned_to_user_id?.trim() === uid);
    }
    if (folder === "projects") return [];
    const groupKey = folderProcessGroupKey(folder, groups);
    if (groupKey.startsWith("__missing_")) return [];
    if (groupKey === WORK_ITEMS_ALL_GROUP_KEY) return tasks;
    return filterTasksByProcessGroup(tasks, groupKey);
}

export function filterTasksByView(tasks: MyTasksTaskRow[], view: WorkItemViewKey): MyTasksTaskRow[] {
    switch (view) {
        case "due_soon":
            return tasks.filter(
                (t) =>
                    isOpenTask(t) &&
                    operationalTaskDueUrgency({ status: t.status, dueAtIso: t.due_at }) === "due_soon"
            );
        case "waiting":
            return [];
        default:
            return tasks;
    }
}

export function taskMatchesSource(task: MyTasksTaskRow, source: WorkItemSourceKey): boolean {
    if (source === "all") return true;
    const src = (task.source ?? "").trim().toLowerCase();
    if (source === "manual") return src === "manual" && !task.processing_case_id?.trim();
    if (source === "bos") return src === "task_assist" || src === "bos_work_item";
    if (source === "business_process") {
        return Boolean(task.department_id?.trim() || task.lifecycle_provenance?.trim());
    }
    if (source === "processing") {
        return Boolean(task.processing_case_id?.trim()) || src === "processing";
    }
    return false;
}

export function filterTasksBySource(tasks: MyTasksTaskRow[], source: WorkItemSourceKey): MyTasksTaskRow[] {
    if (source === "all") return tasks;
    return tasks.filter((t) => taskMatchesSource(t, source));
}

export function sortWorkItemTasks(tasks: MyTasksTaskRow[], sort: WorkItemSortKey): MyTasksTaskRow[] {
    const copy = [...tasks];
    copy.sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        if (sort === "recently_updated") return Date.parse(b.created_at) - Date.parse(a.created_at);
        const dueA = Date.parse(a.due_at);
        const dueB = Date.parse(b.due_at);
        if (Number.isNaN(dueA) && Number.isNaN(dueB)) return 0;
        if (Number.isNaN(dueA)) return 1;
        if (Number.isNaN(dueB)) return -1;
        return dueA - dueB;
    });
    return copy;
}

export function applyWorkItemQueueScope(
    tasks: MyTasksTaskRow[],
    scope: WorkItemQueueScope,
    groups: WorkItemsProcessGroup[],
    currentUserId: string | null
): MyTasksTaskRow[] {
    let rows = filterTasksByFolder(tasks, scope.folder, groups, currentUserId);
    rows = filterTasksByView(rows, scope.view);
    rows = filterTasksBySource(rows, scope.source);
    return sortWorkItemTasks(rows, scope.sort);
}

export function countTasksForFolder(
    tasks: MyTasksTaskRow[],
    folder: WorkItemFolderKey,
    groups: WorkItemsProcessGroup[],
    currentUserId: string | null
): number {
    return filterTasksByFolder(tasks, folder, groups, currentUserId).filter(isOpenTask).length;
}

export function countTasksForView(tasks: MyTasksTaskRow[], view: WorkItemViewKey): number {
    const scoped = filterTasksByView(tasks, view);
    return scoped.filter((t) => (view === "completed" ? !isOpenTask(t) : isOpenTask(t))).length;
}

export function countTasksForSource(tasks: MyTasksTaskRow[], source: WorkItemSourceKey): number {
    if (!WORK_ITEM_SOURCE_DEFS.find((d) => d.key === source)?.available) return 0;
    return filterTasksBySource(tasks, source).filter(isOpenTask).length;
}

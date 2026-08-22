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
import { isCommunicationsProjectedWorkItem } from "@/lib/workItems/mapCommunicationThreadToWorkItemRow";
import { isProcessingProjectedWorkItem } from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
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
        available: true,
    },
];


/** Prefer explicit navigation filter (Overview deep-links) over view-derived server filter. */
export function resolveWorkspaceTasksFetchFilter(
    view: WorkItemViewKey,
    navigationFilter?: OperationalTaskWorkspaceFilter | null,
): OperationalTaskWorkspaceFilter {
    const nav = navigationFilter?.trim();
    if (nav) return nav as OperationalTaskWorkspaceFilter;
    return resolveServerFilterForView(view);
}

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

export function filterTasksByView(
    tasks: MyTasksTaskRow[],
    view: WorkItemViewKey,
    currentUserId?: string | null,
): MyTasksTaskRow[] {
    const uid = currentUserId?.trim() || "";
    switch (view) {
        case "mine":
            return uid ? tasks.filter((t) => t.assigned_to_user_id?.trim() === uid) : [];
        case "unassigned":
            return tasks.filter((t) => !t.assigned_to_user_id?.trim());
        case "due_soon":
            return tasks.filter(
                (t) =>
                    hasAuthoritativeDueCommitment(t) &&
                    isOpenTask(t) &&
                    operationalTaskDueUrgency({ status: t.status, dueAtIso: t.due_at }) === "due_soon"
            );
        case "waiting":
            return [];
        case "due_today":
        case "overdue":
            return tasks.filter(hasAuthoritativeDueCommitment);
        default:
            return tasks;
    }
}

/**
 * ── ONLY A SOURCE THAT OWNS A DUE COMMITMENT MAY CONTRIBUTE TO A DUE METRIC ──
 *
 * `due_at` is not the same fact across the federated queue. `operational_tasks` stores a real
 * operator commitment. The two projections DERIVE one:
 *
 *   Communications → `due_at` is the thread's LAST ACTIVITY time, so every comms work item is
 *                    "overdue" the instant it exists.
 *   Processing     → `due_at` is `statusChangedAt + 1 day @ 17:00`, so every processing case is
 *                    "overdue" a day after it appears, whatever anyone committed to.
 *
 * Communications was already excluded here; Processing was not, and that asymmetry is the whole of
 * the reported disagreement. On Firefly the unified queue showed **Overdue 9** — one real overdue
 * task plus eight processing cases older than a day — beside a KPI strip reading **Overdue 1**. The
 * KPI was the honest number; the 9 counted a commitment nobody had made.
 *
 * So a derived due date contributes UNSUPPORTED to due metrics rather than a plausible-looking
 * number. The rows stay in the queue and in Open/All Work; they simply stop claiming to be late.
 */
export function hasAuthoritativeDueCommitment(task: MyTasksTaskRow): boolean {
    return !isCommunicationsProjectedWorkItem(task) && !isProcessingProjectedWorkItem(task);
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
    if (source === "communications") {
        return Boolean(task.communication_thread_id?.trim()) || src === "communications";
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
    rows = filterTasksByView(rows, scope.view, currentUserId);
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

export function countTasksForView(
    tasks: MyTasksTaskRow[],
    view: WorkItemViewKey,
    currentUserId?: string | null,
): number {
    const scoped = filterTasksByView(tasks, view, currentUserId);
    return scoped.filter((t) => (view === "completed" ? !isOpenTask(t) : isOpenTask(t))).length;
}

export function countTasksForSource(tasks: MyTasksTaskRow[], source: WorkItemSourceKey): number {
    if (!WORK_ITEM_SOURCE_DEFS.find((d) => d.key === source)?.available) return 0;
    return filterTasksBySource(tasks, source).filter(isOpenTask).length;
}

export type WorkItemQueueEmptyState = {
    message: string;
    helper: string;
};

function sourceLabel(source: WorkItemSourceKey): string {
    return WORK_ITEM_SOURCE_DEFS.find((d) => d.key === source)?.label ?? "Selected source";
}

/** Truthful empty copy for the active folder + view + source intersection. */
export function resolveWorkItemQueueEmptyState(
    scope: WorkItemQueueScope,
    options?: {
        hasSearch?: boolean;
        hasSiteFilter?: boolean;
        opportunityEntitySingular?: string;
    },
): WorkItemQueueEmptyState {
    if (options?.hasSearch) {
        return {
            message: "No work items match your search.",
            helper: "Try a different name, household, or child.",
        };
    }
    if (options?.hasSiteFilter) {
        return {
            message: "No work items for this site.",
            helper: "Choose another site or clear the site filter.",
        };
    }

    const recordSingular = (options?.opportunityEntitySingular ?? "record").toLowerCase();
    const createHelper = `Create a general work item or link one to a ${recordSingular}.`;

    const source = scope.source;
    const view = scope.view;
    const sourceActive = source !== "all";
    const sourceName = sourceLabel(source);

    if (sourceActive && view === "mine") {
        if (source === "processing") {
            return {
                message: "No Processing work is assigned to you.",
                helper: "Processing projections stay unassigned until an operator claims them. Try Unassigned or clear the Mine view.",
            };
        }
        if (source === "communications") {
            return {
                message: "No Communications work is assigned to you.",
                helper: "Try Unassigned or clear the Mine view to see all Needs Reply threads.",
            };
        }
        if (source === "business_process") {
            return {
                message: "No Business Process work matches Mine.",
                helper: "Try Unassigned or clear the view filter to see all Business Process work.",
            };
        }
        return {
            message: `No ${sourceName} work matches Mine.`,
            helper: "Try another view or clear the active filters.",
        };
    }

    if (sourceActive) {
        return {
            message: `No open work from ${sourceName}.`,
            helper: "Try another source or clear the source filter.",
        };
    }

    switch (view) {
        case "due_today":
            return { message: "No work items due today", helper: createHelper, };
        case "overdue":
            return { message: "No overdue work items", helper: createHelper, };
        case "mine":
            return { message: "No work items assigned to you", helper: createHelper, };
        case "unassigned":
            return { message: "No unassigned work items", helper: createHelper, };
        case "completed":
            return { message: "No completed or dismissed work items", helper: "Completed work will appear here after you finish it." };
        case "waiting":
            return { message: "No waiting work items", helper: "Waiting work will appear when that semantics ship." };
        case "due_soon":
            return { message: "No work items due soon", helper: createHelper, };
        default:
            return { message: "No open work items", helper: createHelper, };
    }
}


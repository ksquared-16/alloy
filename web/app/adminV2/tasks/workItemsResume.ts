/**
 * Work Items' declaration of its own stable navigation position.
 *
 * Its position has TWO owners — the modal owns the work view, the panel owns the queue scope — so
 * both write their own keys into one merged position rather than each keeping a private store.
 * The queue scope is already four flat string keys (folder, view, source, sort), which is exactly
 * the "stable filter / stable lane" this contract is for.
 *
 * A selected task, an open editor, a reschedule popover and an outcome dialog are all transient and
 * have no representation here.
 */
import {
    DEFAULT_WORK_ITEM_QUEUE_SCOPE,
    WORK_ITEM_FOLDER_DEFS,
    WORK_ITEM_SOURCE_DEFS,
    WORK_ITEM_VIEW_DEFS,
    type WorkItemQueueScope,
} from "@/lib/workItems/workItemQueueScope";
import type { StableWorkspacePosition } from "@/lib/runtime/workspaceResume";

export const WORK_ITEMS_WORKSPACE_KEY = "work-items";

export const WORK_ITEMS_DEFAULT_POSITION = {
    workView: "overview",
    scopeFolder: DEFAULT_WORK_ITEM_QUEUE_SCOPE.folder,
    scopeView: DEFAULT_WORK_ITEM_QUEUE_SCOPE.view,
    scopeSource: DEFAULT_WORK_ITEM_QUEUE_SCOPE.source,
    scopeSort: DEFAULT_WORK_ITEM_QUEUE_SCOPE.sort,
} satisfies StableWorkspacePosition;

// Derived from the canonical definitions, never hand-listed — a new folder/view/source must not
// have to be remembered here to remain resumable.
const FOLDERS = new Set(WORK_ITEM_FOLDER_DEFS.map((f) => f.key as string));
const VIEWS = new Set(WORK_ITEM_VIEW_DEFS.map((v) => v.key as string));
const SOURCES = new Set(WORK_ITEM_SOURCE_DEFS.map((v) => v.key as string));
const SORTS = new Set(["due_date", "title", "recently_updated"]);

export function isValidWorkItemsPosition(position: StableWorkspacePosition): boolean {
    if (position.workView !== "overview" && position.workView !== "queue") return false;
    if (!FOLDERS.has(position.scopeFolder)) return false;
    if (!VIEWS.has(position.scopeView)) return false;
    if (!SOURCES.has(position.scopeSource)) return false;
    if (!SORTS.has(position.scopeSort)) return false;
    return true;
}

/** The scope a resumed Work Items queue should open with. */
export function scopeFromPosition(position: StableWorkspacePosition): WorkItemQueueScope {
    return {
        folder: position.scopeFolder,
        view: position.scopeView,
        source: position.scopeSource,
        sort: position.scopeSort,
    } as WorkItemQueueScope;
}

export function positionFromScope(scope: WorkItemQueueScope): StableWorkspacePosition {
    return {
        scopeFolder: scope.folder,
        scopeView: scope.view,
        scopeSource: scope.source,
        scopeSort: scope.sort,
    };
}

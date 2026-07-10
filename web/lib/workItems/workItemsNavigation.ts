/**
 * Cross-navigation between Current Work (record-scoped) and Work Items (org queue).
 */

import { openWorkspaceModal } from "@/lib/adminV2/workspaceModalCoordinator";
import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export const ADMIN_V2_OPEN_WORK_ITEMS_TASK = "adminv2:open-work-items-task" as const;

export const ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK = "adminv2:opportunity-focus-current-work" as const;

export type OpenWorkItemsTaskDetail = {
    task_id: string;
    opportunity_id?: string | null;
    filter?: OperationalTaskWorkspaceFilter;
};

export type OpportunityFocusCurrentWorkDetail = {
    opportunity_id: string;
    task_id?: string | null;
};

export function dispatchOpenWorkItemsTask(detail: OpenWorkItemsTaskDetail): void {
    if (typeof window === "undefined") return;
    openWorkspaceModal("tasks");
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_WORK_ITEMS_TASK, { detail }));
}

export function dispatchFocusCurrentWork(detail: OpportunityFocusCurrentWorkDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK, { detail }));
}

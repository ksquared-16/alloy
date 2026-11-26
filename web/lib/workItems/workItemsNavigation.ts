/**
 * Cross-navigation between Current Work (record-scoped) and Work Items (org queue).
 */

import { openWorkspaceModal } from "@/lib/adminV2/workspaceModalCoordinator";
import { dispatchAdminV2OpenInboxModal, dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";
import { prefetchCommandCenterConversations, setCommandCenterPendingSelection } from "@/lib/communications/v2/commandCenterPrefetchCache";
import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { WorkItemSourceKey, WorkItemViewKey } from "@/lib/workItems/workItemQueueScope";

export const ADMIN_V2_OPEN_WORK_ITEMS_TASK = "adminv2:open-work-items-task" as const;

export const ADMIN_V2_OPEN_PROCESSING_CASE = "adminv2:open-processing-case" as const;

export const ADMIN_V2_OPEN_COMMUNICATIONS_THREAD = "adminv2:open-communications-thread" as const;

export type OpenCommunicationsThreadDetail = {
    thread_id: string;
};

export type OpenProcessingCaseDetail = {
    case_id: string;
};

export const ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK = "adminv2:opportunity-focus-current-work" as const;

export type OpenWorkItemsTaskDetail = {
    task_id: string;
    opportunity_id?: string | null;
    filter?: OperationalTaskWorkspaceFilter;
    source?: WorkItemSourceKey;
    view?: WorkItemViewKey;
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


export function dispatchOpenCommunicationsThread(threadId: string): void {
    if (typeof window === "undefined") return;
    const id = threadId.trim();
    if (!id) return;
    void prefetchCommandCenterConversations({ force: true });
    dispatchAdminV2OpenInboxModal();
    setCommandCenterPendingSelection(id);
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_COMMUNICATIONS_THREAD, { detail: { thread_id: id } }));
}

export function dispatchOpenProcessingCase(caseId: string): void {
    if (typeof window === "undefined") return;
    const id = caseId.trim();
    if (!id) return;
    /*
     * The case travels as the modal's OPEN INTENT, not only as a follow-up event.
     *
     * ProcessingModal registers its `adminv2:open-processing-case` listener behind `if (!open)
     * return`, so when the modal is still closed the listener does not exist yet — and this
     * function dispatches that event synchronously, in the same tick as the open request. The
     * event was therefore delivered to nobody and the operator landed on the Mailroom overview
     * instead of the case they clicked. Intent has no such race: TopNavBar holds it in state and
     * ProcessingModal applies it on mount, which is the same shape Communications already relies
     * on via `setCommandCenterPendingSelection`.
     *
     * The event is still dispatched for the case where the modal is ALREADY open.
     */
    dispatchAdminV2OpenProcessingModal({ mode: "work", caseId: id });
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_PROCESSING_CASE, { detail: { case_id: id } }));
}

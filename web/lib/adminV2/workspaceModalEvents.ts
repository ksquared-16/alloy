import {
    closeAllWorkspaceModals,
    closeWorkspaceModal,
    openWorkspaceModal,
    type AdminV2WorkspaceModalKey,
} from "@/lib/adminV2/workspaceModalCoordinator";

export const ADMIN_V2_OPEN_TASKS_PANEL = "adminv2:open-tasks-panel";
export const ADMIN_V2_OPEN_INBOX_MODAL = "adminv2:open-inbox-modal";
export const ADMIN_V2_CLOSE_WORKSPACE_MODALS = "adminv2:close-workspace-modals";

export {
    closeAllWorkspaceModals,
    closeWorkspaceModal,
    getAdminV2WorkspaceModal,
    getAdminV2WorkspaceModalSnapshot,
    openWorkspaceModal,
    subscribeAdminV2WorkspaceModal,
    type AdminV2WorkspaceModalKey,
} from "@/lib/adminV2/workspaceModalCoordinator";

export function dispatchAdminV2OpenTasksPanel(): void {
    openWorkspaceModal("tasks");
}

export function dispatchAdminV2OpenInboxModal(): void {
    openWorkspaceModal("inbox");
}

export function dispatchAdminV2CloseWorkspaceModals(): void {
    closeAllWorkspaceModals();
}

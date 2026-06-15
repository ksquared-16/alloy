export const ADMIN_V2_OPEN_TASKS_PANEL = "adminv2:open-tasks-panel";
export const ADMIN_V2_OPEN_INBOX_MODAL = "adminv2:open-inbox-modal";
export const ADMIN_V2_OPEN_PROCESSING_MODAL = "adminv2:open-processing-modal";

export function dispatchAdminV2OpenTasksPanel(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_TASKS_PANEL));
}

export function dispatchAdminV2OpenProcessingModal(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_PROCESSING_MODAL));
}

export function dispatchAdminV2OpenInboxModal(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_INBOX_MODAL));
}

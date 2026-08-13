import {
    closeAllWorkspaceModals,
    closeWorkspaceModal,
    openWorkspaceModal,
    type AdminV2WorkspaceModalKey,
} from "@/lib/adminV2/workspaceModalCoordinator";

export const ADMIN_V2_OPEN_TASKS_PANEL = "adminv2:open-tasks-panel";
export const ADMIN_V2_OPEN_INBOX_MODAL = "adminv2:open-inbox-modal";
export const ADMIN_V2_OPEN_ANALYTICS_MODAL = "adminv2:open-analytics-modal";
export const ADMIN_V2_OPEN_PROCESSING_MODAL = "adminv2:open-processing-modal";
export const ADMIN_V2_CLOSE_WORKSPACE_MODALS = "adminv2:close-workspace-modals";

/** Digital Mailroom Studio tabs a deep-link may target (mirror of `ProcessingStudioTab`). */
export type ProcessingStudioTabKey = "forms" | "packets" | "fields" | "branding";

/**
 * Deep-link intent carried into the Digital Mailroom when opening the Processing modal.
 * Preserves fidelity for former `/admin/forms…` links: a link that identified a specific
 * form/packet/case opens the Mailroom AT that resource rather than a generic landing.
 */
export type ProcessingModalIntent =
    | {
          mode: "studio";
          studioTab?: ProcessingStudioTabKey;
          formId?: string | null;
          formName?: string | null;
      }
    | {
          mode: "work";
          workView?: "overview" | "work";
          caseId?: string | null;
      };

/** Detail payload on the `adminv2:open-processing-modal` CustomEvent. */
export type OpenProcessingModalDetail = { intent?: ProcessingModalIntent };

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

export function dispatchAdminV2OpenProcessingModal(intent?: ProcessingModalIntent): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent<OpenProcessingModalDetail>(ADMIN_V2_OPEN_PROCESSING_MODAL, {
                detail: intent ? { intent } : {},
            }),
        );
    }
    openWorkspaceModal("processing");
}

export type OpenSchedulingModalDetail = {
    mode?: "work" | "studio";
    /**
     * Mirrors `SchedulingWorkView`. `daily_roster` was missing, so no caller could
     * deep-link the day roster type-safely even though the workspace has routed to
     * it since it shipped.
     */
    workView?: "overview" | "roster" | "daily_roster" | "attendance";
    studioView?: "types" | "patterns" | "templates" | "validation";
};

/** Session key for deep-linking Assignments Workspace (Focus Panel → Studio Types, etc.). */
export const ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY = "alloy.assignments.workspace.deeplink";

export function dispatchAdminV2OpenSchedulingModal(detail?: OpenSchedulingModalDetail): void {
    if (typeof window !== "undefined" && detail) {
        try {
            sessionStorage.setItem(ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY, JSON.stringify(detail));
        } catch {
            /* ignore quota */
        }
        window.dispatchEvent(new CustomEvent("adminv2:open-scheduling-modal", { detail }));
    }
    openWorkspaceModal("scheduling");
}

export function dispatchAdminV2OpenInboxModal(): void {
    openWorkspaceModal("inbox");
}

export function dispatchAdminV2OpenAnalyticsModal(): void {
    openWorkspaceModal("analytics");
}

export function dispatchAdminV2CloseWorkspaceModals(): void {
    closeAllWorkspaceModals();
}

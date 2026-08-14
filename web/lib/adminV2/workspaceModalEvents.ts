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
     * `roster`, `daily_roster` and `attendance` are LEGACY here. Those surfaces
     * moved to the Roster workspace; `dispatchAdminV2OpenSchedulingModal` forwards
     * them rather than opening Assignments on a tab that no longer exists.
     */
    workView?: "overview" | "assignments" | "roster" | "daily_roster" | "attendance";
    studioView?: "types" | "patterns" | "templates" | "validation";
    /**
     * Site the caller was looking at. A cross-workspace handoff that omits it
     * lands on Assignments' own default site, so `Manage →` on a Riverside staff
     * member opened the Lakeside ledger and the subject was simply not there.
     */
    siteLocationId?: string | null;
    /** Open Assignments focused on one subject — the Roster `Manage →` handoff. */
    focusSubject?: {
        personId?: string | null;
        customerMemberId?: string | null;
        enrollmentAgreementId?: string | null;
    } | null;
};

/** Session key for deep-linking Assignments Workspace (Focus Panel → Studio Types, etc.). */
export const ASSIGNMENTS_WORKSPACE_DEEPLINK_KEY = "alloy.assignments.workspace.deeplink";

/** Session key for deep-linking the Roster workspace (range, lens, room, section). */
export const ROSTER_WORKSPACE_DEEPLINK_KEY = "alloy.roster.workspace.deeplink";

export type OpenRosterModalDetail = {
    /** Roster is the expectation mode; Attendance is the actuality mode. */
    section?: "roster" | "attendance";
    range?: "day" | "week";
    lens?: "rooms" | "staff";
    /** Site + room + date carried across a handoff so context is never reset. */
    siteLocationId?: string | null;
    roomLocationId?: string | null;
    date?: string | null;
    /** Overview attention cards route into the week board with their filter intent. */
    filter?: string | null;
};

/**
 * Work views that used to live in Assignments and now live in Roster. Any link
 * written before the move names one of these; forwarding them is what keeps old
 * deep links from dead-ending on a tab that no longer exists.
 */
const MOVED_TO_ROSTER: Record<string, OpenRosterModalDetail> = {
    roster: { section: "roster" },
    daily_roster: { section: "roster", range: "day" },
    attendance: { section: "attendance" },
};

export function dispatchAdminV2OpenSchedulingModal(detail?: OpenSchedulingModalDetail): void {
    const moved = detail?.workView ? MOVED_TO_ROSTER[detail.workView] : undefined;
    if (moved) {
        dispatchAdminV2OpenRosterModal(moved);
        return;
    }
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

/** Open the Roster workspace — the operating plan, and Attendance as its actuality mode. */
export function dispatchAdminV2OpenRosterModal(detail?: OpenRosterModalDetail): void {
    if (typeof window !== "undefined" && detail) {
        try {
            sessionStorage.setItem(ROSTER_WORKSPACE_DEEPLINK_KEY, JSON.stringify(detail));
        } catch {
            /* ignore quota */
        }
        window.dispatchEvent(new CustomEvent("adminv2:open-roster-modal", { detail }));
    }
    openWorkspaceModal("roster");
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

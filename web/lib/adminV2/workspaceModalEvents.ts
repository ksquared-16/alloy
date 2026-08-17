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
    /**
     * A WORK section. Roster is the expectation mode and Attendance the actuality mode; Staff and
     * Children are the durable population underneath both. All four are sections of one workspace,
     * so a deep link written to the old separate Records workspace names `staff`/`children` here and
     * still lands.
     */
    section?: "roster" | "attendance" | "staff" | "children";
    /**
     * A STUDIO section. Present so a single detail type can carry either placement — an Assignments
     * Studio link and a Roster link are both "open Operations at X", and splitting them into two
     * payload shapes would put the mode decision in two places.
     */
    studioSection?: "types" | "patterns" | "validation" | "templates" | null;
    range?: "day" | "week";
    lens?: "rooms" | "staff" | "assignments";
    /** Site + room + date carried across a handoff so context is never reset. */
    siteLocationId?: string | null;
    roomLocationId?: string | null;
    date?: string | null;
    /** Overview attention cards route into the week board with their filter intent. */
    filter?: string | null;
};

/**
 * EVERY Assignments work view, mapped onto its Operations destination.
 *
 * `roster` / `daily_roster` / `attendance` moved to Roster's own sections in the earlier re-home.
 * `assignments` was the commitment LEDGER, which is now Roster's Assignments LENS — the same rows,
 * on the surface that owns the operating day, rather than in a workspace of their own. `overview`
 * was an attention board Operations does not rebuild; it lands on Roster, whose control band already
 * carries the operational health signals it summarized.
 *
 * Forwarding all five is what keeps every link ever written from dead-ending on a retired shell.
 */
const ASSIGNMENTS_WORK_TO_OPERATIONS: Record<string, OpenRosterModalDetail> = {
    roster: { section: "roster" },
    daily_roster: { section: "roster", range: "day" },
    attendance: { section: "attendance" },
    assignments: { section: "roster", lens: "assignments" },
    overview: { section: "roster" },
};

/**
 * COMPATIBILITY ALIAS for the retired Assignments workspace.
 *
 * It opens Operations, never a scheduling shell — there is no longer one to open. Kept as a named
 * function rather than deleted because callers outside this repository's control (stored deep links,
 * the Focus Panel's Configure Types action, bookmarks) still speak this name, and a forward is a
 * move where a removal would be a dead end.
 */
export function dispatchAdminV2OpenSchedulingModal(detail?: OpenSchedulingModalDetail): void {
    const work = detail?.workView ? ASSIGNMENTS_WORK_TO_OPERATIONS[detail.workView] : undefined;
    if (work) {
        dispatchAdminV2OpenOperationsModal({ ...work, siteLocationId: detail?.siteLocationId ?? null });
        return;
    }
    // A Studio destination, or a bare `mode: "studio"` with no section — the latter lands on
    // Assignment Categories, which is the Studio tab an operator asking for "configuration" means.
    if (detail?.studioView || detail?.mode === "studio") {
        dispatchAdminV2OpenOperationsModal({
            studioSection: detail?.studioView ?? "types",
            siteLocationId: detail?.siteLocationId ?? null,
        });
        return;
    }
    dispatchAdminV2OpenOperationsModal({
        section: "roster",
        siteLocationId: detail?.siteLocationId ?? null,
    });
}

/** Open Operations — the operating day (WORK) and its configuration (STUDIO). */
export function dispatchAdminV2OpenOperationsModal(detail?: OpenRosterModalDetail): void {
    if (typeof window !== "undefined" && detail) {
        try {
            sessionStorage.setItem(ROSTER_WORKSPACE_DEEPLINK_KEY, JSON.stringify(detail));
        } catch {
            /* ignore quota */
        }
        window.dispatchEvent(new CustomEvent("adminv2:open-roster-modal", { detail }));
    }
    openWorkspaceModal("operations");
}

/** COMPATIBILITY ALIAS for the retired Roster workspace key. Operations owns those sections now. */
export function dispatchAdminV2OpenRosterModal(detail?: OpenRosterModalDetail): void {
    dispatchAdminV2OpenOperationsModal(detail);
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

/** Which Records section a deep link asked for. */

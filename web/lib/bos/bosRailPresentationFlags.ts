/**
 * Document flags for BOS Action Workspace — suppress persistent rail while open.
 */

export const BOS_ACTION_WORKSPACE_OPEN_ATTR = "data-adminv2-action-workspace-open";

export function isActionWorkspaceOpen(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR) === "true";
}

export function setActionWorkspaceOpenDocumentFlag(open: boolean): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (open) {
        root.setAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR, "true");
    } else {
        root.removeAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR);
    }
}

/**
 * Workspace band for Action Workspace when BOS rail is suppressed (no right-rail reserve).
 */
export function measureActionWorkspacePanelLayout(viewportWidth = window.innerWidth): {
    left: number;
    width: number;
    availableLeft: number;
    availableRight: number;
    availableWidth: number;
} {
    const sidebar = document.querySelector("[data-adminv2-sidebar='true']");
    const collapsed =
        document.querySelector("[data-adminv2-app-shell='workspace-v2']")?.getAttribute(
            "data-adminv2-sidebar-collapsed"
        ) === "true";
    const sidebarRight =
        sidebar ? Math.round(sidebar.getBoundingClientRect().right) : collapsed ? 56 : 280;
    const availableLeft = sidebarRight + 16;
    const availableRight = Math.round(viewportWidth) - 16;
    const availableWidth = Math.max(0, availableRight - availableLeft);
    const preferredWidth = Math.min(1200, Math.round(0.84 * viewportWidth));
    const width = Math.min(preferredWidth, availableWidth);
    const left = availableLeft + Math.max(0, (availableWidth - width) / 2);
    return {
        left: Math.round(left),
        width: Math.round(width),
        availableLeft,
        availableRight,
        availableWidth,
    };
}

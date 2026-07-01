import {
    applyDrawerWorkspaceGeometryVars,
    clearDrawerWorkspaceGeometryVars,
    computeDrawerWorkspaceBounds,
    DRAWER_WORKSPACE_MAX_WIDTH_PX,
    DRAWER_WORKSPACE_OUTER_MARGIN_PX,
    estimateDrawerWorkspaceBounds,
    isDrawerGeometryProbeActive,
    isDrawerWorkspaceGeometryActive,
    type DrawerWorkspaceBounds,
} from "@/lib/bos/drawerWorkspaceGeometry";

const SIDEBAR_SELECTOR = "[data-adminv2-sidebar='true']";
const BOS_OVERLAY_SELECTOR = "[data-adminv2-bos-rail-overlay='true']";
const COMMAND_COLUMN_SELECTOR = "[data-adminv2-workspace-command-column]";

function readSidebarCollapsed(): boolean {
    const shell = document.querySelector("[data-adminv2-app-shell='workspace-v2']");
    return shell?.getAttribute("data-adminv2-sidebar-collapsed") === "true";
}

/** Measure workspace band (sidebar → BOS rail) and apply drawer CSS vars for action workspace. */
export function measureAndApplyActionWorkspaceGeometry(
    root: HTMLElement = document.documentElement,
): DrawerWorkspaceBounds {
    if (isDrawerGeometryProbeActive(root)) {
        return estimateDrawerWorkspaceBounds(window.innerWidth);
    }

    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    const sidebarRight =
        sidebar ? Math.round(sidebar.getBoundingClientRect().right) : readSidebarCollapsed() ? 56 : 280;

    const overlay = document.querySelector(BOS_OVERLAY_SELECTOR);
    const column = document.querySelector(COMMAND_COLUMN_SELECTOR);

    let bosOverlayLeft: number | null = null;
    let bosOverlayWidth: number | null = null;
    let bosOverlayRight: number | null = null;

    if (overlay && overlay.getBoundingClientRect().width > 0) {
        const rect = overlay.getBoundingClientRect();
        bosOverlayLeft = Math.round(rect.left);
        bosOverlayWidth = Math.round(rect.width);
        bosOverlayRight = Math.round(rect.right);
    } else if (column && column.getBoundingClientRect().width > 0) {
        const rect = column.getBoundingClientRect();
        bosOverlayLeft = Math.round(rect.left);
        bosOverlayWidth = Math.round(rect.width);
        bosOverlayRight = Math.round(rect.right);
    }

    const bounds =
        bosOverlayLeft != null ?
            computeDrawerWorkspaceBounds({
                sidebarRight,
                bosOverlayLeft,
                bosOverlayWidth,
                bosOverlayRight,
                viewportWidth: window.innerWidth,
                preferredDrawerWidthPx: DRAWER_WORKSPACE_MAX_WIDTH_PX,
                outerMarginPx: DRAWER_WORKSPACE_OUTER_MARGIN_PX,
            })
        :   estimateDrawerWorkspaceBounds(window.innerWidth);

    applyDrawerWorkspaceGeometryVars(root, bounds);
    return bounds;
}

export function clearActionWorkspaceGeometryIfIdle(root: HTMLElement = document.documentElement): void {
    if (isDrawerWorkspaceGeometryActive()) return;
    clearDrawerWorkspaceGeometryVars(root);
}

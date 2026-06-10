import { BOS_RAIL_OVERLAY_GUTTER_PX } from "@/lib/bos/bosOverlayGeometry";

/** Minimum clearance between drawer left edge and sidebar right edge. */
export const DRAWER_WORKSPACE_LEFT_CLEARANCE_PX = 16;

/** Horizontal padding inside the available workspace band (both sides). */
export const DRAWER_WORKSPACE_INNER_PADDING_PX = 32;

/** Max drawer width cap (~60rem) within BOS safe region. */
export const DRAWER_WORKSPACE_MAX_WIDTH_PX = 960;

export const DRAWER_AVAILABLE_LEFT_CSS_VAR = "--adminv2-drawer-available-left";
export const DRAWER_AVAILABLE_RIGHT_CSS_VAR = "--adminv2-drawer-available-right";
export const DRAWER_AVAILABLE_WIDTH_CSS_VAR = "--adminv2-drawer-available-width";
export const DRAWER_COMPUTED_LEFT_CSS_VAR = "--adminv2-drawer-computed-left";
export const DRAWER_COMPUTED_WIDTH_CSS_VAR = "--adminv2-drawer-computed-width";
export const DRAWER_COMPUTED_RIGHT_CSS_VAR = "--adminv2-drawer-computed-right";

export type DrawerWorkspaceBounds = {
    sidebarRight: number;
    bosOverlayLeft: number | null;
    availableLeft: number;
    availableRight: number;
    availableWidth: number;
    computedDrawerLeft: number;
    computedDrawerRight: number;
    computedDrawerWidth: number;
};

export type ComputeDrawerWorkspaceBoundsParams = {
    sidebarRight: number;
    bosOverlayLeft: number | null;
    viewportWidth: number;
    gutterPx?: number;
    leftClearancePx?: number;
    innerPaddingPx?: number;
    maxWidthPx?: number;
};

/**
 * Fit drawer inside [sidebar.right, bosOverlay.left - gutter].
 * Centers drawer in the available band with left clearance and inner padding.
 */
export function computeDrawerWorkspaceBounds(params: ComputeDrawerWorkspaceBoundsParams): DrawerWorkspaceBounds {
    const gutter = params.gutterPx ?? BOS_RAIL_OVERLAY_GUTTER_PX;
    const leftClearance = params.leftClearancePx ?? DRAWER_WORKSPACE_LEFT_CLEARANCE_PX;
    const innerPadding = params.innerPaddingPx ?? DRAWER_WORKSPACE_INNER_PADDING_PX;
    const maxWidthPx = params.maxWidthPx ?? DRAWER_WORKSPACE_MAX_WIDTH_PX;

    const sidebarRight = Math.round(params.sidebarRight);
    const availableLeft = sidebarRight;
    const availableRight =
        params.bosOverlayLeft != null ?
            Math.round(params.bosOverlayLeft - gutter)
        :   Math.round(params.viewportWidth);
    const availableWidth = Math.max(0, availableRight - availableLeft);
    const minDrawerLeft = availableLeft + leftClearance;

    let drawerWidth = Math.min(maxWidthPx, Math.max(0, availableWidth - innerPadding));
    let drawerLeft = minDrawerLeft + Math.max(0, (availableWidth - drawerWidth) / 2);
    let drawerRight = drawerLeft + drawerWidth;

    if (drawerRight > availableRight) {
        drawerWidth = Math.max(0, availableRight - minDrawerLeft);
        drawerWidth = Math.min(drawerWidth, maxWidthPx);
        drawerLeft = minDrawerLeft + Math.max(0, (availableRight - minDrawerLeft - drawerWidth) / 2);
        drawerRight = drawerLeft + drawerWidth;
    }

    if (drawerLeft < minDrawerLeft) {
        drawerLeft = minDrawerLeft;
        drawerWidth = Math.min(drawerWidth, Math.max(0, availableRight - drawerLeft));
        drawerRight = drawerLeft + drawerWidth;
    }

    return {
        sidebarRight,
        bosOverlayLeft: params.bosOverlayLeft,
        availableLeft,
        availableRight,
        availableWidth,
        computedDrawerLeft: Math.round(drawerLeft),
        computedDrawerRight: Math.round(drawerRight),
        computedDrawerWidth: Math.round(drawerWidth),
    };
}

export function passesDrawerWorkspaceGutterRules(
    bounds: DrawerWorkspaceBounds,
    drawerRect: { left: number; right: number },
    gutterPx = BOS_RAIL_OVERLAY_GUTTER_PX
): { passesLeft: boolean; passesRight: boolean } {
    const minLeft = bounds.availableLeft + DRAWER_WORKSPACE_LEFT_CLEARANCE_PX;
    const maxRight =
        bounds.bosOverlayLeft != null ? bounds.bosOverlayLeft - gutterPx : bounds.availableRight;
    return {
        passesLeft: drawerRect.left >= minLeft,
        passesRight: drawerRect.right <= maxRight,
    };
}

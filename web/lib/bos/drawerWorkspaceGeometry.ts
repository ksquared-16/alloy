import { BOS_RAIL_OVERLAY_GUTTER_PX } from "@/lib/bos/bosOverlayGeometry";
import {
    ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX,
    ALLOY_OS_RUNTIME_ATTR,
    ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR,
    ALLOY_OS_RUNTIME_SPLIT_ATTR,
    isWorkUnitQueueSurfacePath,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

/** Clearance between drawer left edge and sidebar right edge. */
export const DRAWER_WORKSPACE_LEFT_CLEARANCE_PX = 16;

/** Modal framing — visible click-away margin on each side of the drawer within the safe band. */
export const DRAWER_WORKSPACE_OUTER_MARGIN_PX = 24;

/** Upper bound for BOS-rail drawer width — band may be narrower; does not force 960px cap. */
export const DRAWER_WORKSPACE_MAX_WIDTH_PX = 1280;

/** When probe diagnostics are active, auto-measure must not overwrite manual width. */
export const DRAWER_GEOMETRY_PROBE_ATTR = "data-adminv2-drawer-geometry-probe";

/** Minimum drawer width before BOS shrink / layout degradation. */
export const DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX = 880;

/** Minimum BOS overlay width when shrinking for drawer usability. */
export const BOS_MIN_USABLE_WIDTH_PX = 280;

/** @deprecated V3 contract uses full availableWidth — kept for import compatibility. */
export const DRAWER_WORKSPACE_INNER_PADDING_PX = 0;

/** Backdrop left edge (sidebar.right — does not include drawer clearance). */
export const DRAWER_BACKDROP_LEFT_CSS_VAR = "--adminv2-drawer-backdrop-left";

/** Backdrop right edge — ends at drawer frame (not BOS gutter) for unified workspace surface. */
export const DRAWER_BACKDROP_RIGHT_CSS_VAR = "--adminv2-drawer-backdrop-right";

/** Drawer band start (sidebar.right + 16). */
export const DRAWER_AVAILABLE_LEFT_CSS_VAR = "--adminv2-drawer-available-left";
export const DRAWER_AVAILABLE_RIGHT_CSS_VAR = "--adminv2-drawer-available-right";
export const DRAWER_AVAILABLE_WIDTH_CSS_VAR = "--adminv2-drawer-available-width";
export const DRAWER_COMPUTED_LEFT_CSS_VAR = "--adminv2-drawer-computed-left";
export const DRAWER_COMPUTED_WIDTH_CSS_VAR = "--adminv2-drawer-computed-width";
export const DRAWER_COMPUTED_RIGHT_CSS_VAR = "--adminv2-drawer-computed-right";

/** Focus Panel dock left edge (queue right + peer gap) — set only in State 2. */
export const ALLOY_OS_FOCUS_PANEL_LEFT_CSS_VAR = "--alloy-os-focus-panel-left";

/** When drawer is open, caps BOS overlay width (shrink strategy). */
export const BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR = "--adminv2-bos-overlay-effective-width";

export type DrawerWorkspaceBounds = {
    sidebarRight: number;
    bosOverlayLeft: number | null;
    effectiveBosOverlayLeft: number | null;
    effectiveBosOverlayWidth: number | null;
    backdropLeft: number;
    availableLeft: number;
    availableRight: number;
    availableWidth: number;
    computedDrawerLeft: number;
    computedDrawerRight: number;
    computedDrawerWidth: number;
    /** Right edge of dimmed backdrop (drawer right + outer margin). */
    computedBackdropRight: number;
};

export type ComputeDrawerWorkspaceBoundsParams = {
    sidebarRight: number;
    bosOverlayLeft: number | null;
    bosOverlayWidth?: number | null;
    bosOverlayRight?: number | null;
    viewportWidth: number;
    gutterPx?: number;
    leftClearancePx?: number;
    preferredDrawerWidthPx?: number;
    minDrawerWidthPx?: number;
    minBosWidthPx?: number;
    outerMarginPx?: number;
};

type BandLayout = {
    availableLeft: number;
    availableRight: number;
    availableWidth: number;
    computedDrawerWidth: number;
    computedDrawerLeft: number;
    computedDrawerRight: number;
};

function layoutDrawerInBand(
    sidebarRight: number,
    bosLeft: number,
    gutter: number,
    leftClearance: number,
    preferredDrawerWidth: number,
    outerMargin: number
): BandLayout {
    const availableLeft = sidebarRight + leftClearance;
    const availableRight = bosLeft - gutter;
    const availableWidth = Math.max(0, availableRight - availableLeft);
    const innerLeft = availableLeft + outerMargin;
    const innerRight = availableRight - outerMargin;
    const innerWidth = Math.max(0, innerRight - innerLeft);
    const computedDrawerWidth = Math.min(preferredDrawerWidth, innerWidth);
    const computedDrawerLeft = innerLeft + Math.max(0, (innerWidth - computedDrawerWidth) / 2);
    const computedDrawerRight = computedDrawerLeft + computedDrawerWidth;
    return {
        availableLeft,
        availableRight,
        availableWidth,
        computedDrawerWidth,
        computedDrawerLeft,
        computedDrawerRight,
    };
}

/**
 * V3 contract — single source of truth for drawer bounds in BOS copilot mode.
 *
 * availableLeft = sidebar.right + 16
 * availableRight = bos.left - gutter (16px default)
 * innerWidth = availableWidth - 2 * outerMargin
 * drawerWidth = min(DRAWER_WORKSPACE_MAX_WIDTH_PX, innerWidth)
 * drawerLeft = innerLeft + max(0, (innerWidth - drawerWidth) / 2)
 *
 * Shrinks BOS toward 280px min when drawer would fall below 880px usable width.
 */
export function computeDrawerWorkspaceBounds(params: ComputeDrawerWorkspaceBoundsParams): DrawerWorkspaceBounds {
    const gutter = params.gutterPx ?? BOS_RAIL_OVERLAY_GUTTER_PX;
    const leftClearance = params.leftClearancePx ?? DRAWER_WORKSPACE_LEFT_CLEARANCE_PX;
    const preferredDrawerWidth = params.preferredDrawerWidthPx ?? DRAWER_WORKSPACE_MAX_WIDTH_PX;
    const minDrawerWidth = params.minDrawerWidthPx ?? DRAWER_WORKSPACE_MIN_USABLE_WIDTH_PX;
    const minBosWidth = params.minBosWidthPx ?? BOS_MIN_USABLE_WIDTH_PX;
    const outerMargin = params.outerMarginPx ?? DRAWER_WORKSPACE_OUTER_MARGIN_PX;
    const sidebarRight = Math.round(params.sidebarRight);

    const naturalBosLeft =
        params.bosOverlayLeft != null ? Math.round(params.bosOverlayLeft) : null;
    let bosLeft = naturalBosLeft;
    let bosWidth =
        params.bosOverlayWidth != null ? Math.round(params.bosOverlayWidth) : null;
    const bosRight =
        params.bosOverlayRight != null ?
            Math.round(params.bosOverlayRight)
        : bosLeft != null && bosWidth != null ?
            bosLeft + bosWidth
        :   null;

    if (bosWidth == null && bosLeft != null && bosRight != null) {
        bosWidth = Math.max(0, bosRight - bosLeft);
    }

    if (bosLeft == null) {
        const availableRight = Math.round(params.viewportWidth);
        const band = layoutDrawerInBand(
            sidebarRight,
            availableRight + gutter,
            gutter,
            leftClearance,
            preferredDrawerWidth,
            outerMargin
        );
    return {
        sidebarRight,
        bosOverlayLeft: null,
        effectiveBosOverlayLeft: null,
        effectiveBosOverlayWidth: null,
        backdropLeft: sidebarRight,
        availableLeft: band.availableLeft,
        availableRight: band.availableRight,
        availableWidth: band.availableWidth,
        computedDrawerLeft: Math.round(band.computedDrawerLeft),
        computedDrawerRight: Math.round(band.computedDrawerRight),
        computedDrawerWidth: Math.round(band.computedDrawerWidth),
        computedBackdropRight: Math.round(band.computedDrawerRight + outerMargin),
    };
    }

    let band = layoutDrawerInBand(
        sidebarRight,
        bosLeft,
        gutter,
        leftClearance,
        preferredDrawerWidth,
        outerMargin
    );

    if (
        band.computedDrawerWidth < minDrawerWidth &&
        bosWidth != null &&
        bosRight != null &&
        bosWidth > minBosWidth
    ) {
        const deficit = minDrawerWidth - band.computedDrawerWidth;
        const shrinkBy = Math.min(deficit, bosWidth - minBosWidth);
        if (shrinkBy > 0) {
            bosWidth = bosWidth - shrinkBy;
            bosLeft = bosRight - bosWidth;
            band = layoutDrawerInBand(
                sidebarRight,
                bosLeft,
                gutter,
                leftClearance,
                preferredDrawerWidth,
                outerMargin
            );
        }
    }

    return {
        sidebarRight,
        bosOverlayLeft: naturalBosLeft,
        effectiveBosOverlayLeft: bosLeft,
        effectiveBosOverlayWidth: bosWidth,
        backdropLeft: sidebarRight,
        availableLeft: band.availableLeft,
        availableRight: band.availableRight,
        availableWidth: band.availableWidth,
        computedDrawerLeft: Math.round(band.computedDrawerLeft),
        computedDrawerRight: Math.round(band.computedDrawerRight),
        computedDrawerWidth: Math.round(band.computedDrawerWidth),
        computedBackdropRight: Math.round(band.computedDrawerRight + outerMargin),
    };
}

/**
 * True when Alloy OS State 2 split geometry should apply.
 */
export function isAlloyOsSplitGeometryActive(root: HTMLElement = document.documentElement): boolean {
    if (root.getAttribute(ALLOY_OS_RUNTIME_SPLIT_ATTR) === "true") return true;
    if (root.getAttribute(ALLOY_OS_RUNTIME_ATTR) !== "on") return false;
    if (!root.getAttribute(ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR)?.trim()) return false;
    if (typeof document !== "undefined" && document.querySelector(DRAWER_OPEN_SELECTOR) == null) {
        return false;
    }
    if (typeof window !== "undefined" && !isWorkUnitQueueSurfacePath(window.location.pathname)) {
        return false;
    }
    return true;
}

/**
 * Alloy OS State 2 — Queue | Focus Panel | BOS peer geometry.
 * Docks the Focus Panel right of the compressed queue; never shrinks BOS.
 */
export function computeAlloyOsFocusPanelBounds(
    params: ComputeDrawerWorkspaceBoundsParams,
): DrawerWorkspaceBounds {
    const gutter = params.gutterPx ?? BOS_RAIL_OVERLAY_GUTTER_PX;
    const leftClearance = params.leftClearancePx ?? DRAWER_WORKSPACE_LEFT_CLEARANCE_PX;
    const outerMargin = params.outerMarginPx ?? DRAWER_WORKSPACE_OUTER_MARGIN_PX;
    const sidebarRight = params.sidebarRight;

    const queueRight = sidebarRight + leftClearance + ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX;
    const computedDrawerLeft = queueRight + gutter;

    let bosOverlayLeft = params.bosOverlayLeft;
    let bosOverlayWidth = params.bosOverlayWidth ?? null;
    if (bosOverlayLeft == null) {
        const estimated = estimateDrawerWorkspaceBounds(params.viewportWidth);
        bosOverlayLeft = estimated.bosOverlayLeft;
        bosOverlayWidth = estimated.effectiveBosOverlayWidth;
    }

    const naturalBosLeft = bosOverlayLeft ?? params.viewportWidth;
    const bandRight = naturalBosLeft - gutter;
    const computedDrawerRight = bandRight;
    const computedDrawerWidth = Math.max(0, bandRight - computedDrawerLeft);
    const availableLeft = sidebarRight + leftClearance;

    return {
        sidebarRight,
        bosOverlayLeft: params.bosOverlayLeft ?? naturalBosLeft,
        effectiveBosOverlayLeft: params.bosOverlayLeft ?? naturalBosLeft,
        effectiveBosOverlayWidth: bosOverlayWidth ?? params.bosOverlayWidth,
        backdropLeft: sidebarRight,
        availableLeft,
        availableRight: bandRight,
        availableWidth: Math.max(0, bandRight - availableLeft),
        computedDrawerLeft: Math.round(computedDrawerLeft),
        computedDrawerRight: Math.round(computedDrawerRight),
        computedDrawerWidth: Math.round(computedDrawerWidth),
        computedBackdropRight: Math.round(computedDrawerRight + outerMargin),
    };
}

export function passesDrawerWorkspaceGutterRules(
    bounds: DrawerWorkspaceBounds,
    drawerRect: { left: number; right: number },
    gutterPx = BOS_RAIL_OVERLAY_GUTTER_PX
): { passesLeft: boolean; passesRight: boolean } {
    const minLeft = bounds.availableLeft;
    const bosLeft = bounds.effectiveBosOverlayLeft ?? bounds.bosOverlayLeft;
    const maxRight = bosLeft != null ? bosLeft - gutterPx : bounds.availableRight;
    return {
        passesLeft: drawerRect.left >= minLeft,
        passesRight: drawerRect.right <= maxRight,
    };
}

const SIDEBAR_SELECTOR = "[data-adminv2-sidebar='true']";
const BOS_OVERLAY_SELECTOR = "[data-adminv2-bos-rail-overlay='true']";
const COMMAND_COLUMN_SELECTOR = "[data-adminv2-workspace-command-column]";
const DRAWER_OPEN_SELECTOR = "[data-adminv2-drawer='true']";
const DRAWER_OPENING_OVERLAY_SELECTOR = "[data-opportunity-drawer-opening-overlay='true']";
const ACTION_WORKSPACE_OVERLAY_SELECTOR = "[data-action-workspace-overlay='true']";

export function isDrawerWorkspaceGeometryActive(): boolean {
    if (typeof document === "undefined") return false;
    return (
        document.querySelector(DRAWER_OPEN_SELECTOR) != null ||
        document.querySelector(DRAWER_OPENING_OVERLAY_SELECTOR) != null ||
        document.querySelector(ACTION_WORKSPACE_OVERLAY_SELECTOR) != null
    );
}

export function isDrawerGeometryProbeActive(root: HTMLElement = document.documentElement): boolean {
    return root.getAttribute(DRAWER_GEOMETRY_PROBE_ATTR) === "true";
}

export function setDrawerGeometryProbeActive(
    active: boolean,
    root: HTMLElement = document.documentElement,
): void {
    if (active) {
        root.setAttribute(DRAWER_GEOMETRY_PROBE_ATTR, "true");
    } else {
        root.removeAttribute(DRAWER_GEOMETRY_PROBE_ATTR);
    }
}

function readSidebarCollapsed(): boolean {
    const shell = document.querySelector("[data-adminv2-app-shell='workspace-v2']");
    return shell?.getAttribute("data-adminv2-sidebar-collapsed") === "true";
}

/** Safe estimate when overlay is not yet measured — avoids 100vw drawer fallback. */
export function estimateDrawerWorkspaceBounds(viewportWidth: number): DrawerWorkspaceBounds {
    const collapsed = readSidebarCollapsed();
    const sidebarRight = collapsed ? 56 : 280;
    const bosWidth = 320;
    const bosRight = Math.round(viewportWidth - 20);
    const bosLeft = bosRight - bosWidth;
    return computeDrawerWorkspaceBounds({
        sidebarRight,
        bosOverlayLeft: bosLeft,
        bosOverlayWidth: bosWidth,
        bosOverlayRight: bosRight,
        viewportWidth,
    });
}

export function clearDrawerWorkspaceGeometryVars(root: HTMLElement) {
    root.style.removeProperty(DRAWER_BACKDROP_LEFT_CSS_VAR);
    root.style.removeProperty(DRAWER_AVAILABLE_LEFT_CSS_VAR);
    root.style.removeProperty(DRAWER_AVAILABLE_RIGHT_CSS_VAR);
    root.style.removeProperty(DRAWER_AVAILABLE_WIDTH_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_LEFT_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_WIDTH_CSS_VAR);
    root.style.removeProperty(DRAWER_COMPUTED_RIGHT_CSS_VAR);
    root.style.removeProperty(DRAWER_BACKDROP_RIGHT_CSS_VAR);
    root.style.removeProperty(BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR);
    root.style.removeProperty(ALLOY_OS_FOCUS_PANEL_LEFT_CSS_VAR);
}

export function applyDrawerWorkspaceGeometryVars(root: HTMLElement, bounds: DrawerWorkspaceBounds) {
    root.style.setProperty(DRAWER_BACKDROP_LEFT_CSS_VAR, `${bounds.backdropLeft}px`);
    root.style.setProperty(DRAWER_AVAILABLE_LEFT_CSS_VAR, `${bounds.availableLeft}px`);
    root.style.setProperty(DRAWER_AVAILABLE_RIGHT_CSS_VAR, `${bounds.availableRight}px`);
    root.style.setProperty(DRAWER_AVAILABLE_WIDTH_CSS_VAR, `${bounds.availableWidth}px`);
    root.style.setProperty(DRAWER_COMPUTED_LEFT_CSS_VAR, `${bounds.computedDrawerLeft}px`);
    root.style.setProperty(DRAWER_COMPUTED_WIDTH_CSS_VAR, `${bounds.computedDrawerWidth}px`);
    root.style.setProperty(DRAWER_COMPUTED_RIGHT_CSS_VAR, `${bounds.computedDrawerRight}px`);
    root.style.setProperty(DRAWER_BACKDROP_RIGHT_CSS_VAR, `${bounds.computedBackdropRight}px`);

    if (
        bounds.effectiveBosOverlayWidth != null &&
        bounds.bosOverlayLeft != null &&
        bounds.effectiveBosOverlayLeft != null &&
        bounds.effectiveBosOverlayLeft > bounds.bosOverlayLeft
    ) {
        root.style.setProperty(
            BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR,
            `${bounds.effectiveBosOverlayWidth}px`
        );
    } else {
        root.style.removeProperty(BOS_OVERLAY_EFFECTIVE_WIDTH_CSS_VAR);
    }
}

/**
 * Measure DOM + apply CSS vars. Returns bounds or null when BOS copilot geometry is inactive.
 */
export function measureAndApplyDrawerWorkspaceGeometry(root: HTMLElement = document.documentElement): DrawerWorkspaceBounds | null {
    if (isDrawerGeometryProbeActive(root)) {
        return null;
    }

    if (!isDrawerWorkspaceGeometryActive()) {
        clearDrawerWorkspaceGeometryVars(root);
        return null;
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

    const splitActive = isAlloyOsSplitGeometryActive(root);

    const bounds =
        splitActive ?
            computeAlloyOsFocusPanelBounds({
                sidebarRight,
                bosOverlayLeft,
                bosOverlayWidth,
                bosOverlayRight,
                viewportWidth: window.innerWidth,
            })
        : bosOverlayLeft != null ?
            computeDrawerWorkspaceBounds({
                sidebarRight,
                bosOverlayLeft,
                bosOverlayWidth,
                bosOverlayRight,
                viewportWidth: window.innerWidth,
            })
        :   estimateDrawerWorkspaceBounds(window.innerWidth);

    applyDrawerWorkspaceGeometryVars(root, bounds);
    if (splitActive) {
        root.style.setProperty(ALLOY_OS_FOCUS_PANEL_LEFT_CSS_VAR, `${bounds.computedDrawerLeft}px`);
    } else {
        root.style.removeProperty(ALLOY_OS_FOCUS_PANEL_LEFT_CSS_VAR);
    }
    return bounds;
}

export function readDrawerComputedWidthPx(root: HTMLElement = document.documentElement): number | null {
    const raw = root.style.getPropertyValue(DRAWER_COMPUTED_WIDTH_CSS_VAR).trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)px$/);
    return match ? Math.round(Number(match[1])) : null;
}

import { BOS_RAIL_OVERLAY_GUTTER_PX } from "@/lib/bos/bosOverlayGeometry";
import { BOS_PRESENTATION_ATTR } from "@/lib/bos/bosPresentationState";

/**
 * Operational Workspace Geometry — platform-level layout for Operational Workspaces.
 *
 * Operational Workspaces (Communications, Processing, Work Items / Tasks, Operational
 * Intelligence, Create Lead, and any future operational workflow surface) are PEER
 * surfaces to the global sidebar, the workspace context, and the Command Rail / BOS rail.
 *
 * They are NOT entity drawers, NOT Focus Panels, NOT queue children, and are never
 * constrained by condensed-queue/drawer/Focus-Panel geometry. Their canvas is the entire
 * operational band:
 *
 *   left   = global sidebar right edge + clearance
 *   right  = pinned BOS rail left − gutter (floating/closed → viewport right − gutter)
 *   top    = below the application header (CSS: `--adminv2-drawer-inset-top`)
 *   bottom = viewport bottom with standard workspace padding (CSS: `--ws-shell-bottom-safe`)
 *
 * Classification is by workspace TYPE, not by feature name: any panel that marks itself
 * with `OPERATIONAL_WORKSPACE_ATTR` automatically inherits this geometry. Geometry logic
 * never references individual modal names.
 *
 * Vertical bounds (top/bottom) are owned by CSS (stable tokens); this module measures and
 * publishes only the horizontal band so the canvas never centers and is never width-capped.
 */

/** Marker attribute every Operational Workspace panel sets on its root element. */
export const OPERATIONAL_WORKSPACE_ATTR = "data-operational-workspace";

/** Shared CSS class for Operational Workspace panels (geometry rule target). */
export const OPERATIONAL_WORKSPACE_SURFACE_CLASS = "operational-workspace-surface";

/** Selector matching any open Operational Workspace panel. */
export const OPERATIONAL_WORKSPACE_OPEN_SELECTOR = `[${OPERATIONAL_WORKSPACE_ATTR}="true"]`;

/** Clearance between the global sidebar right edge and the operational canvas left edge. */
export const OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX = 16;

/** Horizontal band CSS variables (consumed by `.operational-workspace-surface`). */
export const OPERATIONAL_WORKSPACE_LEFT_CSS_VAR = "--operational-workspace-left";
export const OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR = "--operational-workspace-width";
export const OPERATIONAL_WORKSPACE_RIGHT_CSS_VAR = "--operational-workspace-right";

/** DOM contracts shared with the rest of the workspace shell (sidebar / BOS rail anchors). */
const SIDEBAR_SELECTOR = "[data-adminv2-sidebar='true']";
const BOS_OVERLAY_SELECTOR = "[data-adminv2-bos-rail-overlay='true']";
const COMMAND_COLUMN_SELECTOR = "[data-adminv2-workspace-command-column]";
const APP_SHELL_SELECTOR = "[data-adminv2-app-shell='workspace-v2']";

/** Sidebar right-edge fallbacks (sidebar width is owned elsewhere; never modified here). */
const SIDEBAR_RIGHT_EXPANDED_PX = 280;
const SIDEBAR_RIGHT_COLLAPSED_PX = 56;

export type OperationalWorkspaceBounds = {
    /** Left edge X (sidebar right + clearance). */
    left: number;
    /** Right edge X (BOS rail left − gutter, or viewport right − gutter). */
    right: number;
    /** Band width (right − left), never capped, never centered. */
    width: number;
};

export type ComputeOperationalWorkspaceBoundsParams = {
    sidebarRight: number;
    /**
     * Pinned BOS rail left edge. Pass null when BOS is floating/closed so the workspace
     * expands to the full operational band (same as no rail).
     */
    bosRailLeft: number | null;
    viewportWidth: number;
    gutterPx?: number;
    leftClearancePx?: number;
};

/**
 * Pure horizontal-band computation for an Operational Workspace.
 *
 * Contract: full band from sidebar to BOS rail. No max-width cap, no centering. When the
 * rail is unmeasured, the band runs to the viewport right edge (minus gutter).
 */
export function computeOperationalWorkspaceBounds(
    params: ComputeOperationalWorkspaceBoundsParams,
): OperationalWorkspaceBounds {
    const gutter = params.gutterPx ?? BOS_RAIL_OVERLAY_GUTTER_PX;
    const leftClearance = params.leftClearancePx ?? OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX;
    const sidebarRight = Math.round(params.sidebarRight);
    const viewportWidth = Math.round(params.viewportWidth);

    const left = sidebarRight + leftClearance;
    const right =
        params.bosRailLeft != null ?
            Math.round(params.bosRailLeft) - gutter
        :   viewportWidth - gutter;
    const width = Math.max(0, right - left);

    return { left, right, width };
}

function readSidebarCollapsed(): boolean {
    const shell = document.querySelector(APP_SHELL_SELECTOR);
    return shell?.getAttribute("data-adminv2-sidebar-collapsed") === "true";
}

/** True when any Operational Workspace surface is currently mounted/open. */
export function isOperationalWorkspaceOpen(): boolean {
    if (typeof document === "undefined") return false;
    return document.querySelector(OPERATIONAL_WORKSPACE_OPEN_SELECTOR) != null;
}

export function clearOperationalWorkspaceGeometryVars(
    root: HTMLElement = document.documentElement,
): void {
    root.style.removeProperty(OPERATIONAL_WORKSPACE_LEFT_CSS_VAR);
    root.style.removeProperty(OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR);
    root.style.removeProperty(OPERATIONAL_WORKSPACE_RIGHT_CSS_VAR);
}

/**
 * Pure helper: floating/closed BOS must not shrink the operational band.
 * Only pinned reserves horizontal width against the BOS rail.
 */
export function resolveOperationalBosRailLeft(input: {
    bosPresentation: string | null;
    overlayLeft: number | null;
    columnLeft: number | null;
}): number | null {
    if (input.bosPresentation !== "pinned") return null;
    if (input.overlayLeft != null) return input.overlayLeft;
    return input.columnLeft;
}

function readBosPresentationEffective(): string | null {
    if (typeof document === "undefined") return null;
    const fromHtml = document.documentElement.getAttribute(BOS_PRESENTATION_ATTR);
    if (fromHtml) return fromHtml;
    const ambient = document.querySelector("[data-adminv2-workspace-ambient-root]");
    return ambient?.getAttribute(BOS_PRESENTATION_ATTR) ?? null;
}

/**
 * Measure the live workspace band (sidebar → pinned BOS, or full viewport when floating/closed)
 * and publish operational CSS vars.
 *
 * Self-clearing: when no Operational Workspace is open, removes the vars and returns null.
 * Floating BOS must not steal horizontal band — only pinned reserves width.
 */
export function measureAndApplyOperationalWorkspaceGeometry(
    root: HTMLElement = document.documentElement,
): OperationalWorkspaceBounds | null {
    if (typeof document === "undefined" || typeof window === "undefined") return null;

    if (!isOperationalWorkspaceOpen()) {
        clearOperationalWorkspaceGeometryVars(root);
        return null;
    }

    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    const sidebarRight =
        sidebar ?
            Math.round(sidebar.getBoundingClientRect().right)
        : readSidebarCollapsed() ?
            SIDEBAR_RIGHT_COLLAPSED_PX
        :   SIDEBAR_RIGHT_EXPANDED_PX;

    const bosPresentation = readBosPresentationEffective();
    let bosRailLeft: number | null = null;
    // Only pinned BOS reserves horizontal band. Floating is an overlay window; closed has no rail.
    if (bosPresentation === "pinned") {
        const overlay = document.querySelector(BOS_OVERLAY_SELECTOR);
        const column = document.querySelector(COMMAND_COLUMN_SELECTOR);
        const overlayLeft =
            overlay && overlay.getBoundingClientRect().width > 0 ?
                Math.round(overlay.getBoundingClientRect().left)
            :   null;
        const columnLeft =
            column && column.getBoundingClientRect().width > 0 ?
                Math.round(column.getBoundingClientRect().left)
            :   null;
        bosRailLeft = resolveOperationalBosRailLeft({
            bosPresentation,
            overlayLeft,
            columnLeft,
        });
    }

    const bounds = computeOperationalWorkspaceBounds({
        sidebarRight,
        bosRailLeft,
        viewportWidth: window.innerWidth,
    });

    // IDEMPOTENT WRITE — the first half of breaking the pinned-BOS feedback loop.
    //
    // These vars size the operational surface, and when BOS is PINNED that surface shares a
    // flex row with the rail this module measures. Writing unconditionally therefore resizes
    // an element a ResizeObserver is watching, which re-enters this function inside the same
    // frame. Writing only on an actual change lets the system settle after one pass instead
    // of oscillating; `applyOperationalWorkspaceGeometryVars` reports whether it changed so
    // the caller can stop scheduling more work.
    applyOperationalWorkspaceGeometryVars(root, bounds);
    return bounds;
}

/**
 * Write the band vars, and report whether anything actually changed.
 *
 * Exported for the hook and for tests: "did this write change the layout" is the signal
 * that decides whether another measurement pass is worth running, and a boolean is far
 * easier to assert against than a spy on `style.setProperty`.
 */
export function applyOperationalWorkspaceGeometryVars(
    root: HTMLElement,
    bounds: OperationalWorkspaceBounds,
): boolean {
    const next: Array<[string, string]> = [
        [OPERATIONAL_WORKSPACE_LEFT_CSS_VAR, `${bounds.left}px`],
        [OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR, `${bounds.width}px`],
        [OPERATIONAL_WORKSPACE_RIGHT_CSS_VAR, `${bounds.right}px`],
    ];
    let changed = false;
    for (const [name, value] of next) {
        if (root.style.getPropertyValue(name) !== value) {
            root.style.setProperty(name, value);
            changed = true;
        }
    }
    return changed;
}

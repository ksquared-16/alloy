/**
 * Alloy OS runtime — first implementation slice (flag-gated).
 *
 * This module owns the feature flag + scope predicates for the universal runtime
 * split behavior (State 1 expanded queue ↔ State 2 compressed queue + Focus Panel).
 * It introduces NO new runtime primitive and changes NO data/VM/reveal contract.
 *
 * Default: OFF. When `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1`, the controller may apply
 * additive root attributes that drive the runtime token layer and the flag-gated
 * split CSS/geometry. With the flag off, every code path is a no-op.
 */

/** Build-time flag. Default off. Set `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1` to enable. */
export const ALLOY_OS_RUNTIME_ENABLED = process.env.NEXT_PUBLIC_ALLOY_OS_RUNTIME === "1";

/** Root attribute that opts a document into the runtime token layer (tokens only). */
export const ALLOY_OS_RUNTIME_ATTR = "data-alloy-os-runtime";

/** Root attribute that activates State 2 (compressed queue + docked Focus Panel). */
export const ALLOY_OS_RUNTIME_SPLIT_ATTR = "data-alloy-os-runtime-split";

/** Diagnostic attribute carrying the active perspective key (e.g. `enrollment:todays_tours`). */
export const ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR = "data-alloy-os-runtime-perspective";

/** Focus Panel target content width (System 1.5 Concept B: "target about 680px"). */
export const ALLOY_OS_FOCUS_PANEL_WIDTH_PX = 680;

/** Focus Panel minimum width before the band is considered tight (Concept B: min 420px). */
export const ALLOY_OS_FOCUS_PANEL_MIN_WIDTH_PX = 420;

/** Focus Panel maximum peer width — never floods an ultra-wide band (Concept B: max 720px). */
export const ALLOY_OS_FOCUS_PANEL_MAX_WIDTH_PX = 720;

/** Compressed queue rail width (polish target 440px; acceptable band 430–450px). */
export const ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX = 440;

/**
 * Operational-surface safe area — gap between the surface bottom and the viewport
 * bottom (System 1.5 Concept B: "Operational surface bottom = viewport bottom − 16px").
 * Queue · Focus Panel · BOS all end at this shared bottom Y.
 */
export const ALLOY_OS_OP_SURFACE_SAFE_AREA_PX = 16;

/**
 * True when a pathname is an operator work-unit queue surface (slug or compat dept route).
 * The runtime split is scoped to work-unit surfaces; the active Perspective (not a
 * specific queue key) decides whether State 2 applies — so this works for any domain.
 */
export function isWorkUnitQueueSurfacePath(pathname: string | null | undefined): boolean {
    if (typeof pathname !== "string" || pathname.length === 0) return false;
    return pathname.includes("/work-unit/");
}

/**
 * Pure State 2 decision. The split is driven by the active runtime Perspective +
 * an open Focus Panel on a work-unit surface — never by a specific queue key or
 * `?queue=` value. Deep-linked, in-page pill, and bootstrap selections all produce
 * an active Perspective, so all of them activate the split uniformly.
 */
export function alloyOsRuntimeSplitActive(input: {
    perspectiveActive: boolean;
    drawerOpen: boolean;
    onWorkUnitSurface: boolean;
}): boolean {
    return input.perspectiveActive && input.drawerOpen && input.onWorkUnitSurface;
}

/** Fixed compressed-queue row height — 80px preferred (virtualization contract). */
export const ALLOY_OS_COMPRESSED_ROW_HEIGHT_PX = 80;

/** Minimum compressed row height before layout degrades. */
export const ALLOY_OS_COMPRESSED_ROW_MIN_HEIGHT_PX = 76;

/** Maximum compressed row height (anatomy cap). */
export const ALLOY_OS_COMPRESSED_ROW_MAX_HEIGHT_PX = 84;

/** Sticky group-header height inside the compressed queue (Concept B). */
export const ALLOY_OS_COMPRESSED_GROUP_HEADER_HEIGHT_PX = 32;

/**
 * Pure decision for Concept B "Perspective change" behavior: when the active
 * Perspective changes while the Focus Panel is open, the panel should close and the
 * selection should clear (a perspective is a context shift, not a record swap).
 *
 * Returns false on the initial perspective (no previous key) and whenever the panel
 * is not open, so opening/swapping records — which keep the same perspective — never
 * trips it. Switching pills/lanes changes the perspective key and trips it once.
 */
export function shouldClearFocusPanelOnPerspectiveChange(input: {
    previousPerspectiveKey: string | null | undefined;
    nextPerspectiveKey: string | null | undefined;
    drawerOpen: boolean;
}): boolean {
    if (!input.drawerOpen) return false;
    const prev = input.previousPerspectiveKey?.trim() || null;
    if (!prev) return false;
    const next = input.nextPerspectiveKey?.trim() || null;
    return prev !== next;
}

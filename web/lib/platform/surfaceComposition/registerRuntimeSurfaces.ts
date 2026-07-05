/**
 * Runtime surface registration (Experience Builder V3 → Presentation Runtime V2).
 *
 * Nested surfaces and the Focus Panel surface are defined as `SurfaceSpec`s in
 * `recursiveSurfaceProofs.ts` and registered here so `getSurface` /
 * `resolveOpenSurface` resolve through the real registry path.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    getSurface,
    registerSurfaces,
    resolveOpenSurface,
} from "@/lib/platform/surfaceComposition/surfaceRegistry";
import {
    FOCUS_PANEL_SURFACE_ID,
    V3_PROOF_SURFACES,
    focusPanelSurface,
} from "@/lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs";
import {
    surfaceComponents,
    type SurfaceSpec,
} from "@/lib/platform/surfaceComposition/universalSurfaceModel";

/**
 * Register the V3 surface specs into the runtime registry. Idempotent and self-healing:
 * keyed on the registry's own state (not a private flag) so a registry reset re-registers.
 */
export function ensureRuntimeSurfacesRegistered(): void {
    if (getSurface(FOCUS_PANEL_SURFACE_ID)) return;
    registerSurfaces(V3_PROOF_SURFACES);
}

/** A nested surface reachable from a parent surface via a component's depth binding. */
export type NestedSurfaceLauncher = {
    /** The card/component that opens the nested surface (operator-facing label). */
    cardLabel: string;
    /** The nested surface id. */
    surfaceId: string;
    /** The nested surface's operator-facing label. */
    surfaceLabel: string;
    /** Which depth binding opens it. */
    depth: "expanded" | "workspace";
    /** Parent component id (for canvas drill-in). */
    componentId: string;
};

/**
 * Focus Panel runtime card keys → surface component ids on `focus_panel_surface`.
 * This is the seam between the canvas card catalog and registry depth bindings.
 */
export const FOCUS_PANEL_CARD_COMPONENT_IDS: Partial<Record<FocusPanelCardKey, string>> = {
    children: "children_card",
    billing_preview: "financial_configuration_card",
};

const DEPTH_ORDER = ["expanded", "workspace"] as const;

/**
 * Derive nested-surface launchers from any surface spec: walk its components and resolve
 * each depth binding through `resolveOpenSurface`. Enables nested-of-nested paths later.
 */
export function nestedLaunchersForSurface(surface: SurfaceSpec): NestedSurfaceLauncher[] {
    ensureRuntimeSurfacesRegistered();
    const launchers: NestedSurfaceLauncher[] = [];
    for (const component of surfaceComponents(surface)) {
        for (const depth of DEPTH_ORDER) {
            const nested = resolveOpenSurface(component, depth);
            if (nested) {
                launchers.push({
                    cardLabel: component.label,
                    surfaceId: nested.id,
                    surfaceLabel: nested.label,
                    depth,
                    componentId: component.id,
                });
            }
        }
    }
    return launchers;
}

/** Resolve the nested-surface launcher for a Focus Panel canvas card key, if any. */
export function nestedLauncherForFocusPanelCard(cardKey: FocusPanelCardKey): NestedSurfaceLauncher | null {
    ensureRuntimeSurfacesRegistered();
    const surface = getSurface(FOCUS_PANEL_SURFACE_ID) ?? focusPanelSurface;
    const componentId = FOCUS_PANEL_CARD_COMPONENT_IDS[cardKey];
    if (!componentId) return null;
    return nestedLaunchersForSurface(surface).find((l) => l.componentId === componentId) ?? null;
}

/** Map of canvas card key → nested surface id for cards with depth-bound expansion surfaces. */
export function focusPanelNestedSurfaceByCardKey(): Partial<Record<FocusPanelCardKey, { surfaceId: string; surfaceLabel: string }>> {
    ensureRuntimeSurfacesRegistered();
    const out: Partial<Record<FocusPanelCardKey, { surfaceId: string; surfaceLabel: string }>> = {};
    for (const [cardKey, componentId] of Object.entries(FOCUS_PANEL_CARD_COMPONENT_IDS) as [FocusPanelCardKey, string][]) {
        const launcher = nestedLaunchersForSurface(getSurface(FOCUS_PANEL_SURFACE_ID) ?? focusPanelSurface).find(
            (l) => l.componentId === componentId,
        );
        if (launcher) {
            out[cardKey] = { surfaceId: launcher.surfaceId, surfaceLabel: launcher.surfaceLabel };
        }
    }
    return out;
}

/**
 * Derive the Focus Panel's nested-surface launchers FROM the registry.
 * @deprecated Prefer `nestedLaunchersForSurface(getSurface(FOCUS_PANEL_SURFACE_ID)!)` — kept for back-compat.
 */
export function focusPanelNestedLaunchers(): NestedSurfaceLauncher[] {
    ensureRuntimeSurfacesRegistered();
    const surface = getSurface(FOCUS_PANEL_SURFACE_ID) ?? focusPanelSurface;
    return nestedLaunchersForSurface(surface);
}

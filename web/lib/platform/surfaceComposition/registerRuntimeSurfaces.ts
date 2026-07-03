/**
 * Runtime surface registration (Experience Builder V3 → Presentation Runtime V2).
 *
 * The nested surfaces (Children Surface, Financial Configuration Surface) and the
 * Focus Panel surface are DEFINED as `SurfaceSpec`s in `recursiveSurfaceProofs.ts`
 * but were never registered in the runtime `surfaceRegistry` — so `getSurface` /
 * `resolveOpenSurface` returned null for them. This idempotent bootstrap registers
 * them so the builder's nested navigation resolves through the real registry path
 * (component.depth.openSurfaceId → resolveOpenSurface → the nested Surface), instead
 * of a hardcoded id list.
 *
 * No new surfaces are introduced here — this only wires the already-authored specs
 * into the registry the runtime + builder read.
 */

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
import { surfaceComponents } from "@/lib/platform/surfaceComposition/universalSurfaceModel";

/**
 * Register the V3 surface specs into the runtime registry. Idempotent and self-healing:
 * keyed on the registry's own state (not a private flag) so a registry reset re-registers.
 */
export function ensureRuntimeSurfacesRegistered(): void {
    if (getSurface(FOCUS_PANEL_SURFACE_ID)) return;
    registerSurfaces(V3_PROOF_SURFACES);
}

/** A nested surface reachable from the Focus Panel surface via a component's depth binding. */
export type NestedSurfaceLauncher = {
    /** The card/component that opens the nested surface (operator-facing label). */
    cardLabel: string;
    /** The nested surface id (children_surface / financial_configuration_surface). */
    surfaceId: string;
    /** The nested surface's operator-facing label. */
    surfaceLabel: string;
    /** Which depth binding opens it. */
    depth: "expanded" | "workspace";
};

/**
 * Derive the Focus Panel's nested-surface launchers FROM the registry: walk the Focus
 * Panel surface's components and resolve each depth binding through `resolveOpenSurface`.
 * This is the registry / resolveOpenSurface path the builder navigation uses — the
 * launcher list is no longer hand-maintained.
 */
export function focusPanelNestedLaunchers(): NestedSurfaceLauncher[] {
    ensureRuntimeSurfacesRegistered();
    const surface = getSurface(FOCUS_PANEL_SURFACE_ID) ?? focusPanelSurface;
    const launchers: NestedSurfaceLauncher[] = [];
    for (const component of surfaceComponents(surface)) {
        for (const depth of ["expanded", "workspace"] as const) {
            const nested = resolveOpenSurface(component, depth);
            if (nested) {
                launchers.push({
                    cardLabel: component.label,
                    surfaceId: nested.id,
                    surfaceLabel: nested.label,
                    depth,
                });
            }
        }
    }
    return launchers;
}

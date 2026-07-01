/**
 * Alloy OS — Surface ViewModel composition (ownership layer).
 *
 * Core law: a visible operating surface may NOT be assembled by independent component loaders.
 * Each route composes a single above-fold **Surface ViewModel** that OWNS surface readiness;
 * components present its sections but never decide whether the surface is ready.
 *
 *   click / route intent → compose Surface VM → commit surface once → patch non-blocking quietly
 *
 * These are **client adapters**: pure functions composed over the existing loader/cache/reveal-gate
 * outputs. They introduce no new fetches, no new skeleton layer, and no new reveal primitive —
 * `reveal.canCommit` is always the authoritative existing reveal predicate for the surface, so
 * behavior is unchanged and the flag-off path is preserved. Section ids are the canonical ids from
 * `@/lib/perf/alloySectionMap` so the VM, the section map, and `[perf:section]` diagnostics agree.
 *
 * See docs/platform/operator/surface-view-model-composition.md.
 */

import type { AlloySectionId } from "@/lib/perf/alloySectionMap";

/** First-paint provenance of the composed surface (most-warm wins when several apply). */
export type SurfaceViewModelSource = "bootstrap" | "session" | "cache" | "network" | "default";

export type SurfaceKind = "shell_nav" | "workspace" | "work_unit";

/** Per-section readiness fed to {@link composeSurfaceReveal} (descriptive bundle membership). */
export type SurfaceSectionReadiness = {
    id: AlloySectionId;
    /** Whether the section participates in the blocking above-fold bundle. */
    blocking: boolean;
};

export type SurfaceReveal = {
    /** Above-fold sections that must be present/seeded before the single surface commit. */
    blockingSectionIds: AlloySectionId[];
    /** Sections that render their final slot at commit and patch values quietly afterward. */
    nonBlockingSectionIds: AlloySectionId[];
    /**
     * The single commit decision for the route. This is always the authoritative existing reveal
     * predicate for the surface (`workspaceRevealGate.above_fold_ready`,
     * `resolveWorkUnitPageContentReady(...)`, nav readiness) — never a second, divergent gate.
     */
    canCommit: boolean;
};

export type SurfacePatchPolicy = {
    /** Section ids whose values may change in place after the surface has committed. */
    allowedAfterCommit: AlloySectionId[];
};

/**
 * Generic surface view-model. `TSections` is the surface-specific section payload (descriptive
 * references to already-loaded data — labels, counts, presence/seed flags — never new fetches).
 */
export type SurfaceViewModel<TSections> = {
    id: string;
    surface: SurfaceKind;
    /** Bumped when the VM SHAPE changes (not on value patches). */
    version: number;
    /** Mirror of `reveal.canCommit` for ergonomic reads. */
    ready: boolean;
    /** True when first paint is served from a warm source (session/cache/bootstrap), not cold network. */
    warm: boolean;
    source: SurfaceViewModelSource;
    sections: TSections;
    reveal: SurfaceReveal;
    patch: SurfacePatchPolicy;
};

/**
 * Build the reveal block. `canCommit` is supplied by the caller as the authoritative existing
 * gate predicate; the blocking/non-blocking id lists are derived from the descriptive section
 * bundle for diagnostics and contract assertions. Keeping `canCommit` external guarantees the VM
 * never introduces a second readiness source that could diverge from the protected reveal gate.
 */
export function composeSurfaceReveal(input: {
    sections: SurfaceSectionReadiness[];
    canCommit: boolean;
}): SurfaceReveal {
    return {
        blockingSectionIds: input.sections.filter((s) => s.blocking).map((s) => s.id),
        nonBlockingSectionIds: input.sections.filter((s) => !s.blocking).map((s) => s.id),
        canCommit: input.canCommit,
    };
}

/** Pick the warmest available source for first paint (session/cache/bootstrap are "warm"). */
export function resolveSurfaceSource(input: {
    seededFromSession?: boolean;
    seededFromCache?: boolean;
    seededFromBootstrap?: boolean;
    network?: boolean;
}): { source: SurfaceViewModelSource; warm: boolean } {
    if (input.seededFromSession) return { source: "session", warm: true };
    if (input.seededFromCache) return { source: "cache", warm: true };
    if (input.seededFromBootstrap) return { source: "bootstrap", warm: true };
    if (input.network) return { source: "network", warm: false };
    return { source: "default", warm: false };
}

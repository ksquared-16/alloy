import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

/**
 * Canonical server-composed **Route VM** for the `/workspace` surface
 * (see `docs/platform/runtime/final-runtime-architecture.md`).
 *
 * The Route VM is the single first-paint payload the surface reveals from. It is composed at the
 * server route boundary (the workspace layout) and is the **enduring runtime unit** — not a React
 * provider, not a hook. It owns the first-paint data available server-side today (context identity +
 * lifecycle landing tiles). Subsequent M1 slices fold KPIs, work-unit summaries, and the banner into
 * this same object and delete their client fetches; the client may refine *values* in place after
 * first paint but never re-owns first paint.
 *
 * This module is pure (no React, no server-only) so it is importable from both the server composer
 * and client renderers. It supersedes the transitional `workspaceFirstPaintSeed` provider.
 */
export type WorkspaceRouteVm = {
    surface: "workspace";
    /** Bumped on SHAPE change, not value refinement. */
    version: number;
    context: {
        orgId: string | null;
        orgName: string | null;
        accessScopeFingerprint: string;
    };
    firstPaint: {
        lifecycleCards: readonly OperatorLifecycleLandingCard[];
    };
};

/** Neutral VM used as the context default / when no server VM is present (additive fallback). */
export const EMPTY_WORKSPACE_ROUTE_VM: WorkspaceRouteVm = {
    surface: "workspace",
    version: 1,
    context: { orgId: null, orgName: null, accessScopeFingerprint: "" },
    firstPaint: { lifecycleCards: [] },
};

/**
 * Pure assembly of the workspace Route VM from its already-loaded parts. The workspace layout (the
 * Server VM Composer boundary) loads `lifecycleCards` in its existing parallel server bundle, then
 * assembles the VM here — keeping the load parallel while making this the one composition point that
 * later slices extend (KPIs / work-unit summaries / banner).
 */
export function composeWorkspaceRouteVm(input: {
    context: WorkspaceRouteVm["context"];
    lifecycleCards: readonly OperatorLifecycleLandingCard[];
}): WorkspaceRouteVm {
    return {
        surface: "workspace",
        version: 1,
        context: input.context,
        firstPaint: { lifecycleCards: input.lifecycleCards },
    };
}

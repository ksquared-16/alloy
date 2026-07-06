"use client";

/**
 * Surface Host — the canonical client-context owner of operational surface focus
 * (docs/platform/experience/surface-host-architecture.md). NAV-1 (A): one architecture, one
 * execution path, one source of truth. There is NO feature flag and NO parallel mode — the Host
 * is always mounted at the shared workspace outlet.
 *
 * PHASE 1 is INERT BY IMPLEMENTATION, not by being disabled: the provider only *observes and
 * models* surface state — it mirrors the URL into `current`, tracks browser back/forward, and
 * exposes the state through context. It renders children unchanged and does NOT render surfaces,
 * intercept navigation, write the URL/history, or touch the reload floor. Behavior is identical to
 * today; the only new thing is that Surface Host state now exists internally. If Phase 1 ever
 * changes observable behavior, that is a bug in this file — fix it here.
 *
 * The render takeover + exchange choreography (navigate/settle) are Phase 2.
 */

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";
import {
    initialSurfaceHostState,
    surfaceHostReducer,
    type SurfaceHostState,
} from "@/lib/experience/surfaceHost/surfaceHostState";
import { surfaceHostShouldRenderWorkUnit } from "@/lib/experience/surfaceHost/surfaceHostRender";
import { useWorkUnitSurfaceController } from "@/lib/experience/surfaceHost/workUnitSurfaceController";
import { WorkUnitSurfaceView } from "@/components/admin/workspace/WorkUnitSlugRouteHost";

export type SurfaceHostValue = {
    state: SurfaceHostState;
};

const SurfaceHostContext = createContext<SurfaceHostValue | null>(null);

/** Consume the Host; null only outside the workspace tree (the Host is always mounted within it). */
export function useSurfaceHostOptional(): SurfaceHostValue | null {
    return useContext(SurfaceHostContext);
}

/** Consume the Host; throws when used outside the workspace tree. */
export function useSurfaceHost(): SurfaceHostValue {
    const ctx = useContext(SurfaceHostContext);
    if (!ctx) throw new Error("useSurfaceHost must be used within SurfaceHostProvider");
    return ctx;
}

/**
 * Always mounted at the shared workspace center outlet. Renders `children` unchanged — a context
 * provider emits no DOM. Its effects are pure observation of the URL into internal state.
 */
export function SurfaceHostProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [state, dispatch] = useReducer(
        surfaceHostReducer,
        pathname,
        (p) => initialSurfaceHostState(surfaceRefFromPath(p)),
    );

    // Route/deep-link changes (Phase 1B) — usePathname updates on router nav AND browser
    // back/forward, so the Host mirrors every URL change into `current`.
    useEffect(() => {
        dispatch({ type: "hydrate", ref: surfaceRefFromPath(pathname) });
    }, [pathname]);

    // Browser back/forward (Phase 1C) — explicit popstate re-sync from window.location. Passive:
    // it never preventDefaults, navigates, or writes history — it only reads the current URL into
    // state. Idempotent with the usePathname mirror in Phase 1; the load-bearing path in Phase 2
    // when the Host owns the URL via history and Next's router no longer drives usePathname.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onPopState = () => {
            dispatch({ type: "hydrate", ref: surfaceRefFromPath(window.location.pathname) });
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const value = useMemo<SurfaceHostValue>(() => ({ state }), [state]);

    // Canonical render takeover (Step 3). Decided from the LIVE pathname (in sync with `children`,
    // not the reducer state which lags one effect). On a work-unit URL the Host mounts the work-unit
    // surface via the shared controller, while the route (`children`) is the seed-only component
    // (renders null after writing the server identity to the module cache). Exactly one controller
    // runs the identity / deep-link / URL-sync effects — no parallel route-render mode.
    const liveRef = surfaceRefFromPath(pathname);
    const hostWorkUnitSlug = surfaceHostShouldRenderWorkUnit(liveRef) ? liveRef.workUnitSlug : null;

    return (
        <SurfaceHostContext.Provider value={value}>
            {children}
            {hostWorkUnitSlug != null ? (
                <SurfaceHostWorkUnitMount workUnitSlug={hostWorkUnitSlug} />
            ) : null}
        </SurfaceHostContext.Provider>
    );
}

/**
 * Host-mounted work-unit surface. Drives the SAME `useWorkUnitSurfaceController` as the route host,
 * so identity, record deep-link opening, and URL sync are byte-identical — the surface is simply
 * owned by the Host (which will let it be held during the exchange in Step 4). Seeded synchronously:
 * the seed-only route (rendered just before this in `children`) writes the server identity to the
 * module cache in render, so this controller reads it with no cold-shell waterfall.
 */
function SurfaceHostWorkUnitMount({ workUnitSlug }: { workUnitSlug: string }) {
    const controller = useWorkUnitSurfaceController({ workUnitSlug, initialRouteMeta: null });
    return <WorkUnitSurfaceView controller={controller} />;
}

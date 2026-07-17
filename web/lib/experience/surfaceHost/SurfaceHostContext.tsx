"use client";

/**
 * Surface Host — the canonical client-context owner of operational surface focus
 * (docs/platform/experience/surface-host-architecture.md). NAV-1 (A): one architecture, one
 * execution path, one source of truth. There is NO feature flag and NO parallel mode.
 *
 * CUTOVER (D4). The Host no longer derives what is visible from the pathname. Its anatomy is
 * unchanged — current / outgoing / incoming / phase, stable mounted slots — but its TRIGGERS are now
 * the kernel (Spec C-32: "keep the Surface Host anatomy; replace its triggers").
 *
 *   BEFORE:  pathname → surfaceRefFromPath → liveRef → visible surface
 *   NOW:     K1 Attention → K2 Provisioning → K3 committed Focus → visible surface → URL projection
 *
 * The URL is an EXTERNAL REPRESENTATION, not a cause (Art 2.4). It hydrates attention ONCE on cold
 * load; thereafter it is written FROM committed Focus and never read back to decide what is shown.
 * That is the whole difference between this file and its predecessor.
 *
 * The Host renders the Work Unit only when K3 has COMMITTED one. There is no phase in which a
 * destination is on screen but not yet operational — "a surface is never shown before it is
 * Operational" (Art OC.4 Law 1). While attention is ahead of focus, the operator keeps seeing the
 * Workspace, which is true, retained, and visibly yielding.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";
import {
    initialSurfaceHostState,
    surfaceHostReducer,
    type SurfaceHostState,
} from "@/lib/experience/surfaceHost/surfaceHostState";
import { surfaceHostShouldRenderWorkUnit } from "@/lib/experience/surfaceHost/surfaceHostRender";
import { useCommittedFocus, useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { attentionFromUrl, ATTENTION_SCOPE, WORKSPACE_ATTENTION_TARGET } from "@/lib/runtime/kernel/attention";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { ProvisionedWorkUnitSurface } from "@/components/presentation/workUnit/ProvisionedWorkUnitSurface";

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

export function SurfaceHostProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const kernel = useRuntimeKernel();
    const focus = useCommittedFocus();
    const { orgId, principalUserId } = useWorkspaceOrg();

    // ── COLD-LOAD HYDRATION (Art 2.4) — a URL is read ONCE, into attention. ──
    // This is the only place a URL may establish attention, and `hydrate` throws if attention
    // already exists, so a later URL change can never masquerade as operator intent.
    const hydrated = useRef(false);
    useEffect(() => {
        if (hydrated.current || !orgId) return;
        const h = attentionFromUrl(
            new URL(window.location.href),
            { tenant: orgId, principal: principalUserId ?? "" },
            "direct_url",
        );
        if (!h) return;
        hydrated.current = true;
        kernel.attention.hydrate(h);
    }, [kernel, orgId, principalUserId]);

    // ── BROWSER HISTORY — an ADAPTER into K1, never a second Focus authority. ──
    // popstate expresses operator intent (they pressed Back), so it MOVES attention like any other
    // adapter. It does not write the visible surface; K3 still commits only on a K2 terminal.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onPopState = () => {
            if (!orgId) return;
            const h = attentionFromUrl(
                new URL(window.location.href),
                { tenant: orgId, principal: principalUserId ?? "" },
                "history",
            );
            if (!h) return;
            if (!kernel.attention.get()) {
                kernel.attention.hydrate(h);
                return;
            }
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SURFACE,
                target: h.target,
                lens: h.lens ?? null,
                source: "history",
            });
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [kernel, orgId, principalUserId]);

    // ── URL PROJECTION — written FROM committed Focus, after the commit. Never before, never as a
    //    cause. `replaceState` keeps the address honest without manufacturing history entries the
    //    operator did not create; K3 owns the address, the router does not.
    useEffect(() => {
        const url = focus.projectedUrl;
        if (!url || typeof window === "undefined") return;
        if (window.location.pathname + window.location.search === url) return;
        window.history.replaceState(window.history.state, "", url);
    }, [focus.projectedUrl]);

    // The Host's own state model is retained for its anatomy/diagnostics. It is a PROJECTION of the
    // pathname for compatibility consumers only — it no longer decides what is visible.
    const state = useMemo<SurfaceHostState>(
        () => surfaceHostReducer(initialSurfaceHostState(surfaceRefFromPath(pathname)), {
            type: "hydrate",
            ref: surfaceRefFromPath(pathname),
        }),
        [pathname],
    );
    const value = useMemo<SurfaceHostValue>(() => ({ state }), [state]);

    // ── THE VISIBLE DECISION — committed Focus, and nothing else. ──
    // Not the pathname, not a mount, not a readiness conjunction, not a timer.
    // The Workspace is an attention target, but it is NOT a Work Unit. Only a committed Work Unit
    // focus may render the Work Unit surface — otherwise the Workspace provisions itself as a Work
    // Unit and honestly reports that no such work unit exists.
    const committed = focus.current;
    const showWorkUnit = committed != null && committed.ref.target !== WORKSPACE_ATTENTION_TARGET;

    // ── THE OUTGOING YIELD (C-36) — the Workspace visibly recedes the instant the operator commits to
    //    leaving it, and is HELD (mounted, out of the way) once the Work Unit reveals. The kernel models
    //    this as the `yielding` phase; the Workspace is Presentation-owned (not a K3 surface — a known D5
    //    gap), so the recede is decided here from the divergence between `desired` and committed Focus.
    //    Not a timer: the recede begins on intent and is superseded by the atomic commit, never gated by
    //    a clock. Before this, the Workspace simply stayed on screen beneath the Work Unit — the modelled
    //    yield was never rendered, so the operator's movement had no legible outgoing evidence.
    const movingToWorkUnit = focus.desired != null && focus.desired.target !== WORKSPACE_ATTENTION_TARGET;
    const outgoingYielding = !showWorkUnit && movingToWorkUnit && focus.phase !== "stable";
    const slot = showWorkUnit ? "held" : outgoingYielding ? "outgoing" : "current";

    return (
        <SurfaceHostContext.Provider value={value}>
            <div
                data-surface-slot={slot}
                // `held` = a Work Unit has revealed; the Workspace is retained (mounted, scroll preserved)
                // but display:none so the incoming surface owns the whole region. `outgoing` = receding,
                // non-interactive. `current` = the live, interactive Workspace.
                className={`flex min-h-0 flex-1 flex-col ${
                    showWorkUnit ? "hidden" : outgoingYielding ? "motion-recede pointer-events-none" : ""
                }`.trim()}
                // Report the rendered recede back to Focus so the yield→hold handshake is driven by the
                // choreography, not by tests. In the `yielding` phase this advances K3 and fires the
                // legibility instrumentation; on a cold Workspace→Work Unit move (no K3 `current` to
                // yield) it is a no-op, which is correct.
                onAnimationStart={(e) => {
                    if (e.animationName && e.animationName.startsWith("motion-recede")) {
                        kernel.focus.markYieldLegible();
                    }
                }}
            >
                {children}
            </div>
            {showWorkUnit ? <ProvisionedWorkUnitSurface /> : null}
        </SurfaceHostContext.Provider>
    );
}

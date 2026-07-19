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

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { surfaceRefFromPath } from "@/lib/experience/surfaceHost/surfaceRef";
import { surfaceHostShouldRenderWorkUnit } from "@/lib/experience/surfaceHost/surfaceHostRender";
import { useCommittedFocus, useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { attentionFromUrl, ATTENTION_SCOPE, WORKSPACE_ATTENTION_TARGET } from "@/lib/runtime/kernel/attention";
import { surfaceIdFor } from "@/lib/runtime/kernel/focus";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { subscribeWorkspaceReturn } from "@/lib/experience/surfaceHost/workspaceReturnIntent";
import { ProvisionedWorkUnitSurface } from "@/components/presentation/workUnit/ProvisionedWorkUnitSurface";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

/** The bare Workspace address — the Workspace is not a work-unit target, so it has no slug URL. */
const WORKSPACE_URL = "/workspace";

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

    // ── WORKSPACE RETURN — the Home control (in the shell, above the kernel providers) forwards the
    //    operator's "back to Workspace" gesture here. It is an attention movement like any other: the
    //    committed Work Unit becomes `outgoing` and the retained Workspace (mounted, hidden) takes over
    //    instantly (Kelly A2). The Workspace has no K2 preparation contract, so this move never
    //    commits — `desiredIsWorkspace` below is what makes the retained Workspace visible again.
    useEffect(() => {
        return subscribeWorkspaceReturn(() => {
            if (!orgId) return;
            const current = kernel.attention.get();
            if (!current) {
                kernel.attention.hydrate({
                    tenant: orgId,
                    principal: principalUserId ?? "",
                    target: WORKSPACE_ATTENTION_TARGET,
                    lens: null,
                    source: "direct_url",
                });
                return;
            }
            if (current.target === WORKSPACE_ATTENTION_TARGET) return;
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SURFACE,
                target: WORKSPACE_ATTENTION_TARGET,
                lens: null,
                source: "pointer",
            });
        });
    }, [kernel, orgId, principalUserId]);

    // The operator has expressed intent to be on the Workspace. Because the Workspace is not a K3
    // surface, this intent — not a commit — decides its visibility and its address.
    const desiredIsWorkspace = focus.desired?.target === WORKSPACE_ATTENTION_TARGET;

    // ── URL PROJECTION — written FROM committed Focus, after the commit. Never before, never as a
    //    cause. `replaceState` keeps the address honest without manufacturing history entries the
    //    operator did not create; K3 owns the address, the router does not. The one exception is the
    //    Workspace: it has no committed surface to project from, so when the operator is on it the
    //    address is its bare path rather than the stale (retained) Work Unit's slug URL.
    useEffect(() => {
        const url = desiredIsWorkspace ? WORKSPACE_URL : focus.projectedUrl;
        if (!url || typeof window === "undefined") return;
        if (window.location.pathname + window.location.search === url) return;
        window.history.replaceState(window.history.state, "", url);
    }, [focus.projectedUrl, desiredIsWorkspace]);

    // ── THE VISIBLE DECISION — committed Focus, and nothing else. ──
    // Not the pathname, not a mount, not a readiness conjunction, not a timer.
    // The Workspace is an attention target, but it is NOT a Work Unit. Only a committed Work Unit
    // focus may render the Work Unit surface — otherwise the Workspace provisions itself as a Work
    // Unit and honestly reports that no such work unit exists.
    // The committed surface may STILL be a Work Unit here (Focus never un-commits, and the Workspace
    // has no terminal to supersede it). So the operator's intent to return to the Workspace
    // (`desiredIsWorkspace`) is what recedes it — otherwise a stale committed Work Unit would keep the
    // retained Workspace hidden forever, and Home would appear to "never load" (Kelly A2).
    const committed = focus.current;

    // ── ATOMIC OPERATIONAL COMMIT / NO-MIXED-DESTINATION INVARIANT (Kelly) ──
    // K3 `current` never un-commits, so during a movement to a DIFFERENT surface it still holds the
    // surface being left (or a leftover retained after a Workspace detour). Rendering it while the
    // operator has moved to another destination shows a MIXED destination — e.g. the New Leads route
    // over a retained Registration queue + Focus Panel (New Leads and Registration are distinct Work
    // Views of one Work Unit; `surfaceIdFor` = `target::lens` distinguishes them). The Host must render
    // a committed surface ONLY when its identity matches where attention now points; otherwise the
    // destination has not been committed yet and the single "Thinking…" owner shows until the atomic
    // commit catches up. A subject/aspect movement inside the same surface keeps the same surfaceId, so
    // it is unaffected (no false Thinking on row selection).
    const desired = focus.desired;
    const committedMatchesDesired =
        committed != null &&
        (desired == null ||
            desired.target === WORKSPACE_ATTENTION_TARGET ||
            surfaceIdFor(committed.ref) === surfaceIdFor(desired));

    const showWorkUnit =
        committed != null &&
        committed.ref.target !== WORKSPACE_ATTENTION_TARGET &&
        !desiredIsWorkspace &&
        committedMatchesDesired;

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

    // ── NEVER-BLANK: single "Thinking…" owner during a cold Work Unit preparation (Kelly A3). ──
    // On a DIRECT work-unit load (or any entry where no Workspace is retained to recede), the route
    // renders the seed-only slug host (null) and no surface is committed yet — so the operator stared
    // at a blank canvas for the full ~3.8 s provisioning round-trip and it felt hung. When the ROUTE is
    // a work unit but nothing is committed yet (and we're not on our way back to the Workspace), show
    // the centered Alloy loader as the single owner instead of blank. On a gesture entry FROM the
    // Workspace the route stays `/workspace`, so the retained Workspace recedes and this never fires.
    const routeIsWorkUnit = surfaceHostShouldRenderWorkUnit(surfaceRefFromPath(pathname));
    // A WORK-UNIT → WORK-UNIT surface exchange (e.g. a Work View pill switch, or re-entering a Work
    // View whose Work Unit still holds a DIFFERENT committed surface). Here the committed surface is a
    // Work Unit that does not match the desired destination, so it must not render (mixed), and the
    // retained Workspace must NOT be revealed either (the operator is inside a Work Unit, not returning
    // Home). The canonical "Thinking…" owner holds the region until the destination commits atomically.
    // This does not rely on `usePathname` (which does not track the `replaceState` address), so it is
    // correct even when the route projection has not yet reached Next's router.
    const committedIsWorkUnit = committed != null && committed.ref.target !== WORKSPACE_ATTENTION_TARGET;
    const workUnitExchange = committedIsWorkUnit && !committedMatchesDesired && !desiredIsWorkspace;
    const showWorkUnitLoader = !showWorkUnit && !desiredIsWorkspace && (routeIsWorkUnit || workUnitExchange);

    return (
        <>
            <div
                data-surface-slot={slot}
                // `held` = a Work Unit has revealed; the Workspace is retained (mounted, scroll preserved)
                // but display:none so the incoming surface owns the whole region. `outgoing` = receding,
                // non-interactive. `current` = the live, interactive Workspace.
                className={`flex min-h-0 flex-1 flex-col ${
                    showWorkUnit || showWorkUnitLoader
                        ? "hidden"
                        : outgoingYielding
                          ? "motion-recede pointer-events-none"
                          : ""
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
            {showWorkUnit ? (
                <ProvisionedWorkUnitSurface />
            ) : showWorkUnitLoader ? (
                <AlloyOperationalBootShell variant="work_unit" chrome="content" />
            ) : null}
        </>
    );
}

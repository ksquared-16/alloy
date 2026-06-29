/**
 * Background workspace-root revalidation while operator is on work-unit / drawer surfaces.
 * Stale-while-revalidate: never blocks navigation; keeps session cache fresh for /workspace return.
 */

import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { loadOperatorLifecycleLandingCards, peekOperatorLifecycleLandingCards } from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { writeWorkspaceRootCache, readWorkspaceRootCache } from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { markWorkspaceRootRestore } from "@/lib/perf/workspaceContinuityPerf";

export type WorkspaceContinuityScope = {
    orgId: string;
    principalUserId: string | null;
    accessScopeFingerprint: string;
};

let scheduledForScope: string | null = null;

function scopeKey(scope: WorkspaceContinuityScope): string {
    const u = (scope.principalUserId ?? "").trim() || "__anon__";
    const fp = (scope.accessScopeFingerprint ?? "").trim() || "scope:unknown";
    return `${scope.orgId}:${u}:${fp}`;
}

/** Hydrate lifecycle cards from memory or session without network. */
export function peekWorkspaceLifecycleCardsForRestore(
    scope: WorkspaceContinuityScope,
): OperatorLifecycleLandingCard[] | null {
    const memory = peekOperatorLifecycleLandingCards();
    if (memory?.length) {
        markWorkspaceRootRestore("memory", { org_id: scope.orgId, lifecycle_cards: memory.length });
        return memory;
    }
    const cached = readWorkspaceRootCache(scope.orgId, scope.principalUserId, scope.accessScopeFingerprint);
    if (cached?.lifecycleCards?.length) {
        markWorkspaceRootRestore("cache", { org_id: scope.orgId, lifecycle_cards: cached.lifecycleCards.length });
        return cached.lifecycleCards;
    }
    return null;
}

/**
 * Persist lifecycle cards into workspace session snapshot (SWR write-through).
 *
 * Navigation continuity (Operational Runtime Doctrine, Laws 5–6): when the operator
 * returns to `/workspace` from a work-unit, the lifecycle landing must reveal once
 * from a warm snapshot — never a `WorkspacePageLoadingGate`. The work-unit schedules
 * this write while the operator is on the work-unit (`scheduleWorkspaceRootRevalidation`).
 *
 * Previously this no-opped when no root entry existed yet (deep-link straight into a
 * work-unit, hard reload, or in-memory module cache lost), so the session-cache restore
 * path (`peekWorkspaceLifecycleCardsForRestore`) had nothing to return and the return
 * fell back to the cold loading gate. We now SEED a minimal snapshot in that case so the
 * lifecycle tiles always restore synchronously on return; departments/KPI values still
 * fetch and patch in place (they are not part of the lifecycle-tile first-paint bundle).
 */
export function writeWorkspaceLifecycleCardsCache(
    scope: WorkspaceContinuityScope,
    cards: OperatorLifecycleLandingCard[],
): void {
    const existing = readWorkspaceRootCache(scope.orgId, scope.principalUserId, scope.accessScopeFingerprint);
    writeWorkspaceRootCache(scope.orgId, scope.principalUserId, scope.accessScopeFingerprint, {
        departments: existing?.departments ?? [],
        deptTileStats: existing?.deptTileStats ?? {},
        metrics: existing?.metrics ?? { departments: null, workUnits: null },
        orgOpportunityKpis: existing?.orgOpportunityKpis ?? null,
        workspaceKpiStrip: existing?.workspaceKpiStrip,
        kpiPlacementPending: existing?.kpiPlacementPending ?? false,
        rollupRefined: existing?.rollupRefined ?? false,
        lifecycleCards: cards,
    });
}

/**
 * Quiet background refresh of lifecycle landing cards — call from work-unit page after shell ready.
 * Deduped per org/principal/scope for the session.
 */
export function scheduleWorkspaceRootRevalidation(
    scope: WorkspaceContinuityScope,
    reason: string = "work_unit_idle",
): () => void {
    const key = scopeKey(scope);
    if (scheduledForScope === key) return () => undefined;
    scheduledForScope = key;

    return scheduleAdminV2BackgroundWork(
        () => {
            void loadOperatorLifecycleLandingCards({ force: false })
                .then((cards) => {
                    if (!cards.length) return;
                    writeWorkspaceLifecycleCardsCache(scope, cards);
                    markWorkspaceRootRestore("network", {
                        org_id: scope.orgId,
                        lifecycle_cards: cards.length,
                        reason,
                    });
                })
                .catch(() => {
                    /* non-fatal background refresh */
                })
                .finally(() => {
                    if (scheduledForScope === key) scheduledForScope = null;
                });
        },
        { idleTimeoutMs: 1200, fallbackMs: 400 },
    );
}

/** Preserve card order on background refresh — metrics update in place, no section jump. */
export function mergeLifecycleCardsStableOrder(
    previous: readonly OperatorLifecycleLandingCard[],
    incoming: OperatorLifecycleLandingCard[],
): OperatorLifecycleLandingCard[] {
    if (!previous.length || !incoming.length) return incoming;
    const order = new Map(previous.map((card, index) => [card.id, index]));
    return [...incoming].sort((a, b) => {
        const ai = order.get(a.id) ?? 10_000;
        const bi = order.get(b.id) ?? 10_000;
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
    });
}

/** @internal */
export function resetWorkspaceContinuityPrefetchForTests(): void {
    scheduledForScope = null;
}

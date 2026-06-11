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

/** Persist lifecycle cards into workspace session snapshot (SWR write-through). */
export function writeWorkspaceLifecycleCardsCache(
    scope: WorkspaceContinuityScope,
    cards: OperatorLifecycleLandingCard[],
): void {
    const existing = readWorkspaceRootCache(scope.orgId, scope.principalUserId, scope.accessScopeFingerprint);
    if (!existing) return;
    writeWorkspaceRootCache(scope.orgId, scope.principalUserId, scope.accessScopeFingerprint, {
        departments: existing.departments,
        deptTileStats: existing.deptTileStats,
        metrics: existing.metrics,
        orgOpportunityKpis: existing.orgOpportunityKpis,
        workspaceKpiStrip: existing.workspaceKpiStrip,
        kpiPlacementPending: existing.kpiPlacementPending,
        rollupRefined: existing.rollupRefined,
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

/** @internal */
export function resetWorkspaceContinuityPrefetchForTests(): void {
    scheduledForScope = null;
}

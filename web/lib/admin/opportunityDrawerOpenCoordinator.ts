import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
    isOpportunityDrawerBootstrapWarm,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { markOpportunityDrawerHydrateDone } from "@/lib/admin/opportunityDrawerHydrateGuards";
import {
    fetchOpportunityDrawerPrimaryEntity,
    isOpportunityDrawerPrimaryWarm,
} from "@/lib/admin/opportunityDrawerPrimaryPrefetch";

/** Max overlay floor when cold — avoids sub-frame flash; skipped when intent prefetch is warm. */
export const OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS = 200;

export type OpportunityDrawerOpenPreload = {
    opportunityId: string;
    bootstrap: OpportunityDrawerOperationalBootstrapResponse;
    primaryEntity: Record<string, unknown>;
};

export type OpportunityDrawerOpenMetrics = {
    prefetch_hit: boolean;
    bootstrap_warm: boolean;
    primary_warm: boolean;
    bootstrap_ms: number;
    primary_ms: number;
    wait_for_both_ms: number;
    anti_flicker_ms: number;
};

export function shouldDeferOpportunityDrawerOpen(
    pathname: string | null | undefined,
    entityId: string
): boolean {
    if (!adminV2DrawerBootstrapEnabled()) return false;
    const id = entityId.trim();
    if (!id || id === "new") return false;
    const p = pathname ?? "";
    return p.startsWith("/adminV2") || p.startsWith("/admin/workspace");
}

/**
 * Loads bootstrap + drawer_primary in parallel. Marks primary hydrate done on success.
 * Opens as soon as both resolve; optional short anti-flicker floor only on cold path.
 */
export async function loadOpportunityDrawerFirstPaintWithOpenPolicy(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit,
    opts?: { overlayShownAt?: number }
): Promise<{ preload: OpportunityDrawerOpenPreload; metrics: OpportunityDrawerOpenMetrics }> {
    const id = opportunityId.trim();
    if (!id) throw new Error("missing_opportunity_id");

    const bootstrapWarm = isOpportunityDrawerBootstrapWarm(id);
    const primaryWarm = isOpportunityDrawerPrimaryWarm(id);
    const prefetchHit = bootstrapWarm && primaryWarm;

    const bothStart = typeof performance !== "undefined" ? performance.now() : 0;
    let bootstrapMs = 0;
    let primaryMs = 0;

    const bootstrapP = (async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const boot = await fetchOpportunityDrawerOperationalBootstrap(id, workspaceContext ?? null, init);
        bootstrapMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
        return boot;
    })();

    const primaryP = (async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const entity = await fetchOpportunityDrawerPrimaryEntity(id, init);
        primaryMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
        return entity;
    })();

    const [bootstrap, primaryEntity] = await Promise.all([bootstrapP, primaryP]);
    const waitForBothMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - bothStart);

    markOpportunityDrawerHydrateDone(id, "primary");

    let antiFlickerMs = 0;
    if (!prefetchHit && opts?.overlayShownAt != null && typeof performance !== "undefined") {
        const elapsed = performance.now() - opts.overlayShownAt;
        if (elapsed < OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS) {
            antiFlickerMs = Math.round(OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS - elapsed);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, antiFlickerMs);
            });
        }
    }

    return {
        preload: {
            opportunityId: id,
            bootstrap,
            primaryEntity,
        },
        metrics: {
            prefetch_hit: prefetchHit,
            bootstrap_warm: bootstrapWarm,
            primary_warm: primaryWarm,
            bootstrap_ms: bootstrapMs,
            primary_ms: primaryMs,
            wait_for_both_ms: waitForBothMs,
            anti_flicker_ms: antiFlickerMs,
        },
    };
}

import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
    isOpportunityDrawerBootstrapWarm,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { markOpportunityDrawerHydrateDone } from "@/lib/admin/opportunityDrawerHydrateGuards";
import { fetchOpportunityDrawerFullEntity, isOpportunityDrawerFullWarm } from "@/lib/admin/opportunityDrawerFullPrefetch";
import {
    buildOpportunityDrawerHeaderActionsUrl,
    fetchOpportunityDrawerHeaderActions,
    isOpportunityDrawerHeaderActionsWarm,
} from "@/lib/admin/opportunityDrawerHeaderActionsPrefetch";
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
    /** Merged `surface=full` row when pre-open fetch succeeded. */
    fullEntity: Record<string, unknown> | null;
    headerActions: ResolvedActionsBySlot;
    /** When true, enrichment overview sections stay unmounted until user edit/expand. */
    enrichmentHeldUntilInteraction: boolean;
};

export type OpportunityDrawerOpenMetrics = {
    prefetch_hit: boolean;
    bootstrap_warm: boolean;
    primary_warm: boolean;
    full_warm: boolean;
    bootstrap_ms: number;
    primary_ms: number;
    full_ms: number | null;
    header_actions_ms: number;
    wait_for_composed_ms: number;
    anti_flicker_ms: number;
    enrichment_held: boolean;
};

export function opportunityDrawerComposedRevealReady(preload: OpportunityDrawerOpenPreload): boolean {
    if (!opportunityDrawerPrimaryContractReady(preload.primaryEntity, preload.opportunityId)) return false;
    if (preload.headerActions == null || typeof preload.headerActions !== "object") return false;
    if (preload.bootstrap?.entity == null) return false;
    if (preload.fullEntity) {
        return String(preload.fullEntity._record_surface ?? "").trim() === "full";
    }
    return preload.enrichmentHeldUntilInteraction === true;
}

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
 * Loads bootstrap, drawer_primary, surface=full, and record_header actions before drawer mount.
 * Opens when composed reveal contract is satisfied (full present OR enrichment held).
 */
export async function loadOpportunityDrawerComposedOpen(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit,
    opts?: { overlayShownAt?: number }
): Promise<{ preload: OpportunityDrawerOpenPreload; metrics: OpportunityDrawerOpenMetrics }> {
    const id = opportunityId.trim();
    if (!id) throw new Error("missing_opportunity_id");

    const bootstrapWarm = isOpportunityDrawerBootstrapWarm(id);
    const primaryWarm = isOpportunityDrawerPrimaryWarm(id);
    const fullWarm = isOpportunityDrawerFullWarm(id);
    const prefetchHit = bootstrapWarm && primaryWarm && fullWarm;

    const composedStart = typeof performance !== "undefined" ? performance.now() : 0;
    let bootstrapMs = 0;
    let primaryMs = 0;
    let fullMs: number | null = null;
    let headerActionsMs = 0;

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

    const fullP = (async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        try {
            const entity = await fetchOpportunityDrawerFullEntity(id, init);
            fullMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
            return entity;
        } catch {
            fullMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
            return null;
        }
    })();

    const [bootstrap, primaryEntity, fullEntity] = await Promise.all([bootstrapP, primaryP, fullP]);

    const headerActionsUrl = buildOpportunityDrawerHeaderActionsUrl(
        id,
        workspaceContext ?? null,
        primaryEntity,
        bootstrap
    );
    const headerUrlWarm = isOpportunityDrawerHeaderActionsWarm(headerActionsUrl);

    const headerT0 = typeof performance !== "undefined" ? performance.now() : 0;
    const headerActions = await fetchOpportunityDrawerHeaderActions(
        id,
        workspaceContext ?? null,
        primaryEntity,
        bootstrap,
        init
    );
    headerActionsMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - headerT0);

    const enrichmentHeldUntilInteraction = fullEntity == null;
    const preload: OpportunityDrawerOpenPreload = {
        opportunityId: id,
        bootstrap,
        primaryEntity,
        fullEntity,
        headerActions,
        enrichmentHeldUntilInteraction,
    };

    if (!opportunityDrawerComposedRevealReady(preload)) {
        throw new Error("drawer_composed_contract_not_ready");
    }

    markOpportunityDrawerHydrateDone(id, "primary");
    if (fullEntity) {
        markOpportunityDrawerHydrateDone(id, "full");
    }

    const waitForComposedMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - composedStart);

    let antiFlickerMs = 0;
    const warmEnough = prefetchHit || headerUrlWarm;
    if (!warmEnough && opts?.overlayShownAt != null && typeof performance !== "undefined") {
        const elapsed = performance.now() - opts.overlayShownAt;
        if (elapsed < OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS) {
            antiFlickerMs = Math.round(OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS - elapsed);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, antiFlickerMs);
            });
        }
    }

    return {
        preload,
        metrics: {
            prefetch_hit: prefetchHit,
            bootstrap_warm: bootstrapWarm,
            primary_warm: primaryWarm,
            full_warm: fullWarm,
            bootstrap_ms: bootstrapMs,
            primary_ms: primaryMs,
            full_ms: fullMs,
            header_actions_ms: headerActionsMs,
            wait_for_composed_ms: waitForComposedMs,
            anti_flicker_ms: antiFlickerMs,
            enrichment_held: enrichmentHeldUntilInteraction,
        },
    };
}

/** @deprecated alias */
export const loadOpportunityDrawerFirstPaintWithOpenPolicy = loadOpportunityDrawerComposedOpen;

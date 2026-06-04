import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
    isOpportunityDrawerBootstrapWarm,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { peekDrawerEntitySnapshot, putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import { drawerSnapshotReuseEligible } from "@/lib/admin/drawer/drawerPerformanceContract";
import { opportunityDrawerComposedAboveFoldReady } from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
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
import {
    reportDrawerBootstrapReady,
    reportDrawerComposedRevealReady,
    reportDrawerHeaderActionsReady,
    reportDrawerPrimaryReadyAtOpen,
} from "@/lib/perf/adminV2DrawerPerf";
import {
    setAdminV2DrawerOpenPending,
} from "@/lib/perf/adminV2PrimarySurfaceGate";
import { markAdminV2DrawerOpenBudgetStart } from "@/lib/perf/adminV2JankBudget";
import { scheduleOpportunityDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/runOpportunityDrawerViewModelShadow";

/** Max overlay floor when cold — avoids sub-frame flash; skipped when intent prefetch is warm. */
export const OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS = 200;

export type OpportunityDrawerOpenPreload = {
    opportunityId: string;
    bootstrap: OpportunityDrawerOperationalBootstrapResponse;
    primaryEntity: Record<string, unknown>;
    /** Merged `surface=full` when warm cache resolved before commit (optional; never gates open). */
    fullEntity: Record<string, unknown> | null;
    headerActions: ResolvedActionsBySlot;
    /** When true, enrichment overview sections stay unmounted until user edit/expand or background full merges. */
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
    full_attached_at_open: boolean;
};

/**
 * Primary-gated composed reveal: bootstrap shell + drawer_primary + header actions.
 * Does not require surface=full, comms, tours, or below-fold enrichments.
 */
export function opportunityDrawerComposedRevealReady(preload: OpportunityDrawerOpenPreload): boolean {
    if (!opportunityDrawerPrimaryContractReady(preload.primaryEntity, preload.opportunityId)) return false;
    if (preload.headerActions == null || typeof preload.headerActions !== "object") return false;
    if (preload.bootstrap?.entity == null) return false;
    const paintRecord = (preload.fullEntity ?? preload.primaryEntity) as Record<string, unknown>;
    return opportunityDrawerComposedAboveFoldReady({
        primaryEntity: paintRecord,
        opportunityId: preload.opportunityId,
        inquiryChildrenSectionVisible: true,
    });
}

/** @deprecated alias — same as {@link opportunityDrawerComposedRevealReady} */
export const opportunityDrawerPrimaryGatedRevealReady = opportunityDrawerComposedRevealReady;

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

/** Non-blocking peek: attach full entity only if the in-flight/full cache promise is already settled. */
async function peekOpportunityDrawerFullEntity(
    fullP: Promise<Record<string, unknown> | null>
): Promise<Record<string, unknown> | null> {
    try {
        return await Promise.race([
            fullP,
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), 0);
            }),
        ]);
    } catch {
        return null;
    }
}

/**
 * Loads bootstrap + drawer_primary + record_header actions before drawer mount.
 * Starts surface=full in the background (intent warm / dedupe cache); full never gates commit.
 */
export async function loadOpportunityDrawerComposedOpen(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit,
    opts?: {
        overlayShownAt?: number;
        queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null;
    }
): Promise<{ preload: OpportunityDrawerOpenPreload; metrics: OpportunityDrawerOpenMetrics }> {
    const id = opportunityId.trim();
    if (!id) throw new Error("missing_opportunity_id");

    setAdminV2DrawerOpenPending(true, "drawer_composed_open");
    markAdminV2DrawerOpenBudgetStart();

    const bootstrapWarm = isOpportunityDrawerBootstrapWarm(id);
    const primaryWarm = isOpportunityDrawerPrimaryWarm(id);
    const fullWarm = isOpportunityDrawerFullWarm(id);
    const prefetchHit = bootstrapWarm && primaryWarm;

    // Card 1 + Card 3 — drawer open reuse via the Drawer Performance Contract. Reuse a cached
    // `full` snapshot whose ABOVE-FOLD is complete, even if below-fold/background (e.g. member
    // graph) is still pending — that pending work fills invisibly post-paint and must not block
    // reuse. Reusing it (and not downgrading it to `drawer_primary` below) lets AdminEntityDrawer's
    // restore logic skip the background cache-bust hydrate.
    const warmFullSnapshot: Record<string, unknown> | null = (() => {
        const snap = peekDrawerEntitySnapshot("opportunities", id) as Record<string, unknown> | null;
        if (!snap) return null;
        if (!drawerSnapshotReuseEligible("opportunities", snap, id)) return null;
        return snap;
    })();

    const composedStart = typeof performance !== "undefined" ? performance.now() : 0;
    let bootstrapMs = 0;
    let primaryMs = 0;
    let fullMs: number | null = null;
    let headerActionsMs = 0;

    const fullStart = typeof performance !== "undefined" ? performance.now() : 0;
    const fullP: Promise<Record<string, unknown> | null> = warmFullSnapshot
        ? Promise.resolve(warmFullSnapshot)
        : fetchOpportunityDrawerFullEntity(id, init)
              .then((entity) => {
                  fullMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - fullStart);
                  return entity;
              })
              .catch(() => {
                  fullMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - fullStart);
                  return null;
              });

    const bootstrapP = (async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const boot = await fetchOpportunityDrawerOperationalBootstrap(id, workspaceContext ?? null, init);
        bootstrapMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
        return boot;
    })();

    const primaryP = (async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        if (warmFullSnapshot) {
            // Reuse the fresh `full` snapshot as the primary entity — no refetch, and crucially
            // do NOT write a `drawer_primary` snapshot below (which would downgrade the cached
            // `full` and re-trigger the background hydrate on mount).
            primaryMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
            return warmFullSnapshot;
        }
        const boot = await bootstrapP;
        const bootEntity = boot.entity as Record<string, unknown> | null | undefined;
        if (
            bootEntity &&
            typeof bootEntity === "object" &&
            opportunityDrawerPrimaryContractReady(bootEntity, id)
        ) {
            const primaryFromBootstrap: Record<string, unknown> = {
                ...bootEntity,
                _record_surface:
                    String(bootEntity._record_surface ?? "").trim() === "drawer_visible"
                        ? "drawer_primary"
                        : bootEntity._record_surface,
            };
            putDrawerEntitySnapshot("opportunities", id, primaryFromBootstrap);
            primaryMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
            return primaryFromBootstrap;
        }
        const entity = await fetchOpportunityDrawerPrimaryEntity(
            id,
            init,
            workspaceContext ?? null,
            opts?.queuePreviewSeed ?? null
        );
        primaryMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
        return entity;
    })();

    const [bootstrap, primaryEntity] = await Promise.all([bootstrapP, primaryP]);
    reportDrawerBootstrapReady(id, bootstrapMs);
    reportDrawerPrimaryReadyAtOpen(id, primaryMs);

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
    reportDrawerHeaderActionsReady(id, headerActionsMs);

    const peekedFull = await peekOpportunityDrawerFullEntity(fullP);
    let fullEntity: Record<string, unknown> | null = null;
    if (peekedFull && String(peekedFull._record_surface ?? "").trim() === "full") {
        fullEntity = peekedFull;
    }

    let paintEntity = fullEntity ?? primaryEntity;
    if (
        !opportunityDrawerComposedAboveFoldReady({
            primaryEntity: paintEntity,
            opportunityId: id,
            inquiryChildrenSectionVisible: true,
        })
    ) {
        fullEntity = await fullP.catch(() => null);
        if (fullEntity && String(fullEntity._record_surface ?? "").trim() === "full") {
            paintEntity = fullEntity;
        }
    }

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

    const waitForComposedMs = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - composedStart);
    reportDrawerComposedRevealReady(id, waitForComposedMs);
    setAdminV2DrawerOpenPending(false, "composed_reveal");

    markOpportunityDrawerHydrateDone(id, "primary");
    if (fullEntity) {
        markOpportunityDrawerHydrateDone(id, "full");
    }

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

    scheduleOpportunityDrawerViewModelShadow({
        preload,
        workspaceContext: workspaceContext ?? null,
        init,
    });

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
            full_attached_at_open: fullEntity != null,
        },
    };
}

/** @deprecated alias */
export const loadOpportunityDrawerFirstPaintWithOpenPolicy = loadOpportunityDrawerComposedOpen;

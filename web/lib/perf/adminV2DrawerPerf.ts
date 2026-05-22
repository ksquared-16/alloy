/**
 * Drawer timing marks and structured perf lines for Admin V2 opportunity drawer.
 * Phase-boundary only — not for render loops.
 */

import { alloyPerfSet, ensureAlloyPerf } from "@/lib/perf/alloyPerfGlobal";
import { emitAdminV2Perf, perfDrawerFullHydrate } from "@/lib/perf/adminV2PerfLog";

const ROW_CLICK_MARK = "drawer_row_click_at";
const OPEN_START_MARK = "drawer_open_start";
const OPEN_OVERLAY_MARK = "drawer_open_overlay_at";
const OPEN_COMMIT_MARK = "drawer_open_commit_at";
const VISIBLE_REQ_MARK = "drawer_opportunity_visible_req";
const VISIBLE_APPLIED_MARK = "drawer_opportunity_visible_applied";
const BOOTSTRAP_READY_MARK = "drawer_bootstrap_ready_at";
const PRIMARY_READY_MARK = "drawer_primary_ready_at";
const HEADER_ACTIONS_READY_MARK = "drawer_header_actions_ready_at";
const COMPOSED_REVEAL_READY_MARK = "drawer_composed_reveal_ready_at";
const FULL_APPLIED_MARK = "drawer_opportunity_full_applied";
const POST_REVEAL_ENRICH_START_MARK = "drawer_post_reveal_enrich_start_at";
const POST_REVEAL_ENRICH_END_MARK = "drawer_post_reveal_enrich_end_at";
const BOOTSTRAP_REQ_MARK = "drawer_bootstrap_request_start";
const BOOTSTRAP_APPLIED_MARK = "drawer_bootstrap_applied";

function msBetween(startMark: string, endMark: string): number | undefined {
    const perf = ensureAlloyPerf();
    if (!perf) return undefined;
    const a = perf.get(startMark);
    const b = perf.get(endMark);
    if (a == null || b == null) return undefined;
    return Math.round(b - a);
}

/** Queue row → drawer open (call immediately before `openDrawer`). */
export function markDrawerRowClickStart(): void {
    if (typeof performance === "undefined") return;
    alloyPerfSet(ROW_CLICK_MARK, performance.now());
}

export function markDrawerOpenStart(): void {
    if (typeof performance === "undefined") return;
    alloyPerfSet(OPEN_START_MARK, performance.now());
}

/** Deferred open: external overlay mounted (after row click). */
export function markDrawerOpenOverlayShown(): void {
    if (typeof performance === "undefined") return;
    const t = performance.now();
    alloyPerfSet(OPEN_OVERLAY_MARK, t);
    const clickToOverlay = msBetween(ROW_CLICK_MARK, OPEN_OVERLAY_MARK);
    if (clickToOverlay != null) {
        alloyPerfSet("drawer_open_click_to_overlay", clickToOverlay);
    }
}

export type DrawerOpenCoordinatorPerf = {
    prefetch_hit: boolean;
    bootstrap_warm: boolean;
    primary_warm: boolean;
    full_warm?: boolean;
    bootstrap_ms: number;
    primary_ms: number;
    full_ms?: number | null;
    header_actions_ms: number;
    wait_for_composed_ms: number;
    wait_for_both_ms?: number;
    anti_flicker_ms: number;
    enrichment_held?: boolean;
    /** Non-blocking peek: full resolved before commit (warm cache). */
    full_attached_at_open?: boolean;
};

function emitDrawerOpenPhase(
    phase: string,
    opportunityId: string,
    extra?: Record<string, unknown>
): void {
    emitAdminV2Perf("[perf.drawer.open]", {
        surface: "drawer_opportunity",
        phase,
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        source: "network",
        ...extra,
    });
}

/** Coordinator: bootstrap payload ready (pre-mount gate). */
export function reportDrawerBootstrapReady(opportunityId: string, bootstrapMs: number): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(BOOTSTRAP_READY_MARK, performance.now());
    }
    emitDrawerOpenPhase("bootstrap_ready", opportunityId, { bootstrap_ms: bootstrapMs });
}

/** Coordinator: `drawer_primary` entity ready (pre-mount gate). */
export function reportDrawerPrimaryReadyAtOpen(opportunityId: string, primaryMs: number): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(PRIMARY_READY_MARK, performance.now());
    }
    emitDrawerOpenPhase("drawer_primary_ready", opportunityId, { drawer_primary_ms: primaryMs });
}

/** Coordinator: record_header actions resolved (pre-mount gate). */
export function reportDrawerHeaderActionsReady(opportunityId: string, headerActionsMs: number): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(HEADER_ACTIONS_READY_MARK, performance.now());
    }
    emitDrawerOpenPhase("header_actions_ready", opportunityId, {
        drawer_open_header_actions_ms: headerActionsMs,
    });
}

/** Coordinator: primary-gated composed reveal contract satisfied — drawer may commit. */
export function reportDrawerComposedRevealReady(
    opportunityId: string,
    waitForComposedMs: number
): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(COMPOSED_REVEAL_READY_MARK, performance.now());
    }
    emitDrawerOpenPhase("composed_reveal_ready", opportunityId, {
        drawer_open_wait_for_composed_ms: waitForComposedMs,
    });
}

/** Deferred open: bootstrap + primary ready, drawer committed. */
export function reportDrawerOpenCoordinatorCommit(
    opportunityId: string,
    metrics: DrawerOpenCoordinatorPerf
): void {
    if (typeof performance === "undefined") return;
    const t = performance.now();
    alloyPerfSet(OPEN_COMMIT_MARK, t);
    const clickToOverlay = msBetween(ROW_CLICK_MARK, OPEN_OVERLAY_MARK);
    const clickToCommit = msBetween(ROW_CLICK_MARK, OPEN_COMMIT_MARK);
    if (clickToOverlay != null) alloyPerfSet("drawer_open_click_to_overlay", clickToOverlay);
    if (clickToCommit != null) alloyPerfSet("drawer_open_click_to_commit_ms", clickToCommit);
    const waitComposed = metrics.wait_for_composed_ms ?? metrics.wait_for_both_ms ?? 0;
    alloyPerfSet("drawer_open_bootstrap_ms", metrics.bootstrap_ms);
    alloyPerfSet("drawer_open_primary_ms", metrics.primary_ms);
    if (metrics.full_ms != null) alloyPerfSet("drawer_open_full_ms", metrics.full_ms);
    alloyPerfSet("drawer_open_header_actions_ms", metrics.header_actions_ms);
    alloyPerfSet("drawer_open_wait_for_composed_ms", waitComposed);
    alloyPerfSet("drawer_open_prefetch_hit", metrics.prefetch_hit ? 1 : 0);

    emitAdminV2Perf("[perf.drawer.open]", {
        surface: "drawer_opportunity",
        phase: "deferred_composed_commit",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        drawer_open_click_to_overlay: clickToOverlay,
        drawer_open_click_to_commit_ms: clickToCommit,
        drawer_open_bootstrap_ms: metrics.bootstrap_ms,
        drawer_open_primary_ms: metrics.primary_ms,
        drawer_open_full_ms: metrics.full_ms ?? undefined,
        drawer_open_header_actions_ms: metrics.header_actions_ms,
        drawer_open_wait_for_composed_ms: waitComposed,
        drawer_open_anti_flicker_ms: metrics.anti_flicker_ms,
        drawer_open_prefetch_hit: metrics.prefetch_hit,
        drawer_open_bootstrap_warm: metrics.bootstrap_warm,
        drawer_open_primary_warm: metrics.primary_warm,
        drawer_open_full_warm: metrics.full_warm,
        drawer_open_enrichment_held: metrics.enrichment_held,
        drawer_open_full_attached_at_open: metrics.full_attached_at_open,
        source: metrics.prefetch_hit ? "cache" : "network",
    });

    if (clickToCommit != null && clickToCommit > 1200 && !metrics.prefetch_hit) {
        emitAdminV2Perf("[perf.drawer.open]", {
            surface: "drawer_opportunity",
            phase: "deferred_open_slow_cold",
            opportunity_id: opportunityId,
            entity_id: opportunityId,
            total_ms: clickToCommit,
            drawer_open_wait_for_composed_ms: waitComposed,
            drawer_open_prefetch_hit: false,
            source: "network",
        });
    }
}

export function markDrawerBootstrapRequestStart(): void {
    if (typeof performance === "undefined") return;
    alloyPerfSet(BOOTSTRAP_REQ_MARK, performance.now());
}

export function markDrawerBootstrapApplied(opportunityId: string): void {
    if (typeof performance === "undefined") return;
    const t = performance.now();
    alloyPerfSet(BOOTSTRAP_APPLIED_MARK, t);
    alloyPerfSet(VISIBLE_APPLIED_MARK, t);
    alloyPerfSet("drawer_opportunity_visible_applied", t);
    reportDrawerVisibleApplied(opportunityId);
}

export function reportDrawerVisibleApplied(opportunityId: string): void {
    const rowToVisible = msBetween(ROW_CLICK_MARK, VISIBLE_APPLIED_MARK);
    const openToVisible = msBetween(OPEN_START_MARK, VISIBLE_APPLIED_MARK);
    const reqToVisible = msBetween(VISIBLE_REQ_MARK, VISIBLE_APPLIED_MARK);
    emitAdminV2Perf("[perf.drawer.phase]", {
        surface: "drawer_opportunity",
        phase: "row_click_to_drawer_visible",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        total_ms: rowToVisible,
        open_to_visible_ms: openToVisible,
        req_to_visible_ms: reqToVisible,
        source: "network",
    });
}

/** In-drawer: coordinated overview reveal after primary contract (post-mount). */
export function reportDrawerPrimaryReady(opportunityId: string): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(PRIMARY_READY_MARK, performance.now());
    }
    const visibleToPrimary = msBetween(VISIBLE_APPLIED_MARK, PRIMARY_READY_MARK);
    const rowToPrimary = msBetween(ROW_CLICK_MARK, PRIMARY_READY_MARK);
    emitAdminV2Perf("[perf.drawer.phase]", {
        surface: "drawer_opportunity",
        phase: "drawer_visible_to_primary_ready",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        total_ms: visibleToPrimary,
        row_click_to_primary_ms: rowToPrimary,
        source: "network",
    });
}

/** Background `surface=full` merged into drawer state. */
export function reportDrawerFullHydrated(opportunityId: string): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(FULL_APPLIED_MARK, performance.now());
    }
    const visibleToFull = msBetween(VISIBLE_APPLIED_MARK, FULL_APPLIED_MARK);
    const rowToFull = msBetween(ROW_CLICK_MARK, FULL_APPLIED_MARK);
    const composedToFull = msBetween(COMPOSED_REVEAL_READY_MARK, FULL_APPLIED_MARK);
    perfDrawerFullHydrate({
        phase: "full_hydrate_ready",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        total_ms: visibleToFull,
        drawer_full_hydrate_ms: visibleToFull,
        row_click_to_full_ms: rowToFull,
        composed_reveal_to_full_ms: composedToFull,
    });
    emitDrawerOpenPhase("full_hydrate_ready", opportunityId, {
        drawer_full_hydrate_ms: visibleToFull,
        composed_reveal_to_full_ms: composedToFull,
    });
}

/** Post-reveal enrich window opened (`postDrawerVisible` after primary contract — not full). */
export function reportPostRevealEnrichStart(opportunityId: string): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(POST_REVEAL_ENRICH_START_MARK, performance.now());
    }
    const revealToEnrich = msBetween(COMPOSED_REVEAL_READY_MARK, POST_REVEAL_ENRICH_START_MARK);
    emitDrawerOpenPhase("post_reveal_enrich_start", opportunityId, {
        composed_reveal_to_enrich_start_ms: revealToEnrich,
    });
}

/** Below-fold enrichment window open (scroll/idle unlock — oper/tours may mount). */
export function reportPostRevealEnrichEnd(opportunityId: string): void {
    if (typeof performance !== "undefined") {
        alloyPerfSet(POST_REVEAL_ENRICH_END_MARK, performance.now());
    }
    const enrichStartToEnd = msBetween(POST_REVEAL_ENRICH_START_MARK, POST_REVEAL_ENRICH_END_MARK);
    emitDrawerOpenPhase("post_reveal_enrich_end", opportunityId, {
        post_reveal_enrich_ms: enrichStartToEnd,
    });
}

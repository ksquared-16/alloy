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
const PRIMARY_READY_MARK = "drawer_primary_ready_at";
const FULL_APPLIED_MARK = "drawer_opportunity_full_applied";
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
    bootstrap_ms: number;
    primary_ms: number;
    wait_for_both_ms: number;
    anti_flicker_ms: number;
};

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
    alloyPerfSet("drawer_open_bootstrap_ms", metrics.bootstrap_ms);
    alloyPerfSet("drawer_open_primary_ms", metrics.primary_ms);
    alloyPerfSet("drawer_open_wait_for_both_ms", metrics.wait_for_both_ms);
    alloyPerfSet("drawer_open_prefetch_hit", metrics.prefetch_hit ? 1 : 0);

    emitAdminV2Perf("[perf.drawer.open]", {
        surface: "drawer_opportunity",
        phase: "deferred_first_paint_commit",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        drawer_open_click_to_overlay: clickToOverlay,
        drawer_open_click_to_commit_ms: clickToCommit,
        drawer_open_bootstrap_ms: metrics.bootstrap_ms,
        drawer_open_primary_ms: metrics.primary_ms,
        drawer_open_wait_for_both_ms: metrics.wait_for_both_ms,
        drawer_open_anti_flicker_ms: metrics.anti_flicker_ms,
        drawer_open_prefetch_hit: metrics.prefetch_hit,
        drawer_open_bootstrap_warm: metrics.bootstrap_warm,
        drawer_open_primary_warm: metrics.primary_warm,
        source: metrics.prefetch_hit ? "cache" : "network",
    });

    if (clickToCommit != null && clickToCommit > 1200 && !metrics.prefetch_hit) {
        emitAdminV2Perf("[perf.drawer.open]", {
            surface: "drawer_opportunity",
            phase: "deferred_open_slow_cold",
            opportunity_id: opportunityId,
            entity_id: opportunityId,
            total_ms: clickToCommit,
            drawer_open_wait_for_both_ms: metrics.wait_for_both_ms,
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

export function reportDrawerFullHydrated(opportunityId: string): void {
    const visibleToFull = msBetween(VISIBLE_APPLIED_MARK, FULL_APPLIED_MARK);
    const rowToFull = msBetween(ROW_CLICK_MARK, FULL_APPLIED_MARK);
    perfDrawerFullHydrate({
        phase: "drawer_visible_to_full_hydrated",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        total_ms: visibleToFull,
        drawer_full_hydrate_ms: visibleToFull,
        row_click_to_full_ms: rowToFull,
    });
}

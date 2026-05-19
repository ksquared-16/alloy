/**
 * Drawer timing marks and structured perf lines for Admin V2 opportunity drawer.
 * Phase-boundary only — not for render loops.
 */

import { alloyPerfSet, ensureAlloyPerf } from "@/lib/perf/alloyPerfGlobal";
import { emitAdminV2Perf, perfDrawerFullHydrate } from "@/lib/perf/adminV2PerfLog";

const ROW_CLICK_MARK = "drawer_row_click_at";
const OPEN_START_MARK = "drawer_open_start";
const VISIBLE_REQ_MARK = "drawer_opportunity_visible_req";
const VISIBLE_APPLIED_MARK = "drawer_opportunity_visible_applied";
const PRIMARY_READY_MARK = "drawer_primary_ready_at";
const FULL_APPLIED_MARK = "drawer_opportunity_full_applied";

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

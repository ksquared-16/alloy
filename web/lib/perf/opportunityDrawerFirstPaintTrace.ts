/**
 * Opportunity drawer first-paint trace — post-open fetch budget + above-fold stability marks.
 */

import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { emitAdminV2Perf } from "@/lib/perf/adminV2PerfLog";

const ABOVE_FOLD_STABLE_MARK = "drawer_above_fold_stable_at";
const POST_OPEN_FETCH_COUNT_MARK = "drawer_post_open_fetch_count";

type PostOpenFetchKind =
    | "activity_signal"
    | "tour_bookings"
    | "inquiry_summary_right"
    | "registry_section_actions"
    | "member_person_graph"
    | "other";

let postOpenFetchCounts: Record<string, number> = {};
let postOpenFetchKinds: PostOpenFetchKind[] = [];
let activeOpportunityId: string | null = null;

export function resetOpportunityDrawerFirstPaintTrace(opportunityId: string): void {
    activeOpportunityId = opportunityId;
    postOpenFetchCounts = {};
    postOpenFetchKinds = [];
    if (typeof performance !== "undefined") {
        alloyPerfSet(POST_OPEN_FETCH_COUNT_MARK, 0);
    }
}

export function recordOpportunityDrawerPostOpenFetch(
    opportunityId: string,
    kind: PostOpenFetchKind
): void {
    if (activeOpportunityId !== opportunityId) {
        resetOpportunityDrawerFirstPaintTrace(opportunityId);
    }
    postOpenFetchCounts[kind] = (postOpenFetchCounts[kind] ?? 0) + 1;
    postOpenFetchKinds.push(kind);
    const total = Object.values(postOpenFetchCounts).reduce((a, b) => a + b, 0);
    if (typeof performance !== "undefined") {
        alloyPerfSet(POST_OPEN_FETCH_COUNT_MARK, total);
    }
}

export function reportDrawerAboveFoldStable(opportunityId: string): void {
    if (typeof performance === "undefined") return;
    const t = performance.now();
    alloyPerfSet(ABOVE_FOLD_STABLE_MARK, t);
    emitAdminV2Perf("[perf.drawer.first_paint]", {
        surface: "drawer_opportunity",
        phase: "above_fold_stable",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        post_open_fetch_count: Object.values(postOpenFetchCounts).reduce((a, b) => a + b, 0),
        post_open_fetch_by_kind: { ...postOpenFetchCounts },
        post_open_fetch_kinds: [...postOpenFetchKinds],
        source: "network",
    });
}

export function reportDrawerFirstPaintHydrateWave(
    opportunityId: string,
    wave: "primary_merge" | "full_merge",
    changedKeys: string[]
): void {
    emitAdminV2Perf("[perf.drawer.first_paint]", {
        surface: "drawer_opportunity",
        phase: "hydrate_wave",
        opportunity_id: opportunityId,
        entity_id: opportunityId,
        wave,
        changed_keys: changedKeys.slice(0, 24),
        changed_key_count: changedKeys.length,
        source: "network",
    });
}

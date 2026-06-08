import type { PlacementCandidateActiveOverrideSummary } from "@/lib/orchestration/placement/placementCandidateTypes";

/** Drop expired temporary overrides at read/eval time (history preserved in DB). */
export function filterActivePlacementOverrides(
    overrides: PlacementCandidateActiveOverrideSummary[],
    nowMs: number
): PlacementCandidateActiveOverrideSummary[] {
    return overrides.filter((o) => {
        if (o.override_kind !== "temporary") return true;
        if (!o.expires_at?.trim()) return false;
        const ms = Date.parse(o.expires_at);
        return Number.isFinite(ms) && ms > nowMs;
    });
}

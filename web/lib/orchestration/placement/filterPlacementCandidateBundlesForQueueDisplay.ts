/**
 * Queue display filter — suppress synthetic fallback candidates when real child-linked rows exist.
 */

import type { PlacementCandidateQueueBundle } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";

export function filterPlacementCandidateBundlesForQueueDisplay(
    bundles: ReadonlyArray<PlacementCandidateQueueBundle>
): PlacementCandidateQueueBundle[] {
    if (!bundles.length) return [];
    const real = bundles.filter((b) => b.candidate.is_synthetic_fallback !== true);
    return real.length > 0 ? [...real] : [...bundles];
}

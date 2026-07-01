/**
 * Experience Builder preview — resolve opportunity id from global search hits.
 */

import {
    formatGlobalSearchHitPrimaryName,
    formatGlobalSearchHitSecondaryLine,
} from "@/lib/admin/globalSearch/globalRecordSearchResultPresentation";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

export type LayoutBuilderPreviewRecordSelection = {
    opportunityId: string;
    label: string;
    secondary?: string | null;
};

export function resolvePreviewOpportunityIdFromSearchHit(hit: GlobalRecordSearchHit): string | null {
    if (hit.entity_type === "opportunities") {
        return hit.entity_id?.trim() || hit.opportunity_id?.trim() || null;
    }
    const fromCluster = hit.opportunity_id?.trim();
    if (fromCluster) return fromCluster;
    if (hit.group === "leads") return hit.entity_id?.trim() || null;
    return null;
}

export function isLayoutBuilderPreviewSearchHit(hit: GlobalRecordSearchHit): boolean {
    return resolvePreviewOpportunityIdFromSearchHit(hit) != null;
}

export function layoutBuilderPreviewSelectionFromHit(hit: GlobalRecordSearchHit): LayoutBuilderPreviewRecordSelection | null {
    const opportunityId = resolvePreviewOpportunityIdFromSearchHit(hit);
    if (!opportunityId) return null;
    return {
        opportunityId,
        label: formatGlobalSearchHitPrimaryName(hit),
        secondary: formatGlobalSearchHitSecondaryLine(hit, { inCluster: false }),
    };
}

/** Lead / opportunity hits only — excludes campuses and unsupported grains. */
export function filterLayoutBuilderPreviewSearchHits(hits: GlobalRecordSearchHit[]): GlobalRecordSearchHit[] {
    return hits.filter((hit) => hit.group === "leads" || isLayoutBuilderPreviewSearchHit(hit));
}

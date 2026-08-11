/**
 * Experience Builder preview — resolve an opportunity id from global search.
 *
 * Global search returns SUBJECTS (Search Platform V2). The preview selector wants
 * one thing: the opportunity behind a subject, because a layout preview renders
 * against an opportunity record. Subjects are flattened by the platform's
 * selection projection first, so this file holds preview policy only and no
 * knowledge of the search payload shape.
 */

import type { SearchResult } from "@/lib/search/searchContracts";
import {
    searchSelectionFromResult,
    searchSelectionsFromResults,
    type SearchSelection,
} from "@/lib/search/searchSelectionAdapter";

export type LayoutBuilderPreviewRecordSelection = {
    opportunityId: string;
    label: string;
    secondary?: string | null;
};

/** The opportunity behind a selection — the subject itself, or the one it participates in. */
export function resolvePreviewOpportunityIdFromSelection(selection: SearchSelection): string | null {
    if (selection.entity_type === "opportunities") {
        return selection.entity_id.trim() || selection.opportunity_id?.trim() || null;
    }
    return selection.opportunity_id?.trim() || null;
}

export function isLayoutBuilderPreviewSelection(selection: SearchSelection): boolean {
    return resolvePreviewOpportunityIdFromSelection(selection) != null;
}

function secondaryLine(selection: SearchSelection): string | null {
    const parts = [selection.type_label, selection.household_name, selection.location_label]
        .map((p) => (p ?? "").trim())
        .filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

export function layoutBuilderPreviewSelectionFrom(
    selection: SearchSelection
): LayoutBuilderPreviewRecordSelection | null {
    const opportunityId = resolvePreviewOpportunityIdFromSelection(selection);
    if (!opportunityId) return null;
    return {
        opportunityId,
        label: selection.name,
        secondary: secondaryLine(selection),
    };
}

/** Convenience: straight from a search result. */
export function layoutBuilderPreviewSelectionFromResult(
    result: SearchResult
): LayoutBuilderPreviewRecordSelection | null {
    const selection = searchSelectionFromResult(result);
    return selection ? layoutBuilderPreviewSelectionFrom(selection) : null;
}

/**
 * Opportunity-bearing subjects only — excludes campuses and any subject with no
 * opportunity behind it.
 */
export function filterLayoutBuilderPreviewSelections(
    results: readonly SearchResult[]
): SearchSelection[] {
    return searchSelectionsFromResults(results).filter(isLayoutBuilderPreviewSelection);
}

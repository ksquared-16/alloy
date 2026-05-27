/**
 * Waitlist queue candidate-row projection (Card 4.6).
 * One queue list row = one placement_candidate; opportunity/family is context.
 */

import type { PlacementLinkMode } from "@/lib/orchestration/placement/placementCandidateTypes";
import type { PlacementPriorityV2CandidatePreview } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";

export type PlacementWaitlistSiblingCohortRef = {
    placement_candidate_id: string;
    child_display_name: string;
    program_room_group_label: string;
    program_room_cohort_key: string;
    link_mode?: PlacementLinkMode;
};

export type PlacementWaitlistSiblingContext = {
    has_siblings_on_waitlist: boolean;
    sibling_candidate_count: number;
    sibling_cohorts: PlacementWaitlistSiblingCohortRef[];
    link_mode: PlacementLinkMode;
};

export type PlacementWaitlistCandidateRowProjection = {
    row_projection: "placement_candidate";
    placement_candidate_id: string;
    opportunity_id: string;
    child_display_name: string;
    family_display_name: string;
    parent_display_name?: string | null;
    program_room_cohort_key: string;
    program_room_group_label: string;
    bucket: string;
    wait_since?: string | null;
    is_synthetic_fallback?: boolean;
    sibling_context: PlacementWaitlistSiblingContext;
    placement_priority_v2: PlacementPriorityV2CandidatePreview;
    shadow_mode: boolean;
    /** Card 6 — optional informational forecast hints (max one shown in queue UI). */
    forecast_hints?: string[];
};

export function placementCandidateQueueRowId(opportunityId: string, candidateId: string): string {
    return `pcrow:${opportunityId.trim()}:${candidateId.trim()}`;
}

export function readOpportunityIdFromQueueRow(row: Record<string, unknown>): string {
    const explicit = typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
    if (explicit) return explicit;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id.startsWith("pcrow:")) {
        const parts = id.split(":");
        if (parts.length >= 3) return parts[1]!;
    }
    if (id.startsWith("ocmrow:")) {
        const parts = id.split(":");
        if (parts.length >= 3) return parts[1]!;
    }
    return id;
}

function readFamilyDisplayName(row: Record<string, unknown>): string {
    const customer = typeof row._customer_name === "string" ? row._customer_name.trim() : "";
    if (customer) return customer;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name) return name;
    return "Family";
}

function readParentDisplayName(row: Record<string, unknown>): string | null {
    const contact = typeof row._primary_contact_line === "string" ? row._primary_contact_line.trim() : "";
    return contact || null;
}

function buildSiblingContext(
    selfId: string,
    all: PlacementPriorityV2CandidatePreview[]
): PlacementWaitlistSiblingContext {
    const siblings = all.filter((c) => c.placement_candidate_id !== selfId);
    const self = all.find((c) => c.placement_candidate_id === selfId);
    const linkMode = self?.link_mode ?? "independent";
    return {
        has_siblings_on_waitlist: siblings.length > 0,
        sibling_candidate_count: siblings.length,
        sibling_cohorts: siblings.map((s) => {
            const normalized = normalizePlacementWaitlistCohort(
                s.program_room_cohort_key,
                s.program_room_group_label
            );
            return {
                placement_candidate_id: s.placement_candidate_id,
                child_display_name: s.child_display_name?.trim() || "Child",
                program_room_group_label: normalized.cohortLabel,
                program_room_cohort_key: normalized.cohortKey,
                link_mode: s.link_mode,
            };
        }),
        link_mode: linkMode,
    };
}

export type ExpandToPlacementCandidateRowsResult = {
    rows: Array<Record<string, unknown>>;
    expanded_candidate_row_count: number;
    opportunity_row_count: number;
};

/** Opportunity-level preview fields that must not leak onto candidate-row VMs. */
const OPPORTUNITY_ROW_PRESENTATION_OMIT_KEYS = [
    "_crm_compact_children",
    "_requested_program",
    "_placement_priority",
    "_placement_priority_v2",
    "_child_display_name",
] as const;

function stripOpportunityPresentationFromCandidateRow(row: Record<string, unknown>): Record<string, unknown> {
    const out = { ...row };
    for (const key of OPPORTUNITY_ROW_PRESENTATION_OMIT_KEYS) {
        delete out[key];
    }
    return out;
}

/**
 * Fan out evaluated V2 opportunity rows into one queue row per placement candidate.
 * V1 fallback / non-v2 rows pass through unchanged.
 */
export function expandOpportunityRowsToPlacementCandidateRows(
    rows: Array<Record<string, unknown>>
): ExpandToPlacementCandidateRowsResult {
    const out: Array<Record<string, unknown>> = [];
    let expanded = 0;
    let opportunityRows = 0;

    for (const row of rows) {
        const v2 = row._placement_priority_v2;
        if (v2 == null || typeof v2 !== "object" || Array.isArray(v2)) {
            out.push({ ...row, opportunity_id: readOpportunityIdFromQueueRow(row) });
            opportunityRows++;
            continue;
        }

        const preview = v2 as Record<string, unknown>;
        if (preview.fallback_to_v1 === true || preview.evaluated !== true) {
            out.push({ ...row, opportunity_id: readOpportunityIdFromQueueRow(row) });
            opportunityRows++;
            continue;
        }

        const candidates = preview.candidates;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            out.push({ ...row, opportunity_id: readOpportunityIdFromQueueRow(row) });
            opportunityRows++;
            continue;
        }

        const opportunityId = readOpportunityIdFromQueueRow(row);
        const shadowMode = preview.shadow_mode === true;
        const familyName = readFamilyDisplayName(row);
        const parentName = readParentDisplayName(row);
        const allCandidates = candidates as PlacementPriorityV2CandidatePreview[];

        for (const cand of allCandidates) {
            const candidateId = cand.placement_candidate_id?.trim();
            if (!candidateId) continue;

            const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(
                cand.program_room_cohort_key,
                cand.program_room_group_label
            );

            const projection: PlacementWaitlistCandidateRowProjection = {
                row_projection: "placement_candidate",
                placement_candidate_id: candidateId,
                opportunity_id: opportunityId,
                child_display_name: cand.child_display_name?.trim() || "Child",
                family_display_name: familyName,
                parent_display_name: parentName,
                program_room_cohort_key: cohortKey,
                program_room_group_label: cohortLabel,
                bucket: cand.bucket,
                wait_since: cand.wait_since ?? null,
                is_synthetic_fallback: cand.is_synthetic_fallback === true,
                sibling_context: buildSiblingContext(candidateId, allCandidates),
                placement_priority_v2: {
                    ...cand,
                    program_room_cohort_key: cohortKey,
                    program_room_group_label: cohortLabel,
                },
                shadow_mode: shadowMode,
                ...(Array.isArray(cand.forecast_hints) && cand.forecast_hints.length
                    ? { forecast_hints: cand.forecast_hints.filter((h) => typeof h === "string" && h.trim()) }
                    : {}),
            };

            out.push({
                ...stripOpportunityPresentationFromCandidateRow(row),
                id: placementCandidateQueueRowId(opportunityId, candidateId),
                opportunity_id: opportunityId,
                _placement_waitlist_row: projection,
                __placement_v2_sort_tuple: cand.sort_tuple,
            });
            expanded++;
        }
    }

    return { rows: out, expanded_candidate_row_count: expanded, opportunity_row_count: opportunityRows };
}

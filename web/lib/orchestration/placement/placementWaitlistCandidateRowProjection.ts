/**
 * Waitlist queue candidate-row projection (Card 4.6).
 * One queue list row = one placement_candidate; opportunity/family is context.
 */

import type { WaitlistRuntimePrecedenceReason } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import type { PlacementLinkMode } from "@/lib/orchestration/placement/placementCandidateTypes";
import type { PlacementPriorityV2CandidatePreview } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import type { HouseholdPlacementFactContextByCustomerId } from "@/lib/orchestration/placement/bulkLoadHouseholdPlacementFactContext";
import {
    resolveEnrolledSiblingDisplayRefs,
    resolveHouseholdOtherChildrenDisplay,
    type HouseholdEnrolledSiblingDisplayRef,
    type HouseholdPlacementFactHouseholdSlice,
} from "@/lib/orchestration/placement/householdPlacementFacts";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { resolvePlacementWaitlistChildDisplayLabel } from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";

export type PlacementWaitlistSiblingCohortRef = {
    placement_candidate_id: string;
    child_display_name: string;
    program_room_group_label: string;
    program_room_cohort_key: string;
    link_mode?: PlacementLinkMode;
};

export type PlacementWaitlistEnrolledSiblingRef = HouseholdEnrolledSiblingDisplayRef;

export type PlacementWaitlistHouseholdOtherChildren = {
    count: number;
    names: string | null;
};

export type PlacementWaitlistSiblingContext = {
    has_siblings_on_waitlist: boolean;
    sibling_candidate_count: number;
    sibling_cohorts: PlacementWaitlistSiblingCohortRef[];
    link_mode: PlacementLinkMode;
    enrolled_siblings?: PlacementWaitlistEnrolledSiblingRef[];
    display_diagnostics?: string | null;
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
    /** Site scope for location-owned program category resolution. */
    site_id?: string | null;
    /** Canonical program key (location_program_categories.key) derived from OCM program_category_id. */
    program_key?: string | null;
    program_category_id?: string | null;
    bucket: string;
    wait_since?: string | null;
    is_synthetic_fallback?: boolean;
    sibling_context: PlacementWaitlistSiblingContext;
    /** Other children on the family record (household inquiry children), excluding row child. */
    household_other_children?: PlacementWaitlistHouseholdOtherChildren | null;
    placement_priority_v2: PlacementPriorityV2CandidatePreview;
    shadow_mode: boolean;
    /** Card 6 — optional informational forecast hints (max one shown in queue UI). */
    forecast_hints?: string[];
    /** Card 1 — runtime-derived position within org category section (not persisted). */
    runtime_position?: number;
    runtime_position_total?: number;
    runtime_position_label?: string;
    runtime_position_mode?: "preview" | "live";
    runtime_position_section_key?: string;
    runtime_position_precedence_note?: string;
    runtime_position_precedence_reason?: WaitlistRuntimePrecedenceReason;
    /** Group-local range from the placement engine — the legal span of a manual position. */
    runtime_group_position?: number;
    runtime_group_total?: number;
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
                child_display_name: resolvePlacementWaitlistChildDisplayLabel({
                    childDisplayName: s.child_display_name,
                    isSyntheticFallback: false,
                }),
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

function resolveProjectionProgramCategoryScope(args: {
    candidateId: string;
    household: HouseholdPlacementFactHouseholdSlice | null;
    candidateSiteId: string | null;
}): {
    site_id: string | null;
    program_key: string | null;
    program_category_id: string | null;
} {
    const pcMatch = args.household?.active_placement_candidates.find(
        (pc) => pc.placement_candidate_id === args.candidateId
    );
    const site_id = (pcMatch?.site_id ?? args.candidateSiteId)?.trim() || null;
    const ocmId = pcMatch?.opportunity_customer_member_id?.trim() || null;
    const ocm =
        ocmId && args.household
            ? args.household.inquiry_children.find((c) => c.opportunity_customer_member_id === ocmId)
            : null;
    return {
        site_id,
        program_key: ocm?.program_key?.trim() || null,
        program_category_id: ocm?.program_category_id?.trim() || null,
    };
}

function stripOpportunityPresentationFromCandidateRow(row: Record<string, unknown>): Record<string, unknown> {
    const out = { ...row };
    for (const key of OPPORTUNITY_ROW_PRESENTATION_OMIT_KEYS) {
        delete out[key];
    }
    return out;
}

export type ExpandToPlacementCandidateRowsOptions = {
    householdFactsByCustomerId?: HouseholdPlacementFactContextByCustomerId;
    locationLabelsById?: ReadonlyMap<string, string>;
};

/**
 * Fan out evaluated V2 opportunity rows into one queue row per placement candidate.
 * V1 fallback / non-v2 rows pass through unchanged.
 */
export function expandOpportunityRowsToPlacementCandidateRows(
    rows: Array<Record<string, unknown>>,
    options?: ExpandToPlacementCandidateRowsOptions
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
        const customerId =
            typeof row.customer_id === "string" ? row.customer_id.trim()
            : typeof row._customer_id === "string" ? row._customer_id.trim()
            : "";
        const household =
            customerId && options?.householdFactsByCustomerId ?
                options.householdFactsByCustomerId.get(customerId) ?? null
            :   null;
        const candidateSiteId =
            typeof row.location_id === "string" ? row.location_id.trim()
            : typeof row.site_id === "string" ? row.site_id.trim()
            : null;

        for (const cand of allCandidates) {
            const candidateId = cand.placement_candidate_id?.trim();
            if (!candidateId) continue;

            const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(
                cand.program_room_cohort_key,
                cand.program_room_group_label
            );

            const siblingContext = buildSiblingContext(candidateId, allCandidates);
            let householdOtherChildren: PlacementWaitlistHouseholdOtherChildren | null = null;
            if (household) {
                const pcMatch = household.active_placement_candidates.find(
                    (pc) => pc.placement_candidate_id === candidateId
                );
                const enrolled = resolveEnrolledSiblingDisplayRefs(
                    household,
                    {
                        placement_candidate_id: candidateId,
                        opportunity_customer_member_id: pcMatch?.opportunity_customer_member_id ?? null,
                        customer_member_id: pcMatch?.customer_member_id ?? null,
                        site_id: candidateSiteId,
                    },
                    options?.locationLabelsById ?? null
                );
                siblingContext.enrolled_siblings = enrolled;
                householdOtherChildren = resolveHouseholdOtherChildrenDisplay(household, {
                    placement_candidate_id: candidateId,
                    opportunity_customer_member_id: pcMatch?.opportunity_customer_member_id ?? null,
                    customer_member_id: pcMatch?.customer_member_id ?? null,
                    site_id: candidateSiteId,
                });
                if (
                    (cand.bucket === "tier_sibling_enrolled" || cand.policy_bucket === "tier_sibling_enrolled") &&
                    enrolled.every((s) => !s.child_display_name?.trim())
                ) {
                    siblingContext.display_diagnostics = "enrolled_sibling_names_missing_in_household_load";
                }
            }

            const programCategoryScope = resolveProjectionProgramCategoryScope({
                candidateId,
                household,
                candidateSiteId,
            });

            const projection: PlacementWaitlistCandidateRowProjection = {
                row_projection: "placement_candidate",
                placement_candidate_id: candidateId,
                opportunity_id: opportunityId,
                child_display_name: resolvePlacementWaitlistChildDisplayLabel({
                    childDisplayName: cand.child_display_name,
                    isSyntheticFallback: cand.is_synthetic_fallback === true,
                }),
                family_display_name: familyName,
                parent_display_name: parentName,
                program_room_cohort_key: cohortKey,
                program_room_group_label: cohortLabel,
                site_id: programCategoryScope.site_id,
                program_key: programCategoryScope.program_key,
                program_category_id: programCategoryScope.program_category_id,
                bucket: cand.bucket,
                wait_since: cand.wait_since ?? null,
                is_synthetic_fallback: cand.is_synthetic_fallback === true,
                sibling_context: siblingContext,
                household_other_children: householdOtherChildren,
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

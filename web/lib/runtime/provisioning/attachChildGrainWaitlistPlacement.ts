/**
 * Attach Placement System waitlist projection onto child-grain provisioning rows.
 *
 * Child Waitlist membership comes from process_instances; ranking/position/wait_since
 * come from placement_candidates + overrides (same authority as candidateGrainWaitlistQueue).
 * Position is derived at load time — never persisted.
 *
 * Rank is assigned within Program (category) sections over the placement-evaluated cohort
 * for this Work Unit page. Viewer ACL may hide rows later; visible `#n` is not renumbered
 * by access (business rank within the evaluated Program section).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlacementV2ToOpportunityQueueRows } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { loadPlacementEvaluationHouseholdContext } from "@/lib/orchestration/placement/loadPlacementEvaluationHouseholdContext";
import { expandOpportunityRowsToPlacementCandidateRows } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import type { PlacementWaitlistCandidateRowProjection } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import { loadLocationProgramCategoriesForOrg } from "@/lib/locations/loadLocationProgramCategoriesForOrg";
import type { PlacementCandidatesByOpportunityId } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import { formatDateUtcAudit } from "@/lib/adminFormatters";

export type ChildProvisioningRowWithPlacement = ChildProvisioningRow & {
    /** Canonical waitlist candidate projection when a placement_candidate matches this child. */
    placementWaitlistRow?: PlacementWaitlistCandidateRowProjection | null;
    /** Internal sort tuple for within-section priority (stripped after sort when needed). */
    placementSortTuple?: Array<string | number | null> | null;
    placementCandidateId?: string | null;
};

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function formatWaitSinceDisplay(iso: string | null | undefined): string | null {
    if (!iso?.trim()) return null;
    const f = formatDateUtcAudit(iso.trim());
    return f && f !== "—" ? f : null;
}

function candidateIdsForChild(
    candidatesByOpportunityId: PlacementCandidatesByOpportunityId,
    child: ChildProvisioningRow,
): Set<string> {
    const out = new Set<string>();
    const oppId = str(child.contextId);
    if (!oppId) return out;
    for (const bundle of candidatesByOpportunityId.get(oppId) ?? []) {
        const cm = str(bundle.candidate.customer_member_id);
        const ocm = str(bundle.candidate.opportunity_customer_member_id);
        if (cm === child.subjectId || ocm === child.subjectId || (child.legacyOcmId && ocm === child.legacyOcmId)) {
            out.add(bundle.candidate.id);
        }
    }
    return out;
}

/** Match a placement candidate row to a child by durable member id, legacy OCM id, or name. */
export function matchPlacementRowToChild(
    placementRow: Record<string, unknown>,
    child: ChildProvisioningRow,
    memberMatchedCandidateIds?: ReadonlySet<string>,
): boolean {
    const proj = placementRow._placement_waitlist_row;
    if (proj == null || typeof proj !== "object" || Array.isArray(proj)) return false;
    const p = proj as PlacementWaitlistCandidateRowProjection;
    if (str(p.opportunity_id) !== str(child.contextId)) return false;

    const candId = str(p.placement_candidate_id);
    if (candId && memberMatchedCandidateIds?.has(candId)) return true;

    const childName = str(child.title)?.toLowerCase() ?? null;
    const candName = str(p.child_display_name)?.toLowerCase() ?? null;
    if (childName && candName && childName === candName) return true;

    return false;
}

function findBestPlacementMatch(
    expanded: Array<Record<string, unknown>>,
    child: ChildProvisioningRow,
    claimedCandidateIds: Set<string>,
    candidatesByOpportunityId: PlacementCandidatesByOpportunityId,
): Record<string, unknown> | null {
    const memberIds = candidateIdsForChild(candidatesByOpportunityId, child);
    const sameOpp = expanded.filter((row) => {
        const proj = row._placement_waitlist_row;
        if (proj == null || typeof proj !== "object" || Array.isArray(proj)) return false;
        const p = proj as PlacementWaitlistCandidateRowProjection;
        const candId = str(p.placement_candidate_id);
        if (!candId || claimedCandidateIds.has(candId)) return false;
        return str(p.opportunity_id) === str(child.contextId);
    });
    if (!sameOpp.length) return null;

    const exact = sameOpp.find((row) => matchPlacementRowToChild(row, child, memberIds));
    if (exact) return exact;

    // Unambiguous leftover candidate on this opportunity.
    if (sameOpp.length === 1) return sameOpp[0]!;
    return null;
}

/**
 * Evaluate placement for child Waitlist rows and attach `_placement_waitlist_row`-equivalent
 * projections (including derived runtime positions within Program sections).
 *
 * Fail-open: returns input rows unchanged when placement is disabled or load fails.
 */
export async function attachChildGrainWaitlistPlacement(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    workUnitMetadata: unknown;
    departmentMetadata: unknown;
    /** Prefer legacy `waitlisted` key (placement config), then Work View id. */
    placementQueueKeys?: readonly string[];
    childRows: readonly ChildProvisioningRow[];
    familyNamesByOpportunityId?: ReadonlyMap<string, string | null>;
    nowMs?: number;
}): Promise<ChildProvisioningRowWithPlacement[]> {
    const rows = params.childRows.map((r) => ({ ...r }) as ChildProvisioningRowWithPlacement);
    if (!rows.length) return rows;

    const opportunityIds = [
        ...new Set(rows.map((r) => str(r.contextId)).filter((id): id is string => Boolean(id))),
    ];
    if (!opportunityIds.length) return rows;

    const queueKeys = params.placementQueueKeys?.length
        ? params.placementQueueKeys
        : (["waitlisted", "waitlist"] as const);

    let placementResolved = resolvePlacementQueueConfig({
        departmentMetadata: params.departmentMetadata,
        workUnitMetadata: params.workUnitMetadata,
        queue_key: queueKeys[0]!,
    });
    for (const key of queueKeys.slice(1)) {
        if (placementResolved.status === "enabled") break;
        placementResolved = resolvePlacementQueueConfig({
            departmentMetadata: params.departmentMetadata,
            workUnitMetadata: params.workUnitMetadata,
            queue_key: key,
        });
    }

    if (placementResolved.status !== "enabled" || placementResolved.engine_version !== "v2") {
        return rows;
    }

    try {
        const candidatesByOpportunityId = await bulkLoadPlacementCandidatesByOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds,
            activeOnly: false,
        });

        const householdFactsByCustomerId = await loadPlacementEvaluationHouseholdContext({
            supabase: params.supabase,
            orgId: params.orgId,
            candidatesByOpportunityId,
        });

        const locationProgramCategories = await loadLocationProgramCategoriesForOrg(
            params.supabase,
            params.orgId,
        );
        const waitlistCategoryContext = { categories: locationProgramCategories };

        const oppRows: Array<Record<string, unknown>> = opportunityIds.map((id) => ({
            id,
            name: params.familyNamesByOpportunityId?.get(id) ?? null,
            created_at: null,
            updated_at: null,
            metadata: null,
            customer_id: null,
        }));

        const queueKey =
            placementResolved.status === "enabled" ? placementResolved.queue_key : queueKeys[0]!;

        const v2Out = applyPlacementV2ToOpportunityQueueRows({
            rows: oppRows,
            placement: { ...placementResolved, engine_version: "v2" },
            ctx: {
                workUnitId: params.workUnitId,
                queueKey,
                nowMs: params.nowMs ?? Date.now(),
            },
            candidatesByOpportunityId,
            householdFactsByCustomerId,
            v1FallbackForEmpty: true,
        });

        const expanded = expandOpportunityRowsToPlacementCandidateRows(v2Out.rows, {
            householdFactsByCustomerId,
        });
        let expandedRows = expanded.rows.filter((row) => {
            const proj = row._placement_waitlist_row;
            return (
                proj != null &&
                typeof proj === "object" &&
                !Array.isArray(proj) &&
                (proj as PlacementWaitlistCandidateRowProjection).row_projection === "placement_candidate"
            );
        });

        const shadowMode = placementResolved.options.shadow_mode;
        expandedRows = sortPlacementCandidateQueueRows(expandedRows, shadowMode, waitlistCategoryContext);
        assignWaitlistCandidateRuntimePositions(expandedRows, shadowMode, waitlistCategoryContext);

        const claimed = new Set<string>();
        for (const child of rows) {
            const matched = findBestPlacementMatch(
                expandedRows,
                child,
                claimed,
                candidatesByOpportunityId,
            );
            if (!matched) continue;
            const proj = matched._placement_waitlist_row as PlacementWaitlistCandidateRowProjection;
            const candId = str(proj.placement_candidate_id);
            if (candId) claimed.add(candId);

            // Prefer operator-facing wait_since formatting for queue compact slots.
            const waitSinceDisplay = formatWaitSinceDisplay(proj.wait_since) ?? proj.wait_since ?? null;
            child.placementWaitlistRow = {
                ...proj,
                wait_since: waitSinceDisplay,
            };
            child.placementCandidateId = candId;
            const tuple = matched.__placement_v2_sort_tuple;
            child.placementSortTuple = Array.isArray(tuple)
                ? (tuple as Array<string | number | null>)
                : (proj.placement_priority_v2?.sort_tuple ?? null);
        }

        return rows;
    } catch {
        // Fail-open: membership already correct; ranking fields stay absent rather than failing the answer.
        return params.childRows.map((r) => ({ ...r }) as ChildProvisioningRowWithPlacement);
    }
}

/** Build waitlist_context fields from an attached placement projection. */
export function waitlistContextFromPlacementProjection(
    proj: PlacementWaitlistCandidateRowProjection | null | undefined,
): { position_label?: string | null; wait_since?: string | null; priority?: number | null } | undefined {
    if (!proj) return undefined;
    const positionLabel = str(proj.runtime_position_label);
    const waitSince = str(proj.wait_since);
    const score =
        typeof proj.placement_priority_v2?.score === "number" ? proj.placement_priority_v2.score : null;
    if (!positionLabel && !waitSince && score == null) return undefined;
    return {
        position_label: positionLabel,
        wait_since: waitSince,
        priority: score,
    };
}

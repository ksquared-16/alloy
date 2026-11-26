/**
 * Create Lead — standardized success / refresh contract (Operational Command Runtime V4,
 * Phase 7).
 *
 * After the registered create_lead action executes, every entry point (manual modal, BOS,
 * Work Unit rail) should describe success the same way: what was created, where to go next,
 * what to refresh, and the operator copy to show. This avoids each surface re-deriving open/
 * refresh behavior.
 *
 * Read-only: this builds a descriptor from the execution result; it performs no navigation
 * or data fetching itself.
 *
 * @see docs/sprints/archive/06_2026/create_lead_command_flow_audit.md
 */

import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";
import { createLeadDisplayName } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";

export type CommandRefreshTarget = {
    /** `opportunity` → invalidate the created record; `work_unit` → invalidate that work unit's queue + pill counts. */
    entityType: string;
    entityId: string;
};

export type CreateLeadSuccess = {
    createdRecordId: string;
    entityType: "opportunity";
    /** Human display title when a name is known. */
    title: string | null;
    /** Recommended surface to send the operator to next. */
    nextSurface: "focus_panel";
    /**
     * Caches/queues a surface should invalidate after success. Includes the created opportunity AND
     * the lead's assigned work unit so the New Leads queue/pill counts refetch (not just the record).
     */
    refreshTargets: CommandRefreshTarget[];
    /** Work unit the record was assigned to — drives queue/count invalidation and routing. */
    workUnitId: string | null;
    /** Platform work unit key when returned by the action (routing). */
    workUnitKey: string | null;
    /** Config-resolved Work View id for process-context routing, when matched. */
    workViewId: string | null;
    /** Label-derived Work View route key (`Leads` → `leads`) for operator URLs. */
    workViewRouteKey: string | null;
    /** Canonical Work Unit Focus Panel href — Work mode, not legacy drawer. */
    focusPanelHref: string;
    /** Case status written to the record. */
    statusKey: string | null;
    /** Short operator confirmation copy. */
    successCopy: string;
    /** Follow-on copy describing the next surface (e.g. "Opening lead."). */
    nextCopy: string;
};

function trimmed(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * Extract the created opportunity id from a registered-action success result. Falls back
 * across the affectedId and known detail shapes returned by `executeCreateLeadAction`.
 */
export function isCreateLeadProcessingReview(result: ActionResultOk): boolean {
    const detail = (result.result.detail ?? {}) as Record<string, unknown>;
    return trimmed(detail.mode) === "processing_review" && Boolean(trimmed(detail.processing_case_id));
}

export function createLeadProcessingCaseId(result: ActionResultOk): string | null {
    const detail = (result.result.detail ?? {}) as Record<string, unknown>;
    return trimmed(detail.processing_case_id) || null;
}

export function createdLeadOpportunityId(result: ActionResultOk): string {
    const fromAffected = trimmed(result.result.affectedId);
    if (fromAffected) return fromAffected;
    const detail = result.result.detail ?? {};
    return trimmed((detail as Record<string, unknown>).opportunity_id) || trimmed(result.result.entityId);
}

/**
 * Build the standardized success descriptor. `knownInputs` is the command payload (used only
 * to compute a display title); the authoritative created id comes from the execution result.
 */
export function buildCreateLeadSuccess(input: {
    result: ActionResultOk;
    knownInputs?: Record<string, unknown> | null;
}): CreateLeadSuccess {
    const createdRecordId = createdLeadOpportunityId(input.result);
    const detail = (input.result.result.detail ?? {}) as Record<string, unknown>;
    const workUnitId = trimmed(detail.work_unit_id) || null;
    const workUnitKey = trimmed(detail.work_unit_key) || null;
    const workViewId = trimmed(detail.work_view_id) || null;
    const workViewRouteKey = trimmed(detail.work_view_route_key) || null;
    const statusKey = trimmed(detail.status_key) || null;
    const name = input.knownInputs ? createLeadDisplayName(input.knownInputs) : "";
    const title = name ? `Lead for ${name}` : null;
    const focusPanelHref = resolveCreatedRecordProcessContextHref({
        recordId: createdRecordId,
        workUnitKey,
        workViewId,
        workViewRouteKey,
    });
    return {
        createdRecordId,
        entityType: "opportunity",
        title,
        nextSurface: "focus_panel",
        refreshTargets: [
            ...(createdRecordId
                ? [{ entityType: "opportunity", entityId: createdRecordId } as CommandRefreshTarget]
                : []),
            ...(workUnitId
                ? [{ entityType: "work_unit", entityId: workUnitId } as CommandRefreshTarget]
                : []),
        ],
        workUnitId,
        workUnitKey,
        workViewId,
        workViewRouteKey,
        focusPanelHref,
        statusKey,
        successCopy: name ? `Created lead for ${name}.` : "Lead created.",
        nextCopy: "Opening record.",
    };
}

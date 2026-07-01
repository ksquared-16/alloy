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
 * @see docs/sprints/06_2026/create_lead_command_flow_audit.md
 */

import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";
import { createLeadDisplayName } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

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
    /** Work unit the lead was assigned to — drives queue/count invalidation and focus-panel routing. */
    workUnitId: string | null;
    /** Case status written to the lead (e.g. `new_inquiry`). Proves New Leads membership; diagnostics. */
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
    const statusKey = trimmed(detail.status_key) || null;
    const name = input.knownInputs ? createLeadDisplayName(input.knownInputs) : "";
    const title = name ? `Lead for ${name}` : null;
    return {
        createdRecordId,
        entityType: "opportunity",
        title,
        nextSurface: "focus_panel",
        refreshTargets: [
            ...(createdRecordId
                ? [{ entityType: "opportunity", entityId: createdRecordId } as CommandRefreshTarget]
                : []),
            // Invalidate the lead's work-unit queue + pill counts so New Leads reflects the new record
            // without a full page reload (the record is a valid member; only the projection was stale).
            ...(workUnitId
                ? [{ entityType: "work_unit", entityId: workUnitId } as CommandRefreshTarget]
                : []),
        ],
        workUnitId,
        statusKey,
        successCopy: name ? `Created lead for ${name}.` : "Lead created.",
        nextCopy: "Opening lead.",
    };
}

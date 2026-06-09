/**
 * Safe partial wiring of `_queue_row_context` onto opportunity queue row payloads.
 * Additive only — does not change membership, counts, or enrichment fields.
 *
 * @see docs/system/work-unit-surface-context-contract.md
 */

import type { NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import {
    attachPartialQueueRowContextToRows,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContext";
import {
    attachChildGrainQueueRowContext,
    isHonestChildCandidateGrainRow,
} from "@/lib/workUnits/buildChildGrainQueueRowContext";

/** Rollback: set `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` to omit `_queue_row_context`. */
export function isQueueRowContextWiringEnabled(): boolean {
    return process.env.ALLOY_QUEUE_ROW_CONTEXT_DISABLED !== "1";
}

export type OpportunityQueueRowContextLaneParams = {
    entityType: string;
    requestedQueueKey: string;
    executableQueueKey: string;
    queueLabel: string;
    normalized: NormalizedQueueDefinitionDocument;
    /** Defaults to `enrollment` until department lifecycle_key resolver ships. */
    lifecycleKey?: string;
    /** When builder routing is active — drives honest stage/grain/count_unit. */
    builderMembership?: QueueMembershipV1 | null;
};

function queueRowCountUnitFromMembership(
    countUnit: QueueMembershipV1["count_unit"],
): PartialQueueRowContextQueueMeta["count_unit"] {
    switch (countUnit) {
        case "enrollment_tracks":
            return "enrollment_track";
        case "cases":
            return "cases";
        case "children":
            return "children";
        case "candidates":
            return "candidates";
        default:
            return undefined;
    }
}

export function queueRowContextMetaFromLane(
    lane: OpportunityQueueRowContextLaneParams
): PartialQueueRowContextQueueMeta {
    const executable = lane.executableQueueKey.trim();
    const entry = lane.normalized.queues.find((q) => q.key === executable) ?? null;
    const membership = lane.builderMembership ?? null;

    if (membership) {
        return {
            key: lane.requestedQueueKey.trim() || executable,
            label: lane.queueLabel.trim() || executable,
            lifecycle_key: membership.lifecycle_key.trim() || lane.lifecycleKey?.trim() || "enrollment",
            stage_key: membership.stage_key.trim() || entry?.domain?.trim() || executable,
            subject_grain: membership.subject_type,
            count_unit: queueRowCountUnitFromMembership(membership.count_unit),
            location_scope_source: membership.location_scope_source ?? undefined,
        };
    }

    return {
        key: lane.requestedQueueKey.trim() || executable,
        label: lane.queueLabel.trim() || executable,
        lifecycle_key: lane.lifecycleKey?.trim() || "enrollment",
        stage_key: entry?.domain?.trim() || executable,
        subject_grain: entry?.grain ?? "case",
    };
}

export function opportunityRowContextLaneWithBuilderMembership(
    lane: OpportunityQueueRowContextLaneParams,
    membership: QueueMembershipV1 | null | undefined,
): OpportunityQueueRowContextLaneParams {
    if (!membership) return lane;
    return { ...lane, builderMembership: membership };
}

function asRecordRows(rows: unknown[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const row of rows) {
        if (row != null && typeof row === "object" && !Array.isArray(row)) {
            out.push(row as Record<string, unknown>);
        }
    }
    return out;
}

/**
 * Attach `_queue_row_context` to enriched opportunity queue rows when wiring is enabled.
 * Non-opportunity entity types and non-object rows pass through unchanged.
 */
export function attachOpportunityQueueRowsWithRowContext(
    rows: Array<Record<string, unknown>> | unknown[],
    lane: OpportunityQueueRowContextLaneParams,
    options?: {
        attachCaseGrainRowContext?: boolean;
        allowedLocationIds?: readonly string[] | null;
    },
): Array<Record<string, unknown>> {
    if (!isQueueRowContextWiringEnabled()) {
        return asRecordRows(rows);
    }
    if (lane.entityType !== "opportunity") {
        return asRecordRows(rows);
    }
    const recordRows = asRecordRows(rows);
    if (!recordRows.length) return recordRows;
    const meta = queueRowContextMetaFromLane(lane);
    const attachCaseGrain = options?.attachCaseGrainRowContext !== false;
    const rowContextOptions = {
        allowedLocationIds: options?.allowedLocationIds ?? null,
    };

    // Phase B: honest row_subject for existing child/candidate-shaped rows (no flag).
    return recordRows.map((row) => {
        if (isHonestChildCandidateGrainRow(row)) {
            return attachChildGrainQueueRowContext(row, meta, rowContextOptions);
        }
        if (!attachCaseGrain) {
            return row;
        }
        return attachPartialQueueRowContextToRows([row], meta, rowContextOptions)[0]!;
    });
}

/**
 * Safe partial wiring of `_queue_row_context` onto opportunity queue row payloads.
 * Additive only — does not change membership, counts, or enrichment fields.
 *
 * @see docs/system/work-unit-surface-context-contract.md
 */

import type { NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
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
};

export function queueRowContextMetaFromLane(
    lane: OpportunityQueueRowContextLaneParams
): PartialQueueRowContextQueueMeta {
    const executable = lane.executableQueueKey.trim();
    const entry = lane.normalized.queues.find((q) => q.key === executable) ?? null;
    return {
        key: lane.requestedQueueKey.trim() || executable,
        label: lane.queueLabel.trim() || executable,
        lifecycle_key: lane.lifecycleKey?.trim() || "enrollment",
        stage_key: entry?.domain?.trim() || executable,
        subject_grain: entry?.grain ?? "case",
    };
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
    lane: OpportunityQueueRowContextLaneParams
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
    const laneKey = meta.key.trim() || lane.executableQueueKey.trim();
    const honestChildGrain =
        isChildGrainLaneBuildersEnabled(laneKey) || isChildGrainLaneBuildersEnabled(lane.executableQueueKey);

    if (!honestChildGrain) {
        return attachPartialQueueRowContextToRows(recordRows, meta);
    }

    return recordRows.map((row) => {
        if (isHonestChildCandidateGrainRow(row)) {
            return attachChildGrainQueueRowContext(row, meta);
        }
        return attachPartialQueueRowContextToRows([row], meta)[0]!;
    });
}

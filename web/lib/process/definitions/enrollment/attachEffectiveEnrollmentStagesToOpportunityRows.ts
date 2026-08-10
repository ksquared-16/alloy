/**
 * Batch-attach Effective Process Position stage keys onto opportunity (context) rows.
 *
 * Shared by QueueService enrichment AND AdminV2 process-population / provisioning projection
 * so Work View membership evaluates the same EPP keys before `computeOperationalProjection`.
 *
 * Fail-open: on load error, returns original rows (legacy raw stage_key membership).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { attachEffectiveParticipantStagesToContextRows } from "@/lib/process/engine/attachEffectiveParticipantStagesToContextRows";
import { loadEffectiveEnrollmentStagesByOpportunity } from "@/lib/process/definitions/enrollment/loadEffectiveEnrollmentStagesByOpportunity";

export async function attachEffectiveEnrollmentStagesToOpportunityRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: Array<Record<string, unknown>>;
    /** Access / workspace location scope — filter participants before EPP rollup. */
    allowedLocationIds?: readonly string[] | null;
    logLabel?: string;
}): Promise<Array<Record<string, unknown>>> {
    const { rows } = params;
    if (!rows.length) return rows;
    const label = params.logLabel ?? "epp";
    try {
        const opportunityIds = rows
            .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
            .filter(Boolean);
        const contextStageByOpportunityId = new Map<string, string | null>();
        for (const row of rows) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (!id) continue;
            const stage =
                (typeof row.stage_key === "string" && row.stage_key.trim() ? row.stage_key.trim() : null)
                || (typeof row.lifecycle_stage_key === "string" && row.lifecycle_stage_key.trim()
                    ? row.lifecycle_stage_key.trim()
                    : null);
            contextStageByOpportunityId.set(id, stage);
        }
        const allowed =
            params.allowedLocationIds && params.allowedLocationIds.length > 0
                ? new Set(params.allowedLocationIds.map((id) => id.trim()).filter(Boolean))
                : null;
        const loaded = await loadEffectiveEnrollmentStagesByOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds,
            contextStageByOpportunityId,
            allowedLocationIds: allowed && allowed.size > 0 ? allowed : null,
        });
        return attachEffectiveParticipantStagesToContextRows(rows, loaded.stagesByOpportunityId, {
            markMissingAsEmpty: true,
            rollupLabelsByContextId: loaded.rollupLabelsByOpportunityId,
        });
    } catch (err) {
        console.warn(`[${label}] effective enrollment stages attach failed; using legacy stage membership`, err);
        return rows;
    }
}

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

type EffectiveEnrollmentStagesLoad = Awaited<ReturnType<typeof loadEffectiveEnrollmentStagesByOpportunity>>;

/**
 * START the EPP load without applying it.
 *
 * The round trip needs only `id`, `stage_key` and `lifecycle_stage_key` off the context rows — all
 * columns of the canonical opportunity select — so it does NOT need the composed visible record and
 * can begin as soon as that row is in hand. The apply step is pure and runs on whatever rows the
 * caller finally has. Splitting the two is what lets a caller take the round trip off its serial
 * chain without changing which rows are decorated.
 *
 * Fail-open exactly as the combined form: a load error is logged and reported as `null`, and the
 * apply step then returns the rows untouched (legacy raw stage_key membership).
 */
export function startEffectiveEnrollmentStagesForOpportunityRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: Array<Record<string, unknown>>;
    allowedLocationIds?: readonly string[] | null;
    logLabel?: string;
}): Promise<EffectiveEnrollmentStagesLoad | null> {
    const label = params.logLabel ?? "epp";
    const { rows } = params;
    if (!rows.length) return Promise.resolve(null);
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
        return loadEffectiveEnrollmentStagesByOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds,
            contextStageByOpportunityId,
            allowedLocationIds: allowed && allowed.size > 0 ? allowed : null,
        }).catch((err) => {
            console.warn(`[${label}] effective enrollment stages attach failed; using legacy stage membership`, err);
            return null;
        });
    } catch (err) {
        console.warn(`[${label}] effective enrollment stages attach failed; using legacy stage membership`, err);
        return Promise.resolve(null);
    }
}

/** APPLY a started load onto rows. Pure and synchronous; fail-open on a null load. */
export function applyEffectiveEnrollmentStagesToOpportunityRows(
    rows: Array<Record<string, unknown>>,
    loaded: EffectiveEnrollmentStagesLoad | null,
    logLabel?: string,
): Array<Record<string, unknown>> {
    if (!loaded) return rows;
    try {
        return attachEffectiveParticipantStagesToContextRows(rows, loaded.stagesByOpportunityId, {
            markMissingAsEmpty: true,
            rollupLabelsByContextId: loaded.rollupLabelsByOpportunityId,
        });
    } catch (err) {
        console.warn(`[${logLabel ?? "epp"}] effective enrollment stages attach failed; using legacy stage membership`, err);
        return rows;
    }
}

/**
 * The combined form, unchanged for every existing caller: start, then apply. It is built ON the two
 * halves above so there is one code path and one fail-open rule rather than two that can drift.
 */
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
    const loaded = await startEffectiveEnrollmentStagesForOpportunityRows(params);
    return applyEffectiveEnrollmentStagesToOpportunityRows(rows, loaded, params.logLabel);
}

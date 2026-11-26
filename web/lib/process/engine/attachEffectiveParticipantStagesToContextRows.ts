/**
 * Attach Effective Process Position participant stage keys onto context/case-grain rows
 * so Work View `opportunity_stage` predicates use effective participation membership.
 *
 * Pure: callers supply the map (batch-loaded). Does not invent stages.
 */

export const EFFECTIVE_PARTICIPANT_STAGE_KEYS_FIELD = "_effective_participant_stage_keys" as const;
export const EFFECTIVE_STAGE_ROLLUP_LABEL_FIELD = "_effective_stage_rollup_label" as const;
export const EFFECTIVE_LOCATION_ROLLUP_LABEL_FIELD = "_effective_location_rollup_label" as const;

export type EffectiveParticipantStagesByContextId = ReadonlyMap<string, readonly string[]>;

export function attachEffectiveParticipantStagesToContextRows<T extends Record<string, unknown>>(
    rows: readonly T[],
    byContextId: EffectiveParticipantStagesByContextId,
    options?: {
        /** When true, attach empty arrays for contexts missing from the map (loaded, zero participants). */
        markMissingAsEmpty?: boolean;
        rollupLabelsByContextId?: ReadonlyMap<string, { stage?: string | null; location?: string | null }>;
    },
): T[] {
    const markMissingAsEmpty = options?.markMissingAsEmpty === true;
    const labels = options?.rollupLabelsByContextId;
    return rows.map((row) => {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) return row;
        const stages = byContextId.get(id);
        if (stages === undefined && !markMissingAsEmpty) return row;
        const next: Record<string, unknown> = {
            ...row,
            [EFFECTIVE_PARTICIPANT_STAGE_KEYS_FIELD]: stages ? [...stages] : [],
        };
        const rollup = labels?.get(id);
        if (rollup?.stage) next[EFFECTIVE_STAGE_ROLLUP_LABEL_FIELD] = rollup.stage;
        if (rollup?.location) next[EFFECTIVE_LOCATION_ROLLUP_LABEL_FIELD] = rollup.location;
        return next as T;
    });
}

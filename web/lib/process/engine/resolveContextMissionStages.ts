/**
 * Context/family Mission stage selection from Effective Process Position.
 *
 * Persisted `opportunities.stage_key` remains shared/context stage authority.
 * Mission (What's Next) for a case/context Focus Panel subject must follow
 * currently applicable authorized effective participant tracks — not raw context
 * stage alone once participants have diverged.
 *
 * Work View lens stages (opportunity_stage predicates) may constrain which
 * tracks contribute when the view is stage-scoped. Empty lens = inventory /
 * catch-all: the view imposes no stage Mission.
 *
 * Process-agnostic: no stage-key hardcoding.
 */

import { composeStageRollup } from "@/lib/process/engine/effectiveProcessPosition";

export type ContextMissionSource =
    | "effective_participants"
    | "context_stage"
    | "work_view_lens"
    | "empty";

export type ContextMissionResolution = {
    /** Unique Mission stage keys in first-seen order (EPP order, then lens order). */
    missionStageKeys: string[];
    /** True when exactly zero or one Mission stage key. */
    homogeneous: boolean;
    /** Emphasized Mission stage (first key; callers may re-rank by due/priority). */
    primaryMissionStageKey: string | null;
    /**
     * True when Mission came from effective participant stages rather than
     * falling back to raw context stage with no participant signal.
     */
    derivedFromEffectiveParticipants: boolean;
    source: ContextMissionSource;
    /** Count of non-null effective participant stages that contributed (pre-unique). */
    contributingParticipantCount: number;
};

function normKey(v: string | null | undefined): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function uniqueInOrder(values: readonly (string | null | undefined)[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
        const v = normKey(raw);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}

/**
 * Resolve Mission stage keys for a case/context Focus Panel subject.
 *
 * Rules:
 * 1. Collect effective participant stages (already access/location filtered upstream).
 * 2. If a Work View supplies `opportunity_stage` lens keys, intersect — stage-scoped
 *    views provide strong Mission context for matching tracks only.
 * 3. If no participants contribute stages → Mission = shared context stage (shared still matters).
 * 4. Inventory / empty lens → Mission = all unique effective stages (never raw context alone
 *    when participants have branched away).
 */
export function resolveContextMissionStages(args: {
    contextStageKey: string | null | undefined;
    effectiveParticipantStageKeys: readonly (string | null | undefined)[] | null | undefined;
    /** `lensStageKeys(view)` — empty/absent = inventory / stage-independent. */
    workViewLensStageKeys?: readonly string[] | null;
}): ContextMissionResolution {
    const contextStageKey = normKey(args.contextStageKey);
    const participantKeys = (args.effectiveParticipantStageKeys ?? [])
        .map(normKey)
        .filter((k): k is string => Boolean(k));
    const contributingParticipantCount = participantKeys.length;
    const uniqueParticipantStages = uniqueInOrder(participantKeys);
    const lensKeys = uniqueInOrder(args.workViewLensStageKeys ?? []);

    // No participant stage signal → shared/context stage remains Mission authority.
    if (uniqueParticipantStages.length === 0) {
        if (!contextStageKey) {
            return {
                missionStageKeys: [],
                homogeneous: true,
                primaryMissionStageKey: null,
                derivedFromEffectiveParticipants: false,
                source: "empty",
                contributingParticipantCount: 0,
            };
        }
        return {
            missionStageKeys: [contextStageKey],
            homogeneous: true,
            primaryMissionStageKey: contextStageKey,
            derivedFromEffectiveParticipants: false,
            source: "context_stage",
            contributingParticipantCount: 0,
        };
    }

    let missionStageKeys = uniqueParticipantStages;
    let source: ContextMissionSource = "effective_participants";

    if (lensKeys.length > 0) {
        const lensSet = new Set(lensKeys);
        const intersected = uniqueParticipantStages.filter((k) => lensSet.has(k));
        if (intersected.length > 0) {
            // Preserve lens order for emphasis when the view is stage-scoped.
            missionStageKeys = uniqueInOrder([
                ...lensKeys.filter((k) => intersected.includes(k)),
                ...intersected,
            ]);
            source = "work_view_lens";
        }
        // If intersection is empty, keep full effective tracks — a stage-scoped view
        // that admitted this row via other predicates must not invent an empty Mission.
    }

    const rollup = composeStageRollup(missionStageKeys);
    return {
        missionStageKeys,
        homogeneous: rollup.homogeneous,
        primaryMissionStageKey: missionStageKeys[0] ?? null,
        derivedFromEffectiveParticipants: true,
        source,
        contributingParticipantCount,
    };
}

/** Read `_effective_participant_stage_keys` from an enriched context/opportunity row. */
export function effectiveParticipantStageKeysFromRow(
    row: Record<string, unknown> | null | undefined,
): string[] {
    if (!row) return [];
    const raw = row._effective_participant_stage_keys;
    if (!Array.isArray(raw)) return [];
    return uniqueInOrder(raw.map((k) => (typeof k === "string" ? k : null)));
}

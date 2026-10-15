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
    /** Emphasized Mission stage: the context stage when it is a Mission stage (rule 6), else the first key. */
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
 * 5. E2E-12 — participants that have no track yet sit AT the context stage
 *    (`participantsAtContextPosition`): they contribute the context stage like any other
 *    participant. A family with Alpha on Waitlist and Bravo untracked is MIXED, not all-Waitlist.
 * 6. E2E-12 — when the context stage is one of several Mission stages, it is the case subject's
 *    primary: that position is the case's own work, while a participant that branched away has its
 *    own child-grain subject (`composeChildGrainSurface`) for its stage's work. The other Mission
 *    stages stay in `missionStageKeys` and still render as secondary work. When every participant
 *    has left the context stage, nothing changes (rule 4).
 */
export function resolveContextMissionStages(args: {
    contextStageKey: string | null | undefined;
    effectiveParticipantStageKeys: readonly (string | null | undefined)[] | null | undefined;
    /** `lensStageKeys(view)` — empty/absent = inventory / stage-independent. */
    workViewLensStageKeys?: readonly string[] | null;
    /**
     * Participants with no track yet (see `loadChildrenAtFamilyPosition`). They are at the context
     * stage. Absent/0 = every participant is tracked, which was the only case before E2E-12.
     */
    participantsAtContextPosition?: number | null;
}): ContextMissionResolution {
    const contextStageKey = normKey(args.contextStageKey);
    const atContext = Math.max(0, Math.floor(Number(args.participantsAtContextPosition ?? 0)) || 0);
    const participantKeys = [
        ...(args.effectiveParticipantStageKeys ?? []).map(normKey),
        ...(contextStageKey && atContext > 0 ? Array.from({ length: atContext }, () => contextStageKey) : []),
    ].filter((k): k is string => Boolean(k));
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
    // Rule 6: the case's own position leads when it is one of the Mission stages. A stage-scoped
    // lens (rule 2) already chose its emphasis and is left alone.
    const primaryMissionStageKey =
        source !== "work_view_lens" && contextStageKey && missionStageKeys.includes(contextStageKey)
            ? contextStageKey
            : missionStageKeys[0] ?? null;
    return {
        missionStageKeys,
        homogeneous: rollup.homogeneous,
        primaryMissionStageKey,
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

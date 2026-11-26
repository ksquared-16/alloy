/**
 * Effective Process Position — derived operator-facing process position.
 *
 * Persisted subject/context stage remains authoritative. This module never writes stage.
 * It rolls up effective participant stages (and locations) after access/scope filtering
 * has already selected the visible participant set.
 *
 * Process-agnostic: consumers supply ProcessParticipant[] + ProcessParticipationContract.
 */

import {
    effectiveStage,
    type ProcessParticipant,
} from "@/lib/process/engine/processParticipant";
import type { ProcessParticipationContract } from "@/lib/process/engine/processParticipationContract";

export type EffectiveParticipantPosition<Attr = unknown> = {
    participantId: string;
    subjectId: string;
    contextId: string | null;
    /** explicit participant stage, or null when inheriting */
    participantStageKey: string | null;
    contextStageKey: string | null;
    /** effectiveStage(participant, contract) */
    effectiveStageKey: string | null;
    locationId: string | null;
    attributes: Attr;
};

export type StageRollup = {
    /** Unique effective stage keys in first-seen order. */
    stageKeys: string[];
    homogeneous: boolean;
    /**
     * Compact operator label:
     * - homogeneous → that stage key
     * - 2 distinct → `a · b`
     * - 3+ → `${n} active stages`
     */
    compactLabel: string | null;
    /** Per-stage counts for detail (Tour · 3). */
    countsByStage: ReadonlyArray<{ stageKey: string; count: number }>;
};

export type LocationRollup = {
    locationIds: string[];
    homogeneous: boolean;
    /** Single id, or null when mixed/empty (presentation owns labels). */
    singleLocationId: string | null;
    /** Compact: null (single), `2 locations`, etc. */
    compactLabel: string | null;
};

export type EffectiveProcessPosition<Attr = unknown> = {
    contextId: string | null;
    contextStageKey: string | null;
    participants: ReadonlyArray<EffectiveParticipantPosition<Attr>>;
    stageRollup: StageRollup;
    locationRollup: LocationRollup;
};

export type EffectiveParticipantLocationReader<Attr = unknown> = (
    participant: ProcessParticipant<Attr>,
) => string | null;

function normKey(v: string | null | undefined): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function uniqueInOrder(values: readonly (string | null)[]): string[] {
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

/** Build stage rollup from effective stage keys (one per visible participant). */
export function composeStageRollup(effectiveStageKeys: readonly (string | null)[]): StageRollup {
    const present = effectiveStageKeys.map(normKey).filter((k): k is string => Boolean(k));
    const stageKeys = uniqueInOrder(present);
    const counts = new Map<string, number>();
    for (const k of present) counts.set(k, (counts.get(k) ?? 0) + 1);
    const countsByStage = stageKeys.map((stageKey) => ({
        stageKey,
        count: counts.get(stageKey) ?? 0,
    }));
    const homogeneous = stageKeys.length <= 1;
    let compactLabel: string | null = null;
    if (stageKeys.length === 1) compactLabel = stageKeys[0]!;
    else if (stageKeys.length === 2) compactLabel = `${stageKeys[0]} · ${stageKeys[1]}`;
    else if (stageKeys.length >= 3) compactLabel = `${stageKeys.length} active stages`;
    return { stageKeys, homogeneous, compactLabel, countsByStage };
}

/** Build location rollup from participant location ids (already access-filtered). */
export function composeLocationRollup(locationIds: readonly (string | null)[]): LocationRollup {
    const ids = uniqueInOrder(locationIds);
    const homogeneous = ids.length <= 1;
    return {
        locationIds: ids,
        homogeneous,
        singleLocationId: ids.length === 1 ? ids[0]! : null,
        compactLabel: ids.length >= 2 ? `${ids.length} locations` : null,
    };
}

/**
 * Case/context-grain Work View membership for a stage key.
 *
 * - No visible participants → shared/context stage alone.
 * - Otherwise → at least one visible participant effectively in that stage.
 *
 * Does NOT use context stage alone when participants exist and have all branched away.
 */
export function contextBelongsToEffectiveStage(args: {
    contextStageKey: string | null | undefined;
    participantEffectiveStageKeys: readonly (string | null | undefined)[];
    stageKey: string;
}): boolean {
    const target = normKey(args.stageKey);
    if (!target) return false;
    const participantStages = args.participantEffectiveStageKeys
        .map((k) => normKey(k ?? null))
        .filter((k): k is string => Boolean(k));
    if (participantStages.length === 0) {
        return normKey(args.contextStageKey) === target;
    }
    return participantStages.some((k) => k === target);
}

/**
 * Derive Effective Process Position from already-authorized / scope-filtered participants.
 * Callers MUST filter by access + workspace location before invoking.
 */
export function deriveEffectiveProcessPosition<Attr>(args: {
    contextId: string | null;
    contextStageKey: string | null;
    participants: readonly ProcessParticipant<Attr>[];
    contract: ProcessParticipationContract;
    locationOf?: EffectiveParticipantLocationReader<Attr>;
}): EffectiveProcessPosition<Attr> {
    const locationOf = args.locationOf ?? (() => null);
    const participants: EffectiveParticipantPosition<Attr>[] = args.participants.map((p) => ({
        participantId: p.participantId,
        subjectId: p.subjectId,
        contextId: p.contextId,
        participantStageKey: p.participantStageKey,
        contextStageKey: p.contextStageKey,
        effectiveStageKey: effectiveStage(p, args.contract),
        locationId: normKey(locationOf(p)),
        attributes: p.attributes,
    }));
    return {
        contextId: args.contextId,
        contextStageKey: normKey(args.contextStageKey),
        participants,
        stageRollup: composeStageRollup(participants.map((p) => p.effectiveStageKey)),
        locationRollup: composeLocationRollup(participants.map((p) => p.locationId)),
    };
}

/** Convenience: does this derived position place the context in a case-grain stage cohort? */
export function effectiveProcessPositionBelongsToStage(
    position: EffectiveProcessPosition<unknown>,
    stageKey: string,
): boolean {
    return contextBelongsToEffectiveStage({
        contextStageKey: position.contextStageKey,
        participantEffectiveStageKeys: position.participants.map((p) => p.effectiveStageKey),
        stageKey,
    });
}

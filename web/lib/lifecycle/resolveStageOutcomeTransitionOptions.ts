/**
 * Process-derived transition options for outcome automation editor.
 *
 * Derives outgoing transitions from configured edges — never hardcoded stage lists.
 */

import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageOutcomeTransitionOption = {
    transition_ref: string;
    label: string;
    target_stage_key: string;
    target_stage_label: string;
    available?: boolean;
    status_key?: string;
    closes_record?: true;
};

export function resolveStageOutcomeTransitionOptions(input: {
    currentStageKey: string;
    currentStageLabel?: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
    /** @deprecated Legacy callers pass all process stages — ignored except for label lookup. */
    processStagesLegacy?: unknown;
}): StageOutcomeTransitionOption[] {
    const processStages = input.processStages
        ?? (Array.isArray(input.processStagesLegacy)
            ? (input.processStagesLegacy as Array<{ key: string; label: string }>)
            : []);

    return resolveOutgoingProcessTransitions({
        currentStageKey: input.currentStageKey,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages,
    }).map((row) => ({
        transition_ref: row.transition_ref,
        label: row.label,
        target_stage_key: row.target_stage_key,
        target_stage_label: row.target_stage_label,
        available: row.available,
        ...(row.status_key ? { status_key: row.status_key } : {}),
        ...(row.closes_record ? { closes_record: true as const } : {}),
    }));
}

/** Resolve legacy stage_key-only targets to a transition_ref when unambiguous. */
export function resolveLegacyStageKeyToTransitionRef(
    stageKey: string | null | undefined,
    options: StageOutcomeTransitionOption[],
): { transition_ref: string | null; ambiguous: boolean } {
    const key = stageKey?.trim();
    if (!key) return { transition_ref: null, ambiguous: false };

    const matches = options.filter((opt) => opt.target_stage_key === key);
    if (matches.length === 1) return { transition_ref: matches[0]!.transition_ref, ambiguous: false };
    if (matches.length > 1) return { transition_ref: null, ambiguous: true };
    return { transition_ref: null, ambiguous: false };
}

export function readTransitionRefFromTarget(
    target: StageOutcomeRuleTargetV1,
    options: StageOutcomeTransitionOption[],
): string | null {
    const explicit = target.transition_ref?.trim();
    if (explicit) return explicit;

    const legacy = resolveLegacyStageKeyToTransitionRef(target.stage_key, options);
    return legacy.transition_ref;
}

export function stageKeyFromTransitionRef(
    transitionRef: string | null | undefined,
    options: StageOutcomeTransitionOption[],
): string | null {
    const ref = transitionRef?.trim();
    if (!ref) return null;

    const match = options.find((opt) => opt.transition_ref === ref);
    if (match) return match.target_stage_key;

    if (ref.startsWith("move_to_stage:")) {
        const parts = ref.slice("move_to_stage:".length).split(":");
        return parts[0]?.trim() || null;
    }
    if (ref.startsWith("outcome_transition:")) {
        const parts = ref.split(":");
        return parts[2]?.trim() || null;
    }
    return null;
}

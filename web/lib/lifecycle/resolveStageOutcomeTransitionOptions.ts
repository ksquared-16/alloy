/**
 * Process-derived transition options for outcome automation editor.
 *
 * Derives outgoing transitions from the current builder stage — never hardcoded stage lists.
 */

import { resolveCanonicalTransitionOptions } from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import type { StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageOutcomeTransitionOption = {
    transition_ref: string;
    label: string;
    target_stage_key: string;
    target_stage_label: string;
};

export function resolveStageOutcomeTransitionOptions(input: {
    processStages: unknown;
    currentStageKey: string;
}): StageOutcomeTransitionOption[] {
    const canonical = resolveCanonicalTransitionOptions({
        processTransitions: input.processStages,
        stageKey: input.currentStageKey,
    });

    return canonical.map((row) => {
        const targetStageKey = row.ref.startsWith("move_to_stage:")
            ? row.ref.slice("move_to_stage:".length)
            : row.ref;
        return {
            transition_ref: row.ref,
            label: row.label,
            target_stage_key: targetStageKey,
            target_stage_label: row.label.replace(/^Move to /i, ""),
        };
    });
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
    return { transition_ref: `move_to_stage:${key}`, ambiguous: false };
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

    if (ref.startsWith("move_to_stage:")) return ref.slice("move_to_stage:".length).trim() || null;
    return null;
}

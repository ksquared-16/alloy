/**
 * Outgoing process transitions — derived from configured edges only.
 *
 * Sources (in order):
 * 1. Current stage `stage_operating_plan_v1.outcome_rules` move_to_stage targets
 * 2. Process `tracks_v1.split_rules` where from_stage_key matches current stage
 *
 * Never generates transitions from a stage inventory or domain assumptions.
 */

import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { parseProcessTracksV1 } from "@/lib/businessProcesses/parseProcessTracksV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type OutgoingProcessTransition = {
    transition_ref: string;
    label: string;
    target_stage_key: string;
    target_stage_label: string;
    source: "process_transition" | "legacy_fallback";
    /** Outcome key when transition originates from an outcome rule. */
    outcome_key?: string;
    /** Split-rule outcome key when transition originates from tracks_v1. */
    split_outcome_key?: string;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function stageLabelForKey(
    stageKey: string,
    processStages: ReadonlyArray<{ key: string; label: string }>,
): string {
    const match = processStages.find((row) => row.key === stageKey);
    if (match?.label?.trim()) return match.label.trim();
    return stageKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function outcomeLabelForKey(
    outcomeKey: string | null | undefined,
    plan: StageOperatingPlanV1 | null | undefined,
): string | null {
    const key = outcomeKey?.trim();
    if (!key || !plan) return null;
    const outcome = plan.outcomes.find((row) => row.outcome_key === key);
    return outcome?.label?.trim() ?? null;
}

function stableTransitionRef(args: {
    explicitRef: string | null;
    ruleKey: string;
    outcomeKey: string | null;
    targetStageKey: string;
    source: "outcome_rule" | "split_rule";
    splitOutcomeKey?: string | null;
}): string {
    if (args.explicitRef) return args.explicitRef;
    if (args.source === "split_rule" && args.splitOutcomeKey) {
        return `split_rule:${args.ruleKey}:${args.splitOutcomeKey}`;
    }
    if (args.outcomeKey) {
        return `outcome_transition:${args.outcomeKey}:${args.targetStageKey}`;
    }
    return `move_to_stage:${args.targetStageKey}:${args.ruleKey}`;
}

function transitionsFromOperatingPlan(args: {
    plan: StageOperatingPlanV1 | null | undefined;
    currentStageKey: string;
    processStages: ReadonlyArray<{ key: string; label: string }>;
}): OutgoingProcessTransition[] {
    const plan = args.plan;
    if (!plan) return [];

    const current = args.currentStageKey.trim();
    const out: OutgoingProcessTransition[] = [];
    const seenRefs = new Set<string>();

    for (const rule of plan.outcome_rules ?? []) {
        const outcomeKey = trimOrNull(rule.when_outcome_key);
        for (const target of rule.targets ?? []) {
            if (target.kind !== "move_to_stage") continue;
            const targetStageKey = trimOrNull(target.stage_key);
            if (!targetStageKey || targetStageKey === current) continue;

            const transitionRef = stableTransitionRef({
                explicitRef: trimOrNull(target.transition_ref),
                ruleKey: rule.rule_key,
                outcomeKey,
                targetStageKey,
                source: "outcome_rule",
            });
            if (seenRefs.has(transitionRef)) continue;
            seenRefs.add(transitionRef);

            const targetStageLabel = stageLabelForKey(targetStageKey, args.processStages);
            const outcomeLabel = outcomeLabelForKey(outcomeKey, plan);
            const label = outcomeLabel ?? `Move to ${targetStageLabel}`;

            out.push({
                transition_ref: transitionRef,
                label,
                target_stage_key: targetStageKey,
                target_stage_label: targetStageLabel,
                source: "process_transition",
                ...(outcomeKey ? { outcome_key: outcomeKey } : {}),
            });
        }
    }

    return out;
}

function transitionsFromSplitRules(args: {
    tracks: ProcessTracksV1 | null | undefined;
    currentStageKey: string;
    processStages: ReadonlyArray<{ key: string; label: string }>;
}): OutgoingProcessTransition[] {
    const tracks = args.tracks;
    if (!tracks?.split_rules?.length) return [];

    const current = args.currentStageKey.trim();
    const out: OutgoingProcessTransition[] = [];
    const seenRefs = new Set<string>();

    for (const rule of tracks.split_rules) {
        const fromStage = trimOrNull(rule.from_stage_key);
        if (!fromStage || fromStage !== current) continue;

        const ruleKey = `${rule.from_track_key}:${rule.from_stage_key}:${rule.into_track_key}`;

        for (const outcome of rule.per_subject_outcomes ?? []) {
            const targetStageKey = trimOrNull(outcome.target_stage_key);
            if (!targetStageKey || targetStageKey === current) continue;

            const splitOutcomeKey = trimOrNull(outcome.outcome_key);
            const transitionRef = stableTransitionRef({
                explicitRef: null,
                ruleKey,
                outcomeKey: null,
                targetStageKey,
                source: "split_rule",
                splitOutcomeKey,
            });
            if (seenRefs.has(transitionRef)) continue;
            seenRefs.add(transitionRef);

            const targetStageLabel = stageLabelForKey(targetStageKey, args.processStages);
            const label =
                trimOrNull(outcome.label)
                ?? `Move to ${targetStageLabel}`;

            out.push({
                transition_ref: transitionRef,
                label,
                target_stage_key: targetStageKey,
                target_stage_label: targetStageLabel,
                source: "process_transition",
                ...(splitOutcomeKey ? { split_outcome_key: splitOutcomeKey } : {}),
            });
        }
    }

    return out;
}

export function resolveOutgoingProcessTransitions(input: {
    currentStageKey: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: ProcessTracksV1 | unknown | null;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
}): OutgoingProcessTransition[] {
    const currentStageKey = input.currentStageKey.trim();
    if (!currentStageKey) return [];

    const processStages = input.processStages ?? [];
    const tracks =
        input.processTracks != null && typeof input.processTracks === "object"
            ? parseProcessTracksV1(input.processTracks) ?? (input.processTracks as ProcessTracksV1)
            : null;

    const fromPlan = transitionsFromOperatingPlan({
        plan: input.stageOperatingPlan ?? null,
        currentStageKey,
        processStages,
    });
    const fromSplits = transitionsFromSplitRules({
        tracks,
        currentStageKey,
        processStages,
    });

    const merged = new Map<string, OutgoingProcessTransition>();
    for (const row of [...fromPlan, ...fromSplits]) {
        if (!merged.has(row.transition_ref)) merged.set(row.transition_ref, row);
    }

    return [...merged.values()];
}

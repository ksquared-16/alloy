/**
 * Requirement timing — pure rule selection and transition evaluation.
 *
 * Legacy rules (no timing metadata):
 *   - Appear during stage_progress / readiness projection.
 *   - Do NOT participate in the new transition-blocking layer.
 *   - record_creation blocking requires explicit timing.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import {
    evaluateFieldRulesForStage,
    type PrimaryPersonSnapshot,
} from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { lifecycleFieldRequirementById } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    fieldRulesArraysFromPersistedLevels,
    isLifecycleRuleEnforceable,
    resolveAllEffectivePersistedLevels,
    type LifecycleStageFieldRulesStored,
    type PersistedRequirementLevel,
    type RuleEnforceableLookup,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type {
    EffectiveRequirementEvaluation,
    EffectiveRequirementMissing,
    PublishedLifecycleFieldRules,
    PublishedRequirementRuleMeta,
    RequirementEnforcement,
    RequirementEvaluationMoment,
    RequirementRuleMetaV1,
    RequirementTiming,
    SelectedRequirementRule,
} from "@/lib/lifecycle/requirementTimingTypes";
import { parseRuleMetaV1, ruleMetaForRule } from "@/lib/lifecycle/requirementTimingMeta";

export type { PrimaryPersonSnapshot };

function normalizeTimings(
    timing: RequirementTiming | RequirementTiming[] | undefined,
): RequirementTiming[] | null {
    if (timing == null) return null;
    return Array.isArray(timing) ? timing : [timing];
}

function hasTiming(meta: RequirementRuleMetaV1 | undefined, target: RequirementTiming): boolean {
    const timings = normalizeTimings(meta?.timing);
    return timings?.includes(target) ?? false;
}

function transitionKeysForMoment(moment: Extract<RequirementEvaluationMoment, { kind: "transition" }>): string[] {
    const keys = new Set<string>();
    const transitionKey = moment.transitionKey?.trim();
    const toStageKey = moment.toStageKey.trim();
    const fromStageKey = moment.fromStageKey.trim();
    if (transitionKey) keys.add(transitionKey);
    if (toStageKey) keys.add(toStageKey);
    if (fromStageKey) keys.add(fromStageKey);
    return [...keys];
}

/** Whether a stage_exit rule applies to the requested transition. */
export function transitionMatchesRuleMeta(
    meta: RequirementRuleMetaV1 | undefined,
    moment: Extract<RequirementEvaluationMoment, { kind: "transition" }>,
): boolean {
    if (!hasTiming(meta, "stage_exit")) return false;

    const keys = transitionKeysForMoment(moment);
    const excluded = meta?.excluded_transition_keys ?? [];
    if (excluded.some((k) => keys.includes(k.trim()))) return false;

    const appliesTo = meta?.applies_to_transition_keys;
    if (appliesTo?.length) {
        return appliesTo.some((k) => keys.includes(k.trim()));
    }

    // Explicit stage_exit with no transition filter → all transitions except excluded.
    return true;
}

/** Pure rule selection for a lifecycle evaluation moment. */
export function selectRequirementRulesForMoment(input: {
    rules: PublishedLifecycleFieldRules;
    ruleMeta: PublishedRequirementRuleMeta;
    moment: RequirementEvaluationMoment;
}): SelectedRequirementRule[] {
    const levels = resolveAllEffectivePersistedLevels({
        rules: input.rules,
        rule_levels_v1: input.rules.rule_levels_v1,
        isEnforceable: (ruleId) => isLifecycleRuleEnforceable(ruleId),
    });

    const selected: SelectedRequirementRule[] = [];

    for (const ruleId of Object.keys(levels)) {
        const meta = ruleMetaForRule(input.ruleMeta, ruleId);
        const timings = normalizeTimings(meta?.timing);

        let applies = false;
        switch (input.moment.kind) {
            case "record_creation":
                applies = hasTiming(meta, "record_creation");
                break;
            case "stage_progress":
                // Legacy default: missing timing behaves as stage_progress.
                applies = !timings || hasTiming(meta, "stage_progress");
                break;
            case "stage_exit_progress":
                applies = hasTiming(meta, "stage_exit");
                break;
            case "transition":
                applies = transitionMatchesRuleMeta(meta, input.moment);
                break;
            case "process_completion":
                applies = hasTiming(meta, "process_completion");
                break;
        }

        if (applies) {
            selected.push({ ruleId, meta });
        }
    }

    return selected;
}

function enforcementFromLevel(
    level: PersistedRequirementLevel,
    meta: RequirementRuleMetaV1 | undefined,
): RequirementEnforcement {
    if (meta?.enforcement) return meta.enforcement;
    switch (level) {
        case "enforced":
            return "blocking";
        case "required":
            return "attention";
        case "recommended":
            return "informational";
    }
}

function scopeLabel(meta: RequirementRuleMetaV1 | undefined, ruleId: string): string {
    if (meta?.scope) return meta.scope;
    const binding = lifecycleFieldRuleBinding(ruleId);
    const catalog = lifecycleFieldRequirementById(ruleId);
    switch (binding?.entity ?? catalog?.entity) {
        case "child":
            return "each_child";
        case "person":
            return "primary_contact";
        case "customer":
            return "relationship";
        default:
            return "record";
    }
}

function filterStoredRulesForRuleIds(
    stored: LifecycleStageFieldRulesStored,
    ruleIds: readonly string[],
): LifecycleStageFieldRulesStored {
    const idSet = new Set(ruleIds);
    const filteredLevels: Record<string, PersistedRequirementLevel> = {};
    const allLevels = resolveAllEffectivePersistedLevels({
        rules: stored,
        rule_levels_v1: stored.rule_levels_v1,
        isEnforceable: (ruleId) => isLifecycleRuleEnforceable(ruleId),
    });
    for (const [ruleId, level] of Object.entries(allLevels)) {
        if (idSet.has(ruleId)) filteredLevels[ruleId] = level;
    }
    const { required_rule_ids, recommended_rule_ids } = fieldRulesArraysFromPersistedLevels(filteredLevels);
    const filteredMeta = stored.rule_meta_v1
        ? {
              version: 1 as const,
              by_rule_id: Object.fromEntries(
                  Object.entries(stored.rule_meta_v1.by_rule_id).filter(([rid]) => idSet.has(rid)),
              ),
          }
        : null;
    return {
        required_rule_ids,
        recommended_rule_ids,
        ...(Object.keys(filteredLevels).length && stored.rule_levels_v1
            ? {
                  rule_levels_v1: {
                      version: 1 as const,
                      by_rule_id: Object.fromEntries(
                          Object.entries(stored.rule_levels_v1.by_rule_id).filter(([rid]) => idSet.has(rid)),
                      ),
                  },
              }
            : {}),
        ...(filteredMeta && Object.keys(filteredMeta.by_rule_id).length ? { rule_meta_v1: filteredMeta } : {}),
    };
}

function violationsToMissing(
    violations: ReturnType<typeof evaluateFieldRulesForStage>,
    ruleMeta: PublishedRequirementRuleMeta,
    options?: { progressionHint?: string },
): EffectiveRequirementMissing[] {
    return violations.map((v) => {
        const ruleId = v.context?.rule_id?.trim() ?? v.label;
        const meta = ruleMetaForRule(ruleMeta, ruleId);
        const level = (v.context?.requirement_level as PersistedRequirementLevel | undefined) ?? "required";
        return {
            key: ruleId,
            label: v.label,
            scope: scopeLabel(meta, ruleId),
            targetIds: v.entity_id ? [v.entity_id] : undefined,
            enforcement: enforcementFromLevel(level, meta),
            progressionHint: options?.progressionHint,
        };
    });
}

/** Evaluate selected rules against record truth using the existing field-rule evaluator. */
export function evaluateSelectedFieldRules(
    ctx: CompletionEvaluationContext,
    stage: LifecycleOperatorStage,
    stored: LifecycleStageFieldRulesStored,
    selected: readonly SelectedRequirementRule[],
    options?: { isEnforceable?: RuleEnforceableLookup },
): EffectiveRequirementEvaluation {
    if (!selected.length) {
        return { satisfied: true, missing: [], blocking: [] };
    }

    const ruleIds = selected.map((r) => r.ruleId);
    const filtered = filterStoredRulesForRuleIds(stored, ruleIds);
    const violations = evaluateFieldRulesForStage(ctx, stage, filtered, options);

    const missing = violationsToMissing(violations, parseRuleMetaV1(stored.rule_meta_v1));
    const blocking = missing.filter((m) => m.enforcement === "blocking");

    return {
        satisfied: blocking.length === 0,
        missing,
        blocking,
    };
}

/** Transition-aware requirement evaluation (explicit stage_exit rules only). */
export function evaluateRequirementsForTransition(input: {
    ctx: CompletionEvaluationContext;
    operatorStage: LifecycleOperatorStage;
    publishedRules: PublishedLifecycleFieldRules;
    ruleMeta: PublishedRequirementRuleMeta;
    fromStageKey: string;
    toStageKey: string;
    transitionKey?: string;
    toStageLabel?: string | null;
}): EffectiveRequirementEvaluation {
    const moment: RequirementEvaluationMoment = {
        kind: "transition",
        fromStageKey: input.fromStageKey,
        toStageKey: input.toStageKey,
        transitionKey: input.transitionKey,
    };

    const selected = selectRequirementRulesForMoment({
        rules: input.publishedRules,
        ruleMeta: input.ruleMeta,
        moment,
    });

    const hint =
        input.toStageLabel?.trim()
            ? `Needed before ${input.toStageLabel.trim()}`
            : input.toStageKey.trim()
              ? `Needed before ${input.toStageKey.trim()}`
              : undefined;

    if (!selected.length) {
        return { satisfied: true, missing: [], blocking: [] };
    }

    const filtered = filterStoredRulesForRuleIds(
        input.publishedRules,
        selected.map((s) => s.ruleId),
    );
    const violations = evaluateFieldRulesForStage(input.ctx, input.operatorStage, filtered);
    const missing = violationsToMissing(violations, input.ruleMeta, { progressionHint: hint });
    const blocking = missing.filter(
        (m) => m.enforcement === "blocking" || m.enforcement === "attention",
    );

    return {
        satisfied: blocking.length === 0,
        missing,
        blocking,
    };
}

/** Rules that should appear in stage progress / readiness (includes legacy default). */
export function selectRulesForStageProgressReadiness(
    rules: PublishedLifecycleFieldRules,
    ruleMeta: PublishedRequirementRuleMeta,
    stageKey: string,
): SelectedRequirementRule[] {
    const progress = selectRequirementRulesForMoment({
        rules,
        ruleMeta,
        moment: { kind: "stage_progress", stageKey },
    });
    const exitProgress = selectRequirementRulesForMoment({
        rules,
        ruleMeta,
        moment: { kind: "stage_exit_progress", stageKey },
    });
    const seen = new Set<string>();
    const merged: SelectedRequirementRule[] = [];
    for (const row of [...progress, ...exitProgress]) {
        if (seen.has(row.ruleId)) continue;
        seen.add(row.ruleId);
        merged.push(row);
    }
    return merged;
}

/** Explicit record_creation rules for Create Lead intake. */
export function selectRulesForRecordCreation(
    rules: PublishedLifecycleFieldRules,
    ruleMeta: PublishedRequirementRuleMeta,
): SelectedRequirementRule[] {
    return selectRequirementRulesForMoment({
        rules,
        ruleMeta,
        moment: { kind: "record_creation" },
    });
}

/**
 * Outcome rule coverage warnings for stage_operating_plan_v1 editor (non-blocking).
 */

import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeRuleV1, StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { stageOutcomeRuleSummary } from "@/lib/lifecycle/stageOperatingPlanUiLabels";

export type OutcomeAutomationIndicator = {
    outcome_key: string;
    label: string;
    has_automation: boolean;
    rule_summaries: string[];
};

export type OperatingPlanOutcomeSaveWarning = {
    kind: "outcome_no_automation" | "orphan_outcome_rule";
    message: string;
    outcome_key?: string;
    rule_key?: string;
};

function outcomeKeySet(outcomes: { outcome_key: string }[]): Set<string> {
    return new Set(outcomes.map((o) => o.outcome_key.trim()).filter(Boolean));
}

function rulesForOutcome(rules: StageOutcomeRuleV1[], outcomeKey: string): StageOutcomeRuleV1[] {
    const key = outcomeKey.trim();
    return rules.filter((r) => r.when_outcome_key.trim() === key);
}

/** Per-outcome automation indicator for editor UI. */
export function outcomeAutomationIndicators(
    draft: Pick<StageOperatingPlanEditorDraft, "outcomes" | "outcome_rules">,
): OutcomeAutomationIndicator[] {
    return draft.outcomes.map((outcome) => {
        const matched = rulesForOutcome(draft.outcome_rules, outcome.outcome_key);
        const rule_summaries = matched.flatMap((rule) =>
            rule.targets.map((target) => stageOutcomeRuleSummary(target)),
        );
        return {
            outcome_key: outcome.outcome_key,
            label: outcome.label,
            has_automation: matched.length > 0,
            rule_summaries,
        };
    });
}

/** Non-blocking warnings surfaced before/after save. */
export function operatingPlanOutcomeSaveWarnings(
    draft: Pick<StageOperatingPlanEditorDraft, "outcomes" | "outcome_rules">,
): OperatingPlanOutcomeSaveWarning[] {
    const warnings: OperatingPlanOutcomeSaveWarning[] = [];
    const keys = outcomeKeySet(draft.outcomes);

    for (const outcome of draft.outcomes) {
        const matched = rulesForOutcome(draft.outcome_rules, outcome.outcome_key);
        if (matched.length === 0) {
            warnings.push({
                kind: "outcome_no_automation",
                outcome_key: outcome.outcome_key,
                message: `"${outcome.label}" has no automation attached — choosing it will not change status or stage.`,
            });
        }
    }

    for (const rule of draft.outcome_rules) {
        const whenKey = rule.when_outcome_key.trim();
        if (!whenKey || keys.has(whenKey)) continue;
        warnings.push({
            kind: "orphan_outcome_rule",
            rule_key: rule.rule_key,
            outcome_key: whenKey,
            message: `Automation rule "${rule.rule_key}" references missing outcome "${whenKey}".`,
        });
    }

    return warnings;
}

export function operatingPlanOutcomeSaveWarningsFromPlan(
    plan: StageOperatingPlanV1 | null | undefined,
): OperatingPlanOutcomeSaveWarning[] {
    if (!plan) return [];
    return operatingPlanOutcomeSaveWarnings({
        outcomes: plan.outcomes,
        outcome_rules: plan.outcome_rules,
    });
}

/**
 * Tenant-safe merge of code defaults into published stage_operating_plan_v1.
 *
 * Precedence: published tenant plan shadows code defaults for any outcome_key /
 * rule_key / sufficient_command_result the tenant already configured. This helper
 * only ADDS missing canonical defaults — it never overwrites intentional tenant config.
 */

import type { StageOperatingPlanV1, StageOutcomeRuleV1, StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

export type MergeTourScheduledDefaultsReport = {
    stage_key: string;
    added_outcomes: string[];
    added_rules: string[];
    added_sufficient_command_results: string[];
    skipped_conflicts: string[];
    changed: boolean;
};

function outcomeKeys(plan: StageOperatingPlanV1): Set<string> {
    return new Set(plan.outcomes.map((o) => o.outcome_key.trim()).filter(Boolean));
}

function ruleKeys(plan: StageOperatingPlanV1): Set<string> {
    return new Set(plan.outcome_rules.map((r) => r.rule_key.trim()).filter(Boolean));
}

/**
 * Merge Tour Scheduled + schedule_tour→tour_scheduled defaults into a published Lead plan
 * only where the tenant has not already configured conflicting keys.
 */
export function mergeTourScheduledDefaultsIntoLeadPlan(
    published: StageOperatingPlanV1,
): { plan: StageOperatingPlanV1; report: MergeTourScheduledDefaultsReport } {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead");
    const report: MergeTourScheduledDefaultsReport = {
        stage_key: "lead",
        added_outcomes: [],
        added_rules: [],
        added_sufficient_command_results: [],
        skipped_conflicts: [],
        changed: false,
    };

    if (!defaults) {
        return { plan: published, report };
    }

    const next: StageOperatingPlanV1 = {
        ...published,
        outcomes: [...published.outcomes],
        outcome_rules: [...published.outcome_rules],
        work_templates: published.work_templates.map((t) => ({
            ...t,
            completion_policy: t.completion_policy
                ? {
                      ...t.completion_policy,
                      sufficient_command_results: [
                          ...(t.completion_policy.sufficient_command_results ?? []),
                      ],
                  }
                : t.completion_policy,
        })),
    };

    const existingOutcomes = outcomeKeys(published);
    for (const outcome of defaults.outcomes) {
        if (outcome.outcome_key !== "tour_scheduled") continue;
        if (existingOutcomes.has(outcome.outcome_key)) {
            report.skipped_conflicts.push(`outcome:${outcome.outcome_key}`);
            continue;
        }
        next.outcomes.push(outcome as StageCompletionOutcomeV1);
        report.added_outcomes.push(outcome.outcome_key);
        report.changed = true;
    }

    const existingRules = ruleKeys(published);
    for (const rule of defaults.outcome_rules) {
        const isTourScheduled =
            rule.when_outcome_key === "tour_scheduled"
            || (rule.when_domain_signal?.domain === "tour_booking"
                && rule.when_domain_signal?.signal === "scheduled");
        if (!isTourScheduled) continue;
        if (existingRules.has(rule.rule_key)) {
            report.skipped_conflicts.push(`rule:${rule.rule_key}`);
            continue;
        }
        // If tenant already maps tour_scheduled differently, do not add our rule.
        if (
            rule.when_outcome_key === "tour_scheduled"
            && published.outcome_rules.some((r) => r.when_outcome_key === "tour_scheduled")
        ) {
            report.skipped_conflicts.push(`when_outcome:tour_scheduled`);
            continue;
        }
        next.outcome_rules.push(rule as StageOutcomeRuleV1);
        report.added_rules.push(rule.rule_key);
        report.changed = true;
    }

    const defaultContact = defaults.work_templates.find((t) => t.template_key === "contact_family");
    const defaultSufficient =
        defaultContact?.completion_policy?.sufficient_command_results?.find(
            (row) => row.capability === "schedule_tour" && row.result === "confirmed",
        ) ?? null;

    if (defaultSufficient) {
        for (const template of next.work_templates) {
            if (template.template_key !== "contact_family") continue;
            const existing = template.completion_policy?.sufficient_command_results ?? [];
            const hasScheduleTour = existing.some(
                (row) => row.capability === "schedule_tour" && row.result === "confirmed",
            );
            if (hasScheduleTour) {
                report.skipped_conflicts.push("sufficient_command_results:schedule_tour/confirmed");
                continue;
            }
            if (!template.completion_policy) {
                template.completion_policy = { sufficient_command_results: [defaultSufficient] };
            } else {
                template.completion_policy.sufficient_command_results = [
                    ...existing,
                    defaultSufficient,
                ];
            }
            report.added_sufficient_command_results.push("schedule_tour/confirmed→tour_scheduled");
            report.changed = true;
        }
    }

    return { plan: next, report };
}

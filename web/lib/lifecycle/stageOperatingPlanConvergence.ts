/**
 * Business Process editor convergence — primary work, work-scoped outcomes, attention normalization.
 */

import type {
    StageCompletionOutcomeV1,
    StageOperatingPlanV1,
    StageOutcomeRuleTargetV1,
    StageOutcomeRuleV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { defaultAttentionRuleLabel, normalizeAttentionRuleKind } from "@/lib/lifecycle/stageAttentionRuleCatalog";
import { stageOutcomeRuleSummary } from "@/lib/lifecycle/stageOperatingPlanUiLabels";
import { formatFollowUpDuePolicySummary } from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";

export function resolveEffectivePrimaryWorkTemplate(
    plan: Pick<StageOperatingPlanV1, "work_templates"> | null | undefined,
): StageWorkTemplateV1 | null {
    const templates = plan?.work_templates ?? [];
    if (!templates.length) return null;
    const explicit = templates.find((t) => t.primary === true);
    if (explicit) return explicit;
    return templates.find((t) => t.required) ?? templates[0] ?? null;
}

/** Ensure exactly one primary flag when any work items exist. */
export function normalizeWorkTemplatePrimaryFlags(
    templates: StageWorkTemplateV1[],
): StageWorkTemplateV1[] {
    if (!templates.length) return templates;
    const primaryIndexes = templates
        .map((t, i) => (t.primary ? i : -1))
        .filter((i) => i >= 0);
    if (primaryIndexes.length === 1) return templates.map((t) => ({ ...t }));

    if (primaryIndexes.length > 1) {
        const keep = primaryIndexes[0]!;
        return templates.map((t, i) => ({ ...t, primary: i === keep }));
    }

    const fallbackIndex = templates.findIndex((t) => t.required);
    const primaryIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
    return templates.map((t, i) => ({ ...t, primary: i === primaryIndex }));
}

export function setPrimaryWorkTemplate(
    templates: StageWorkTemplateV1[],
    templateKey: string,
): StageWorkTemplateV1[] {
    return templates.map((t) => ({ ...t, primary: t.template_key === templateKey }));
}

export function outcomesForWorkTemplate(
    outcomes: StageCompletionOutcomeV1[],
    templateKey: string,
): StageCompletionOutcomeV1[] {
    return outcomes.filter((o) => (o.work_template_key ?? null) === templateKey);
}

export function unattachedStageOutcomes(outcomes: StageCompletionOutcomeV1[]): StageCompletionOutcomeV1[] {
    return outcomes.filter((o) => !(o.work_template_key ?? "").trim());
}

function defaultAttentionTargets(label: string): StageOutcomeRuleTargetV1[] {
    return [
        {
            kind: "create_needs_attention",
            attention_reason: label,
            wait_bucket: "waiting_on_staff",
        },
    ];
}

export function normalizeAttentionRulesForPersist(
    rules: StageOperatingPlanV1["attention_rules"],
): StageOperatingPlanV1["attention_rules"] {
    return rules.map((rule, index) => {
        const kind = normalizeAttentionRuleKind(rule.kind);
        const label = (rule.label ?? "").trim() || defaultAttentionRuleLabel(kind);
        const normalized: StageOperatingPlanV1["attention_rules"][number] = {
            rule_key: rule.rule_key.trim() || `attention_${index + 1}`,
            kind,
            label,
            targets: rule.targets.length ? rule.targets : defaultAttentionTargets(label),
        };
        if (rule.severity) normalized.severity = rule.severity;
        if (typeof rule.threshold === "number") normalized.threshold = rule.threshold;
        if (rule.template_key?.trim()) normalized.template_key = rule.template_key.trim();
        return normalized;
    });
}

export function normalizeOperatingPlanDraftForPersist(
    draft: StageOperatingPlanEditorDraft,
): StageOperatingPlanEditorDraft {
    return {
        ...draft,
        work_templates: normalizeWorkTemplatePrimaryFlags(draft.work_templates),
        attention_rules: normalizeAttentionRulesForPersist(draft.attention_rules),
    };
}

export function outcomeAutomationSummaries(
    outcomeKey: string,
    rules: StageOutcomeRuleV1[],
    options?: {
        workTemplateLabelByKey?: Record<string, string>;
        transitionLabelByRef?: Record<string, string>;
    },
): string[] {
    const matching = rules.filter((r) => r.when_outcome_key === outcomeKey);
    if (!matching.length) return [];

    const lines: string[] = [];
    for (const rule of matching) {
        for (const target of rule.targets) {
            if (target.kind === "no_movement") {
                lines.push("Remain in current stage");
                continue;
            }
            if (target.kind === "move_to_stage") {
                const transitionLabel =
                    options?.transitionLabelByRef?.[target.transition_ref?.trim() ?? ""]
                    ?? (target.stage_key ? `Move to ${target.stage_key.replace(/_/g, " ")}` : null);
                if (transitionLabel) {
                    lines.push(transitionLabel);
                    continue;
                }
            }
            if (target.kind === "update_family_case_status" && target.status_key) {
                lines.push(`Update family status: ${target.status_key.replace(/_/g, " ")}`);
                continue;
            }
            if (target.kind === "create_next_work" && target.template_key) {
                const label =
                    options?.workTemplateLabelByKey?.[target.template_key]
                    ?? target.template_key.replace(/_/g, " ");
                if (target.follow_up_due_policy) {
                    lines.push(formatFollowUpDuePolicySummary(target.follow_up_due_policy, label));
                    continue;
                }
                const due =
                    typeof target.due_days === "number" ?
                        ` in ${target.due_days} day${target.due_days === 1 ? "" : "s"}`
                    :   "";
                lines.push(`Create "${label}"${due} after outcome is recorded`);
                continue;
            }
            if (target.kind === "reopen_work" && target.template_key) {
                const label =
                    options?.workTemplateLabelByKey?.[target.template_key]
                    ?? target.template_key.replace(/_/g, " ");
                if (target.follow_up_due_policy) {
                    lines.push(formatFollowUpDuePolicySummary(target.follow_up_due_policy, label));
                    continue;
                }
                const due =
                    typeof target.due_days === "number" ?
                        ` in ${target.due_days} day${target.due_days === 1 ? "" : "s"}`
                    :   "";
                lines.push(`Continue "${label}"${due}`);
                continue;
            }
            if (target.kind === "mark_stage_work_complete") {
                lines.push("Complete current work");
                continue;
            }
            if (target.kind === "create_needs_attention") {
                lines.push(
                    target.attention_reason ?
                        `Mark needs attention — ${target.attention_reason}`
                    :   "Mark needs attention",
                );
                continue;
            }
            lines.push(stageOutcomeRuleSummary(target));
        }
    }
    return [...new Set(lines)];
}

export function workTemplateLabelMap(templates: StageWorkTemplateV1[]): Record<string, string> {
    return Object.fromEntries(templates.map((t) => [t.template_key, t.label]));
}

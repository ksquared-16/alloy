import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    resolveEffectiveWorkDefinitionKeyFromTemplate,
} from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import type { ResolveWorkDefinitionsParams } from "@/lib/admin/operationalWork/workDefinitionTypes";

export type StageOperatingPlanWorkDefinitionIssue = {
    template_key: string;
    label: string;
    reason: "missing_template_key" | "unresolved_definition" | "definition_not_available";
    message: string;
};

export type ValidateStageOperatingPlanWorkDefinitionsResult =
    | { ok: true }
    | { ok: false; issues: StageOperatingPlanWorkDefinitionIssue[] };

function issueForTemplate(
    template: StageWorkTemplateV1,
    reason: StageOperatingPlanWorkDefinitionIssue["reason"],
): StageOperatingPlanWorkDefinitionIssue {
    const templateKey = template.template_key?.trim() || "(missing)";
    const label = template.label?.trim() || templateKey;
    const messages: Record<StageOperatingPlanWorkDefinitionIssue["reason"], string> = {
        missing_template_key: "Work template is missing a template key.",
        unresolved_definition: `Work template "${label}" does not resolve to a platform work definition.`,
        definition_not_available: `Work definition for "${label}" is disabled or not allowed for this stage.`,
    };
    return { template_key: templateKey, label, reason, message: messages[reason] };
}

/** Fail publish/save when any work template cannot resolve to an available platform definition. */
export function validateStageOperatingPlanWorkDefinitions(
    plan: Pick<StageOperatingPlanV1, "stage_key" | "work_templates">,
    resolveParams?: ResolveWorkDefinitionsParams,
): ValidateStageOperatingPlanWorkDefinitionsResult {
    const issues: StageOperatingPlanWorkDefinitionIssue[] = [];
    const stageKey = plan.stage_key?.trim() || resolveParams?.stageKey?.trim() || "";

    for (const template of plan.work_templates ?? []) {
        const effective = resolveEffectiveWorkDefinitionKeyFromTemplate(template, {
            ...resolveParams,
            stageKey: stageKey || resolveParams?.stageKey,
        });
        if (!effective.ok) {
            issues.push(issueForTemplate(template, effective.reason));
        }
    }

    return issues.length ? { ok: false, issues } : { ok: true };
}

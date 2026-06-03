import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { effectiveRequirementsToValidationResult } from "@/lib/completion/evaluateEffectiveRequirements";
import { readinessResultFromEffectiveRequirements } from "@/lib/completion/evaluateOperationalReadiness";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";

export type ActionPreflightUiPayload = {
    action_key: string;
    title: string;
    summary: string;
    blocking: Array<{ field_key: string; label: string; reason: string; source: string }>;
    recommended: Array<{ field_key: string; label: string; reason: string }>;
    completion_requirements: RequirementValidationResult;
    effective_requirements: EffectiveRequirementsResult;
    readiness?: ReadinessResult;
};

const ACTION_PREFLIGHT_TITLES: Record<string, string> = {
    approve_enrollment: "Approve enrollment — requirements",
    move_to_waitlist: "Move to waitlist — requirements",
    schedule_tour: "Schedule tour — requirements",
    record_tour_outcome: "Record tour outcome — requirements",
};

export function actionPreflightTitle(actionKey: string): string {
    return ACTION_PREFLIGHT_TITLES[actionKey.trim()] ?? "Action requirements";
}

export function buildActionPreflightUiPayload(
    actionKey: string,
    effective: EffectiveRequirementsResult,
    context?: {
        orgId?: string;
        opportunityId?: string;
        departmentId?: string | null;
    }
): ActionPreflightUiPayload {
    const validation = effectiveRequirementsToValidationResult(effective);
    const trimmedKey = actionKey.trim();
    const readiness =
        context?.orgId && context?.opportunityId
            ? readinessResultFromEffectiveRequirements(effective, {
                  trigger: "action_execute",
                  subject: { entity_type: "opportunity", entity_id: context.opportunityId },
                  context: {
                      org_id: context.orgId,
                      department_id: context.departmentId ?? undefined,
                      action_key: trimmedKey,
                  },
              })
            : undefined;

    return {
        action_key: trimmedKey,
        title: actionPreflightTitle(actionKey),
        summary: formatRequirementValidationSummary(validation) || "Complete required information before continuing.",
        blocking: effective.blocking.map((v) => ({
            field_key: v.field_key,
            label: v.label,
            reason: v.reason,
            source: v.source,
        })),
        recommended: effective.recommended.map((v) => ({
            field_key: v.field_key,
            label: v.label,
            reason: v.reason,
        })),
        completion_requirements: validation,
        effective_requirements: effective,
        ...(readiness ? { readiness } : {}),
    };
}

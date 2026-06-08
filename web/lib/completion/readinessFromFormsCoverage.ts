/**
 * Map Forms lifecycle coverage → ReadinessResult (Phase 1 consumer wiring).
 */

import type {
    FormsLifecycleCoverageItem,
    FormsLifecycleCoverageResult,
    FormsLifecycleRequirementContract,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import { effectiveFieldRulesStoredForStage } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    buildReadinessResult,
    isReadinessBlockingTrigger,
} from "@/lib/completion/readinessMappers";
import type {
    ReadinessContext,
    ReadinessGap,
    ReadinessTrigger,
    RequirementLevel,
} from "@/lib/completion/readinessTypes";
import {
    isLifecycleRuleEnforceable,
    resolveEffectivePersistedLevel,
    type PersistedRequirementLevel,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";

function resolvedLevelForRule(
    ruleId: string,
    contract: FormsLifecycleRequirementContract,
    departmentMetadata?: Record<string, unknown> | null
): RequirementLevel {
    const stored = effectiveFieldRulesStoredForStage(contract.stageKey, departmentMetadata ?? null);
    const level = resolveEffectivePersistedLevel({
        ruleId,
        rules: stored,
        rule_levels_v1: stored.rule_levels_v1,
        isEnforceable: (id) => isLifecycleRuleEnforceable(id),
    });
    if (level === "off") return "required";
    return level;
}

function gapFromCoverageItem(
    item: FormsLifecycleCoverageItem,
    level: RequirementLevel,
    trigger: ReadinessTrigger
): ReadinessGap {
    const blocking = level === "enforced" && isReadinessBlockingTrigger(trigger);
    return {
        requirement_id: item.requirementId,
        scope_type: "record",
        level,
        label: item.requirementLabel,
        missing_reason: `${item.requirementLabel} is missing.`,
        failure_kind: "missing",
        blocking,
        field_key: item.requirementFieldKey || item.requirementId,
    };
}

function levelForCoverageItem(
    item: FormsLifecycleCoverageItem,
    contract: FormsLifecycleRequirementContract,
    departmentMetadata?: Record<string, unknown> | null
): RequirementLevel {
    if (item.requirementId.startsWith("constraint:")) {
        return "enforced";
    }
    if (item.requiredness === "recommended") {
        return "recommended";
    }
    return resolvedLevelForRule(item.requirementId, contract, departmentMetadata);
}

function missingCoverageItems(coverage: FormsLifecycleCoverageResult): FormsLifecycleCoverageItem[] {
    const items = [
        ...coverage.missingRequired,
        ...coverage.missingRecommended,
        ...coverage.constraintFailures,
    ];
    return items.filter((item) => item.status === "missing");
}

export function readinessResultFromFormsLifecycleCoverage(input: {
    coverage: FormsLifecycleCoverageResult;
    contract: FormsLifecycleRequirementContract;
    trigger: Extract<ReadinessTrigger, "form_submit" | "form_coverage">;
    orgId: string;
    departmentMetadata?: Record<string, unknown> | null;
    formId?: string;
    departmentId?: string;
}): import("@/lib/completion/readinessTypes").ReadinessResult {
    const gaps = missingCoverageItems(input.coverage).map((item) =>
        gapFromCoverageItem(
            item,
            levelForCoverageItem(item, input.contract, input.departmentMetadata),
            input.trigger
        )
    );

    const configured = input.contract.required.length + input.contract.recommended.length;
    const satisfied = Math.max(0, configured - gaps.length);

    const context: ReadinessContext = {
        org_id: input.orgId,
        department_id: input.departmentId ?? input.contract.departmentId,
        operator_stage: input.contract.stageKey,
        form_id: input.formId,
    };

    return buildReadinessResult({
        trigger: input.trigger,
        subject: {
            entity_type: "form",
            entity_id: input.formId?.trim() || "form_submission",
        },
        context,
        gaps,
        counts: {
            gaps_total: gaps.length,
            by_level: {
                recommended: gaps.filter((g) => g.level === "recommended").length,
                required: gaps.filter((g) => g.level === "required").length,
                enforced: gaps.filter((g) => g.level === "enforced").length,
            },
            blocking: gaps.filter((g) => g.blocking).length,
            satisfied,
            configured,
        },
    });
}

/** Phase 1 form submit — block only when readiness has enforced blocking gaps. */
export function formsSubmitBlockedByReadiness(
    readiness: import("@/lib/completion/readinessTypes").ReadinessResult
): boolean {
    return !readiness.ok;
}

export function persistedLevelForFormsRule(
    ruleId: string,
    contract: FormsLifecycleRequirementContract,
    departmentMetadata?: Record<string, unknown> | null
): PersistedRequirementLevel | "off" {
    const stored = effectiveFieldRulesStoredForStage(contract.stageKey, departmentMetadata ?? null);
    return resolveEffectivePersistedLevel({
        ruleId,
        rules: stored,
        rule_levels_v1: stored.rule_levels_v1,
        isEnforceable: (id) => isLifecycleRuleEnforceable(id),
    });
}

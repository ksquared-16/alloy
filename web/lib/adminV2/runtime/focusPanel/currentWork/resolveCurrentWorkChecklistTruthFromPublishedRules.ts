/**
 * Resolve published field-rule checklist completion from record / readiness truth.
 *
 * Generic — driven by lifecycle field rule bindings and evaluateFieldRulesForStage.
 * Work-template checklist keys continue to use stage-work runtime completion.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { RequirementViolation } from "@/lib/completion/requirementValidationTypes";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    effectiveFieldRulesStoredForBuilderStage,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { evaluateFieldRulesForStage } from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    selectRulesForStageProgressReadiness,
} from "@/lib/lifecycle/requirementTimingEvaluation";
import { ruleMetaForRule } from "@/lib/lifecycle/requirementTimingMeta";

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { CurrentWorkTemplateConfigOverlay } from "./currentWorkTemplateConfig";
import type { PublishedStageInputsForCurrentWork } from "./resolvePublishedStageInputsForCurrentWork";

export type ChecklistTruthStatus = "complete" | "missing" | "blocked";

export type ChecklistTruthResult = {
    key: string;
    status: ChecklistTruthStatus;
    completed: boolean;
    missingCount?: number;
    targetLabel?: string;
    detail?: string;
};

export type ResolveCurrentWorkChecklistTruthInput = {
    record: Record<string, unknown>;
    operationalContext: OperationalContext;
    publishedStageInputs: PublishedStageInputsForCurrentWork | null | undefined;
    templateOverlay: CurrentWorkTemplateConfigOverlay | null | undefined;
    readinessProjection?: ReadinessResult | null;
    runtimeCompletedKeys?: ReadonlySet<string> | null;
    departmentMetadata?: Record<string, unknown> | null;
};

function scopeTargetLabel(scope?: string): string | null {
    switch (scope) {
        case "child":
            return "Children";
        case "person":
            return "Person";
        default:
            return null;
    }
}

function entityTargetLabel(entity: string | undefined): string | undefined {
    switch (entity) {
        case "child":
            return "Children";
        case "person":
            return "Person";
        case "customer":
            return "Household";
        case "opportunity":
            return "Record";
        default:
            return undefined;
    }
}

function workTemplateKeys(plan: StageOperatingPlanV1 | null | undefined): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const template of plan?.work_templates ?? []) {
        keys.add(template.template_key);
    }
    return keys;
}

function fieldRuleKeys(published: PublishedStageInputsForCurrentWork | null | undefined): ReadonlySet<string> {
    const keys = new Set<string>();
    const rules = published?.fieldRules;
    if (!rules) return keys;
    for (const id of rules.required_rule_ids) keys.add(id);
    for (const id of rules.recommended_rule_ids) keys.add(id);
    return keys;
}

function violationsByRuleId(violations: RequirementViolation[]): Map<string, RequirementViolation[]> {
    const map = new Map<string, RequirementViolation[]>();
    for (const violation of violations) {
        const ruleId = violation.context?.rule_id?.trim();
        if (!ruleId) continue;
        const list = map.get(ruleId) ?? [];
        list.push(violation);
        map.set(ruleId, list);
    }
    return map;
}

function readinessGapByRuleId(readiness: ReadinessResult | null | undefined): Map<string, ReadinessResult["gaps"][number]> {
    const map = new Map<string, ReadinessResult["gaps"][number]>();
    for (const gap of readiness?.gaps ?? []) {
        const key = gap.requirement_id.trim();
        if (!key || map.has(key)) continue;
        map.set(key, gap);
    }
    return map;
}

function truthFromViolations(
    key: string,
    violations: RequirementViolation[],
    scope?: string,
    readinessGap?: ReadinessResult["gaps"][number],
    ruleMeta?: ReturnType<typeof ruleMetaForRule>,
): ChecklistTruthResult {
    if (violations.length === 0) {
        return { key, status: "complete", completed: true };
    }

    const binding = lifecycleFieldRuleBinding(key);
    const targetLabel = entityTargetLabel(binding?.entity) ?? scopeTargetLabel(scope) ?? undefined;
    const perEntity = violations.filter((v) => v.entity_id && v.entity_id !== "unknown");
    const missingCount = perEntity.length > 0 ? perEntity.length : violations.length;
    const timings = ruleMeta?.timing
        ? Array.isArray(ruleMeta.timing)
            ? ruleMeta.timing
            : [ruleMeta.timing]
        : null;
    const progressionHint =
        timings?.includes("stage_exit")
            ? "Needed before the configured next step"
            : undefined;
    const detail =
        progressionHint ??
        (missingCount > 1
            ? `Missing for ${missingCount} ${binding?.entity === "child" ? "children" : "records"}`
            : violations[0]?.missing_reason ?? readinessGap?.missing_reason ?? undefined);

    return {
        key,
        status: readinessGap?.blocking ? "blocked" : "missing",
        completed: false,
        missingCount,
        targetLabel,
        detail,
    };
}

function truthFromReadinessGap(key: string, gap: ReadinessResult["gaps"][number], scope?: string): ChecklistTruthResult {
    return {
        key,
        status: gap.blocking ? "blocked" : "missing",
        completed: false,
        targetLabel:
            gap.entity_type === "child"
                ? "Children"
                : gap.entity_type === "person"
                  ? "Person"
                  : scopeTargetLabel(scope) ?? undefined,
        detail: gap.missing_reason,
    };
}

function storedRuleMetaForChecklist(
    departmentMetadata: Record<string, unknown>,
    stageKey: string,
    ruleId: string,
) {
    const stored = effectiveFieldRulesStoredForBuilderStage(
        stageKey,
        departmentMetadata,
        asOperatorStageKey(stageKey),
    );
    return ruleMetaForRule(stored.rule_meta_v1 ?? null, ruleId);
}

function evaluatePublishedFieldRuleViolations(input: {
    record: Record<string, unknown>;
    operationalContext: OperationalContext;
    publishedStageInputs: PublishedStageInputsForCurrentWork;
    departmentMetadata: Record<string, unknown>;
}): Map<string, RequirementViolation[]> {
    const { publishedStageInputs, operationalContext, record, departmentMetadata } = input;
    const operatorStage = asOperatorStageKey(publishedStageInputs.stageKey);
    const stored = effectiveFieldRulesStoredForBuilderStage(
        publishedStageInputs.stageKey,
        departmentMetadata,
        operatorStage,
    );

    const recordWithMetadata = { ...record, _department_metadata: departmentMetadata };

    // Child Attention: evaluate child-scoped rules against the focused participant only —
    // do not fail Waitlist readiness because a sibling is missing a field.
    let scopedRecord: Record<string, unknown> = recordWithMetadata;
    if (operationalContext.grain === "child") {
        const focusMemberId =
            typeof record["child.customer_member_id"] === "string"
                ? String(record["child.customer_member_id"]).trim()
                : operationalContext.subject.id.trim();
        const children = Array.isArray(record._inquiry_children)
            ? (record._inquiry_children as Record<string, unknown>[])
            : [];
        if (focusMemberId && children.length > 0) {
            const focused = children.filter((c) => {
                const cm = typeof c.customer_member_id === "string" ? c.customer_member_id.trim() : "";
                const id = typeof c.id === "string" ? c.id.trim() : "";
                return cm === focusMemberId || id === focusMemberId;
            });
            if (focused.length > 0) {
                scopedRecord = { ...recordWithMetadata, _inquiry_children: focused };
            }
        }
    }

    const completionCtx = buildCompletionContextFromRecord({
        entity_type: "opportunity",
        entity_id:
            typeof scopedRecord.id === "string" && scopedRecord.id.trim()
                ? scopedRecord.id.trim()
                : operationalContext.subject.id,
        phase: "preview",
        record: scopedRecord,
        surface: "current_work_checklist",
        status_from: typeof scopedRecord.status_key === "string" ? scopedRecord.status_key : null,
    });
    completionCtx.related = {
        ...completionCtx.related,
        department_metadata: departmentMetadata,
    };

    const stageForEval: LifecycleOperatorStage =
        operatorStage ?? asOperatorStageKey(publishedStageInputs.stageKey) ?? "lead";

    const selected = selectRulesForStageProgressReadiness(
        stored,
        stored.rule_meta_v1 ?? null,
        publishedStageInputs.stageKey,
    );
    if (!selected.length) return new Map();

    const filteredIds = new Set(selected.map((row) => row.ruleId));
    const filteredStored: typeof stored = {
        required_rule_ids: stored.required_rule_ids.filter((id) => filteredIds.has(id)),
        recommended_rule_ids: stored.recommended_rule_ids.filter((id) => filteredIds.has(id)),
        ...(stored.rule_levels_v1 ? { rule_levels_v1: stored.rule_levels_v1 } : {}),
        ...(stored.rule_meta_v1 ? { rule_meta_v1: stored.rule_meta_v1 } : {}),
    };

    const violations = evaluateFieldRulesForStage(completionCtx, stageForEval, filteredStored);
    return violationsByRuleId(violations);
}

/**
 * Resolve checklist truth for published overlay items.
 * Pure — no I/O.
 */
export function resolveCurrentWorkChecklistTruthFromPublishedRules(
    input: ResolveCurrentWorkChecklistTruthInput,
): Map<string, ChecklistTruthResult> {
    const {
        record,
        operationalContext,
        publishedStageInputs,
        templateOverlay,
        readinessProjection,
        runtimeCompletedKeys,
        departmentMetadata,
    } = input;

    const results = new Map<string, ChecklistTruthResult>();
    const checklist = templateOverlay?.checklist ?? [];
    if (checklist.length === 0) return results;

    const templateKeys = workTemplateKeys(publishedStageInputs?.operatingPlan ?? null);
    const configuredFieldRules = fieldRuleKeys(publishedStageInputs);
    const completedKeys = runtimeCompletedKeys ?? new Set<string>();
    const readinessByKey = readinessGapByRuleId(readinessProjection);

    const metadata =
        departmentMetadata ??
        (record._department_metadata != null &&
        typeof record._department_metadata === "object" &&
        !Array.isArray(record._department_metadata)
            ? (record._department_metadata as Record<string, unknown>)
            : null);

    let violationsByKey = new Map<string, RequirementViolation[]>();
    if (publishedStageInputs && metadata) {
        violationsByKey = evaluatePublishedFieldRuleViolations({
            record,
            operationalContext,
            publishedStageInputs,
            departmentMetadata: metadata,
        });
    }

    for (const row of checklist) {
        const key = row.key.trim();
        if (!key) continue;

        if (templateKeys.has(key)) {
            const complete = completedKeys.has(key);
            results.set(key, {
                key,
                status: complete ? "complete" : "missing",
                completed: complete,
            });
            continue;
        }

        const isFieldRule = configuredFieldRules.has(key) || lifecycleFieldRuleBinding(key) != null;
        if (isFieldRule) {
            const readinessGap = readinessByKey.get(key);
            if (readinessGap) {
                results.set(key, truthFromReadinessGap(key, readinessGap, row.scope));
                continue;
            }

            const violations = violationsByKey.get(key) ?? [];
            const meta =
                metadata && publishedStageInputs
                    ? storedRuleMetaForChecklist(metadata, publishedStageInputs.stageKey, key)
                    : undefined;
            results.set(key, truthFromViolations(key, violations, row.scope, readinessGap, meta));
            continue;
        }

        const complete = completedKeys.has(key);
        results.set(key, {
            key,
            status: complete ? "complete" : "missing",
            completed: complete,
        });
    }

    return results;
}

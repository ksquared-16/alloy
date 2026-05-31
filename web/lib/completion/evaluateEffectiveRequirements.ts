/**
 * Unified lifecycle requirement evaluator — single spine for layout, action, transition, completion, BOS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    autoPopulateForLifecycleAction,
    evaluateLifecycleActionRequirements,
    isLifecyclePreflightActionKey,
    lifecycleActionTargetStatus,
} from "@/lib/completion/lifecycleActionRequirementCatalog";
import { evaluateCompletionRequirements } from "@/lib/completion/evaluateCompletionRequirements";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import { validateStatusTransitionStructured } from "@/lib/completion/enforcePersonCompletionOnPatch";
import {
    buildEffectiveRequirementsResult,
    partitionValidationToEffective,
} from "@/lib/completion/effectiveRequirementMappers";
import { effectiveTriggerToCompletionPhase } from "@/lib/completion/effectiveRequirementPhase";
import type {
    EffectiveRequirementsContext,
    EffectiveRequirementsResult,
    EffectiveRequirementViolation,
} from "@/lib/completion/effectiveRequirementsTypes";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import {
    buildOpportunityCompletionContextFromDb,
    loadOpportunityRecordForEffectiveRequirements,
} from "@/lib/completion/loadRecordForEffectiveRequirements";

function tagSource(
    violations: EffectiveRequirementViolation[],
    source: EffectiveRequirementViolation["source"]
): EffectiveRequirementViolation[] {
    return violations.map((v) => (v.source === source ? v : { ...v, source }));
}

function countBySource(
    blocking: EffectiveRequirementViolation[],
    recommended: EffectiveRequirementViolation[]
): EffectiveRequirementsResult["sourceSummary"] {
    const all = [...blocking, ...recommended];
    return {
        layoutRules: all.filter((v) => v.source === "layout").length,
        actionRules: all.filter((v) => v.source === "action").length,
        transitionRules: all.filter((v) => v.source === "transition").length,
        completionRules: all.filter((v) => v.source === "completion").length,
    };
}

function buildContextFromEffective(input: EffectiveRequirementsContext) {
    const phase = effectiveTriggerToCompletionPhase(input.trigger);
    return buildCompletionContextFromRecord({
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        phase,
        record: { ...input.record, ...(input.payload ?? {}) },
        surface: input.surface ?? "opportunity_drawer",
        layout_variant_key: input.layout_variant_key,
        status_from: input.status_from ?? input.status,
        status_to: input.status_to ?? input.transition_key ?? undefined,
        action_key: input.action_key,
    });
}

/** Evaluate from an in-memory record snapshot (BOS preview, tests). */
export function evaluateEffectiveRequirements(
    input: EffectiveRequirementsContext
): EffectiveRequirementsResult {
    const ctx = buildContextFromEffective(input);
    ctx.org_id = input.org_id;
    const actionTarget = input.action_key ? lifecycleActionTargetStatus(input.action_key) : null;
    if (actionTarget && !ctx.status_to) {
        ctx.status_to = actionTarget;
    }

    const summary = { layoutRules: 0, actionRules: 0, transitionRules: 0, completionRules: 0 };
    let blocking: EffectiveRequirementViolation[] = [];
    let recommended: EffectiveRequirementViolation[] = [];

    const completion = evaluateCompletionRequirements(ctx);
    const completionParts = partitionValidationToEffective(completion, "completion");
    blocking.push(...tagSource(completionParts.blocking, "completion"));
    recommended.push(...tagSource(completionParts.recommended, "completion"));
    summary.completionRules = completionParts.blocking.length + completionParts.recommended.length;

    const actionKey = input.action_key?.trim();
    if (actionKey && isLifecyclePreflightActionKey(actionKey)) {
        const actionRules = evaluateLifecycleActionRequirements(ctx, input.payload);
        const actionParts = partitionValidationToEffective(actionRules, "action");
        blocking.push(...tagSource(actionParts.blocking, "action"));
        recommended.push(...tagSource(actionParts.recommended, "action"));
        summary.actionRules = actionParts.blocking.length + actionParts.recommended.length;
    }

    const autoPopulate =
        input.trigger === "action_execute" && actionKey
            ? autoPopulateForLifecycleAction(actionKey, {
                  opportunityId: input.entity_id,
                  payload: input.payload,
              })
            : [];

    return buildEffectiveRequirementsResult({
        blocking,
        recommended,
        autoPopulate,
        sourceSummary: countBySource(blocking, recommended),
    });
}

/** Async evaluation including DB-backed transition rules. */
export async function evaluateEffectiveRequirementsAsync(
    supabase: SupabaseClient,
    input: EffectiveRequirementsContext
): Promise<EffectiveRequirementsResult> {
    const sync = evaluateEffectiveRequirements(input);
    const statusTo = input.status_to?.trim();
    if (
        input.entity_type !== "opportunity" ||
        !statusTo ||
        !input.org_id ||
        (input.trigger !== "action_execute" && input.trigger !== "status_transition")
    ) {
        return sync;
    }

    const metadata =
        input.record.metadata && typeof input.record.metadata === "object" && !Array.isArray(input.record.metadata)
            ? (input.record.metadata as Record<string, unknown>)
            : null;

    const transition = await validateStatusTransitionStructured({
        supabase,
        orgId: input.org_id,
        entityType: "opportunities",
        entityId: input.entity_id,
        departmentId: input.department_id,
        workUnitId: input.work_unit_id,
        actionKey: input.action_key,
        fromStatusKey: input.status_from ?? input.status,
        toStatusKey: statusTo,
        currentMetadata: metadata,
        payload: input.payload ?? {},
    });

    const transitionParts = partitionValidationToEffective(transition, "transition");
    const blocking = [...sync.blocking, ...tagSource(transitionParts.blocking, "transition")];
    const recommended = [...sync.recommended, ...tagSource(transitionParts.recommended, "transition")];

    return buildEffectiveRequirementsResult({
        blocking,
        recommended,
        autoPopulate: sync.autoPopulate,
        sourceSummary: {
            ...sync.sourceSummary,
            transitionRules: transitionParts.blocking.length + transitionParts.recommended.length,
        },
    });
}

export function effectiveRequirementsToValidationResult(
    result: EffectiveRequirementsResult
): RequirementValidationResult {
    const blocking = result.blocking.map((v) => ({
        entity_type: v.entity_type ?? "opportunity",
        entity_id: v.entity_id ?? "",
        field_key: v.field_key,
        label: v.label,
        requirement_type: "required_before_action" as const,
        blocking_level: "hard_block" as const,
        missing_reason: v.reason,
        context: { action_key: v.resolution?.action_key },
    }));
    const warnings = result.recommended
        .filter((v) => v.severity === "warning")
        .map((v) => ({
            entity_type: v.entity_type ?? "opportunity",
            entity_id: v.entity_id ?? "",
            field_key: v.field_key,
            label: v.label,
            requirement_type: "required_on_save" as const,
            blocking_level: "soft_warning" as const,
            missing_reason: v.reason,
            context: {},
        }));
    const recommendations = result.recommended
        .filter((v) => v.severity === "recommended")
        .map((v) => ({
            entity_type: v.entity_type ?? "opportunity",
            entity_id: v.entity_id ?? "",
            field_key: v.field_key,
            label: v.label,
            requirement_type: "recommended_non_blocking" as const,
            blocking_level: "recommendation" as const,
            missing_reason: v.reason,
            context: {},
        }));

    return {
        ok: result.ok,
        blocking,
        warnings,
        recommendations,
    };
}

export async function evaluateOpportunityActionPreflight(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        opportunityId: string;
        actionKey: string;
        payload?: Record<string, unknown>;
        departmentId?: string | null;
        workUnitId?: string | null;
        statusTo?: string | null;
    }
): Promise<EffectiveRequirementsResult> {
    const record = await loadOpportunityRecordForEffectiveRequirements(
        supabase,
        input.orgId,
        input.opportunityId
    );
    if (!record) {
        return buildEffectiveRequirementsResult({
            blocking: [
                {
                    field_key: "opportunity",
                    label: "Opportunity",
                    severity: "required",
                    reason: "Record not found.",
                    source: "completion",
                },
            ],
            recommended: [],
            autoPopulate: [],
            sourceSummary: { layoutRules: 0, actionRules: 0, transitionRules: 0, completionRules: 1 },
        });
    }

    const statusFrom = record.status_key != null ? String(record.status_key) : null;
    return evaluateEffectiveRequirementsAsync(supabase, {
        org_id: input.orgId,
        entity_type: "opportunity",
        entity_id: input.opportunityId,
        status: statusFrom,
        status_from: statusFrom,
        status_to: input.statusTo ?? undefined,
        action_key: input.actionKey,
        trigger: "action_execute",
        department_id: input.departmentId,
        work_unit_id: input.workUnitId,
        record,
        payload: input.payload,
    });
}

export { buildOpportunityCompletionContextFromDb };

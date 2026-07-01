/**
 * Readiness Engine — canonical evaluation entry (Phase 1 wrapper).
 * Wraps existing evaluateEffectiveRequirements without changing call sites yet.
 * @see docs/sprints/06_2026/readiness_engine_architecture_and_runtime_contract.md
 */

import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import type { EffectiveRequirementsContext } from "@/lib/completion/effectiveRequirementsTypes";
import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";
import {
    buildReadinessContextFromEvalInput,
    mapEffectiveRequirementsToReadinessResult,
} from "@/lib/completion/readinessMappers";
import type { ReadinessEvalInput, ReadinessResult, ReadinessTrigger } from "@/lib/completion/readinessTypes";

function effectiveTriggerFromReadinessTrigger(
    trigger: ReadinessTrigger
): EffectiveRequirementsContext["trigger"] {
    switch (trigger) {
        case "action_execute":
            return "action_execute";
        case "status_transition":
            return "status_transition";
        case "record_view":
        case "form_submit":
        case "form_coverage":
        case "lifecycle_validate":
            return "bos_scan";
        default:
            return "bos_scan";
    }
}

function mapReadinessInputToEffectiveContext(input: ReadinessEvalInput): EffectiveRequirementsContext {
    if (!input.record) {
        throw new Error("evaluateOperationalReadiness requires record snapshot in Phase 1.");
    }
    return {
        org_id: input.org_id,
        entity_type: input.subject.entity_type as EffectiveRequirementsContext["entity_type"],
        entity_id: input.subject.entity_id,
        trigger: effectiveTriggerFromReadinessTrigger(input.trigger),
        action_key: input.action_key ?? null,
        status: input.status ?? null,
        status_from: input.status_from ?? input.status ?? null,
        status_to: input.status_to ?? null,
        department_id: input.department_id ?? null,
        work_unit_id: input.work_unit_id ?? null,
        record: input.record,
        payload: input.payload,
        lifecycle_stage: input.context?.operator_stage,
    };
}

/**
 * Canonical readiness evaluation — Phase 1 delegates to legacy spine + mapper.
 * Does not replace evaluateEffectiveRequirements at existing call sites yet.
 */
export function evaluateOperationalReadiness(input: ReadinessEvalInput): ReadinessResult {
    const effective = evaluateEffectiveRequirements(mapReadinessInputToEffectiveContext(input));
    return mapEffectiveRequirementsToReadinessResult(effective, {
        trigger: input.trigger,
        subject: input.subject,
        context: buildReadinessContextFromEvalInput(input),
        configured_rule_count: input.configured_rule_count,
        satisfied_rule_count: input.satisfied_rule_count,
        include_legacy: input.include_legacy,
        evaluated_at: new Date().toISOString(),
    });
}

/**
 * Map an existing EffectiveRequirementsResult without re-running evaluation.
 */
export function readinessResultFromEffectiveRequirements(
    effective: EffectiveRequirementsResult,
    input: Omit<Parameters<typeof mapEffectiveRequirementsToReadinessResult>[1], "evaluated_at"> & {
        evaluated_at?: string;
    }
): ReadinessResult {
    return mapEffectiveRequirementsToReadinessResult(effective, {
        ...input,
        evaluated_at: input.evaluated_at ?? new Date().toISOString(),
    });
}

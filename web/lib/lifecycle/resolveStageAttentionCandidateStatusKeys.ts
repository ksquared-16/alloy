/**
 * Derive opportunity status keys for Needs Attention queue prefilter when stages
 * have configured stage_operating_plan_v1.attention_rules.
 *
 * Prefilter is intentionally broader — final resolver pass still decides membership.
 */

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { ENROLLMENT_STAGE_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStageBindings";
import {
    activeLifecycleProcess,
    asOperatorStageKey,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import { flattenStatusRollupKeys } from "@/lib/lifecycle/statusRollupV1";

function trimStatusKey(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim().toLowerCase();
    return s || null;
}

function stageHasAttentionRules(
    process: LifecycleBuilderProcessRecord,
    stage: LifecycleBuilderStageRecord,
): boolean {
    const explicit = resolveStageOperatingPlanForStage(stage, stage.key);
    if ((explicit?.attention_rules?.length ?? 0) > 0) return true;
    if (process.key === "enrollment") {
        const fallback = defaultStageOperatingPlanForEnrollmentStage(stage.key);
        return (fallback?.attention_rules?.length ?? 0) > 0;
    }
    return false;
}

function statusKeysFromStageMetadata(stage: LifecycleBuilderStageRecord): string[] {
    const keys = new Set<string>();

    for (const sk of flattenStatusRollupKeys(stage.status_rollup_v1)) {
        const t = trimStatusKey(sk);
        if (t) keys.add(t);
    }

    const qm = stage.queue_membership_v1?.included_status_keys;
    if (Array.isArray(qm)) {
        for (const sk of qm) {
            const t = trimStatusKey(sk);
            if (t) keys.add(t);
        }
    }

    return [...keys];
}

function statusKeysForStageAttentionPrefilter(
    process: LifecycleBuilderProcessRecord,
    stage: LifecycleBuilderStageRecord,
): string[] {
    const keys = new Set<string>(statusKeysFromStageMetadata(stage));

    const operator = asOperatorStageKey(stage.key);
    if (operator) {
        for (const sk of ENROLLMENT_STAGE_STATUS_KEYS[operator]) {
            const t = trimStatusKey(sk);
            if (t) keys.add(t);
        }
        if (operator === "lead") {
            const leadKey = trimStatusKey(NEW_LEAD_STATUS_KEY);
            if (leadKey) keys.add(leadKey);
        }
    }

    return [...keys];
}

/**
 * Status keys whose records should be NA queue candidates when stage attention rules exist.
 * Returns empty when department has no configured stage attention rules.
 */
export function resolveStageAttentionCandidateStatusKeys(
    departmentMetadata: Record<string, unknown> | null | undefined,
): string[] {
    if (!departmentMetadata) return [];

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return [];

    const keys = new Set<string>();
    for (const stage of process.stages) {
        if (!stage.is_active) continue;
        if (!stageHasAttentionRules(process, stage)) continue;
        for (const sk of statusKeysForStageAttentionPrefilter(process, stage)) {
            keys.add(sk);
        }
    }

    return [...keys].sort((a, b) => a.localeCompare(b));
}

/** PostgREST-safe `or` branches — one eq per key (no `in.(...)` commas). */
export function buildStageAttentionStatusKeyOrBranches(statusKeys: readonly string[]): string[] {
    return [...new Set(statusKeys.map((k) => trimStatusKey(k)).filter((k): k is string => k != null))]
        .sort((a, b) => a.localeCompare(b))
        .map((k) => `status_key.eq.${k}`);
}

/**
 * Manual enrollment status transition policy — Business Process metadata.
 *
 * Default: operator-directed jump to configured stages with preflight + optional bypass.
 */

import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { mapBuilderStageToDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";

export const ENROLLMENT_MANUAL_TRANSITION_POLICY_METADATA_KEY = "manual_status_transition_policy_v1" as const;

export type EnrollmentManualTransitionPolicyMode =
    | "strict_transitions_only"
    | "operator_jump_with_preflight";

export type EnrollmentManualTransitionPolicyV1 = {
    version: 1;
    mode: EnrollmentManualTransitionPolicyMode;
    waitlist_as_parking_lot?: boolean;
    bypass_reason_required_for_skipped_stages?: boolean;
};

export const DEFAULT_ENROLLMENT_MANUAL_TRANSITION_POLICY: EnrollmentManualTransitionPolicyV1 = {
    version: 1,
    mode: "operator_jump_with_preflight",
    waitlist_as_parking_lot: true,
    bypass_reason_required_for_skipped_stages: true,
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function parseEnrollmentManualTransitionPolicy(
    raw: unknown,
): EnrollmentManualTransitionPolicyV1 {
    if (!isRecord(raw)) return { ...DEFAULT_ENROLLMENT_MANUAL_TRANSITION_POLICY };
    const mode =
        raw.mode === "strict_transitions_only" ? "strict_transitions_only" : "operator_jump_with_preflight";
    return {
        version: 1,
        mode,
        waitlist_as_parking_lot:
            raw.waitlist_as_parking_lot === false ? false : DEFAULT_ENROLLMENT_MANUAL_TRANSITION_POLICY.waitlist_as_parking_lot,
        bypass_reason_required_for_skipped_stages:
            raw.bypass_reason_required_for_skipped_stages === false
                ? false
                : DEFAULT_ENROLLMENT_MANUAL_TRANSITION_POLICY.bypass_reason_required_for_skipped_stages,
    };
}

export function readEnrollmentManualTransitionPolicy(
    process: LifecycleBuilderProcessRecord | null | undefined,
): EnrollmentManualTransitionPolicyV1 {
    if (!process?.manual_status_transition_policy_v1) {
        return { ...DEFAULT_ENROLLMENT_MANUAL_TRANSITION_POLICY };
    }
    return parseEnrollmentManualTransitionPolicy(process.manual_status_transition_policy_v1);
}

export function builderStageSortIndex(process: LifecycleBuilderProcessRecord, stageKey: string): number {
    const stages = process.stages
        .filter((s) => s.is_active !== false)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
    const idx = stages.findIndex((s) => s.key === stageKey);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

const SKIP_BYPASS_EXCLUDED_BUILDER_STAGE_KEYS = new Set(["closed"]);

/** Builder stages strictly between origin and destination (forward jumps only). */
export function skippedBuilderStagesBetween(
    process: LifecycleBuilderProcessRecord,
    fromBuilderStageKey: string | null,
    toBuilderStageKey: string | null,
): Array<{ key: string; label: string }> {
    if (!fromBuilderStageKey || !toBuilderStageKey || fromBuilderStageKey === toBuilderStageKey) return [];
    const fromIdx = builderStageSortIndex(process, fromBuilderStageKey);
    const toIdx = builderStageSortIndex(process, toBuilderStageKey);
    if (toIdx <= fromIdx) return [];

    const stages = process.stages
        .filter((s) => s.is_active !== false)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

    return stages
        .filter((s) => {
            if (SKIP_BYPASS_EXCLUDED_BUILDER_STAGE_KEYS.has(s.key)) return false;
            const idx = builderStageSortIndex(process, s.key);
            return idx > fromIdx && idx < toIdx;
        })
        .map((s) => ({ key: s.key, label: s.label.trim() || s.key }));
}

export function bypassReasonRequiredForSkippedStages(
    policy: EnrollmentManualTransitionPolicyV1,
    skippedStages: Array<{ key: string; label: string }>,
): boolean {
    if (!skippedStages.length) return false;
    if (policy.mode !== "operator_jump_with_preflight") return false;
    return policy.bypass_reason_required_for_skipped_stages !== false;
}

export function operatorJumpAllowsDestination(
    process: LifecycleBuilderProcessRecord,
    destinationKey: EnrollmentStatusDestinationKey,
): boolean {
    for (const stage of process.stages) {
        if (stage.is_active === false) continue;
        const mapped = mapBuilderStageToDestinationKey(stage.key);
        if (mapped === destinationKey) return true;
    }
    return false;
}

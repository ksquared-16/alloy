/**
 * Operator enrollment process stage on opportunity status_definitions.metadata.
 * Distinct from metadata.lifecycle_stage (universal CRM enum).
 */

import {
    mergeProcessStageMetadata,
    parseProcessStageKeyFromStatusMetadata,
    PROCESS_STAGE_UNASSIGNED,
} from "@/lib/businessProcesses/processStageMetadata";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStageBindings";

export const ENROLLMENT_OPERATOR_STAGE_METADATA_KEY = "enrollment_operator_stage" as const;

/** Explicitly exclude from all operator stages (overrides canonical default). */
export const ENROLLMENT_OPERATOR_STAGE_UNASSIGNED = "unassigned" as const;

const STAGE_SET = new Set<string>(LIFECYCLE_STAGE_ORDER);

const CANONICAL_KEY_TO_STAGE: Map<string, LifecycleOperatorStage> = (() => {
    const m = new Map<string, LifecycleOperatorStage>();
    for (const stage of LIFECYCLE_STAGE_ORDER) {
        for (const key of ENROLLMENT_STAGE_STATUS_KEYS[stage]) {
            if (!m.has(key)) m.set(key, stage);
        }
    }
    return m;
})();

export function isLifecycleOperatorStage(value: string): value is LifecycleOperatorStage {
    return STAGE_SET.has(value);
}

export function parseEnrollmentOperatorStageFromMetadata(
    metadata: Record<string, unknown> | null | undefined
): LifecycleOperatorStage | typeof ENROLLMENT_OPERATOR_STAGE_UNASSIGNED | string | null {
    const parsed = parseProcessStageKeyFromStatusMetadata(metadata);
    if (parsed == null) return null;
    if (parsed === PROCESS_STAGE_UNASSIGNED || parsed === ENROLLMENT_OPERATOR_STAGE_UNASSIGNED) {
        return ENROLLMENT_OPERATOR_STAGE_UNASSIGNED;
    }
    if (isLifecycleOperatorStage(parsed)) return parsed;
    return parsed;
}

export function canonicalOperatorStageForStatusKey(statusKey: string): LifecycleOperatorStage | null {
    return CANONICAL_KEY_TO_STAGE.get(statusKey.trim()) ?? null;
}

export type EnrollmentOperatorStageAssignmentSource = "metadata" | "canonical" | "unassigned";

/** Effective operator stage for Settings display (null = unassigned bucket). */
export function effectiveEnrollmentOperatorStage(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined
): { stage: LifecycleOperatorStage | null; source: EnrollmentOperatorStageAssignmentSource } {
    const parsed = parseEnrollmentOperatorStageFromMetadata(metadata);
    if (parsed === ENROLLMENT_OPERATOR_STAGE_UNASSIGNED) {
        return { stage: null, source: "unassigned" };
    }
    if (parsed && isLifecycleOperatorStage(parsed)) {
        return { stage: parsed, source: "metadata" };
    }
    const canonical = canonicalOperatorStageForStatusKey(statusKey);
    if (canonical) {
        return { stage: canonical, source: "canonical" };
    }
    return { stage: null, source: "unassigned" };
}

/** Resolve stage bucket using configured lifecycle stage keys (includes custom stages). */
export function effectiveStageKeyAssignment(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined,
    configuredStageKeys: readonly string[]
): { stage: string | null; source: EnrollmentOperatorStageAssignmentSource } {
    const resolved = resolveStatusProcessStageAssignment(statusKey, metadata, configuredStageKeys);
    if (resolved.source === "metadata") {
        return { stage: resolved.stage, source: "metadata" };
    }
    if (resolved.source === "legacy_canonical") {
        return { stage: resolved.stage, source: "canonical" };
    }
    return { stage: null, source: "unassigned" };
}

export function mergeEnrollmentOperatorStageMetadata(
    existing: Record<string, unknown> | null | undefined,
    stage: LifecycleOperatorStage | typeof ENROLLMENT_OPERATOR_STAGE_UNASSIGNED | string | null
): Record<string, unknown> {
    return mergeProcessStageMetadata(existing, stage);
}

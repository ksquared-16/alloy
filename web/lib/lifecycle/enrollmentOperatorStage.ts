/**
 * Operator enrollment process stage on opportunity status_definitions.metadata.
 * Distinct from metadata.lifecycle_stage (universal CRM enum).
 */

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
    if (metadata == null || typeof metadata !== "object") return null;
    const raw = metadata[ENROLLMENT_OPERATOR_STAGE_METADATA_KEY];
    if (raw == null) return null;
    const t = String(raw).trim();
    if (t === ENROLLMENT_OPERATOR_STAGE_UNASSIGNED) return ENROLLMENT_OPERATOR_STAGE_UNASSIGNED;
    if (isLifecycleOperatorStage(t)) return t;
    if (t) return t;
    return null;
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
    const parsed = parseEnrollmentOperatorStageFromMetadata(metadata);
    if (parsed === ENROLLMENT_OPERATOR_STAGE_UNASSIGNED) {
        return { stage: null, source: "unassigned" };
    }
    if (typeof parsed === "string" && configuredStageKeys.includes(parsed)) {
        return { stage: parsed, source: "metadata" };
    }
    const canonical = canonicalOperatorStageForStatusKey(statusKey);
    if (canonical && configuredStageKeys.includes(canonical)) {
        return { stage: canonical, source: "canonical" };
    }
    return { stage: null, source: "unassigned" };
}

export function mergeEnrollmentOperatorStageMetadata(
    existing: Record<string, unknown> | null | undefined,
    stage: LifecycleOperatorStage | typeof ENROLLMENT_OPERATOR_STAGE_UNASSIGNED | string | null
): Record<string, unknown> {
    const base =
        existing !== null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...existing }
            : {};
    if (stage == null) {
        delete base[ENROLLMENT_OPERATOR_STAGE_METADATA_KEY];
        return base;
    }
    base[ENROLLMENT_OPERATOR_STAGE_METADATA_KEY] = stage;
    return base;
}

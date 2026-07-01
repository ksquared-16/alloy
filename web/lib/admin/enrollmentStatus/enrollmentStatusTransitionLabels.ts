/**
 * Operator-facing enrollment status / stage labels for Change Enrollment Status modal.
 * Uses Business Process stage labels and queue lane names — not raw status_key tokens.
 */

import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    LIFECYCLE_STAGE_LABELS,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    activeLifecycleProcess,
    asOperatorStageKey,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { defaultWorkUnitQueueNameForOperatorStage } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { resolveBuilderStageKeyForStatus } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

export type EnrollmentOperatorStageDisplay = {
    /** Primary operator label (BP stage / queue lane). */
    label: string;
    operatorStageKey: LifecycleOperatorStage | null;
    builderStageKey: string | null;
    /** Raw status_key — debug only. */
    rawStatusKey: string | null;
};

function labelForOperatorStage(stage: LifecycleOperatorStage): string {
    if (stage === "lead") return defaultWorkUnitQueueNameForOperatorStage("lead");
    return LIFECYCLE_STAGE_LABELS[stage] ?? defaultWorkUnitQueueNameForOperatorStage(stage);
}

function labelForBuilderStageKey(
    departmentMetadata: Record<string, unknown> | null | undefined,
    builderStageKey: string | null,
): string | null {
    if (!builderStageKey) return null;
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(departmentMetadata ?? {}));
    const stage = process ? findStage(process, builderStageKey) : null;
    const configured = stage?.label?.trim();
    if (configured) return configured;
    const operator = canonicalOperatorStageForStatusKey(builderStageKey);
    if (operator) return labelForOperatorStage(operator);
    return builderStageKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve operator-facing current stage label from status + BP config. */
export function resolveEnrollmentOperatorStageDisplay(input: {
    statusKey: string | null;
    departmentMetadata?: Record<string, unknown> | null;
    builderStageKey?: string | null;
}): EnrollmentOperatorStageDisplay {
    const rawStatusKey = input.statusKey?.trim() || null;
    const builderStageKey =
        input.builderStageKey?.trim() ||
        (rawStatusKey
            ? resolveBuilderStageKeyForStatus({
                  departmentMetadata: input.departmentMetadata,
                  statusKey: rawStatusKey,
                  explicitBuilderStageKey: input.builderStageKey,
              })
            : null);
    const operatorStageKey =
        (rawStatusKey ? canonicalOperatorStageForStatusKey(rawStatusKey) : null) ??
        (builderStageKey ? asOperatorStageKey(builderStageKey) : null);

    const configuredBuilderLabel = labelForBuilderStageKey(input.departmentMetadata, builderStageKey);
    if (configuredBuilderLabel) {
        return { label: configuredBuilderLabel, operatorStageKey, builderStageKey, rawStatusKey };
    }
    if (operatorStageKey) {
        return {
            label: labelForOperatorStage(operatorStageKey),
            operatorStageKey,
            builderStageKey,
            rawStatusKey,
        };
    }
    return {
        label: rawStatusKey ? rawStatusKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—",
        operatorStageKey: null,
        builderStageKey,
        rawStatusKey,
    };
}

export function enrollmentDestinationDisplayLabel(
    destinationKey: EnrollmentStatusDestinationKey,
    departmentMetadata?: Record<string, unknown> | null,
    builderStageKey?: string | null,
): string {
    if (destinationKey === "closed_withdrawn") {
        const fromBp = labelForBuilderStageKey(departmentMetadata, builderStageKey ?? "closed_withdrawn");
        return fromBp ?? "Lost / Withdrawn";
    }
    const fromBp = labelForBuilderStageKey(departmentMetadata, builderStageKey ?? destinationKey);
    if (fromBp) return fromBp;
    const operator = destinationKey as LifecycleOperatorStage;
    return labelForOperatorStage(operator) ?? LIFECYCLE_STAGE_LABELS[operator] ?? destinationKey;
}

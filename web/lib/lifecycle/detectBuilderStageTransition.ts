/**
 * Detect builder stage bucket change from opportunity status keys.
 * Uses configured lifecycle builder stage keys — not canonical operator enums.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    stageKeysForProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { effectiveStageKeyAssignment } from "@/lib/lifecycle/enrollmentOperatorStage";

export type BuilderStageTransition = {
    previousBuilderStageKey: string | null;
    nextBuilderStageKey: string | null;
    stageChanged: boolean;
};

function trimStatusKey(raw: string | null | undefined): string | null {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    return t || null;
}

/** Map legacy canonical operator stage keys onto configured builder slugs when needed. */
function normalizeBuilderStageKey(
    stage: string | null,
    configuredStageKeys: readonly string[],
): string | null {
    if (!stage) return null;
    if (configuredStageKeys.includes(stage)) return stage;
    if (stage === "enrollment" && configuredStageKeys.includes("enrolling")) return "enrolling";
    return null;
}

function resolveBuilderStageForStatus(
    statusKey: string | null,
    statusMetadata: Record<string, unknown> | null | undefined,
    configuredStageKeys: readonly string[],
): string | null {
    if (!statusKey) return null;
    const { stage } = effectiveStageKeyAssignment(statusKey, statusMetadata ?? null, configuredStageKeys);
    return normalizeBuilderStageKey(stage, configuredStageKeys);
}

export type DetectBuilderStageTransitionParams = {
    previousStatusKey: string | null;
    nextStatusKey: string | null;
    departmentMetadata: Record<string, unknown> | null | undefined;
    /** Optional status_definitions.metadata for more accurate rollup assignment. */
    previousStatusMetadata?: Record<string, unknown> | null;
    nextStatusMetadata?: Record<string, unknown> | null;
};

export function detectBuilderStageTransition(
    params: DetectBuilderStageTransitionParams,
): BuilderStageTransition {
    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const configuredStageKeys = process ? stageKeysForProcess(process) : [];

    const previousBuilderStageKey = resolveBuilderStageForStatus(
        trimStatusKey(params.previousStatusKey),
        params.previousStatusMetadata,
        configuredStageKeys,
    );
    const nextBuilderStageKey = resolveBuilderStageForStatus(
        trimStatusKey(params.nextStatusKey),
        params.nextStatusMetadata,
        configuredStageKeys,
    );

    const stageChanged =
        nextBuilderStageKey != null &&
        nextBuilderStageKey !== previousBuilderStageKey;

    return {
        previousBuilderStageKey,
        nextBuilderStageKey,
        stageChanged,
    };
}

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
    const assigned = normalizeBuilderStageKey(stage, configuredStageKeys);
    if (assigned) return assigned;
    /*
     * A STATUS KEY THAT IS ITSELF A CONFIGURED STAGE KEY NAMES ITS OWN STAGE.
     *
     * Assignment reads a `process_stage` off the STATUS DEFINITION, then falls back to two legacy
     * canonical maps. A tenant that drives transitions with the stage keys directly satisfies none
     * of the three: measured on staging, `next_status_key: "decision"` resolved to null while
     * `decision` was a published stage of the active process, and the org had no status_definitions
     * rows at all. Requirements are authored per stage, so an unresolved stage means every
     * stage-exit requirement silently evaluates against nothing.
     *
     * Last, not first: an explicit assignment still wins, so a tenant that deliberately points a
     * same-named status at a different stage is unaffected.
     */
    return configuredStageKeys.includes(statusKey) ? statusKey : null;
}

export type DetectBuilderStageTransitionParams = {
    previousStatusKey: string | null;
    nextStatusKey: string | null;
    departmentMetadata: Record<string, unknown> | null | undefined;
    /** Optional status_definitions.metadata for more accurate rollup assignment. */
    previousStatusMetadata?: Record<string, unknown> | null;
    nextStatusMetadata?: Record<string, unknown> | null;
    /**
     * The stage the record is ACTUALLY in, when the caller already knows it.
     *
     * Status keys are a rollup vocabulary and are not required to name a stage — a case can sit at
     * the `tour` stage while its `status_key` is `open`. Inferring the departure stage from that
     * status is then guesswork that fails closed to null, and a null departure stage means the
     * stage's own exit requirements are never loaded. A caller holding the durable stage should say
     * so rather than let it be re-derived from a weaker signal.
     */
    currentBuilderStageKey?: string | null;
};

export function detectBuilderStageTransition(
    params: DetectBuilderStageTransitionParams,
): BuilderStageTransition {
    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const configuredStageKeys = process ? stageKeysForProcess(process) : [];

    const previousBuilderStageKey =
        normalizeBuilderStageKey(trimStatusKey(params.currentBuilderStageKey), configuredStageKeys)
        ?? resolveBuilderStageForStatus(
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

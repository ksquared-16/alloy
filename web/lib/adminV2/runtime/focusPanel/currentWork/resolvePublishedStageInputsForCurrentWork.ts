/**
 * Resolve published process/stage configuration used by /processes (lifecycle builder)
 * into inputs for the Current Work template adapter.
 *
 * Source of truth: the GOVERNING business-process payload's stage records —
 * stage_operating_plan_v1, action_catalog_v1, and builder field rules.
 *
 * ## D-96 — which payload governs
 *
 * By default that payload is `departments.metadata.lifecycle_builder_v1`, the live projection.
 * When the caller supplies `governingBuilderPayload` — the payload of the revision the running
 * instance is pinned to — that payload governs INSTEAD, for every section this resolver returns:
 * operating plan, action catalog, stage list, tracks, operator guidance and field rules.
 *
 * This is Class A: transaction-governing configuration for one running journey. It must not drift
 * when someone publishes. Class-B surfaces — builder authoring, form coverage, latest-config
 * discovery — deliberately do NOT pass a governing payload and keep showing current configuration.
 *
 * The substitution is total rather than per-section on purpose. Pinning the requirements while the
 * stage list or action catalog still came from live metadata would be split-brain: one journey
 * governed by two configurations that no publish keeps in step.
 */

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    activeLifecycleProcess,
    asOperatorStageKey,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { canonicalStageFieldRules } from "@/lib/lifecycle/effectiveStageRequirements";
import { effectiveFieldRulesForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    projectProcessRuntimeCommands,
    type ProcessRuntimeCommandProjection,
} from "@/lib/lifecycle/processRuntimeCommandProjection";

export type PublishedStageInputsForCurrentWork = {
    operatingPlan: StageOperatingPlanV1;
    actionCatalog: StageActionCatalogV1 | null;
    fieldRules: LifecycleStageFieldRules | null;
    processKey: string | null;
    stageKey: string;
    departmentMetadata: Record<string, unknown>;
    processStages: Array<{ key: string; label: string }>;
    processTracks?: ProcessTracksV1 | null;
    operatorGuidance?: string | null;
    /** Active lifecycle process record — enables P6.S2 command authority projection. */
    process?: LifecycleBuilderProcessRecord | null;
    /** Precomputed runtime Command projection (process selection + stage recommendation). */
    commandProjection?: ProcessRuntimeCommandProjection | null;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

/**
 * Read published stage configuration from department metadata — same resolution path
 * as lifecycle stage bootstrap and stage work runtime projection.
 */
export function resolvePublishedStageInputsForCurrentWork(params: {
    departmentMetadata: Record<string, unknown> | null | undefined;
    builderStageKey: string | null | undefined;
    /**
     * D-96. The pinned revision's payload. When present it REPLACES `lifecycle_builder_v1` for this
     * resolution; the surrounding department metadata is still carried so the legacy compatibility
     * keys remain reachable for a pre-D-97 revision, which genuinely is not self-contained. For a
     * revision published under D-97 every stage states its own `requirements_v1`, so the canonical
     * branch answers first and those legacy keys are never consulted.
     */
    governingBuilderPayload?: Record<string, unknown> | null;
}): PublishedStageInputsForCurrentWork | null {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const liveMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? params.departmentMetadata
            : {};

    const departmentMetadata = params.governingBuilderPayload
        ? { ...liveMetadata, [LIFECYCLE_BUILDER_METADATA_KEY]: params.governingBuilderPayload }
        : liveMetadata;

    const { plan, processKey, stageRecord } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: stageKey,
    });
    if (!plan) return null;

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stage = stageRecord ?? (process ? findStage(process, stageKey) : null);
    const actionCatalog = stage?.action_catalog_v1 ?? null;

    const operatorStage = asOperatorStageKey(stageKey);
    // D-96 + D-97. When a governing revision is in force, its own `requirements_v1` answers first.
    // Anything else would defeat the pin: `effectiveFieldRulesForBuilderStage` prefers the LIVE
    // `lifecycle_progression_requirements_v1` override, so a pinned journey would keep picking up
    // legacy edits made after it started. Null (canonical silent, i.e. a revision published before
    // D-97 normalization) falls through to the unchanged legacy behaviour, which is the honest
    // answer for an artifact that genuinely is not self-contained.
    const canonicalRules = params.governingBuilderPayload
        ? canonicalStageFieldRules(builder, stageKey, processKey ?? undefined)
        : null;
    const fieldRules = canonicalRules
        ? { rules: canonicalRules }
        : effectiveFieldRulesForBuilderStage(stageKey, departmentMetadata, operatorStage);

    const processStages =
        process?.stages
            ?.filter((s) => s.is_active !== false)
            .map((s) => ({ key: s.key, label: s.label.trim() || s.key })) ?? [];

    const commandProjection = process
        ? projectProcessRuntimeCommands({
              process,
              stageKey,
              stageActionCatalog: actionCatalog,
          })
        : null;

    return {
        operatingPlan: plan,
        actionCatalog,
        fieldRules: fieldRules.rules,
        processKey: processKey ?? process?.key ?? null,
        stageKey,
        departmentMetadata,
        processStages,
        processTracks: process?.tracks_v1 ?? null,
        operatorGuidance: stage?.operator_guidance?.trim() || null,
        process: process ?? null,
        commandProjection,
    };
}

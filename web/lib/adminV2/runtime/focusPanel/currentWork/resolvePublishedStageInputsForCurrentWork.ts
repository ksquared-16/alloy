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
    overlayLiveCommandPlacementOntoPinnedRevision,
    type CommandPlacementSource,
} from "@/lib/lifecycle/liveCommandPlacement";
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
    /** Null when the client already holds the live department configuration (S6-1). */
    departmentMetadata: Record<string, unknown> | null;
    /**
     * Present ONLY when `departmentMetadata` was omitted: the department whose live configuration the
     * client said it holds. It is what makes the omission scope-exact — the composition resolves the
     * retained copy for THIS department or falls back, and can never be fooled into using another
     * department's configuration.
     */
    departmentMetadataRef?: { departmentId: string } | null;
    processStages: Array<{ key: string; label: string }>;
    processTracks?: ProcessTracksV1 | null;
    operatorGuidance?: string | null;
    /*
     * NOT CARRIED TO THE CLIENT. The active lifecycle process record is ~26 KB and was serialized on
     * every subject-scoped answer — measured as part of the ~74.7 KB stage-work block that ships in
     * BOTH the provisioning answer and the drawer VM for the same selection.
     *
     * It was never read. Its stated purpose was to "enable the P6.S2 command authority projection",
     * and that projection is computed HERE, from this record, and already travels as
     * `commandProjection`. The record is also derivable from `departmentMetadata`, which this same
     * payload still carries, so nothing downstream lost a source.
     *
     * Kept as an internal local in this resolver (it still finds the stage and builds the
     * projection); simply no longer emitted. Removing it from the type is deliberate: it makes a
     * future consumer that wants it a compile error rather than a silent 26 KB per selection.
     */
    /** Precomputed runtime Command projection (process selection + stage recommendation). */
    commandProjection?: ProcessRuntimeCommandProjection | null;
    /**
     * Provenance for the D-96 split. Engineer-facing, never rendered: a pinned instance now reports
     * `workSemanticsSource: "pinned_revision"` with `source: "live_published"`, and that combination
     * is correct rather than contradictory.
     */
    commandConfiguration?: {
        workSemanticsSource: "pinned_revision" | "live_published";
        source: CommandPlacementSource;
        refsByTemplateKey: Record<string, string[]>;
    };
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
    /**
     * S6-1 — the client asserted it already holds this department's published configuration.
     *
     * It is only an INPUT to the decision. The copy may be dropped from the answer solely when this
     * subject's department metadata IS the live department record — i.e. when no pinned revision is
     * governing. With a pin (D-96) the value carried here is the live metadata with
     * `lifecycle_builder_v1` REPLACED by the pinned payload, so substituting the client's live copy
     * would silently defeat the pin. That case keeps embedding, whatever the client claims.
     */
    clientHoldsLiveDepartmentConfig?: boolean;
    /** The department this resolution belongs to — carried back when the copy is omitted. */
    departmentId?: string | null;
}): PublishedStageInputsForCurrentWork | null {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const liveMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? params.departmentMetadata
            : {};

    /*
     * D-96 SPLIT. The pinned revision still governs what the work MEANS — identity, grain,
     * completion, outcomes, requirements. Command placement is not that: it answers "what can the
     * operator do now?", and it was pinned only because `helpful_actions` sits inside the
     * work-template payload. Overlaying current published command refs onto the pinned payload is
     * what makes a `/process` command edit reach records already in the stage, while everything the
     * pin exists to protect keeps coming from the revision.
     */
    const placement = params.governingBuilderPayload
        ? overlayLiveCommandPlacementOntoPinnedRevision({
              pinnedBuilderPayload: params.governingBuilderPayload,
              liveDepartmentMetadata: liveMetadata,
              stageKey,
          })
        : null;

    const departmentMetadata = placement
        ? { ...liveMetadata, [LIFECYCLE_BUILDER_METADATA_KEY]: placement.payload }
        : liveMetadata;

    const omitDepartmentMetadata = params.clientHoldsLiveDepartmentConfig === true && !placement;

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
        // Omitted only when the client holds it AND it is genuinely the live record (no pin).
        departmentMetadata: omitDepartmentMetadata ? null : departmentMetadata,
        departmentMetadataRef:
            omitDepartmentMetadata && params.departmentId ? { departmentId: params.departmentId } : null,
        processStages,
        processTracks: process?.tracks_v1 ?? null,
        operatorGuidance: stage?.operator_guidance?.trim() || null,
        commandProjection,
        commandConfiguration: {
            // After the D-96 split these two legitimately disagree, and saying so is the point:
            // work semantics may be pinned while command placement is live.
            workSemanticsSource: params.governingBuilderPayload ? "pinned_revision" : "live_published",
            source: placement ? placement.placement.source : "live_published",
            refsByTemplateKey: placement ? placement.placement.refsByTemplateKey : {},
        },
    };
}

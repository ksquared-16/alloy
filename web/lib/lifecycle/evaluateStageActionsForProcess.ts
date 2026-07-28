/**
 * Process-aware stage action evaluation (P6.S2).
 *
 * Stage catalogs remain recommendation/evaluation only.
 * Unselected stage references are diagnosed — not promoted to selected/runnable.
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import {
    projectProcessRuntimeCommands,
    type ProcessRuntimeCommandProjection,
} from "@/lib/lifecycle/processRuntimeCommandProjection";
import {
    evaluateActionForStage,
    evaluateStageActions,
    type EligibilityHint,
    type EvaluatedAction,
} from "@/lib/platform/actions/stageActionEvaluator";
import type { PlatformActionGrain } from "@/lib/platform/actions/platformActionCatalog";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

export type ProcessAwareStageEvaluationResult = {
    evaluated: EvaluatedAction[];
    orphans: EvaluatedAction[];
    projection: ProcessRuntimeCommandProjection;
    diagnostics: readonly { code: string; message: string }[];
};

function isSelected(
    projection: ProcessRuntimeCommandProjection,
    key: string
): boolean {
    const trimmed = key.trim();
    const selectedEnabled = new Set(projection.selectedEnabledKeys);
    return (
        selectedEnabled.has(trimmed) ||
        selectedEnabled.has(normalizeActionRefToIntentKey(trimmed))
    );
}

/**
 * Evaluate resolved action keys against process Command selection + stage catalog.
 */
export function evaluateStageActionsForProcess(input: {
    process: LifecycleBuilderProcessRecord;
    stageKey?: string | null;
    stageCatalog?: StageActionCatalogV1 | null;
    resolvedActionKeys: string[];
    subjectGrain?: PlatformActionGrain | null;
    eligibilityMap?: Map<string, EligibilityHint>;
}): ProcessAwareStageEvaluationResult {
    const projection = projectProcessRuntimeCommands({
        process: input.process,
        stageKey: input.stageKey,
        stageActionCatalog: input.stageCatalog,
    });

    const selectedKeys = input.resolvedActionKeys.filter((key) => isSelected(projection, key));
    const orphanKeys = input.resolvedActionKeys.filter((key) => !isSelected(projection, key));

    const evaluated = evaluateStageActions({
        resolvedActionKeys: selectedKeys,
        stageCatalog: input.stageCatalog,
        subjectGrain: input.subjectGrain,
        eligibilityMap: input.eligibilityMap,
    }).map((row) => {
        const cmd = projection.commands.find(
            (c) =>
                c.canonicalCapabilityKey === row.key ||
                c.capabilityKey === row.key ||
                normalizeActionRefToIntentKey(c.canonicalCapabilityKey) ===
                    normalizeActionRefToIntentKey(row.key)
        );
        if (cmd && !cmd.runnable) {
            return {
                ...row,
                state: "unavailable" as const,
                reason: cmd.blockedReasons[0] ?? "Command is not runnable for this process.",
            };
        }
        return row;
    });

    const orphans: EvaluatedAction[] = orphanKeys.map((key) =>
        evaluateActionForStage({
            actionKey: key,
            stageCatalog: input.stageCatalog,
            subjectGrain: input.subjectGrain,
            eligibility: input.eligibilityMap?.get(key) ?? null,
        })
    ).map((row) => ({
        ...row,
        state: "unavailable" as const,
        reason: "Stage reference is not process-selected (command_set_v1 / legacy selection).",
    }));

    const diagnostics = [
        ...projection.diagnostics,
        ...orphanKeys.map((key) => ({
            code: "stage_evaluation_unselected",
            message: `process=${projection.processKey} stage=${projection.stageKey ?? "?"} capability=${key}`,
        })),
    ];

    return { evaluated, orphans, projection, diagnostics };
}

/**
 * Pure option resolver for Work Template action configuration in /processes editor.
 *
 * Delegates to canonical intent-level options — generic umbrellas and grain duplicates
 * are merged or hidden before reaching the editor.
 */

import {
    formatCanonicalActionOptionDescription,
    resolveCanonicalWorkTemplateActionOptions,
    resolveCanonicalWorkTemplateAlternatePathOptions,
    type CanonicalWorkTemplateActionOption,
} from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type WorkTemplateActionOption = {
    ref: string;
    label: string;
    description?: string;
    icon?: string;
    category: string;
    executionSurface?: string;
    supported: boolean;
    disabledReason?: string;
};

export type WorkTemplateTransitionOption = {
    ref: string;
    label: string;
    description?: string;
    targetStageKey?: string;
    supported: boolean;
    disabledReason?: string;
};

export type WorkTemplateOutcomeOption = {
    ref: string;
    label: string;
    successful?: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function toWorkTemplateActionOption(row: CanonicalWorkTemplateActionOption): WorkTemplateActionOption {
    return {
        ref: row.ref,
        label: row.label,
        description: formatCanonicalActionOptionDescription(row),
        category: row.category,
        executionSurface: row.executionSurface,
        supported: row.supported,
        ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
    };
}

function buildTransitionOptions(input: {
    stageKey: string;
    stageLabel?: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
}): WorkTemplateTransitionOption[] {
    const fromLabel = input.stageLabel?.trim() || input.stageKey.replace(/_/g, " ");
    return resolveOutgoingProcessTransitions({
        currentStageKey: input.stageKey,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages: input.processStages ?? [],
    }).map((row) => ({
        ref: row.transition_ref,
        label: row.label,
        description: `Transition · ${fromLabel} → ${row.target_stage_label}`,
        targetStageKey: row.target_stage_key,
        supported: true,
    }));
}

export function resolveWorkTemplateActionOptions(input: {
    actionRegistry: unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
    /** @deprecated Legacy callers pass all stages as transitions — used for label lookup only. */
    processTransitions?: unknown;
    stageKey: string;
    stageLabel?: string;
    stageOutcomes?: Array<{ outcome_key: string; label: string; work_template_key?: string | null; successful?: boolean }>;
    workTemplateKey?: string | null;
    processDefinition?: unknown;
    stageDefinition?: unknown;
}): {
    primaryActionOptions: WorkTemplateActionOption[];
    helpfulActionOptions: WorkTemplateActionOption[];
    alternatePathOptions: WorkTemplateActionOption[];
    transitionOptions: WorkTemplateTransitionOption[];
    outcomeOptions: WorkTemplateOutcomeOption[];
} {
    const processStages =
        input.processStages
        ?? (Array.isArray(input.processTransitions)
            ? (input.processTransitions as Array<{ key: string; label: string }>)
            : []);

    const canonicalInput = {
        processDefinition: input.processDefinition,
        stageDefinition: input.stageDefinition,
        actionRegistry: input.actionRegistry,
        stageActionCatalog: input.stageActionCatalog ?? null,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages,
        stageKey: input.stageKey,
        stageLabel: input.stageLabel,
    };

    const primaryActionOptions = resolveCanonicalWorkTemplateActionOptions(canonicalInput).map(toWorkTemplateActionOption);

    const helpfulActionOptions = resolveCanonicalWorkTemplateActionOptions(canonicalInput).map(toWorkTemplateActionOption);

    const transitionOptions = buildTransitionOptions({
        stageKey: input.stageKey,
        stageLabel: input.stageLabel,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages,
    });

    const alternatePathOptions = resolveCanonicalWorkTemplateAlternatePathOptions(canonicalInput).map(
        toWorkTemplateActionOption,
    );

    const workTemplateKey = input.workTemplateKey?.trim() ?? null;
    const outcomeOptions: WorkTemplateOutcomeOption[] = (input.stageOutcomes ?? [])
        .filter((row) => {
            const tplKey = row.work_template_key?.trim();
            if (!workTemplateKey) return true;
            if (!tplKey) return true;
            return tplKey === workTemplateKey;
        })
        .map((row) => ({
            ref: row.outcome_key,
            label: row.label,
            ...(row.successful === true ? { successful: true } : {}),
        }));

    return {
        primaryActionOptions,
        helpfulActionOptions,
        alternatePathOptions,
        transitionOptions,
        outcomeOptions,
    };
}

/** Resolve transition ref to operator label from configured outgoing transitions. */
export function transitionRefLabel(
    transitionRef: string,
    context?: {
        currentStageKey?: string;
        stageOperatingPlan?: StageOperatingPlanV1 | null;
        processTracks?: unknown;
        processStages?: ReadonlyArray<{ key: string; label: string }>;
    } | unknown,
): string {
    const ref = transitionRef.trim();
    if (!ref) return ref;

    const resolvedContext =
        context != null && typeof context === "object" && !Array.isArray(context)
        && ("currentStageKey" in context || "stageOperatingPlan" in context || "processStages" in context)
            ? (context as {
                  currentStageKey?: string;
                  stageOperatingPlan?: StageOperatingPlanV1 | null;
                  processTracks?: unknown;
                  processStages?: ReadonlyArray<{ key: string; label: string }>;
              })
            : {
                  currentStageKey: "",
                  processStages: Array.isArray(context)
                      ? (context as Array<{ key: string; label: string }>)
                      : [],
              };

    const options = buildTransitionOptions({
        stageKey: resolvedContext.currentStageKey ?? "",
        stageOperatingPlan: resolvedContext.stageOperatingPlan ?? null,
        processTracks: resolvedContext.processTracks ?? null,
        processStages: resolvedContext.processStages ?? [],
    });

    const match = options.find((row) => row.ref === ref);
    if (match?.label) return match.label;

    if (ref.startsWith("move_to_stage:")) {
        const targetKey = ref.slice("move_to_stage:".length).split(":")[0] ?? "";
        const stageLabel = (resolvedContext.processStages ?? []).find((row) => row.key === targetKey)?.label;
        const label = stageLabel?.trim() || targetKey.replace(/_/g, " ");
        return `Move to ${label}`;
    }

    return ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

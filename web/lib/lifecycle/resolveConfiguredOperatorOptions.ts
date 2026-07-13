/**
 * Unified contextual operator option resolver.
 *
 * Every option derives from Work Template refs, registered actions valid for context,
 * configured outgoing transitions, outcome definitions, or stage action catalog.
 * Tenant capability filtering: no parallel capability registry exists on action rows.
 * Availability is owned by stage action catalog, scoped configured actions, Work Template
 * refs, and configured transitions. Registered !== available by design.
 */

import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    formatCanonicalActionOptionDescription,
    resolveCanonicalWorkTemplateActionOptions,
    type CanonicalWorkTemplateActionOption,
} from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import {
    resolveOutgoingProcessTransitions,
    type OutgoingProcessTransition,
} from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type ConfiguredOperatorOptionSource =
    | "work_template"
    | "process_transition"
    | "action_registry"
    | "stage_catalog"
    | "legacy_fallback";

export type ConfiguredOperatorOptionKind =
    | "action"
    | "transition"
    | "work_template"
    | "outcome";

export type ConfiguredOperatorOption = {
    ref: string;
    kind: ConfiguredOperatorOptionKind;
    label: string;
    description?: string;
    icon?: string;
    source: ConfiguredOperatorOptionSource;
    supported: boolean;
    disabledReason?: string;
    entityScope?: string;
    processRef?: string;
    stageRef?: string;
    targetStageKey?: string;
    targetStageLabel?: string;
};

function configuredActionsForStage(
    rows: LifecycleConfiguredActionRow[],
    stageKey: string,
): LifecycleConfiguredActionRow[] {
    const current = stageKey.trim();
    if (!current) return [];

    return rows.filter((row) => {
        if (row.action_scope === "lifecycle") return true;
        if (!row.operator_stages.length) return false;
        return row.operator_stages.some((stage) => stage === current);
    });
}

function toActionOption(
    row: CanonicalWorkTemplateActionOption,
    source: ConfiguredOperatorOptionSource,
    stageRef?: string,
): ConfiguredOperatorOption {
    return {
        ref: row.ref,
        kind: "action",
        label: row.label,
        description: formatCanonicalActionOptionDescription(row),
        source,
        supported: row.supported,
        ...(row.disabledReason ? { disabledReason: row.disabledReason } : {}),
        ...(stageRef ? { stageRef } : {}),
    };
}

function toTransitionOption(
    row: OutgoingProcessTransition,
    currentStageKey: string,
    currentStageLabel?: string,
): ConfiguredOperatorOption {
    const fromLabel = currentStageLabel?.trim() || currentStageKey.replace(/_/g, " ");
    return {
        ref: row.transition_ref,
        kind: "transition",
        label: row.label,
        description: `Transition · ${fromLabel} → ${row.target_stage_label}`,
        source: row.source === "legacy_fallback" ? "legacy_fallback" : "process_transition",
        supported: true,
        targetStageKey: row.target_stage_key,
        targetStageLabel: row.target_stage_label,
        stageRef: currentStageKey,
    };
}

export function resolveConfiguredOperatorOptions(input: {
    tenantConfig?: unknown;
    process?: { key?: string; tracks_v1?: unknown } | null;
    stage?: { key?: string; label?: string; operating_plan?: StageOperatingPlanV1 | null } | null;
    workTemplate?: unknown;
    actionRegistry: LifecycleConfiguredActionRow[] | unknown;
    stageActionCatalog?: StageActionCatalogV1 | null;
    entityContext?: unknown;
    /** Editor mode surfaces invalid configured refs as disabled options. */
    includeInvalidConfiguredRefs?: boolean;
    /** Configured refs to validate/repair in editor. */
    configuredRefs?: string[];
}): ConfiguredOperatorOption[] {
    const stageKey = typeof input.stage?.key === "string" ? input.stage.key.trim() : "";
    const stageLabel = typeof input.stage?.label === "string" ? input.stage.label.trim() : undefined;
    const stageOperatingPlan = input.stage?.operating_plan ?? null;
    const processStages = Array.isArray(input.tenantConfig)
        ? (input.tenantConfig as Array<{ key: string; label: string }>)
        : [];

    const configuredRows = Array.isArray(input.actionRegistry)
        ? (input.actionRegistry as LifecycleConfiguredActionRow[])
        : [];
    const stageScopedActions = configuredActionsForStage(configuredRows, stageKey);

    const canonicalActions = resolveCanonicalWorkTemplateActionOptions({
        processDefinition: input.process,
        stageDefinition: input.stage,
        actionRegistry: stageScopedActions,
        stageActionCatalog: input.stageActionCatalog ?? null,
        stageKey,
    });

    const actionOptions = canonicalActions.map((row) => {
        const inCatalog = input.stageActionCatalog?.candidate_actions.some(
            (candidate) => candidate.action_key === row.ref || candidate.action_key === row.intentKey,
        );
        return toActionOption(row, inCatalog ? "stage_catalog" : "action_registry", stageKey);
    });

    const transitions = resolveOutgoingProcessTransitions({
        currentStageKey: stageKey,
        stageOperatingPlan,
        processTracks: input.process?.tracks_v1 ?? null,
        processStages,
    });
    const transitionOptions = transitions.map((row) => toTransitionOption(row, stageKey, stageLabel));

    const options: ConfiguredOperatorOption[] = [...actionOptions, ...transitionOptions];

    if (input.includeInvalidConfiguredRefs && input.configuredRefs?.length) {
        const knownRefs = new Set(options.map((row) => row.ref));
        for (const ref of input.configuredRefs) {
            const trimmed = ref.trim();
            if (!trimmed || knownRefs.has(trimmed)) continue;
            options.push({
                ref: trimmed,
                kind: trimmed.startsWith("move_to_stage:") || trimmed.startsWith("outcome_transition:")
                    || trimmed.startsWith("split_rule:")
                    ? "transition"
                    : "action",
                label: trimmed.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                source: "legacy_fallback",
                supported: false,
                disabledReason: "No matching configured option exists for this context",
                stageRef: stageKey,
            });
        }
    }

    return options;
}

export function transitionOptionsFromConfiguredResolver(
    input: Parameters<typeof resolveConfiguredOperatorOptions>[0],
): OutgoingProcessTransition[] {
    const stageKey = typeof input.stage?.key === "string" ? input.stage.key.trim() : "";
    const processStages = Array.isArray(input.tenantConfig)
        ? (input.tenantConfig as Array<{ key: string; label: string }>)
        : [];

    return resolveOutgoingProcessTransitions({
        currentStageKey: stageKey,
        stageOperatingPlan: input.stage?.operating_plan ?? null,
        processTracks: input.process?.tracks_v1 ?? null,
        processStages,
    });
}

import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { completionOutcomesForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

import {
    actionsFromConfigRefs,
    classifyRecordHeaderActionsForCurrentWork,
} from "./classifyCurrentWorkActions";
import { inferWorkItemOwner } from "./inferWorkItemOwner";
import { CURRENT_WORK_RECORD_OUTCOME_CTA } from "./currentWorkCopy";
import {
    actionFromRef,
    type CurrentWorkActionRefLookup,
    type CurrentWorkTemplateConfigOverlay,
} from "./currentWorkTemplateConfig";
import type {
    CurrentWorkChecklistItemVM,
    CurrentWorkLastActivity,
    CurrentWorkSurfaceProgress,
    CurrentWorkSurfaceStatus,
    CurrentWorkSurfaceVM,
    CurrentWorkActionVM,
} from "./currentWorkSurfaceTypes";
import { resolveCurrentWorkChecklistTruthFromPublishedRules, type ChecklistTruthResult } from "./resolveCurrentWorkChecklistTruthFromPublishedRules";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "./resolveCurrentWorkTemplateFromPublishedPlan";
import { resolveStageWorkOutcomeCompletionState } from "./resolveStageWorkOutcomeCompletionState";

export type BuildCurrentWorkSurfaceVMInput = {
    context: OperationalContext;
    templateConfig?: CurrentWorkTemplateConfigOverlay | null;
    actionRegistry?: CurrentWorkActionRefLookup | null;
    readinessProjection?: ReadinessResult | null;
    communicationSummary?: CurrentWorkLastActivity | null;
    /** Explicit completed checklist keys (fixtures / readiness). */
    completedChecklistKeys?: ReadonlySet<string> | null;
};

function statusLabelFor(status: CurrentWorkSurfaceStatus, hasOpenWork: boolean): string {
    switch (status) {
        case "completed":
            return "Completed";
        case "blocked":
            return "Blocked";
        case "not_started":
            return "Not started";
        case "in_progress":
            return hasOpenWork ? "Open" : "In progress";
    }
}

function resolveSurfaceStatus(args: {
    isEmpty: boolean;
    blocked: boolean;
    completed: number;
    total: number;
    hasOpenWork: boolean;
}): CurrentWorkSurfaceStatus {
    if (args.isEmpty) return "not_started";
    if (args.blocked) return "blocked";
    if (args.total > 0 && args.completed >= args.total && !args.hasOpenWork) return "completed";
    if (args.hasOpenWork || args.completed > 0) return "in_progress";
    return "not_started";
}

function checklistFromStageRuntime(runtime: StageWorkRuntimeProjection | null): CurrentWorkChecklistItemVM[] {
    if (!runtime) return [];
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.map((item) => {
        const operationalItem = {
            id: item.work_id ?? item.template_key,
            label: item.label,
            state:
                item.state === "completed" ? ("completed" as const)
                : item.state === "open" ? ("open" as const)
                : ("planned" as const),
            dueLabel: null,
            dueAt: item.due_at,
            urgency: null,
            source: null,
            kind: "stage_work" as const,
        };
        const owner = inferWorkItemOwner(operationalItem);
        const status =
            item.state === "completed" ? ("complete" as const) : ("missing" as const);
        const ownerCard = owner?.card ?? null;
        const targetLabel =
            ownerCard === "household" ? "Household"
            : ownerCard === "children" ? "Children"
            : ownerCard === "communications" ? "Communications"
            : ownerCard === "documents" ? "Documents"
            : null;
        return {
            key: item.template_key,
            label: item.label,
            status,
            scope: "record",
            targetLabel,
            actionRef: null,
            description: item.description?.trim() || null,
            handoffItemId: item.work_id ?? item.template_key,
        };
    });
}

function checklistFromConfig(
    config: CurrentWorkTemplateConfigOverlay,
    completedKeys: ReadonlySet<string>,
    truthByKey?: Map<string, ChecklistTruthResult>,
): CurrentWorkChecklistItemVM[] {
    return (config.checklist ?? []).map((row) => {
        const truth = truthByKey?.get(row.key);
        const status =
            truth?.status
            ?? (completedKeys.has(row.key) ? ("complete" as const) : ("missing" as const));
        return {
            key: row.key,
            label: row.label,
            status,
            scope: row.scope,
            targetLabel:
                truth?.targetLabel
                ?? (row.scope === "child" ? "Children"
                : row.scope === "person" ? "Person"
                : null),
            actionRef: row.action_ref ?? null,
            description: truth?.detail ?? null,
            handoffItemId: null,
        };
    });
}

function mergeChecklists(
    primaryItems: CurrentWorkChecklistItemVM[],
    secondaryItems: CurrentWorkChecklistItemVM[] = [],
): CurrentWorkChecklistItemVM[] {
    const byKey = new Map<string, CurrentWorkChecklistItemVM>();
    for (const item of primaryItems) byKey.set(item.key, item);
    for (const item of secondaryItems) {
        const existing = byKey.get(item.key);
        byKey.set(item.key, existing ? { ...existing, ...item, status: item.status } : item);
    }
    return [...byKey.values()];
}

function checklistFromReadiness(readiness: ReadinessResult | null | undefined): CurrentWorkChecklistItemVM[] {
    if (!readiness?.gaps?.length) return [];
    return readiness.gaps.map((gap) => ({
        key: gap.requirement_id,
        label: gap.label,
        status: gap.blocking ? ("blocked" as const) : ("missing" as const),
        scope:
            gap.entity_type === "child" ? ("child" as const)
            : gap.entity_type === "person" ? ("person" as const)
            : ("record" as const),
        targetLabel:
            gap.entity_type === "child" ? "Children"
            : gap.entity_type === "person" ? "Person"
            : null,
        actionRef: gap.resolution?.action_key ?? null,
        description: gap.missing_reason,
        handoffItemId: null,
    }));
}

function pickPrimaryOpenItem(runtime: StageWorkRuntimeProjection | null): StageWorkItemProjection | null {
    if (!runtime) return null;
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.find((item) => item.state === "open") ?? items.find((item) => item.state === "planned") ?? null;
}

function findOpenItemForTemplate(
    runtime: StageWorkRuntimeProjection | null,
    templateKey: string,
): StageWorkItemProjection | null {
    if (!runtime) return null;
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.find((item) => item.template_key === templateKey && item.state === "open") ?? null;
}

function resolveActionableWorkItem(
    runtime: StageWorkRuntimeProjection | null,
    primaryWorkItem: StageWorkItemProjection | null,
): StageWorkItemProjection | null {
    if (!primaryWorkItem) return null;
    if (primaryWorkItem.state === "open") return primaryWorkItem;
    return findOpenItemForTemplate(runtime, primaryWorkItem.template_key);
}

function outcomeCompletionBlockReason(
    item: StageWorkItemProjection | null,
    outcomes: ReturnType<typeof completionOutcomesForPicker>,
    canMutate: boolean,
): string | null {
    if (!item || item.state !== "open") return null;
    if (outcomes.length === 0) return "No completion outcomes configured for this work.";
    if (!item.requires_outcome_picker) return "This work item does not use outcome completion.";
    if (!canMutate) return "Read-only — completion requires edit access.";
    return null;
}

function buildWorkPrimaryAction(args: {
    title: string;
    description: string | null;
    workKey: string;
    templateConfig: CurrentWorkTemplateConfigOverlay | null | undefined;
    actionRegistry: CurrentWorkActionRefLookup | null | undefined;
    actionableWorkItem: StageWorkItemProjection | null;
}): CurrentWorkActionVM | null {
    if (args.templateConfig?.primary_action?.action_ref) {
        const ref = args.templateConfig.primary_action.action_ref;
        const resolved = actionFromRef(args.actionRegistry, ref);
        if (!resolved) return null;
        return {
            key: resolved.key,
            label: resolved.label,
            description: resolved.description ?? args.description,
            category: "primary",
            placement: "current_work_primary",
            handlerKey: resolved.key,
            actionRef: ref,
        };
    }
    if (!args.actionableWorkItem && !args.title) return null;
    const workDescription =
        args.actionableWorkItem?.description?.trim()
        ?? args.description
        ?? null;
    return {
        key: args.workKey,
        label: args.title,
        description: workDescription,
        category: "primary",
        placement: "current_work_primary",
        handlerKey: "expand_work",
        actionRef: args.workKey,
    };
}

function buildRecordOutcomeAction(args: {
    showOutcomeCompletion: boolean;
    primaryActionLabel: string | null;
}): CurrentWorkActionVM | null {
    if (!args.showOutcomeCompletion || !args.primaryActionLabel) return null;
    return {
        key: "record_outcome",
        label: args.primaryActionLabel,
        category: "primary",
        placement: "current_work_primary",
        handlerKey: "record_outcome",
        actionRef: "record_outcome",
    };
}

function lastActivityFromContext(
    context: OperationalContext,
    communicationSummary?: CurrentWorkLastActivity | null,
): CurrentWorkLastActivity | null {
    if (communicationSummary) return communicationSummary;
    const comms = context.signals.communications;
    if (comms.nextFollowUpAt) {
        return {
            label: "Next follow-up scheduled",
            occurredAt: comms.nextFollowUpAt,
        };
    }
    return null;
}

function mergeActionVms(
    primary: CurrentWorkActionVM[],
    secondary: CurrentWorkActionVM[],
): CurrentWorkActionVM[] {
    const seen = new Set(primary.map((action) => action.key));
    const merged = [...primary];
    for (const action of secondary) {
        if (seen.has(action.key)) continue;
        seen.add(action.key);
        merged.push(action);
    }
    return merged;
}

/**
 * Build the presentation-safe Current Work surface VM from runtime + config.
 * Deterministic; UI renders this only — no domain-specific branches in components.
 */
export function buildCurrentWorkSurfaceVM(input: BuildCurrentWorkSurfaceVMInput): CurrentWorkSurfaceVM {
    const {
        context,
        templateConfig: explicitTemplateConfig,
        actionRegistry: explicitActionRegistry,
        readinessProjection,
        communicationSummary,
        completedChecklistKeys: explicitCompletedChecklistKeys,
    } = input;

    const publishedResolved =
        explicitTemplateConfig == null && context.publishedStageInputs
            ? resolveCurrentWorkTemplateFromPublishedPlan({
                  ...context.publishedStageInputs,
                  stageWorkRuntime: context.stageWorkRuntime ?? null,
                  recordHeaderActions: context.recordHeaderActions ?? null,
              })
            : null;

    const templateConfig = explicitTemplateConfig ?? publishedResolved?.templateConfig ?? null;
    const actionRegistry = explicitActionRegistry ?? publishedResolved?.actionRegistry ?? null;
    const completedChecklistKeys =
        explicitCompletedChecklistKeys ?? publishedResolved?.completedChecklistKeys ?? null;
    const runtime = context.stageWorkRuntime ?? null;
    const attention = context.signals.attention;
    const processKey = context.businessProcess.key?.trim() || "unknown";
    const stageKey =
        runtime?.stage_key ?? (context.businessProcess.stageKey?.trim() || "unknown");
    const recordId = context.subject.id;

    const primaryWorkItem = pickPrimaryOpenItem(runtime);
    const actionableWorkItem = resolveActionableWorkItem(runtime, primaryWorkItem);
    const workKey =
        templateConfig?.work_key?.trim()
        ?? actionableWorkItem?.template_key
        ?? primaryWorkItem?.template_key
        ?? "unknown";

    const completionState = resolveStageWorkOutcomeCompletionState({
        stageWorkRuntime: runtime,
        canMutate: context.capabilities.canMutate,
    });
    const showOutcomeCompletion = completionState.ownsPrimaryCompletion;
    const pickerOutcomes =
        actionableWorkItem ? completionOutcomesForPicker(actionableWorkItem) : [];
    const primaryActionLabel =
        showOutcomeCompletion && actionableWorkItem?.state === "open" && pickerOutcomes.length > 0
            ? CURRENT_WORK_RECORD_OUTCOME_CTA
            : null;

    const classified = classifyRecordHeaderActionsForCurrentWork({
        recordHeaderSlots: context.recordHeaderActions ?? null,
        showOutcomeCompletion,
        primaryActionLabel,
    });

    const configCompletedKeys = new Set(completedChecklistKeys ?? []);

    const checklistTruthByKey =
        templateConfig
            ? resolveCurrentWorkChecklistTruthFromPublishedRules({
                  record: context.truth,
                  operationalContext: context,
                  publishedStageInputs: context.publishedStageInputs ?? null,
                  templateOverlay: templateConfig,
                  readinessProjection,
                  runtimeCompletedKeys: configCompletedKeys,
                  departmentMetadata: context.publishedStageInputs?.departmentMetadata ?? null,
              })
            : undefined;

    const stageChecklist = checklistFromStageRuntime(runtime);
    const configChecklist = templateConfig
        ? checklistFromConfig(templateConfig, configCompletedKeys, checklistTruthByKey)
        : [];
    const readinessChecklist = checklistFromReadiness(readinessProjection);
    const checklist =
        configChecklist.length > 0
            ? mergeChecklists(configChecklist, readinessChecklist)
            : readinessChecklist.length > 0
              ? readinessChecklist
              : stageChecklist;

    const completed = checklist.filter((item) => item.status === "complete").length;
    const total = checklist.length;
    const progress: CurrentWorkSurfaceProgress = {
        completed,
        total,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };

    const isEmpty =
        !runtime
        && checklist.length === 0
        && !templateConfig
        && classified.supporting.length === 0
        && classified.alternatePaths.length === 0;
    const blocked = attention.needsAttention && Boolean(attention.primaryReason);
    const hasOpenWork = Boolean(actionableWorkItem?.state === "open");
    const status = resolveSurfaceStatus({ isEmpty, blocked, completed, total, hasOpenWork });

    const title =
        templateConfig?.title?.trim()
        ?? primaryWorkItem?.label?.trim()
        ?? (runtime && total > 0 ? runtime.stage_label?.trim() : null)
        ?? "No current work configured";

    const description =
        templateConfig?.description?.trim()
        ?? actionableWorkItem?.description?.trim()
        ?? runtime?.purpose?.trim()
        ?? null;

    const primaryAction =
        isEmpty
            ? null
            : buildWorkPrimaryAction({
                  title,
                  description,
                  workKey,
                  templateConfig,
                  actionRegistry,
                  actionableWorkItem,
              });

    const recordOutcomeAction = buildRecordOutcomeAction({
        showOutcomeCompletion,
        primaryActionLabel,
    });

    const supportingFromConfig =
        templateConfig?.supporting_actions?.length
            ? actionsFromConfigRefs(
                  templateConfig.supporting_actions,
                  actionRegistry ?? new Map(),
                  "supporting",
                  "current_work_supporting",
              )
            : [];
    const supportingActions = mergeActionVms(supportingFromConfig, classified.supporting);

    const alternateFromConfig =
        templateConfig?.alternate_paths?.length
            ? actionsFromConfigRefs(
                  templateConfig.alternate_paths,
                  actionRegistry ?? new Map(),
                  "alternate_path",
                  "current_work_alternate_paths",
              )
            : [];
    const alternatePaths = mergeActionVms(alternateFromConfig, classified.alternatePaths);

    const communicationActions =
        templateConfig?.communication_actions?.length
            ? actionsFromConfigRefs(
                  templateConfig.communication_actions,
                  actionRegistry ?? new Map(),
                  "communication",
                  "communications_inline",
              )
            : classified.communicationActions;

    const primaryProjection =
        runtime && actionableWorkItem
            ? workIntentProjectionForStageWorkItem(runtime, actionableWorkItem)
            : null;

    return {
        id: `${recordId}:${workKey}`,
        recordId,
        processKey,
        stageKey,
        workKey,
        title: isEmpty ? "No current work configured" : title,
        description,
        status,
        statusLabel: statusLabelFor(status, hasOpenWork),
        progress,
        checklist,
        primaryAction,
        recordOutcomeAction,
        supportingActions,
        alternatePaths,
        administrativeActions: classified.administrative,
        communicationActions,
        bosRecommendations: classified.bosRecommendations,
        lastActivity: lastActivityFromContext(context, communicationSummary ?? null),
        showOutcomeCompletion,
        outcomeCompletionBlockReason: showOutcomeCompletion
            ? null
            : outcomeCompletionBlockReason(
                  actionableWorkItem,
                  pickerOutcomes,
                  context.capabilities.canMutate,
              ),
        completionOutcomes: pickerOutcomes,
        primaryWorkItem: actionableWorkItem ?? primaryWorkItem,
        primaryProjection,
        runtime,
        isEmpty,
    };
}

/** Map surface checklist scope to Focus card for navigation. */
export function handoffOwnerCardForChecklistScope(scope?: string): FocusPanelCardKey | null {
    switch (scope) {
        case "child":
            return "children";
        case "person":
            return "household";
        default:
            return null;
    }
}

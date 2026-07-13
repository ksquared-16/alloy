import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { completionOutcomesForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { resolveOutgoingProcessTransitions } from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

import {
    actionsFromConfigRefs,
    classifyRecordHeaderActionsForCurrentWork,
} from "./classifyCurrentWorkActions";
import { inferWorkItemOwner } from "./inferWorkItemOwner";
import { CURRENT_WORK_RECORD_OUTCOME_CTA } from "./currentWorkCopy";
import {
    resolvedHelpfulActionRefs,
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
    CurrentWorkReadinessItemVM,
    CurrentWorkReadinessVM,
} from "./currentWorkSurfaceTypes";
import { resolveCurrentWorkChecklistTruthFromPublishedRules, type ChecklistTruthResult } from "./resolveCurrentWorkChecklistTruthFromPublishedRules";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "./resolveCurrentWorkTemplateFromPublishedPlan";
import { resolveCurrentWorkTemplateAction } from "./resolveCurrentWorkTemplateAction";
import { resolveStageWorkOutcomeCompletionState } from "./resolveStageWorkOutcomeCompletionState";
import { isGenericUmbrellaLifecycleAction } from "./currentWorkActionSurfacePolicy";

export type BuildCurrentWorkSurfaceVMInput = {
    context: OperationalContext;
    templateConfig?: CurrentWorkTemplateConfigOverlay | null;
    actionRegistry?: CurrentWorkActionRefLookup | null;
    readinessProjection?: ReadinessResult | null;
    communicationSummary?: CurrentWorkLastActivity | null;
    /** Explicit completed checklist keys (fixtures / readiness). */
    completedChecklistKeys?: ReadonlySet<string> | null;
};

type ActionIntentResolutionContext = {
    processDefinition?: unknown;
    stageDefinition?: unknown;
    truth?: Record<string, unknown>;
};

function actionIntentContext(context: OperationalContext): ActionIntentResolutionContext {
    const plan = context.publishedStageInputs?.operatingPlan;
    return {
        stageDefinition: plan ? { journey_segment: plan.journey_segment } : undefined,
        processDefinition: context.publishedStageInputs?.processKey
            ? { key: context.publishedStageInputs.processKey }
            : undefined,
        truth:
            context.truth != null && typeof context.truth === "object"
                ? (context.truth as Record<string, unknown>)
                : undefined,
    };
}

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

function classifyChecklistItems(checklist: CurrentWorkChecklistItemVM[]): {
    requirements: CurrentWorkReadinessItemVM[];
    workItems: CurrentWorkReadinessItemVM[];
} {
    const requirements: CurrentWorkReadinessItemVM[] = [];
    const workItems: CurrentWorkReadinessItemVM[] = [];
    for (const item of checklist) {
        const row: CurrentWorkReadinessItemVM = {
            key: item.key,
            label: item.label,
            status: item.status,
            scope: item.scope,
            targetLabel: item.targetLabel,
        };
        if (item.kind === "stage_work") {
            workItems.push(row);
        } else {
            requirements.push(row);
        }
    }
    return { requirements, workItems };
}

function buildReadinessVM(args: {
    status: CurrentWorkSurfaceStatus;
    statusLabel: string;
    checklist: CurrentWorkChecklistItemVM[];
    blocked: boolean;
    attentionReason: string | null;
    hasOpenWork: boolean;
    hasOverdue: boolean;
    dueLabel?: string | null;
}): CurrentWorkReadinessVM {
    const { requirements, workItems } = classifyChecklistItems(args.checklist);
    const reqComplete = requirements.filter((i) => i.status === "complete").length;
    const reqTotal = requirements.length;
    const workComplete = workItems.filter((i) => i.status === "complete").length;
    const workTotal = workItems.length;

    const reasonCodes: string[] = [];
    let reasonLabel: string | null = null;

    if (args.status === "blocked") {
        if (args.attentionReason) {
            reasonCodes.push("attention");
            reasonLabel = args.attentionReason;
        } else if (reqTotal > 0 && reqComplete < reqTotal) {
            reasonCodes.push("requirements_remaining");
            const remaining = reqTotal - reqComplete;
            reasonLabel = `${remaining} requirement${remaining === 1 ? "" : "s"} remaining`;
        } else {
            reasonCodes.push("blocked");
            reasonLabel = "Waiting for a required action";
        }
    } else if (args.hasOverdue && args.dueLabel) {
        reasonCodes.push("overdue");
        reasonLabel = args.dueLabel;
    } else if (reqTotal > 0 && reqComplete < reqTotal) {
        reasonCodes.push("requirements_remaining");
        const remaining = reqTotal - reqComplete;
        reasonLabel = `${remaining} requirement${remaining === 1 ? "" : "s"} remaining`;
    }

    return {
        state: args.status,
        reasonCodes,
        reasonLabel,
        ...(reqTotal > 0 ? {
            requirements: {
                complete: reqComplete,
                total: reqTotal,
                remaining: reqTotal - reqComplete,
                items: requirements,
            },
        } : {}),
        ...(workTotal > 0 ? {
            workItems: {
                complete: workComplete,
                total: workTotal,
                remaining: workTotal - workComplete,
            },
        } : {}),
    };
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
            kind: "stage_work",
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
            kind: row.kind ?? "requirement",
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
        kind: "requirement" as const,
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
    intentContext: ActionIntentResolutionContext;
}): CurrentWorkActionVM | null {
    if (args.templateConfig?.primary_action?.action_ref) {
        const ref = args.templateConfig.primary_action.action_ref;
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: ref,
            overrideLabel: args.templateConfig.primary_action.override_label ?? null,
            lookup: args.actionRegistry,
            processDefinition: args.intentContext.processDefinition,
            stageDefinition: args.intentContext.stageDefinition,
            truth: args.intentContext.truth,
        });
        if (!resolved) return null;
        return {
            key: resolved.handlerKey,
            label: resolved.label,
            description: resolved.description ?? args.description,
            category: "primary",
            placement: "current_work_primary",
            handlerKey: resolved.handlerKey,
            actionRef: resolved.actionRef,
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

/** Config-owned helpful actions: explicit template config first; legacy catalog/header fallback only when undefined. */
function resolveHelpfulActions(args: {
    explicitRefs: CurrentWorkTemplateConfigOverlay["helpful_actions"] | undefined;
    explicitConfigured: boolean;
    fromConfig: CurrentWorkActionVM[];
    fromRegistry: CurrentWorkActionVM[];
}): CurrentWorkActionVM[] {
    if (args.explicitConfigured) {
        return args.fromConfig.filter((action) => !isGenericUmbrellaLifecycleAction(action.key));
    }
    const filteredConfig = args.fromConfig.filter((action) => !isGenericUmbrellaLifecycleAction(action.key));
    if (filteredConfig.length > 0) return filteredConfig;
    return args.fromRegistry.filter((action) => !isGenericUmbrellaLifecycleAction(action.key));
}

/**
 * Other Transitions — process-owned outgoing configured edges only.
 * Deduplicate by destination stage so outcome-driven edges do not inflate the
 * manual bypass list. Labels use destination stage metadata.
 * Legacy Work Template `alternate_paths` are intentionally ignored at runtime.
 */
function otherTransitionsFromProcess(context: OperationalContext): CurrentWorkActionVM[] {
    const published = context.publishedStageInputs;
    if (!published?.operatingPlan) return [];

    const outgoing = resolveOutgoingProcessTransitions({
        currentStageKey: published.stageKey,
        stageOperatingPlan: published.operatingPlan,
        processTracks: published.processTracks ?? null,
        processStages: published.processStages,
    });

    const byTarget = new Map<string, (typeof outgoing)[number]>();
    for (const row of outgoing) {
        if (!byTarget.has(row.target_stage_key)) {
            byTarget.set(row.target_stage_key, row);
        }
    }

    return [...byTarget.values()].map((row) => ({
        key: row.transition_ref,
        label: `Move to ${row.target_stage_label}`,
        description: null,
        category: "alternate_path" as const,
        placement: "current_work_alternate_paths" as const,
        handlerKey: row.transition_ref,
        actionRef: row.transition_ref,
        resolved: null,
    }));
}

function filterOutcomesByTemplateRefs(
    outcomes: StageCompletionOutcomeV1[],
    outcomeRefs: Array<{ outcome_ref: string }> | undefined,
    explicitConfigured: boolean,
): StageCompletionOutcomeV1[] {
    if (!explicitConfigured || outcomeRefs === undefined) return outcomes;
    if (!outcomeRefs.length) return [];
    const order = outcomeRefs.map((row) => row.outcome_ref.trim()).filter(Boolean);
    const byKey = new Map(outcomes.map((row) => [row.outcome_key, row]));
    return order.map((key) => byKey.get(key)).filter((row): row is StageCompletionOutcomeV1 => row != null);
}

function contextAllowedActionKeys(args: {
    actionCatalog: StageActionCatalogV1 | null | undefined;
    templateConfig: CurrentWorkTemplateConfigOverlay | null | undefined;
}): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const candidate of args.actionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key) continue;
        keys.add(key);
        keys.add(normalizeActionRefToIntentKey(key));
    }
    const template = args.templateConfig;
    const refs = [
        template?.primary_action?.action_ref,
        ...(template?.helpful_actions ?? []).map((row) => row.action_ref),
        ...(template?.alternate_paths ?? []).flatMap((row) =>
            "action_ref" in row ? [row.action_ref] : [],
        ),
        ...(template?.communication_actions ?? []).map((row) => row.action_ref),
    ];
    for (const ref of refs) {
        const key = ref?.trim();
        if (!key) continue;
        keys.add(key);
        keys.add(normalizeActionRefToIntentKey(key));
    }
    return keys;
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
                  processStages: context.publishedStageInputs.processStages ?? null,
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
    const pickerOutcomesRaw =
        actionableWorkItem ? completionOutcomesForPicker(actionableWorkItem) : [];
    const pickerOutcomes = filterOutcomesByTemplateRefs(
        pickerOutcomesRaw,
        templateConfig?.outcome_refs,
        templateConfig?.outcome_refs_explicit === true,
    );
    const primaryActionLabel =
        showOutcomeCompletion && actionableWorkItem?.state === "open" && pickerOutcomes.length > 0
            ? CURRENT_WORK_RECORD_OUTCOME_CTA
            : null;

    const classified = classifyRecordHeaderActionsForCurrentWork({
        recordHeaderSlots: context.recordHeaderActions ?? null,
        showOutcomeCompletion,
        primaryActionLabel,
        allowedActionKeys: contextAllowedActionKeys({
            actionCatalog: context.publishedStageInputs?.actionCatalog ?? null,
            templateConfig,
        }),
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

    // Requirement progress only — work items must not inflate the denominator.
    const requirementItems = checklist.filter((item) => item.kind !== "stage_work");
    const reqCompleted = requirementItems.filter((item) => item.status === "complete").length;
    const reqTotal = requirementItems.length;
    const progress: CurrentWorkSurfaceProgress = {
        completed: reqCompleted,
        total: reqTotal,
        percent: reqTotal > 0 ? Math.round((reqCompleted / reqTotal) * 100) : 0,
    };

    const isEmpty =
        !runtime
        && checklist.length === 0
        && !templateConfig
        && classified.supporting.length === 0
        && classified.alternatePaths.length === 0;
    const blocked =
        (attention.needsAttention && Boolean(attention.primaryReason))
        || (checklist.some((item) => item.status === "blocked"));
    const hasOpenWork = Boolean(actionableWorkItem?.state === "open");
    const hasOverdue = context.signals.work.overdueCount > 0;
    // Status uses full checklist truth + open work; percent remains requirements-only.
    const statusCompleted = checklist.filter((item) => item.status === "complete").length;
    const statusTotal = checklist.length;
    const status = resolveSurfaceStatus({
        isEmpty,
        blocked,
        completed: statusCompleted,
        total: statusTotal,
        hasOpenWork,
    });
    const readiness = buildReadinessVM({
        status,
        statusLabel: statusLabelFor(status, hasOpenWork),
        checklist,
        blocked,
        attentionReason: attention.primaryReason,
        hasOpenWork,
        hasOverdue,
        dueLabel: context.signals.work.primary?.dueLabel ?? null,
    });

    const title =
        templateConfig?.title?.trim()
        ?? primaryWorkItem?.label?.trim()
        ?? (runtime && checklist.length > 0 ? runtime.stage_label?.trim() : null)
        ?? "No current work configured";

    const description =
        templateConfig?.description?.trim()
        ?? actionableWorkItem?.description?.trim()
        ?? runtime?.purpose?.trim()
        ?? null;

    const operatorGuidance = context.publishedStageInputs?.operatorGuidance?.trim() ?? null;

    const intentCtx = actionIntentContext(context);

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
                  intentContext: intentCtx,
              });

    const recordOutcomeAction = buildRecordOutcomeAction({
        showOutcomeCompletion,
        primaryActionLabel,
    });

    const helpfulRefs = resolvedHelpfulActionRefs(templateConfig);
    const helpfulExplicit = templateConfig?.helpful_actions_explicit === true;
    const supportingFromConfig =
        helpfulRefs !== undefined
            ? actionsFromConfigRefs(
                  helpfulRefs,
                  actionRegistry ?? new Map(),
                  "supporting",
                  "current_work_supporting",
                  intentCtx,
              )
            : [];
    const supportingActions = resolveHelpfulActions({
        explicitRefs: helpfulRefs,
        explicitConfigured: helpfulExplicit,
        fromConfig: supportingFromConfig,
        fromRegistry: classified.supporting,
    });

    // Process-owned Other Transitions — ignore Work Template alternate_paths at runtime.
    const alternatePaths = otherTransitionsFromProcess(context);

    const communicationActions =
        templateConfig?.communication_actions?.length
            ? actionsFromConfigRefs(
                  templateConfig.communication_actions,
                  actionRegistry ?? new Map(),
                  "communication",
                  "communications_inline",
                  intentCtx,
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
        operatorGuidance,
        status,
        statusLabel: statusLabelFor(status, hasOpenWork),
        readiness,
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

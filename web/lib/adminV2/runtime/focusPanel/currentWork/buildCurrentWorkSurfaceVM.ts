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

import {
    actionsFromConfigRefs,
    classifyRecordHeaderActionsForCurrentWork,
} from "./classifyCurrentWorkActions";
import { resolveCurrentWorkRequirementOwner } from "./resolveCurrentWorkRequirementOwner";
import { resolveCurrentWorkRequirementOperatorLabel } from "./resolveCurrentWorkFieldRuleDisplayLabel";
import { CURRENT_WORK_RECORD_OUTCOME_CTA } from "./currentWorkCopy";
import {
    resolvedHelpfulActionRefs,
    type CurrentWorkActionRefLookup,
    type CurrentWorkTemplateConfigOverlay,
} from "./currentWorkTemplateConfig";
import { buildCurrentWorkExecutionVM } from "./buildCurrentWorkExecutionVM";
import { resolveCurrentWorkActionExecution } from "./executeCurrentWorkAction";
import { buildCurrentWorkResolutions } from "./buildCurrentWorkResolutions";
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
import { resolveWorkTemplateExecutionMode } from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";
import { buildProcessAwareActionAllowlist } from "@/lib/lifecycle/processRuntimeCommandProjection";

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
            owner: item.owner ?? resolveCurrentWorkRequirementOwner({ scope: item.scope }),
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
        const status =
            item.state === "completed" ? ("complete" as const) : ("missing" as const);
        // Stage-work rows carry no field-rule entity — they are WORK, not a data requirement.
        // No label-regex owner inference (that heuristic was the Slice E debt); a work item has
        // no data-owning card, so ownership is left unset rather than guessed from the label.
        return {
            key: item.template_key,
            label: item.label,
            status,
            kind: "stage_work" as const,
            scope: "record" as const,
            targetLabel: null,
            owner: null,
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
            owner: resolveCurrentWorkRequirementOwner({ scope: row.scope }),
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
    const rows: CurrentWorkChecklistItemVM[] = [];
    for (const gap of readiness.gaps) {
        // Suppress internal identifiers (foreign keys like `location_id`) — they leak from the
        // derivation layer and are never operator requirements. Catalog-backed fields resolve.
        const operatorLabel = resolveCurrentWorkRequirementOperatorLabel(gap.requirement_id);
        if (operatorLabel === null) continue;
        const scope =
            gap.entity_type === "child" ? ("child" as const)
            : gap.entity_type === "person" ? ("person" as const)
            : ("record" as const);
        rows.push({
            key: gap.requirement_id,
            // Prefer the authored gap label; fall back to the canonical operator label. Never the id.
            label: gap.label?.trim() || operatorLabel,
            status: gap.blocking ? ("blocked" as const) : ("missing" as const),
            kind: "requirement" as const,
            scope,
            targetLabel:
                gap.entity_type === "child" ? "Children"
                : gap.entity_type === "person" ? "Person"
                : null,
            owner: resolveCurrentWorkRequirementOwner({ scope, entityType: gap.entity_type }),
            actionRef: gap.resolution?.action_key ?? null,
            description: gap.missing_reason,
            handoffItemId: null,
        });
    }
    return rows;
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

/**
 * Why an outcome cannot be recorded, in a sentence an operator can act on.
 *
 * This used to return `null` for the two states that actually occur most often — no actionable
 * work item at all, and an item that is no longer open — which left the card showing a bare
 * "Blocked" chip with nothing behind it. A director could not tell whether the configuration was
 * wrong, unpublished, or simply not applicable to this record, and had no next step to take.
 *
 * The `!item` case is not an edge: it is what a record looks like when its open work belongs to a
 * work template the published plan does not define (for example work provisioned before the plan
 * was authored). The runtime knew this; it just never said it.
 */
function outcomeCompletionBlockReason(
    item: StageWorkItemProjection | null,
    outcomes: ReturnType<typeof completionOutcomesForPicker>,
    canMutate: boolean,
    /**
     * When the published stage plan already resolves a template sequence / primary title,
     * absence of an open provisioned task is not "no configured work" — Record Outcome stays
     * unavailable without a contradictory operator warning.
     */
    configuredStageWorkResolved?: boolean,
): string | null {
    if (!item) {
        if (configuredStageWorkResolved) return null;
        return "No open work here matches this stage's configured work items, so there is no outcome to record.";
    }
    if (item.state !== "open") return "This work is already complete — there is no outcome left to record.";
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
            relatedSubjectResolution: resolved.relatedSubjectResolution,
            requiresSubjectPicker: resolved.requiresSubjectPicker,
            ...(resolved.blockedReason
                ? {
                      disabled: true,
                      disabledReason: resolved.blockedReason,
                      blockedReason: resolved.blockedReason,
                  }
                : { blockedReason: null }),
        };
    }
    // Outcome-led / no Primary Action: never fabricate a Primary Action from the work title.
    const mode = resolveWorkTemplateExecutionMode({
        primary_action: args.templateConfig?.primary_action,
        execution_mode: args.templateConfig?.execution_mode,
    });
    if (mode === "outcome_led" || !args.templateConfig?.primary_action?.action_ref) {
        return null;
    }
    return null;
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
 * When a tour booking already exists, What's Next must not keep advertising "Schedule tour".
 * Rewrite schedule_tour → reschedule_tour so the CTA matches Tour card / helpful-action truth.
 */
export function alignTourScheduleActionForBookingState(
    action: CurrentWorkActionVM,
    tourScheduled: boolean,
): CurrentWorkActionVM {
    if (!tourScheduled) return action;
    const key = (action.handlerKey || action.key || "").trim();
    if (key !== "schedule_tour") return action;
    return {
        ...action,
        key: "reschedule_tour",
        handlerKey: "reschedule_tour",
        label: "Reschedule tour",
    };
}

/** Config-owned helpful actions only — never invent from record-header registry placement. */
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
    // No Work Template helpful list and no config refs — stay empty rather than inventing
    // Manage-menu / header placement actions into What's Next.
    void args.fromRegistry;
    return [];
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
        description: `Transition to ${row.target_stage_label}`,
        category: "alternate_path" as const,
        placement: "current_work_alternate_paths" as const,
        handlerKey: "process_stage_transition",
        /** Destination stage/status key for canonical transition preflight + PATCH. */
        actionRef: row.target_stage_key,
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
    commandProjection?: import("@/lib/lifecycle/processRuntimeCommandProjection").ProcessRuntimeCommandProjection | null;
}): { keys: ReadonlySet<string>; enforce: boolean } {
    const template = args.templateConfig;
    const helpfulForAllowlist = resolvedHelpfulActionRefs(template) ?? [];
    const explicitTemplateRefs = [
        template?.primary_action?.action_ref,
        ...helpfulForAllowlist.map((row) => row.action_ref),
        ...(template?.alternate_paths ?? []).flatMap((row) =>
            "action_ref" in row ? [row.action_ref] : [],
        ),
        ...(template?.communication_actions ?? []).map((row) => row.action_ref),
    ].filter((ref): ref is string => Boolean(ref?.trim()));

    return buildProcessAwareActionAllowlist({
        projection: args.commandProjection,
        stageActionCatalog: args.actionCatalog,
        explicitTemplateRefs,
    });
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

    const allowlist = contextAllowedActionKeys({
        actionCatalog: context.publishedStageInputs?.actionCatalog ?? null,
        templateConfig,
        commandProjection: context.publishedStageInputs?.commandProjection ?? null,
    });
    const classified = classifyRecordHeaderActionsForCurrentWork({
        recordHeaderSlots: context.recordHeaderActions ?? null,
        showOutcomeCompletion,
        primaryActionLabel,
        allowedActionKeys: allowlist.keys,
        enforceActionAllowlist: allowlist.enforce,
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

    const execution = buildCurrentWorkExecutionVM({
        templateConfig,
        primaryAction,
        recordOutcomeAction,
        showOutcomeCompletion,
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
            : [];

    const primaryProjection =
        runtime && actionableWorkItem
            ? workIntentProjectionForStageWorkItem(runtime, actionableWorkItem)
            : null;

    // Command integrity (Slice F): thread each action's resolved execution state onto the VM so
    // the card renders enabled only what is provably executable, and config errors stay observable.
    const tourScheduled = context.signals.tour.scheduled === true;
    const withActionExecution = <T extends CurrentWorkActionVM | null | undefined>(action: T): T => {
        if (!action) return action;
        const aligned = alignTourScheduleActionForBookingState(action, tourScheduled);
        return { ...aligned, execution: resolveCurrentWorkActionExecution(aligned) } as T;
    };
    const withActionExecutionAll = (actions: CurrentWorkActionVM[]): CurrentWorkActionVM[] =>
        actions.map((action) => withActionExecution(action)!);

    const configuredStageWorkResolved = Boolean(
        templateConfig != null
            || (runtime?.template_keys?.length ?? 0) > 0
            || runtime?.primary != null
            || (title.trim() !== "" && title !== "No current work configured"),
    );
    const resolvedAlternatePaths = withActionExecutionAll(alternatePaths);
    const resolvedOutcomeBlockReason = showOutcomeCompletion
        ? null
        : outcomeCompletionBlockReason(
              actionableWorkItem,
              pickerOutcomes,
              context.capabilities.canMutate,
              configuredStageWorkResolved,
          );
    const resolvedPrimaryWorkItem = actionableWorkItem ?? primaryWorkItem;

    // Generic resolution contract (Slice D): configured outcomes + BP transitions unified.
    const resolutions = buildCurrentWorkResolutions({
        completionOutcomes: pickerOutcomes,
        alternatePaths: resolvedAlternatePaths,
        primaryWorkItem: resolvedPrimaryWorkItem,
        showOutcomeCompletion,
        outcomeCompletionBlockReason: resolvedOutcomeBlockReason,
    });

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
        primaryAction: withActionExecution(primaryAction),
        recordOutcomeAction: withActionExecution(recordOutcomeAction),
        execution,
        supportingActions: withActionExecutionAll(supportingActions),
        alternatePaths: resolvedAlternatePaths,
        administrativeActions: withActionExecutionAll(classified.administrative),
        communicationActions: withActionExecutionAll(communicationActions),
        bosRecommendations: withActionExecutionAll(classified.bosRecommendations),
        lastActivity: lastActivityFromContext(context, communicationSummary ?? null),
        showOutcomeCompletion,
        outcomeCompletionBlockReason: resolvedOutcomeBlockReason,
        completionOutcomes: pickerOutcomes,
        resolutions,
        primaryWorkItem: resolvedPrimaryWorkItem,
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

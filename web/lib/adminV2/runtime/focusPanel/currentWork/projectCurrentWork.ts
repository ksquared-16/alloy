/**
 * Current Work ViewModel — pure projection from Operational Context + stage runtime.
 *
 * Derivation (no enrollment hardcoding; all labels from config/runtime):
 *   title            → primary open stage-work item label (operating-plan template)
 *   purpose          → stageWorkRuntime.purpose (stage operating plan)
 *   checklist        → runtime.primary + runtime.additional work templates
 *   blockers         → signals.attention (requirements / attention reasons)
 *   primaryAction    → "Record what happened" when outcomes exist; else nextActionLabel
 *   supportingActions→ reserved for action-registry labels (empty until wired)
 *   outcomes         → existing StageWorkOutcomePicker → completeStageWorkWithOutcome
 *
 * Fallbacks only: "No open work", "Open work →", empty-state copy.
 * Cards observe this; they never read the drawer VM or write stage_key.
 *
 * @see docs/platform/operator/current-work-surface.md
 * @see docs/platform/operator/actions-current-work-alignment.md
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { inferWorkItemOwner } from "./inferWorkItemOwner";
import { deriveCurrentWorkSupportingActions } from "./deriveCurrentWorkSupportingActions";
import { resolveStageWorkOutcomeCompletionState } from "./resolveStageWorkOutcomeCompletionState";
import { completionOutcomesForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { CURRENT_WORK_RECORD_OUTCOME_CTA } from "./currentWorkCopy";

export type CurrentWorkChecklistItem = {
    id: string;
    label: string;
    description: string | null;
    state: "complete" | "open" | "planned";
    ownerCard: FocusPanelCardKey | null;
    ownerFocus: string | null;
    /** Outreach vs verification vs generic navigation — drives action row styling. */
    handoffKind: "outreach" | "verification" | "navigation" | null;
};

export type CurrentWorkBlocker = {
    label: string;
};

export type CurrentWorkViewModel = {
    microLabel: string;
    title: string;
    purpose: string | null;
    progressLabel: string | null;
    progressVerdict: string | null;
    primaryActionLabel: string | null;
    supportingActionLabels: string[];
    supportingActions: ResolvedActionForClient[];
    blockers: CurrentWorkBlocker[];
    checklist: CurrentWorkChecklistItem[];
    isEmpty: boolean;
    isReady: boolean;
    hasOverdue: boolean;
    openCount: number;
    completedCount: number;
    totalCount: number;
    showOutcomeCompletion: boolean;
    /** When open work has outcomes but completion CTA is hidden — honest operator copy. */
    outcomeCompletionBlockReason: string | null;
    completionOutcomes: StageCompletionOutcomeV1[];
    primaryWorkItem: StageWorkItemProjection | null;
    primaryProjection: WorkIntentRuntimeProjection | null;
    runtime: StageWorkRuntimeProjection | null;
};

export function formatCurrentWorkProgress(completed: number, total: number): string | null {
    if (total <= 0) return null;
    return `${completed} of ${total} complete`;
}

function progressVerdict(completed: number, total: number): string | null {
    if (total <= 0) return null;
    if (completed >= total) return "Ready";
    if (completed === 0) return "Getting started";
    if (completed >= total - 1) return "Almost ready";
    return "In progress";
}

function checklistFromRuntime(runtime: StageWorkRuntimeProjection | null): CurrentWorkChecklistItem[] {
    if (!runtime) return [];
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    return items.map((item) => {
        const operationalItem = {
            id: item.work_id ?? item.template_key,
            label: item.label,
            state: item.state === "completed" ? "completed" as const : item.state === "open" ? "open" as const : "planned" as const,
            dueLabel: null,
            dueAt: item.due_at,
            urgency: null,
            source: null,
            kind: "stage_work" as const,
        };
        const owner = inferWorkItemOwner(operationalItem);
        const handoffKind =
            owner?.card === "communications" ? "outreach" as const
            : owner?.card === "household" ? "verification" as const
            : owner?.card != null ? "navigation" as const
            : null;
        return {
            id: item.work_id ?? item.template_key,
            label: item.label,
            description: item.description?.trim() || null,
            state:
                item.state === "completed" ? "complete"
                : item.state === "open" ? "open"
                : "planned",
            ownerCard: owner?.card ?? null,
            ownerFocus: owner?.focus ?? null,
            handoffKind,
        };
    });
}

function pickPrimaryOpenItem(runtime: StageWorkRuntimeProjection | null): StageWorkItemProjection | null {
    if (!runtime) return null;
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    const open = items.find((item) => item.state === "open");
    if (open) return open;
    const planned = items.find((item) => item.state === "planned");
    return planned ?? null;
}

/** Open work item for the same template — bridges task bind when primary display is still planned. */
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
 * Primary CTA label when configured outcomes exist for the open work item.
 * Title names the work; CTA records the result.
 */
function primaryActionLabelForItem(item: StageWorkItemProjection | null): string | null {
    if (!item || item.state !== "open") return null;
    const outcomes = completionOutcomesForPicker(item);
    if (!item.requires_outcome_picker || outcomes.length === 0) return null;
    return CURRENT_WORK_RECORD_OUTCOME_CTA;
}

function outcomeCompletionBlockReason(
    item: StageWorkItemProjection | null,
    outcomes: StageCompletionOutcomeV1[],
    canMutate: boolean,
): string | null {
    if (!item || item.state !== "open") return null;
    if (outcomes.length === 0) {
        return "No completion outcomes configured for this work.";
    }
    if (!item.requires_outcome_picker) {
        return "This work item does not use outcome completion.";
    }
    if (!canMutate) {
        return "Read-only — completion requires edit access.";
    }
    return null;
}

/** Project Current Work from Operational Context (pure, no I/O). */
export function projectCurrentWork(context: OperationalContext): CurrentWorkViewModel {
    const runtime = context.stageWorkRuntime ?? null;
    const work = context.signals.work;
    const attention = context.signals.attention;
    const checklist = checklistFromRuntime(runtime);
    const totalCount = checklist.length;
    const completedCount = checklist.filter((item) => item.state === "complete").length;
    const primaryWorkItem = pickPrimaryOpenItem(runtime);
    const actionableWorkItem = resolveActionableWorkItem(runtime, primaryWorkItem);
    const primaryProjection =
        runtime && actionableWorkItem ?
            workIntentProjectionForStageWorkItem(runtime, actionableWorkItem)
        :   null;

    const blockers: CurrentWorkBlocker[] = [];
    if (attention.needsAttention && attention.primaryReason) {
        blockers.push({ label: attention.primaryReason });
    }

    const title =
        primaryWorkItem?.label?.trim()
        ?? (runtime && totalCount > 0 ? runtime.stage_label?.trim() : null)
        ?? "No current work configured";

    const purpose = runtime?.purpose?.trim() ?? null;
    const progressLabel = formatCurrentWorkProgress(completedCount, totalCount);
    const configuredPrimaryActionLabel = primaryActionLabelForItem(actionableWorkItem);
    const pickerOutcomes =
        actionableWorkItem
            ? completionOutcomesForPicker(actionableWorkItem)
            : [];

    const completionState = resolveStageWorkOutcomeCompletionState({
        stageWorkRuntime: runtime,
        canMutate: context.capabilities.canMutate,
    });

    const showOutcomeCompletion = completionState.ownsPrimaryCompletion;

    const completionBlockReason = showOutcomeCompletion
        ? null
        : outcomeCompletionBlockReason(
            actionableWorkItem,
            pickerOutcomes,
            context.capabilities.canMutate,
        );

    const isEmpty = !runtime || totalCount === 0;
    const primaryActionLabel =
        isEmpty ? null
        : configuredPrimaryActionLabel;

    const supportingActions = deriveCurrentWorkSupportingActions({
        recordHeaderSlots: context.recordHeaderActions ?? null,
        showOutcomeCompletion,
        primaryActionLabel,
    });

    return {
        microLabel: "Current Work",
        title: isEmpty ? "No current work configured" : title,
        purpose,
        progressLabel,
        progressVerdict: progressVerdict(completedCount, totalCount),
        primaryActionLabel,
        supportingActionLabels: supportingActions.map((action) => action.label),
        supportingActions,
        blockers,
        checklist,
        isEmpty,
        isReady: !isEmpty && blockers.length === 0 && completedCount === totalCount && totalCount > 0,
        hasOverdue: work.overdueCount > 0,
        openCount: work.openCount,
        completedCount,
        totalCount,
        showOutcomeCompletion,
        outcomeCompletionBlockReason: completionBlockReason,
        completionOutcomes: pickerOutcomes,
        primaryWorkItem: actionableWorkItem ?? primaryWorkItem,
        primaryProjection,
        runtime,
    };
}

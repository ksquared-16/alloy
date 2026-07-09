/**
 * Current Work ViewModel — pure projection from Operational Context + stage runtime.
 *
 * Presentation VM: `buildCurrentWorkSurfaceVM` — config-driven surface with action tiers.
 * Legacy fields retained for queue projection and gradual migration.
 *
 * @see docs/platform/operator/current-work-surface.md
 * @see docs/platform/operator/action-system.md
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { buildCurrentWorkSurfaceVM } from "./buildCurrentWorkSurfaceVM";
import type { CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkChecklistItem = {
    id: string;
    label: string;
    description: string | null;
    state: "complete" | "open" | "planned";
    ownerCard: FocusPanelCardKey | null;
    ownerFocus: string | null;
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
    outcomeCompletionBlockReason: string | null;
    completionOutcomes: StageCompletionOutcomeV1[];
    primaryWorkItem: StageWorkItemProjection | null;
    primaryProjection: WorkIntentRuntimeProjection | null;
    runtime: StageWorkRuntimeProjection | null;
    /** Config-driven operational surface — canonical presentation VM. */
    surface: CurrentWorkSurfaceVM;
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

function legacyChecklistFromSurface(surface: CurrentWorkSurfaceVM): CurrentWorkChecklistItem[] {
    return surface.checklist.map((item) => ({
        id: item.handoffItemId ?? item.key,
        label: item.label,
        description: item.description ?? null,
        state:
            item.status === "complete" ? "complete"
            : item.status === "blocked" ? "open"
            : "open",
        ownerCard:
            item.targetLabel === "Household" ? "household"
            : item.targetLabel === "Children" ? "children"
            : item.targetLabel === "Communications" ? "communications"
            : item.targetLabel === "Documents" ? "documents"
            : null,
        ownerFocus: null,
        handoffKind:
            item.targetLabel === "Communications" ? "outreach"
            : item.targetLabel === "Household" ? "verification"
            : item.targetLabel != null ? "navigation"
            : null,
    }));
}

/** Project Current Work from Operational Context (pure, no I/O). */
export function projectCurrentWork(context: OperationalContext): CurrentWorkViewModel {
    const surface = buildCurrentWorkSurfaceVM({ context });
    const work = context.signals.work;
    const attention = context.signals.attention;

    const blockers: CurrentWorkBlocker[] = [];
    if (attention.needsAttention && attention.primaryReason) {
        blockers.push({ label: attention.primaryReason });
    }

    const progressLabel = formatCurrentWorkProgress(surface.progress.completed, surface.progress.total);
    const supportingActions = surface.supportingActions
        .map((action) => action.resolved)
        .filter((action): action is ResolvedActionForClient => action != null);

    return {
        microLabel: "Current Work",
        title: surface.title,
        purpose: surface.description ?? null,
        progressLabel,
        progressVerdict: progressVerdict(surface.progress.completed, surface.progress.total),
        primaryActionLabel:
            surface.isEmpty ? null : (surface.recordOutcomeAction?.label ?? surface.primaryAction?.label ?? null),
        supportingActionLabels: surface.supportingActions.map((a) => a.label),
        supportingActions,
        blockers,
        checklist: legacyChecklistFromSurface(surface),
        isEmpty: surface.isEmpty,
        isReady:
            !surface.isEmpty
            && blockers.length === 0
            && surface.progress.completed === surface.progress.total
            && surface.progress.total > 0,
        hasOverdue: work.overdueCount > 0,
        openCount: work.openCount,
        completedCount: surface.progress.completed,
        totalCount: surface.progress.total,
        showOutcomeCompletion: surface.showOutcomeCompletion,
        outcomeCompletionBlockReason: surface.outcomeCompletionBlockReason,
        completionOutcomes: surface.completionOutcomes,
        primaryWorkItem: surface.primaryWorkItem,
        primaryProjection: surface.primaryProjection,
        runtime: surface.runtime,
        surface,
    };
}

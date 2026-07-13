import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

/** Operator-facing status for Current Work summary chip. */
export type CurrentWorkSurfaceStatus = "not_started" | "in_progress" | "blocked" | "completed";

export type CurrentWorkActionCategory =
    | "primary"
    | "supporting"
    | "communication"
    | "alternate_path"
    | "administrative"
    | "bos_recommended";

export type CurrentWorkActionPlacement =
    | "current_work_primary"
    | "current_work_supporting"
    | "current_work_alternate_paths"
    | "communications_inline"
    | "manage_overflow"
    | "bos_recommendation";

export type CurrentWorkActionVM = {
    key: string;
    label: string;
    description?: string | null;
    icon?: string | null;
    category: CurrentWorkActionCategory;
    placement: CurrentWorkActionPlacement;
    handlerKey?: string | null;
    actionRef?: string | null;
    disabled?: boolean;
    disabledReason?: string | null;
    /** Resolved registry action for client invoke — when available. */
    resolved?: ResolvedActionForClient | null;
};

export type CurrentWorkChecklistStatus = "complete" | "missing" | "blocked";

export type CurrentWorkChecklistItemVM = {
    key: string;
    label: string;
    status: CurrentWorkChecklistStatus;
    scope?: "record" | "child" | "person";
    targetLabel?: string | null;
    actionRef?: string | null;
    description?: string | null;
    /** When navigable via Focus handoff (legacy stage-work rows). */
    handoffItemId?: string | null;
};

export type CurrentWorkSurfaceProgress = {
    completed: number;
    total: number;
    percent: number;
};

export type CurrentWorkReadinessItemVM = {
    key: string;
    label: string;
    status: CurrentWorkChecklistStatus;
    scope?: "record" | "child" | "person";
    targetLabel?: string | null;
};

export type CurrentWorkReadinessVM = {
    state: CurrentWorkSurfaceStatus;
    reasonCodes: string[];
    reasonLabel: string | null;
    requirements?: {
        complete: number;
        total: number;
        remaining: number;
        items: CurrentWorkReadinessItemVM[];
    };
    workItems?: {
        complete: number;
        total: number;
        remaining: number;
    };
};

export type CurrentWorkLastActivity = {
    label: string;
    occurredAt?: string | null;
    detail?: string | null;
};

export type CurrentWorkCompletionSummary = {
    outcomeKey: string;
    outcomeLabel: string;
    summary: string;
    changeLines: string[];
    nextWorkLabel?: string | null;
    nextReminderLabel?: string | null;
};

export type CurrentWorkSurfaceVM = {
    id: string;
    recordId: string;
    processKey: string;
    stageKey: string;
    workKey: string;

    title: string;
    description?: string | null;
    status: CurrentWorkSurfaceStatus;
    statusLabel: string;
    readiness: CurrentWorkReadinessVM;

    progress: CurrentWorkSurfaceProgress;

    checklist: CurrentWorkChecklistItemVM[];

    primaryAction?: CurrentWorkActionVM | null;
    /** Outcome recording CTA — expanded view only (mockup: under work primary). */
    recordOutcomeAction?: CurrentWorkActionVM | null;
    supportingActions: CurrentWorkActionVM[];
    alternatePaths: CurrentWorkActionVM[];
    administrativeActions: CurrentWorkActionVM[];
    communicationActions: CurrentWorkActionVM[];
    bosRecommendations: CurrentWorkActionVM[];

    lastActivity?: CurrentWorkLastActivity | null;

    /** Legacy/runtime fields cards still need for outcome completion. */
    showOutcomeCompletion: boolean;
    outcomeCompletionBlockReason: string | null;
    completionOutcomes: StageCompletionOutcomeV1[];
    primaryWorkItem: StageWorkItemProjection | null;
    primaryProjection: WorkIntentRuntimeProjection | null;
    runtime: StageWorkRuntimeProjection | null;
    isEmpty: boolean;
};

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import type { CurrentWorkExecutionVM } from "./buildCurrentWorkExecutionVM";
import type { CurrentWorkActionExecution } from "./executeCurrentWorkAction";
import type { CurrentWorkResolutionVM } from "./buildCurrentWorkResolutions";
import type { CurrentWorkRequirementOwner } from "./resolveCurrentWorkRequirementOwner";

export type { CurrentWorkRequirementOwner } from "./resolveCurrentWorkRequirementOwner";
export type { CurrentWorkResolutionVM, CurrentWorkResolutionKind } from "./buildCurrentWorkResolutions";

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
    /** Resolved execution state (Slice F) — every visible enabled action is provably executable. */
    execution?: CurrentWorkActionExecution | null;
    /**
     * Related-subject resolution for commands invoked from family/opportunity context
     * (e.g. Move to Waitlist → enrollment child). Drives subject_selector surface.
     */
    relatedSubjectResolution?: "enrollment_child" | null;
    /** When truth already lists multiple eligible subjects — prefer picker before execute. */
    requiresSubjectPicker?: boolean;
    /** Operator-safe block when related subjects are known-empty. */
    blockedReason?: string | null;
};

export type { CurrentWorkActionExecution, CurrentWorkActionExecutionStatus } from "./executeCurrentWorkAction";

export type CurrentWorkChecklistStatus = "complete" | "missing" | "blocked";

export type CurrentWorkChecklistItemKind = "requirement" | "stage_work";

export type CurrentWorkChecklistItemVM = {
    key: string;
    label: string;
    status: CurrentWorkChecklistStatus;
    kind?: CurrentWorkChecklistItemKind;
    scope?: "record" | "child" | "person";
    targetLabel?: string | null;
    /** Owning capability resolved from runtime metadata (not the label) — drives grouping + handoff. */
    owner?: CurrentWorkRequirementOwner | null;
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
    /** Owning capability resolved from runtime metadata — drives owner grouping + handoff. */
    owner?: CurrentWorkRequirementOwner | null;
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
    /** Stage operator guidance — supporting content, not a competing primary card. */
    operatorGuidance?: string | null;
    status: CurrentWorkSurfaceStatus;
    statusLabel: string;
    readiness: CurrentWorkReadinessVM;

    progress: CurrentWorkSurfaceProgress;

    checklist: CurrentWorkChecklistItemVM[];

    primaryAction?: CurrentWorkActionVM | null;
    /** Outcome recording CTA — expanded view only (mockup: under work primary). */
    recordOutcomeAction?: CurrentWorkActionVM | null;
    /** Unambiguous execution prominence — never invent Primary Action from work title. */
    execution?: CurrentWorkExecutionVM | null;
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
    /** Unified generic contract for resolving work — configured outcomes + BP transitions (Slice D). */
    resolutions: CurrentWorkResolutionVM[];
    primaryWorkItem: StageWorkItemProjection | null;
    primaryProjection: WorkIntentRuntimeProjection | null;
    runtime: StageWorkRuntimeProjection | null;
    isEmpty: boolean;
};

export type { CurrentWorkExecutionVM } from "./buildCurrentWorkExecutionVM";

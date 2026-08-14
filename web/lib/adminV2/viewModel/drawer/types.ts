import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { FamilyCommunicationWorkspacePreviewVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type {
    DrawerAboveFoldRenderModel,
    DrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/types";
import type {
    DrawerFirstPaintContract,
    DrawerFirstPaintDependencyState,
} from "@/lib/adminV2/viewModel/drawer/firstPaintTypes";

export type OpportunityDrawerFirstPaintViewportSlot =
    | "header"
    | "status"
    | "location"
    | "actions"
    | "tabs"
    | "lifecycle_rail"
    | "lead_summary"
    | "tour_slot"
    | "tasks_summary"
    | "reminders_summary"
    | "inquiry_children";

/** First-viewport data keys for the current Opportunity drawer VM contract. */
export type OpportunityDrawerFirstPaintDependencyKey =
    | "record_visible"
    | "status_definitions"
    | "header_actions"
    | "queue_definition"
    | "tour_bookings"
    | "tasks_preview"
    | "scheduled_sends"
    | "inquiry_children"
    | "scheduling_projection"
    | "attention_bundle";

export type OpportunityDrawerFirstPaintDependencyState =
    DrawerFirstPaintDependencyState<OpportunityDrawerFirstPaintDependencyKey>;

export type OpportunityDrawerFirstPaintContract = DrawerFirstPaintContract<
    OpportunityDrawerFirstPaintDependencyKey,
    OpportunityDrawerFirstPaintViewportSlot
>;

/** Scalar refresh channels allowed after first paint — never layout/structure. */
export type DrawerViewModelBackgroundRefreshKind =
    | "task_status"
    | "scheduled_send_status"
    | "readiness_values"
    | "stage_work";

export type StatusOptionVm = {
    status_key: string;
    label: string;
    sort_order: number;
};

export type StatusMenuItemVm =
    | { kind: "status"; status_key: string; label: string; sort_order: number }
    | { kind: "separator"; label: string }
    | { kind: "stage_heading"; stage_key: string; label: string };

export type StatusControlVm =
    | {
          renderAs: "dropdown";
          status_key: string;
          label: string;
          options: StatusOptionVm[];
          /** When set, drawer shows current-stage statuses first with stage jump groups. */
          progressive_menu?: StatusMenuItemVm[];
      }
    | {
          renderAs: "readonly_pill";
          label: string;
          status_key?: string;
          /** Deferred until progressive status interaction — not shown as dropdown on first paint. */
          options?: StatusOptionVm[];
      }
    | { renderAs: "hidden" };

export type OperTrustPreviewVm = {
    headline: string;
    risk_urgency_hint: OperationalSummaryRiskHint;
};

export type RemindersSummaryVm = {
    state: "ready" | "empty";
    next_follow_up_iso: string | null;
    scheduled_send_count: number;
    scheduled_sends: Array<{
        id: string;
        scheduled_for: string;
        status: string;
        channel: "sms" | "email";
    }>;
};

export type BosSummaryVm = {
    visible: boolean;
    headline: string | null;
    operational_read: string | null;
};

export type AttentionSummaryVm = {
    visible: boolean;
    needs_attention: boolean;
    primary_reason: string | null;
    reason_count: number;
};

/**
 * Load state for the deferred stage-work projection (Current Work region).
 *
 * `stage_work_runtime` is heavy (two `operational_tasks` reads) and does not feed the above-fold
 * render model, so the Tier-1 compose returns it `pending` and a thin canonical resource resolves
 * it after first paint. The Current Work region MUST distinguish `pending` (neutral loading, never
 * "No active work") from `empty` (authoritatively no active work). `error` retains any prior value.
 */
export type StageWorkLoadState =
    | { status: "pending" }
    | { status: "ready"; value: StageWorkRuntimeProjection }
    | { status: "empty" }
    | { status: "error"; retained?: StageWorkRuntimeProjection };

export type OpportunityDrawerViewModel = {
    generation: string;
    structureSettled: true;
    compose_version: string;
    entity: { type: "opportunity"; id: string };
    workspace: {
        department_id: string | null;
        work_unit_id: string | null;
        /** Raw `work_units.queue_definition` JSON (v1 or v2); coerced at read time for lifecycle rail. */
        queue_definition: unknown;
        /**
         * Builder-owned lifecycle stage order when queue_definition is single-lane (per-stage work unit).
         * Matches /settings/lifecycle and dept work-unit pill deck order.
         */
        lifecycle_rail: {
            stages: Array<{ key: string; label: string }>;
            current_stage_key: string | null;
        } | null;
        /** Operating plan purpose for the current builder stage — read-only context. */
        stage_context: {
            stage_key: string;
            stage_label: string;
            purpose: string;
        } | null;
        /** Operating plan work intent runtime for current builder stage (primary item). */
        work_intent_runtime: WorkIntentRuntimeProjection | null;
        /** Full stage work runtime — primary + additional configured work items. */
        stage_work_runtime: StageWorkRuntimeProjection | null;
        /** Published builder stage config for Current Work (operating plan + catalog + field rules). */
        published_stage_inputs?: PublishedStageInputsForCurrentWork | null;
        /**
         * Deferred-load state for the Current Work region. When absent (legacy / full compose that
         * resolved inline) consumers fall back to `stage_work_runtime` presence. When `pending` the
         * Current Work region shows a neutral loading treatment, NOT the empty state.
         */
        stage_work?: StageWorkLoadState;
    };
    first_paint: OpportunityDrawerFirstPaintContract;
    header: {
        title: string;
        subtitle: string | null;
        status: StatusControlVm;
        /** Server-resolved mutate bar (portal admin) — same source legacy uses via AdminAuthProvider. */
        status_can_mutate: boolean;
        oper_trust_preview: OperTrustPreviewVm | null;
    };
    actions: {
        /** Raw `record_header` slot from resolver (generation / parity). */
        header: ResolvedActionForClient[];
        /** Flattened registry actions — BOS command rail and Manage menu (same catalog). */
        header_menu: ResolvedActionForClient[];
        /** Subject-local Manage menu — mirrors header_menu (registry-backed). */
        manage_menu: ResolvedActionForClient[];
        /** Full record_header slots — Current Work supporting actions source. */
        record_header: ResolvedActionsBySlot | null;
    };
    layout: {
        mode: "workflow_v1";
        tabs: DrawerTabKey[];
        default_tab: DrawerTabKey;
        shell: DrawerShellContract;
    };
    activity: {
        communicationsPreviewVm: FamilyCommunicationWorkspacePreviewVM | null;
    };
    above_fold: {
        render_model: DrawerAboveFoldRenderModel;
        /** Paint record with staging sentinels stripped. */
        record: Record<string, unknown>;
    };
    summaries: {
        tasks: InquirySummaryTaskPreviewPayload;
        /** Active tour_bookings rows from first-paint compose (tour block + lifecycle bar). */
            active_tour_bookings: TourBookingRow[];
        reminders: RemindersSummaryVm;
        bos: BosSummaryVm | null;
        attention: AttentionSummaryVm | null;
    };
    background_refresh: {
        allowed: DrawerViewModelBackgroundRefreshKind[];
    };
    timing: {
        compose_ms: number;
        phases_ms: Record<string, number>;
    };
};

/** Canonical Focus Panel VM alias — same compose shape during drawer→Focus Panel migration. */
export type OpportunityFocusPanelViewModel = OpportunityDrawerViewModel;

/**
 * Canonical operational subject VM alias (Phase C). The composed view model for the operational
 * subject currently displayed in the Focus Panel. Same shape as `OpportunityDrawerViewModel`
 * during migration.
 */
export type OperationalSubjectViewModel = OpportunityDrawerViewModel;

export type OpportunityDrawerViewModelSkipped = {
    structureSettled: false;
    reason: "classic_layout_deferred" | "layout_unavailable" | "opportunity_not_found";
    compose_version: string;
};

export type OpportunityDrawerViewModelResult =
    | { ok: true; viewModel: OpportunityDrawerViewModel }
    | { ok: false; skipped: OpportunityDrawerViewModelSkipped };

/** Canonical operational subject VM result alias (Phase C). */
export type OperationalSubjectViewModelResult = OpportunityDrawerViewModelResult;

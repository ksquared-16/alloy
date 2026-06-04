import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
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
    | "readiness_values";

export type StatusOptionVm = {
    status_key: string;
    label: string;
    sort_order: number;
};

export type StatusControlVm =
    | {
          renderAs: "dropdown";
          status_key: string;
          label: string;
          options: StatusOptionVm[];
      }
    | { renderAs: "readonly_pill"; label: string }
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

export type OpportunityDrawerViewModel = {
    generation: string;
    structureSettled: true;
    compose_version: string;
    entity: { type: "opportunity"; id: string };
    workspace: {
        department_id: string | null;
        work_unit_id: string | null;
        queue_definition: QueueDefinitionV1 | null;
    };
    first_paint: OpportunityDrawerFirstPaintContract;
    header: {
        title: string;
        subtitle: string | null;
        status: StatusControlVm;
        oper_trust_preview: OperTrustPreviewVm | null;
    };
    actions: {
        header: ResolvedActionForClient[];
    };
    layout: {
        mode: "workflow_v1";
        tabs: DrawerTabKey[];
        default_tab: DrawerTabKey;
        shell: DrawerShellContract;
    };
    above_fold: {
        render_model: DrawerAboveFoldRenderModel;
        /** Paint record with staging sentinels stripped. */
        record: Record<string, unknown>;
    };
    summaries: {
        tasks: InquirySummaryTaskPreviewPayload;
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

export type OpportunityDrawerViewModelSkipped = {
    structureSettled: false;
    reason: "classic_layout_deferred" | "layout_unavailable" | "opportunity_not_found";
    compose_version: string;
};

export type OpportunityDrawerViewModelResult =
    | { ok: true; viewModel: OpportunityDrawerViewModel }
    | { ok: false; skipped: OpportunityDrawerViewModelSkipped };

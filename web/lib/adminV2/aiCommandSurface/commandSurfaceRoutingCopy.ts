/**
 * Deterministic Orchestrator routing notices (BOS UX Card 13).
 */

import type { CommandSurfaceRouteResult } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import type { CommandSurfaceRouteKind } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import { usingActiveRecordNoticeText } from "@/lib/adminV2/bos/activeOperationalContext";

export const ENTITY_SEARCH_ROUTING_NOTICE = "Looking up matching records for this request.";

export type CommandSurfaceRoutingNoticeInput = {
    route: CommandSurfaceRouteResult;
    /** When Task Assist will use ambient opportunity without search. */
    usingActiveRecord?: boolean;
    activeRecordLabel?: string | null;
};

function workflowAssistRoutingDetail(route: CommandSurfaceRouteResult): string {
    if (route.workflowAssistCreateIntent) {
        return "proposing a disabled workflow draft for admin review";
    }
    const sub = route.workflowAssistReadIntent?.sub_intent;
    switch (sub) {
        case "failed_runs_last_7d":
            return "reviewing workflows that failed recently";
        case "explain_v1":
            return "explaining what a workflow did for this record";
        case "workflow_summary":
            return "summarizing workflows for this workspace";
        case "enrollment_touch":
            return "enrollment workflow context for this request";
        default:
            return "workflow configuration or operational trace for this request";
    }
}

function taskAssistRoutingDetail(route: CommandSurfaceRouteResult): string {
    const intent = route.taskAssistIntent;
    if (intent?.intent_type === "create_reminder") {
        return "operational reminder or follow-up task";
    }
    if (intent?.intent_type === "schedule_message") {
        return "scheduled outbound message";
    }
    if (intent?.intent_type === "draft_message" || intent?.message_goal_text?.trim()) {
        return "outbound message draft";
    }
    if (route.slots.reminder_verb) {
        return "operational reminder or follow-up task";
    }
    if (route.slots.comms_verb) {
        return "outbound message";
    }
    return "family communication or follow-up for this request";
}

function routeSpecialistLabel(kind: CommandSurfaceRouteKind): string {
    switch (kind) {
        case "task_assist":
            return "Task Assist";
        case "workflow_assist":
            return "Workflow Assist";
        case "config_layout_assist":
            return "Config Assist";
        case "job_layout":
            return "Job overview layout";
        default:
            return "Orchestrator";
    }
}

/**
 * One-sentence routing notice after submit (no clarify route).
 */
export function buildCommandSurfaceRoutingNotice(input: CommandSurfaceRoutingNoticeInput): string | null {
    const { route } = input;
    if (route.route === "clarify") return null;

    const specialist = routeSpecialistLabel(route.route);
    let detail: string;
    switch (route.route) {
        case "task_assist":
            detail = taskAssistRoutingDetail(route);
            break;
        case "workflow_assist":
            detail = workflowAssistRoutingDetail(route);
            break;
        case "config_layout_assist":
            detail = "layout or field configuration change";
            break;
        case "job_layout":
            detail = "job overview layout change";
            break;
        default:
            detail = "this request";
    }

    return `Routing to ${specialist} — ${detail}.`;
}

/** Skip generic routing line when Workflow Assist boundary notice carries the explanation. */
export function shouldAppendCommandSurfaceRoutingNotice(route: CommandSurfaceRouteResult): boolean {
    if (route.route === "clarify") return false;
    if (
        route.route === "workflow_assist" &&
        !route.workflowAssistReadIntent &&
        !route.workflowAssistCreateIntent
    ) {
        return false;
    }
    return true;
}

/** Workflow Assist boundary when workflow language did not resolve to a read/create intent. */
export const WORKFLOW_ASSIST_BOUNDARY_NOTICE =
    "This request affects workflow configuration. Workflow Assist can summarize runs, explain outcomes, and propose disabled drafts for review. For outbound messages or reminders, use Task Assist instead.";

/**
 * @deprecated Prefer WORKFLOW_ASSIST_BOUNDARY_NOTICE — kept for router export alias.
 */
export function buildWorkflowAssistBoundaryNotice(): string {
    return WORKFLOW_ASSIST_BOUNDARY_NOTICE;
}

export { usingActiveRecordNoticeText };

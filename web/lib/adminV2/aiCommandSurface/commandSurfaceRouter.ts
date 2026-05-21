/**
 * Orchestrator Agent — routing layer for the AdminV2 command bar (Interaction Layer V1).
 * Parses intent, decides specialist destination; does not execute operational side effects.
 * Product: Orchestrator. Implementation: routeCommandSurface (name retained).
 */

import { looksLikeAmbientOnlyCommand } from "@/lib/agent/taskAssist/taskAssistCommandBarResolution";
import {
    parseTaskAssistCommandIntent,
    type TaskAssistCommandIntent,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";

import { isConfigLayoutAssistLikeCommand } from "@/lib/agent/configLayoutAssist/configLayoutAssistIntent";
import { extractCommandSurfaceSlots, type CommandSurfaceSlots } from "./commandSurfaceSlotExtract";
import {
    parseWorkflowAssistCreateIntent,
    type WorkflowAssistCreateIntentV1,
} from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import {
    parseWorkflowAssistReadIntent,
    type WorkflowAssistReadIntentV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { WORKFLOW_ASSIST_BOUNDARY_NOTICE } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRoutingCopy";

export type CommandSurfaceRouteKind =
    | "workflow_assist"
    | "task_assist"
    | "config_layout_assist"
    | "job_layout"
    | "clarify";

export type CommandSurfaceRouteContext = {
    /** True when drawer / launcher set an opportunity on GlobalAssistantContext. */
    hasAmbientOpportunity?: boolean;
};

export type CommandSurfaceRouteResult = {
    route: CommandSurfaceRouteKind;
    slots: CommandSurfaceSlots;
    taskAssistIntent: TaskAssistCommandIntent | null;
    clarifyMessage: string | null;
    /** Set when `route === "workflow_assist"` (read-only Workflow Assist). */
    workflowAssistReadIntent: WorkflowAssistReadIntentV1 | null;
    /** Set when operator asks to create/propose a workflow draft (Cards 4–5). */
    workflowAssistCreateIntent: WorkflowAssistCreateIntentV1 | null;
};

export const WORKFLOW_ASSIST_NOTICE_TEXT = WORKFLOW_ASSIST_BOUNDARY_NOTICE;
export const WORKFLOW_ASSIST_AUTOMATIONS_HREF = "/adminV2/workflows";

const CLARIFY_DEFAULT =
    "Tell me what you'd like to do — for example, text a family, schedule an email, adjust the job overview layout, or set a reminder.";

function taskAssistSignals(slots: CommandSurfaceSlots, intent: TaskAssistCommandIntent): boolean {
    if (intent.workflow_blocked) return false;
    if (intent.intent_type !== "unknown") return true;
    if (slots.comms_verb || slots.reminder_verb) return true;
    if (slots.entity_search_text && (slots.comms_verb || slots.message_goal_text)) return true;
    return false;
}

function configLayoutAssistSignals(slots: CommandSurfaceSlots, input: string): boolean {
    if (slots.workflow_like || slots.comms_verb || slots.reminder_verb) return false;
    if (slots.config_layout_like) return true;
    return isConfigLayoutAssistLikeCommand(input);
}

/** Read-only workflow queries (summary, failures, explain) beat when/move create-language parsing. */
function workflowReadTakesPrecedenceOverCreate(
    input: string,
    read: WorkflowAssistReadIntentV1
): boolean {
    switch (read.sub_intent) {
        case "failed_runs_last_7d":
        case "explain_v1":
        case "enrollment_touch":
            return true;
        case "workflow_summary":
            return (
                /\b(show|list|summary|which|all)\b/i.test(input) && /\bworkflows?\b/i.test(input)
            );
        default:
            return false;
    }
}

function resolveWorkflowAssistIntents(
    input: string,
    ctx: CommandSurfaceRouteContext
): {
    workflowAssistReadIntent: WorkflowAssistReadIntentV1 | null;
    workflowAssistCreateIntent: WorkflowAssistCreateIntentV1 | null;
} {
    const workflowAssistReadIntent = parseWorkflowAssistReadIntent(input, {
        hasAmbientOpportunity: ctx.hasAmbientOpportunity,
    });
    const createCandidate = parseWorkflowAssistCreateIntent(input);
    if (createCandidate && workflowReadTakesPrecedenceOverCreate(input, workflowAssistReadIntent)) {
        return { workflowAssistReadIntent, workflowAssistCreateIntent: null };
    }
    if (createCandidate) {
        return { workflowAssistReadIntent: null, workflowAssistCreateIntent: createCandidate };
    }
    return { workflowAssistReadIntent, workflowAssistCreateIntent: null };
}

function jobLayoutSignals(slots: CommandSurfaceSlots, intent: TaskAssistCommandIntent): boolean {
    if (intent.workflow_blocked) return false;
    if (slots.layout_verb && !slots.comms_verb && !slots.reminder_verb) return true;
    if (
        slots.layout_verb &&
        intent.intent_type === "unknown" &&
        !slots.entity_search_text
    ) {
        return true;
    }
    return false;
}

/**
 * Orchestrator: route operator NL to the correct specialist without UI mode tabs.
 *
 * Precedence:
 * 1. workflow-like → workflow_assist (read cards or create-proposal notice; create wins over default read summary)
 * 2. comms / reminder / schedule → task_assist (Task Assist specialist)
 * 3. field / section / drawer config → config_layout_assist
 * 4. job / layout overview → job_layout
 * 5. entity-only or ambient pronoun → task_assist (search / confirm)
 * 6. otherwise → clarify
 */
export function routeCommandSurface(
    input: string,
    ctx: CommandSurfaceRouteContext = {}
): CommandSurfaceRouteResult {
    const slots = extractCommandSurfaceSlots(input);
    const taskAssistIntent = parseTaskAssistCommandIntent(input);

    if (slots.workflow_like || taskAssistIntent.workflow_blocked) {
        const { workflowAssistReadIntent, workflowAssistCreateIntent } = resolveWorkflowAssistIntents(
            input,
            ctx
        );
        return {
            route: "workflow_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent,
            workflowAssistCreateIntent,
        };
    }

    if (configLayoutAssistSignals(slots, input)) {
        return {
            route: "config_layout_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
    }

    if (taskAssistSignals(slots, taskAssistIntent)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
    }

    if (ctx.hasAmbientOpportunity && looksLikeAmbientOnlyCommand(input)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
    }

    if (jobLayoutSignals(slots, taskAssistIntent)) {
        return {
            route: "job_layout",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
    }

    if (slots.entity_search_text) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
    }

    return {
        route: "clarify",
        slots,
        taskAssistIntent,
        clarifyMessage: CLARIFY_DEFAULT,
        workflowAssistReadIntent: null,
        workflowAssistCreateIntent: null,
    };
}

/** Entity search `q` — prefer slot extract, fall back to intent hint. */
export function commandSurfaceEntitySearchQuery(
    input: string,
    slots: CommandSurfaceSlots,
    intent: TaskAssistCommandIntent | null
): string {
    const fromSlots = slots.entity_search_text?.trim() ?? "";
    if (fromSlots.length >= 2) return fromSlots;
    const fromIntent = intent?.search_text_hint?.trim() ?? "";
    if (fromIntent.length >= 2) return fromIntent;
    return input.trim().slice(0, 64);
}

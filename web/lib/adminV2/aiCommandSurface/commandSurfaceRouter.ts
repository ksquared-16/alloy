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
    parseWorkflowAssistReadIntent,
    type WorkflowAssistReadIntentV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";

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
};

export const WORKFLOW_ASSIST_NOTICE_TEXT =
    "That's a workflow configuration request. Workflow Assist is coming next — read-only for now.";
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
 * 1. workflow-like → workflow_assist (Workflow Assist read-only cards)
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
        const workflowAssistReadIntent = parseWorkflowAssistReadIntent(input, {
            hasAmbientOpportunity: ctx.hasAmbientOpportunity,
        });
        return {
            route: "workflow_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent,
        };
    }

    if (configLayoutAssistSignals(slots, input)) {
        return {
            route: "config_layout_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
        };
    }

    if (taskAssistSignals(slots, taskAssistIntent)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
        };
    }

    if (ctx.hasAmbientOpportunity && looksLikeAmbientOnlyCommand(input)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
        };
    }

    if (jobLayoutSignals(slots, taskAssistIntent)) {
        return {
            route: "job_layout",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
        };
    }

    if (slots.entity_search_text) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
            workflowAssistReadIntent: null,
        };
    }

    return {
        route: "clarify",
        slots,
        taskAssistIntent,
        clarifyMessage: CLARIFY_DEFAULT,
        workflowAssistReadIntent: null,
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

/**
 * Interaction Layer V1 — unified command surface router (no LLM, no visible modes).
 */

import { looksLikeAmbientOnlyCommand } from "@/lib/agent/taskAssist/taskAssistCommandBarResolution";
import {
    parseTaskAssistCommandIntent,
    type TaskAssistCommandIntent,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";

import { extractCommandSurfaceSlots, type CommandSurfaceSlots } from "./commandSurfaceSlotExtract";

export type CommandSurfaceRouteKind = "workflow_assist_notice" | "task_assist" | "job_layout" | "clarify";

export type CommandSurfaceRouteContext = {
    /** True when drawer / launcher set an opportunity on GlobalAssistantContext. */
    hasAmbientOpportunity?: boolean;
};

export type CommandSurfaceRouteResult = {
    route: CommandSurfaceRouteKind;
    slots: CommandSurfaceSlots;
    taskAssistIntent: TaskAssistCommandIntent | null;
    clarifyMessage: string | null;
};

export const WORKFLOW_ASSIST_NOTICE_TEXT =
    "That sounds like Workflow Assist. This is coming next. Task Assist can draft messages, schedule sends, and create reminders for an opportunity — try rephrasing without automation rules.";

const CLARIFY_DEFAULT =
    "Tell me what you'd like to do — for example, text a family, schedule an email, adjust the job overview layout, or set a reminder.";

function taskAssistSignals(slots: CommandSurfaceSlots, intent: TaskAssistCommandIntent): boolean {
    if (intent.workflow_blocked) return false;
    if (intent.intent_type !== "unknown") return true;
    if (slots.comms_verb || slots.reminder_verb) return true;
    if (slots.entity_search_text && (slots.comms_verb || slots.message_goal_text)) return true;
    return false;
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
 * Route operator NL to the correct assistant capability without UI mode tabs.
 *
 * Precedence:
 * 1. workflow-like → workflow_assist_notice
 * 2. comms / reminder / schedule → task_assist
 * 3. job / layout overview → job_layout
 * 4. entity-only or ambient pronoun → task_assist (search / confirm)
 * 5. otherwise → clarify
 */
export function routeCommandSurface(
    input: string,
    ctx: CommandSurfaceRouteContext = {}
): CommandSurfaceRouteResult {
    const slots = extractCommandSurfaceSlots(input);
    const taskAssistIntent = parseTaskAssistCommandIntent(input);

    if (slots.workflow_like || taskAssistIntent.workflow_blocked) {
        return {
            route: "workflow_assist_notice",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
        };
    }

    if (taskAssistSignals(slots, taskAssistIntent)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
        };
    }

    if (ctx.hasAmbientOpportunity && looksLikeAmbientOnlyCommand(input)) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
        };
    }

    if (jobLayoutSignals(slots, taskAssistIntent)) {
        return {
            route: "job_layout",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
        };
    }

    if (slots.entity_search_text) {
        return {
            route: "task_assist",
            slots,
            taskAssistIntent,
            clarifyMessage: null,
        };
    }

    return {
        route: "clarify",
        slots,
        taskAssistIntent,
        clarifyMessage: CLARIFY_DEFAULT,
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

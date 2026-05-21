/**
 * Task Assist → Operational Proposal frame copy (BOS UX coherence Cards 8–9).
 */

import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

export function taskAssistDraftProposalTitle(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.intent_type === "schedule_message") return "Schedule outbound message";
    return "Send outbound message";
}

export function taskAssistDraftProposalTypeLabel(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.intent_type === "schedule_message") return "Scheduled message";
    return "Message draft";
}

export function taskAssistDraftProposalSummary(
    channel: "sms" | "email",
    instruction: string
): string {
    const ch = channel === "email" ? "Email" : "SMS";
    const goal = instruction.trim();
    return goal ? `${ch} · ${goal}` : ch;
}

export function taskAssistDraftMutationBoundaryCopy(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.intent_type === "schedule_message") {
        return "Nothing sends until you confirm Schedule send or Send now. Pick a future send time for scheduling.";
    }
    return "Nothing sends until you confirm Send now or schedule.";
}

export function taskAssistReminderProposalTitle(bootstrap: TaskAssistCommandBootstrap): string {
    return bootstrap.reminder_title?.trim() || "Follow up";
}

export const TASK_ASSIST_REMINDER_PROPOSAL_TYPE_LABEL = "Reminder proposal";

export const TASK_ASSIST_PROPOSAL_SOURCE_LABEL = "Task Assist";

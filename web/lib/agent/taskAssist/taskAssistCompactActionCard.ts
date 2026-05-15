import type { TaskAssistCommandBootstrap, TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { buildTaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

export type TaskAssistCompactAction = "draft_message" | "send_now" | "schedule_later" | "create_reminder";

export function taskAssistFollowUpNoticeText(
    candidate: TaskAssistEntitySearchCandidate,
    locationLabel?: string | null,
    intent?: TaskAssistCommandIntent | null
): string {
    const loc = locationLabel?.trim() || candidate.disambiguation?.location_name?.trim() || null;
    const atLoc = loc ? ` at ${loc}` : "";
    const label = candidate.label?.trim() || "this record";
    if (intent?.intent_type === "create_reminder") {
        const when = intent.timing_hint_text?.trim();
        const whenPart = when ? ` for ${when}` : "";
        return `I found ${label}${atLoc}. I can create a follow-up reminder${whenPart}. Review and create reminder.`;
    }
    if (intent?.intent_type === "schedule_message") {
        return `I found ${label}${atLoc}. I drafted a message for review — choose a send time before anything goes out.`;
    }
    return `I found ${label}${atLoc}. I drafted a message for review — confirm before anything sends.`;
}

export function bootstrapForTaskAssistCompactAction(
    intent: TaskAssistCommandIntent | null,
    action: TaskAssistCompactAction
): TaskAssistCommandBootstrap {
    const base = intent ? buildTaskAssistCommandBootstrap(intent) : buildTaskAssistCommandBootstrap({
        intent_type: "draft_message",
        channel_hint: null,
        timing_hint_text: null,
        message_goal_text: null,
        search_text_hint: null,
        confidence: "low",
        warnings: [],
        workflow_blocked: false,
    });

    switch (action) {
        case "send_now":
            return { ...base, intent_type: "draft_message", open_schedule: false };
        case "schedule_later":
            return { ...base, intent_type: "schedule_message", open_schedule: true };
        case "create_reminder":
            return {
                ...base,
                intent_type: "create_reminder",
                open_schedule: false,
                reminder_title: base.reminder_title ?? base.instruction ?? "Follow up",
                reminder_due_hint: base.timing_hint_text ?? base.reminder_due_hint,
            };
        case "draft_message":
        default:
            return { ...base, intent_type: "draft_message", open_schedule: false };
    }
}

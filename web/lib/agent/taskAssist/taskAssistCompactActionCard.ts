import type { TaskAssistCommandBootstrap, TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { buildTaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import {
    taskAssistFollowUpNoticeText,
    taskAssistReminderCreatedNotice,
} from "@/lib/agent/taskAssist/taskAssistOrchestratorCopy";

export type TaskAssistCompactAction = "draft_message" | "send_now" | "schedule_later" | "create_reminder";

export { taskAssistFollowUpNoticeText, taskAssistReminderCreatedNotice };

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

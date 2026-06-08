import type { CommandSurfaceSlots } from "@/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract";
import type { TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

export type TaskAssistClarificationKind = "message_goal" | "reminder_what" | "reminder_when";

export type TaskAssistClarificationChip = {
    id: string;
    label: string;
    /** Fills message_goal_text / reminder instruction */
    goalText?: string;
    /** Fills timing_hint_text */
    timingText?: string;
};

export const MESSAGE_GOAL_CHIPS: TaskAssistClarificationChip[] = [
    { id: "follow_up", label: "Follow up", goalText: "Follow up on their inquiry" },
    { id: "tour_steps", label: "Tour next steps", goalText: "Share tour next steps and scheduling options" },
    { id: "paperwork", label: "Missing paperwork", goalText: "Remind them about missing enrollment paperwork" },
    { id: "custom", label: "Custom message", goalText: "" },
];

export function needsMessageGoalClarification(
    intent: TaskAssistCommandIntent | null,
    slots?: CommandSurfaceSlots
): boolean {
    if (!intent) return false;
    if (intent.intent_type !== "draft_message" && intent.intent_type !== "schedule_message") return false;
    if (intent.message_goal_text?.trim()) return false;
    return (slots?.comms_verb ?? false) || intent.intent_type === "draft_message" || intent.intent_type === "schedule_message";
}

export function needsReminderWhatClarification(intent: TaskAssistCommandIntent | null): boolean {
    if (intent?.intent_type !== "create_reminder") return false;
    const goal = intent.message_goal_text?.trim() ?? "";
    if (goal.length >= 3) return false;
    return true;
}

export function needsReminderWhenClarification(intent: TaskAssistCommandIntent | null): boolean {
    if (intent?.intent_type !== "create_reminder") return false;
    return !intent.timing_hint_text?.trim();
}

export function reminderClarificationKind(intent: TaskAssistCommandIntent | null): TaskAssistClarificationKind | null {
    if (needsReminderWhatClarification(intent)) return "reminder_what";
    if (needsReminderWhenClarification(intent)) return "reminder_when";
    return null;
}

export function clarificationPromptText(kind: TaskAssistClarificationKind): string {
    switch (kind) {
        case "message_goal":
            return "What would you like to tell them?";
        case "reminder_what":
            return "What should I remind you to do?";
        case "reminder_when":
            return "When should I remind you?";
        default:
            return "Could you add a bit more detail?";
    }
}

export function mergeClarificationIntoIntent(
    intent: TaskAssistCommandIntent,
    patch: { goalText?: string | null; timingText?: string | null }
): TaskAssistCommandIntent {
    return {
        ...intent,
        message_goal_text: patch.goalText?.trim() ? patch.goalText.trim() : intent.message_goal_text,
        timing_hint_text: patch.timingText?.trim() ? patch.timingText.trim() : intent.timing_hint_text,
    };
}

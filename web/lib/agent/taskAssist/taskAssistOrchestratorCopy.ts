import type { TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { formatResolvedTimingLabel } from "@/lib/agent/taskAssist/taskAssistTimingResolve";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

export function taskAssistCandidateListPrompt(count: number): string {
    if (count <= 1) return "Confirm which record to use.";
    return `Found ${count} matching records. Select one to continue.`;
}

export function taskAssistFollowUpNoticeText(
    candidate: TaskAssistEntitySearchCandidate,
    _locationLabel?: string | null,
    intent?: TaskAssistCommandIntent | null
): string {
    const label = candidate.label?.trim() || "this record";
    if (intent?.intent_type === "create_reminder") {
        const when = formatResolvedTimingLabel(intent.timing_hint_text) || intent.timing_hint_text?.trim();
        return when ? `Follow-up reminder ready for ${when}.` : `Follow-up reminder ready for ${label}.`;
    }
    if (intent?.intent_type === "schedule_message") {
        const when = formatResolvedTimingLabel(intent.timing_hint_text);
        return when ?
                `Message draft ready for ${label}. Scheduled for ${when} — review before send.`
            :   `Message draft ready for ${label}. Pick a send time before anything goes out.`;
    }
    return `Message draft ready for ${label}. Review before send.`;
}

export function taskAssistReminderCreatedNotice(_title?: string): string {
    return "Reminder created. View task.";
}

"use client";

import {
    MESSAGE_GOAL_CHIPS,
    clarificationPromptText,
    type TaskAssistClarificationKind,
} from "@/lib/agent/taskAssist/taskAssistClarification";

export type TaskAssistClarificationCardProps = {
    kind: TaskAssistClarificationKind;
    disabled?: boolean;
    onChip: (payload: { goalText?: string; timingText?: string; custom?: boolean }) => void;
};

const REMINDER_WHEN_CHIPS = [
    { id: "tomorrow_9", label: "Tomorrow 9am", timingText: "tomorrow at 9am" },
    { id: "monday_9", label: "Monday 9am", timingText: "Monday at 9am" },
    { id: "next_week", label: "Next week", timingText: "next week" },
];

export default function TaskAssistClarificationCard({ kind, disabled, onChip }: TaskAssistClarificationCardProps) {
    const chips =
        kind === "message_goal" ? MESSAGE_GOAL_CHIPS
        : kind === "reminder_when" ? REMINDER_WHEN_CHIPS
        : [];

    return (
        <div className="space-y-2" data-task-assist-clarification={kind}>
            <p className="text-[12px] font-medium text-alloy-midnight/85">{clarificationPromptText(kind)}</p>
            {chips.length ? (
                <div className="flex flex-wrap gap-1">
                    {chips.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            disabled={disabled}
                            data-task-assist-clarification-chip={c.id}
                            className="rounded-full border border-alloy-stone/25 bg-white px-2.5 py-1 text-[10px] font-semibold text-alloy-midnight/80 hover:bg-alloy-stone/[0.06] disabled:opacity-45"
                            onClick={() =>
                                onChip({
                                    goalText: "goalText" in c ? c.goalText : undefined,
                                    timingText: "timingText" in c ? c.timingText : undefined,
                                    custom: c.id === "custom",
                                })
                            }
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            ) : null}
            {kind === "reminder_what" || kind === "message_goal" ? (
                <p className="text-[10px] text-alloy-midnight/55">Or type your answer in the command bar below.</p>
            ) : null}
        </div>
    );
}

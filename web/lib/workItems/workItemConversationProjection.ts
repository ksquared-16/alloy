import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

export type WorkItemConversationEntry = {
    id: string;
    role: "operator" | "system" | "bos";
    text: string;
    at?: string;
};

export function projectWorkItemConversation(task: MyTasksTaskRow): {
    entries: WorkItemConversationEntry[];
    composerMode: "note_only" | "bos_deferred";
} {
    const entries: WorkItemConversationEntry[] = [];

    if (task.description?.trim()) {
        entries.push({
            id: "note-primary",
            role: "operator",
            text: task.description.trim(),
            at: task.created_at,
        });
    }

    if (task.source?.trim().toLowerCase() === "task_assist") {
        entries.push({
            id: "bos-hint",
            role: "bos",
            text: "Created from a BOS Task Assist path. Thread history remains on the linked record until Work Item conversation persistence ships.",
        });
    }

    if (entries.length === 0) {
        entries.push({
            id: "empty",
            role: "system",
            text: "No notes or conversation history yet. Add a note from the task actions below.",
        });
    }

    return { entries, composerMode: "note_only" };
}

"use client";

import { useMemo } from "react";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { projectWorkItemConversation } from "@/lib/workItems/workItemConversationProjection";

export default function WorkItemConversationPanel({ task }: { task: MyTasksTaskRow }) {
    const projection = useMemo(() => projectWorkItemConversation(task), [task]);

    return (
        <div className="space-y-3" data-work-items-conversation-panel="true">
            <ul className="space-y-2">
                {projection.entries.map((entry) => (
                    <li
                        key={entry.id}
                        className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${
                            entry.role === "operator" ?
                                "bg-alloy-juniper/[0.08] text-alloy-midnight/82"
                            : entry.role === "bos" ?
                                "border border-alloy-juniper/20 bg-alloy-juniper/[0.04] text-alloy-midnight/72"
                            :   "border border-alloy-stone/15 bg-alloy-stone/[0.03] text-alloy-midnight/62"
                        }`}
                        data-work-item-conversation-role={entry.role}
                    >
                        {entry.text}
                    </li>
                ))}
            </ul>
            <footer className="rounded-md border border-alloy-stone/18 bg-alloy-stone/[0.03] px-2.5 py-2 text-[10px] text-alloy-midnight/55">
                {projection.composerMode === "note_only" ?
                    "Notes can be updated via Edit in the task actions below. BOS thread composer remains deferred."
                :   "Conversation composer deferred."}
            </footer>
        </div>
    );
}

"use client";

import { useMemo } from "react";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { projectWorkItemActivity } from "@/lib/workItems/workItemActivityProjection";

export default function WorkItemActivityPanel({ task }: { task: MyTasksTaskRow }) {
    const entries = useMemo(() => projectWorkItemActivity(task), [task]);

    return (
        <div className="space-y-2" data-work-items-activity-panel="true">
            <ul className="space-y-2">
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className="rounded-lg border border-alloy-stone/16 bg-white px-3 py-2 text-[11px]"
                        data-work-item-activity-kind={entry.kind}
                    >
                        <p className="font-semibold text-alloy-midnight/78">{entry.label}</p>
                        {entry.detail ? <p className="mt-0.5 text-alloy-midnight/58">{entry.detail}</p> : null}
                        {entry.at ? <p className="mt-0.5 text-[10px] text-alloy-midnight/42">{entry.at}</p> : null}
                    </li>
                ))}
            </ul>
        </div>
    );
}

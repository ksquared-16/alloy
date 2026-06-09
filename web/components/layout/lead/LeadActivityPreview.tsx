"use client";

import { Activity, Calendar, CheckSquare2, MessageSquare, StickyNote } from "lucide-react";
import type { LeadActivityPreviewEntry } from "@/lib/layout/runtime/resolveLeadActivityPreview";

type Props = {
    entries: LeadActivityPreviewEntry[];
};

function EntryIcon({ kind }: { kind: LeadActivityPreviewEntry["kind"] }) {
    switch (kind) {
        case "note":
            return <StickyNote className="h-3 w-3" aria-hidden />;
        case "communication":
            return <MessageSquare className="h-3 w-3" aria-hidden />;
        case "task":
            return <CheckSquare2 className="h-3 w-3" aria-hidden />;
        case "created":
        case "updated":
            return <Calendar className="h-3 w-3" aria-hidden />;
        default:
            return <Activity className="h-3 w-3" aria-hidden />;
    }
}

/** Graceful activity preview — real VM/layout-record entries only. */
export default function LeadActivityPreview({ entries }: Props) {
    if (entries.length === 0) {
        return (
            <div
                className="rounded-md border border-dashed border-alloy-stone/15 bg-alloy-stone/[0.02] px-3 py-4 text-center"
                data-lead-activity-preview="true"
                data-lead-activity-preview-empty="true"
            >
                <p className="text-[11px] text-alloy-midnight/40">No recent activity yet</p>
            </div>
        );
    }

    return (
        <ul className="flex flex-col gap-2" data-lead-activity-preview="true">
            {entries.map((entry, index) => (
                <li
                    key={`${entry.kind}-${index}`}
                    className="flex items-start gap-2 rounded-md border border-alloy-stone/10 bg-white px-2.5 py-2"
                    data-lead-activity-preview-entry="true"
                    data-lead-activity-preview-kind={entry.kind}
                >
                    <span className="mt-0.5 shrink-0 text-alloy-juniper/70">
                        <EntryIcon kind={entry.kind} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                {entry.label}
                            </span>
                            {entry.at ?
                                <span className="shrink-0 text-[10px] text-alloy-midnight/40">{entry.at}</span>
                            :   null}
                        </div>
                        {entry.detail ?
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/75">
                                {entry.detail}
                            </p>
                        :   null}
                    </div>
                </li>
            ))}
        </ul>
    );
}

"use client";

import { Activity, Calendar, CheckSquare2, MessageSquare, StickyNote } from "lucide-react";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import type { LeadActivityPreviewEntry } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import {
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    entries: LeadActivityPreviewEntry[];
    onViewAll?: () => void;
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
export default function LeadActivityPreview({ entries, onViewAll }: Props) {
    if (entries.length === 0) {
        return (
            <div data-lead-activity-preview="true" data-lead-activity-preview-empty="true">
                <DrawerOverviewEmptyState
                    message="No activity yet"
                    hint="The first note, message, or action will appear here."
                    action={
                        onViewAll ?
                            <button
                                type="button"
                                onClick={onViewAll}
                                className="text-[11px] font-semibold text-alloy-blue hover:underline"
                                data-lead-activity-preview-view-all="true"
                            >
                                View all activity
                            </button>
                        :   null
                    }
                    compact
                />
            </div>
        );
    }

    return (
        <div className="space-y-2" data-lead-activity-preview="true">
            <ul className="flex flex-col gap-2">
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
                                <span className={PRESENTATION_LABEL}>
                                    {entry.label}
                                </span>
                                {entry.at ?
                                    <span className={`shrink-0 ${PRESENTATION_SUPPORTING}`}>{entry.at}</span>
                                :   null}
                            </div>
                            {entry.detail ?
                                <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/82">
                                    {entry.detail}
                                </p>
                            :   null}
                        </div>
                    </li>
                ))}
            </ul>
            {onViewAll ?
                <button
                    type="button"
                    onClick={onViewAll}
                    className="text-[11px] font-semibold text-alloy-blue hover:underline"
                    data-lead-activity-preview-view-all="true"
                >
                    View all activity
                </button>
            :   null}
        </div>
    );
}

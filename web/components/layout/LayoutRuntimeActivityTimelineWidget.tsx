"use client";

import { Activity, Calendar, CheckSquare2, MessageSquare, StickyNote } from "lucide-react";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import type { ActivityTimelineDisplayMode } from "@/lib/layout/layoutEditorActivityTimelineConfig";
import type { ActivityTimelineEntry } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import {
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";
import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";

type Props = {
    entries: ActivityTimelineEntry[];
    displayMode: ActivityTimelineDisplayMode;
    onViewAll?: () => void;
};

function EntryIcon({ eventType }: { eventType: ActivityTimelineEntry["eventType"] }) {
    switch (eventType) {
        case "notes":
            return <StickyNote className="h-3 w-3" aria-hidden />;
        case "communications":
            return <MessageSquare className="h-3 w-3" aria-hidden />;
        case "tasks_work":
            return <CheckSquare2 className="h-3 w-3" aria-hidden />;
        case "created":
        case "updated":
        case "profile_changes":
            return <Calendar className="h-3 w-3" aria-hidden />;
        default:
            return <Activity className="h-3 w-3" aria-hidden />;
    }
}

function formatAt(raw: string | null, timeZone: string): string | null {
    if (!raw) return null;
    // Already formatted by resolver when timezone was provided; still safe to re-run —
    // non-parseable display strings pass through unchanged.
    return formatActivityTimestamp(raw, { timeZone }) || raw;
}

function TimelineEntryBody({ entry, timeZone }: { entry: ActivityTimelineEntry; timeZone: string }) {
    const at = formatAt(entry.at, timeZone);
    return (
        <>
            <div className="flex items-baseline justify-between gap-2">
                <span className={PRESENTATION_LABEL}>{entry.title}</span>
                {at ?
                    <span className={`shrink-0 ${PRESENTATION_SUPPORTING}`}>{at}</span>
                :   null}
            </div>
            {entry.detail ?
                <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/82 whitespace-pre-line">
                    {entry.detail}
                </p>
            :   null}
            {entry.actorLabel ?
                <p className="mt-0.5 text-[10px] text-alloy-midnight/50">{entry.actorLabel}</p>
            :   null}
            {entry.source === "related" && entry.relatedScope ?
                <p className="mt-0.5 text-[10px] text-alloy-midnight/45">Related · {entry.relatedScope}</p>
            :   null}
        </>
    );
}

/** Shared Activity Timeline renderer — skins consistently across drawer surfaces. */
export default function LayoutRuntimeActivityTimelineWidget({
    entries,
    displayMode,
    onViewAll,
}: Props) {
    const timeZone = useAdminViewerTimezone();

    if (entries.length === 0) {
        return (
            <div
                data-layout-runtime-activity-timeline="true"
                data-layout-runtime-activity-timeline-empty="true"
                data-layout-runtime-activity-timeline-mode={displayMode}
            >
                <DrawerOverviewEmptyState
                    message="No activity yet"
                    hint="Status changes, messages, notes, and other record events will appear here."
                    action={
                        onViewAll ?
                            <button
                                type="button"
                                onClick={onViewAll}
                                className="text-[11px] font-semibold text-alloy-blue hover:underline"
                                data-layout-runtime-activity-timeline-view-all="true"
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

    if (displayMode === "horizontal_timeline") {
        return (
            <div
                className="w-full min-w-0 overflow-x-auto"
                data-layout-runtime-activity-timeline="true"
                data-layout-runtime-activity-timeline-mode="horizontal_timeline"
            >
                <ol className="flex min-w-max items-stretch gap-3 pb-1">
                    {entries.map((entry) => (
                        <li
                            key={entry.id}
                            className="flex w-44 shrink-0 flex-col rounded-md border border-alloy-stone/10 bg-white px-2.5 py-2"
                            data-layout-runtime-activity-timeline-entry="true"
                            data-layout-runtime-activity-timeline-entry-id={entry.id}
                        >
                            <span className="mb-1 text-alloy-juniper/70">
                                <EntryIcon eventType={entry.eventType} />
                            </span>
                            <TimelineEntryBody entry={entry} timeZone={timeZone} />
                        </li>
                    ))}
                </ol>
                {onViewAll ?
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="mt-2 text-[11px] font-semibold text-alloy-blue hover:underline"
                        data-layout-runtime-activity-timeline-view-all="true"
                    >
                        View all activity
                    </button>
                :   null}
            </div>
        );
    }

    if (displayMode === "compact_feed") {
        return (
            <div
                className="w-full min-w-0 space-y-1.5"
                data-layout-runtime-activity-timeline="true"
                data-layout-runtime-activity-timeline-mode="compact_feed"
            >
                <ul className="divide-y divide-alloy-stone/10 rounded-md border border-alloy-stone/10 bg-white">
                    {entries.map((entry) => (
                        <li
                            key={entry.id}
                            className="flex items-start gap-2 px-2.5 py-2"
                            data-layout-runtime-activity-timeline-entry="true"
                            data-layout-runtime-activity-timeline-entry-id={entry.id}
                        >
                            <span className="mt-0.5 shrink-0 text-alloy-juniper/70">
                                <EntryIcon eventType={entry.eventType} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <TimelineEntryBody entry={entry} timeZone={timeZone} />
                            </div>
                        </li>
                    ))}
                </ul>
                {onViewAll ?
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="text-[11px] font-semibold text-alloy-blue hover:underline"
                        data-layout-runtime-activity-timeline-view-all="true"
                    >
                        View all activity
                    </button>
                :   null}
            </div>
        );
    }

    return (
        <div
            className="w-full min-w-0 space-y-2"
            data-layout-runtime-activity-timeline="true"
            data-layout-runtime-activity-timeline-mode="vertical_timeline"
        >
            <ul className="relative flex flex-col gap-3 pl-3 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-alloy-stone/20">
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className="relative flex items-start gap-2"
                        data-layout-runtime-activity-timeline-entry="true"
                        data-layout-runtime-activity-timeline-entry-id={entry.id}
                    >
                        <span className="absolute -left-3 mt-1.5 h-2 w-2 rounded-full border border-alloy-stone/30 bg-white" />
                        <div className="min-w-0 flex-1 rounded-md border border-alloy-stone/10 bg-white px-2.5 py-2">
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 text-alloy-juniper/70">
                                    <EntryIcon eventType={entry.eventType} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <TimelineEntryBody entry={entry} timeZone={timeZone} />
                                </div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
            {onViewAll ?
                <button
                    type="button"
                    onClick={onViewAll}
                    className="text-[11px] font-semibold text-alloy-blue hover:underline"
                    data-layout-runtime-activity-timeline-view-all="true"
                >
                    View all activity
                </button>
            :   null}
        </div>
    );
}

"use client";

import LayoutRuntimeActivityTimelineWidget from "@/components/layout/LayoutRuntimeActivityTimelineWidget";
import { queueRecordActivityTimelineConfig } from "@/lib/layout/runtime/queueRecordWidgetConfig";
import { resolveLayoutRuntimeActivityTimeline } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    config?: { displayMode?: "compact" | "card"; maxItems?: number; [key: string]: unknown };
};

/** Compact Activity Timeline for operational queue rows — shared resolver + renderer. */
export default function QueueRecordActivityTimelineWidget({ record, title = "Activity", config }: Props) {
    const timelineConfig = queueRecordActivityTimelineConfig(config);
    const entries = resolveLayoutRuntimeActivityTimeline({
        record,
        surfaceKey: "opportunity_drawer",
        config: timelineConfig,
    });

    return (
        <div
            className="queue-record-widget queue-record-widget--activity-timeline"
            data-queue-activity-timeline-widget="true"
            data-queue-row-interactive="true"
            data-queue-activity-timeline-count={String(entries.length)}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="queue-record-widget__label">{title}</div>
            <div className="queue-record-widget__body">
                <LayoutRuntimeActivityTimelineWidget entries={entries} displayMode="compact_feed" />
            </div>
        </div>
    );
}

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { LeadActivityPreviewEntry, LeadActivityPreviewKind } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import {
    defaultActivityTimelineConfigForSurface,
    type LayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";
import {
    resolveLayoutRuntimeActivityTimeline,
    type ActivityTimelineEntry,
} from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";

import type { CurrentWorkActivityPreviewItem } from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";

export type CanonicalActivityItemVM = LeadActivityPreviewEntry;

const KIND_CATEGORY: Record<LeadActivityPreviewKind, string> = {
    note: "Record update",
    communication: "Communication",
    task: "Scheduled actions",
    activity: "Process progression",
    created: "Record update",
    updated: "Record update",
};

function timelineEventToPreviewKind(eventType: ActivityTimelineEntry["eventType"]): LeadActivityPreviewKind {
    if (eventType === "communications") return "communication";
    if (eventType === "notes") return "note";
    if (eventType === "tasks_work") return "task";
    if (eventType === "created") return "created";
    if (eventType === "updated") return "updated";
    return "activity";
}

function toPreviewItem(entry: LeadActivityPreviewEntry): CurrentWorkActivityPreviewItem {
    return {
        label: entry.detail ?? entry.label,
        detail: entry.detail && entry.label !== entry.detail ? entry.label : null,
        category: KIND_CATEGORY[entry.kind] ?? "Record update",
        kind: entry.kind,
        occurredAt: entry.at,
    };
}

/**
 * Canonical What's Next activity feed — same source + newest-first order as Activity tab.
 * Always goes through {@link resolveLayoutRuntimeActivityTimeline} (workflow events when present,
 * otherwise lead/person/child preview with canonical atSortKey sorting).
 */
export function resolveCanonicalCurrentWorkActivityEntries(
    record: ProofRuntimeRecord,
    options?: { timeZone?: string; limit?: number },
): LeadActivityPreviewEntry[] {
    const limit = options?.limit ?? 3;
    const config: LayoutEditorActivityTimelineConfig = {
        ...defaultActivityTimelineConfigForSurface("opportunity_drawer"),
        displayMode: "vertical_timeline",
        timelineDirection: "newest_first",
        maxItems: Math.max(limit, 24),
    };
    const timeline = resolveLayoutRuntimeActivityTimeline({
        record,
        surfaceKey: "opportunity_drawer",
        config,
    });
    return timeline.slice(0, limit).map((entry) => ({
        kind: timelineEventToPreviewKind(entry.eventType),
        label: entry.title,
        detail: entry.detail,
        at: entry.at,
        atSortKey: entry.atSortKey,
    }));
}

/** Prefer newest-first canonical source for What's Next / Recent activity. */
export function buildCurrentWorkActivityPreviewItems(input: {
    activityItems?: CanonicalActivityItemVM[];
    context: OperationalContext;
    currentWorkId?: string;
    workTemplateKey?: string;
    limit?: number;
    /** Resolved operator timezone (canonical local-time doctrine); UTC only if absent. */
    timeZone?: string;
}): CurrentWorkActivityPreviewItem[] {
    const limit = input.limit ?? 3;
    const canonical =
        input.activityItems
        ?? resolveCanonicalCurrentWorkActivityEntries(
            input.context.truth as ProofRuntimeRecord,
            { timeZone: input.timeZone, limit },
        );

    const items = canonical.map(toPreviewItem);

    if (items.length > 0) {
        return items.slice(0, limit);
    }

    if (input.context.signals.tour.scheduled && input.context.signals.tour.startAt) {
        return [
            {
                label: "Tour scheduled",
                detail: input.context.signals.tour.statusLabel ?? undefined,
                category: "Scheduled actions",
                kind: "task",
                occurredAt:
                    formatActivityTimestamp(
                        input.context.signals.tour.startAt,
                        input.timeZone ? { timeZone: input.timeZone } : undefined,
                    ) || input.context.signals.tour.startAt,
            },
        ];
    }

    return [];
}

/** Back-compat wrapper for card callers that pass OperationalContext directly. */
export function buildCurrentWorkActivityPreviewItemsFromContext(
    context: OperationalContext,
    options?: { currentWorkId?: string; workTemplateKey?: string; limit?: number; timeZone?: string },
): CurrentWorkActivityPreviewItem[] {
    return buildCurrentWorkActivityPreviewItems({
        context,
        currentWorkId: options?.currentWorkId,
        workTemplateKey: options?.workTemplateKey,
        limit: options?.limit,
        timeZone: options?.timeZone,
    });
}

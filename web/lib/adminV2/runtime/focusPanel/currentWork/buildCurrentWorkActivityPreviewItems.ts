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

/**
 * Secondary category only when the item has no operator detail line.
 * Never use category as a substitute for what happened (headline stays the event title).
 */
const KIND_CATEGORY: Record<LeadActivityPreviewKind, string> = {
    note: "Note",
    communication: "Communication",
    task: "Work",
    activity: "Enrollment",
    created: "Record",
    updated: "Record",
};

function timelineEventToPreviewKind(eventType: ActivityTimelineEntry["eventType"]): LeadActivityPreviewKind {
    if (eventType === "communications" || eventType === "appointments_tours") return "communication";
    if (eventType === "notes") return "note";
    if (eventType === "tasks_work") return "task";
    if (eventType === "created") return "created";
    if (eventType === "updated") return "updated";
    if (eventType === "lifecycle" || eventType === "status_change") return "activity";
    return "activity";
}

/**
 * Headline = what happened (timeline title). Detail = supporting fact.
 * Never promote detail/work-template copy into the headline.
 */
function toPreviewItem(entry: LeadActivityPreviewEntry): CurrentWorkActivityPreviewItem {
    const detail = entry.detail?.trim() || null;
    return {
        id: entry.id ?? null,
        label: entry.label,
        detail,
        category: detail ? null : (KIND_CATEGORY[entry.kind] ?? null),
        kind: entry.kind,
        occurredAt: entry.at,
    };
}

function preferTourScheduledTimelineEntries(
    entries: ActivityTimelineEntry[],
    limit: number,
): ActivityTimelineEntry[] {
    if (limit <= 0 || entries.length <= limit) return entries.slice(0, Math.max(0, limit));
    const head = entries.slice(0, limit);
    const isScheduled = (e: ActivityTimelineEntry) =>
        e.eventType === "appointments_tours"
        && /tour scheduled/i.test(e.title);
    if (head.some(isScheduled)) return head;
    const scheduled = entries.find(isScheduled);
    if (!scheduled) return head;
    const out = [...head];
    let replaceAt = out.length - 1;
    for (let i = out.length - 1; i >= 0; i -= 1) {
        if (/tour invitation sent/i.test(out[i]?.title ?? "")) {
            replaceAt = i;
            break;
        }
    }
    out[replaceAt] = scheduled;
    return out;
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
        timeZone: options?.timeZone,
    });
    // Newest-first compact subset — keep Tour scheduled visible when invitation spam would starve it.
    return preferTourScheduledTimelineEntries(timeline, limit).map((entry) => ({
        /*
         * NAMESPACE THE CANONICAL ID BY ITS SOURCE.
         *
         * `entry.id` is the canonical event row id when one exists, and the SAME row id can appear
         * both as a direct event and under a related scope. Namespacing by source keeps two
         * legitimately separate rows separate without deduplicating either of them.
         */
        id: `${entry.source}:${entry.relatedScope ?? "direct"}:${entry.id}`,
        kind: timelineEventToPreviewKind(entry.eventType),
        label: entry.title,
        detail: entry.detail,
        at: entry.at
            ? (
                // Already formatted when timeZone was provided to the timeline resolver.
                options?.timeZone
                    ? entry.at
                    : formatActivityTimestamp(entry.at, options?.timeZone ? { timeZone: options.timeZone } : undefined)
                        || entry.at
            )
            : null,
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

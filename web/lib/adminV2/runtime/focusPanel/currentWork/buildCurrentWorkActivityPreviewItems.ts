import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { LeadActivityPreviewEntry, LeadActivityPreviewKind } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
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

function toPreviewItem(entry: LeadActivityPreviewEntry): CurrentWorkActivityPreviewItem {
    return {
        label: entry.detail ?? entry.label,
        detail: entry.detail && entry.label !== entry.detail ? entry.label : null,
        category: KIND_CATEGORY[entry.kind] ?? "Record update",
        kind: entry.kind,
        occurredAt: entry.at,
    };
}

/** Prefer newest-first source order for What's Next / Recent activity (not kind priority). */
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
        ?? resolveLeadActivityPreview(input.context.truth as ProofRuntimeRecord, input.timeZone);

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

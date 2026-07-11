import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { LeadActivityPreviewEntry, LeadActivityPreviewKind } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

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

const KIND_PRIORITY: Record<LeadActivityPreviewKind, number> = {
    activity: 1,
    communication: 2,
    task: 3,
    note: 4,
    updated: 5,
    created: 6,
};

function kindPriority(kind: LeadActivityPreviewKind): number {
    return KIND_PRIORITY[kind] ?? 99;
}

function toPreviewItem(entry: LeadActivityPreviewEntry): CurrentWorkActivityPreviewItem {
    return {
        label: entry.detail ?? entry.label,
        detail: entry.detail && entry.label !== entry.detail ? entry.label : null,
        category: KIND_CATEGORY[entry.kind] ?? "Record update",
        occurredAt: entry.at,
    };
}

/** Prioritize Current Work-related events, then fall back to recent canonical record activity. */
export function buildCurrentWorkActivityPreviewItems(input: {
    activityItems?: CanonicalActivityItemVM[];
    context: OperationalContext;
    currentWorkId?: string;
    workTemplateKey?: string;
    limit?: number;
}): CurrentWorkActivityPreviewItem[] {
    const limit = input.limit ?? 5;
    const canonical =
        input.activityItems
        ?? resolveLeadActivityPreview(input.context.truth as ProofRuntimeRecord);

    const sorted = [...canonical].sort((a, b) => kindPriority(a.kind) - kindPriority(b.kind));
    const items = sorted.map(toPreviewItem);

    if (items.length > 0) {
        return items.slice(0, limit);
    }

    if (input.context.signals.tour.scheduled && input.context.signals.tour.startAt) {
        return [
            {
                label: "Tour scheduled",
                detail: input.context.signals.tour.statusLabel ?? undefined,
                category: "Scheduled actions",
                occurredAt: input.context.signals.tour.startAt,
            },
        ];
    }

    return [];
}

/** Back-compat wrapper for card callers that pass OperationalContext directly. */
export function buildCurrentWorkActivityPreviewItemsFromContext(
    context: OperationalContext,
    options?: { currentWorkId?: string; workTemplateKey?: string; limit?: number },
): CurrentWorkActivityPreviewItem[] {
    return buildCurrentWorkActivityPreviewItems({
        context,
        currentWorkId: options?.currentWorkId,
        workTemplateKey: options?.workTemplateKey,
        limit: options?.limit,
    });
}

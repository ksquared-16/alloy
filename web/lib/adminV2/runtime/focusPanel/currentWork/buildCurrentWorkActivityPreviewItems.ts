import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

import type { CurrentWorkActivityPreviewItem } from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";

/** Build a small recent-activity list for the Current Work inline preview (not Activity mode). */
export function buildCurrentWorkActivityPreviewItems(context: OperationalContext): CurrentWorkActivityPreviewItem[] {
    const items: CurrentWorkActivityPreviewItem[] = [];

    if (context.signals.tour.scheduled && context.signals.tour.startAt) {
        items.push({
            label: "Tour scheduled",
            detail: context.signals.tour.statusLabel ?? undefined,
            occurredAt: context.signals.tour.startAt,
        });
    }

    for (const task of context.signals.work.items.filter((row) => row.kind === "task").slice(0, 3)) {
        items.push({
            label: task.label,
            detail: task.dueLabel ?? task.source ?? undefined,
            occurredAt: task.dueAt,
        });
    }

    if (context.signals.communications.nextFollowUpAt) {
        items.push({
            label: "Follow-up scheduled",
            occurredAt: context.signals.communications.nextFollowUpAt,
        });
    }

    if (items.length === 0 && context.signals.work.primary) {
        items.push({
            label: context.signals.work.primary.label,
            detail: context.signals.work.primary.dueLabel ?? "Open work",
        });
    }

    return items.slice(0, 5);
}

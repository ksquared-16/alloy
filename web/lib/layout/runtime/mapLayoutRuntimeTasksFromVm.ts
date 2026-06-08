/**
 * Map VM task preview payload → layout runtime widget rows.
 */

import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

export type LayoutRuntimeTaskRow = {
    id: string;
    label: string;
    title: string;
    due?: string;
    status?: string;
    source?: string;
};

/** Normalize open tasks from VM record for layout runtime widgets. */
export function mapLayoutRuntimeTasksFromVm(vmRecord: Record<string, unknown>): LayoutRuntimeTaskRow[] {
    const preview = parseInquirySummaryTaskPreview(vmRecord);
    if (preview?.open_tasks.length) {
        return preview.open_tasks.map((t) => ({
            id: t.id,
            label: t.title,
            title: t.title,
            due: t.due_at || undefined,
            status: t.status,
            source: t.source,
        }));
    }

    const legacy = vmRecord._tasks_preview;
    if (!Array.isArray(legacy)) return [];

    return legacy
        .map((raw, index): LayoutRuntimeTaskRow | null => {
            if (!raw || typeof raw !== "object") return null;
            const o = raw as Record<string, unknown>;
            const title = String(o.title ?? o.label ?? o.name ?? "").trim();
            if (!title) return null;
            const due = o.due_at ?? o.due ?? o.when ?? o.at;
            const id = String(o.id ?? `layout-task-${index}`).trim();
            return {
                id,
                label: title,
                title,
                ...(due != null ? { due: String(due) } : {}),
                status: o.status != null ? String(o.status) : undefined,
                source: o.source != null ? String(o.source) : undefined,
            };
        })
        .filter((r): r is LayoutRuntimeTaskRow => r != null);
}

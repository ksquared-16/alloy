/**
 * Read-only business-language projection of work scope for a perspective lane.
 * Until filters_v1 metadata ships, derives from synced queue definition + stage membership.
 */

import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

export type PerspectiveWorkIncludedChip = {
    field: string;
    operator: string;
    value: string;
};

function readQueueRow(raw: unknown, queueKey: string): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object") return null;
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return null;
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const row = q as Record<string, unknown>;
        if (String(row.key ?? "") === queueKey) return row;
    }
    return null;
}

function formatFilterChip(filter: unknown): PerspectiveWorkIncludedChip | null {
    if (!filter || typeof filter !== "object") return null;
    const f = filter as Record<string, unknown>;
    const type = String(f.type ?? "").trim();
    if (type === "status" || type === "case_status") {
        const values = Array.isArray(f.values) ? f.values.map(String).join(", ") : String(f.values ?? "");
        return { field: "Status", operator: "is", value: values || "Any" };
    }
    if (type === "field") {
        const key = String(f.field_key ?? "").replace(/_/g, " ");
        return { field: key || "Field", operator: String(f.operator ?? "equals"), value: String(f.value ?? "") };
    }
    if (type === "date") {
        return { field: String(f.field ?? "Date").replace(/_/g, " "), operator: String(f.operator ?? "is"), value: "Today" };
    }
    return null;
}

/** Project human-readable work-included chips from lane queue definition filters. */
export function projectPerspectiveWorkIncludedChips(
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null,
    queueKey: string,
    stageStatusLabels?: string[],
): PerspectiveWorkIncludedChip[] {
    const chips: PerspectiveWorkIncludedChip[] = [];
    const row = readQueueRow(pipeline?.queueDefinitionRaw, queueKey);
    const filters = Array.isArray(row?.filters) ? row.filters : [];
    for (const filter of filters) {
        const chip = formatFilterChip(filter);
        if (chip) chips.push(chip);
    }
    if (!chips.length && stageStatusLabels?.length) {
        chips.push({
            field: "Status",
            operator: "is",
            value: stageStatusLabels.slice(0, 4).join(", ") + (stageStatusLabels.length > 4 ? "…" : ""),
        });
    }
    if (!chips.length) {
        chips.push({ field: "Records", operator: "in", value: "This stage's synced queue lane" });
    }
    return chips;
}

export function projectPerspectiveSortLabel(
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null,
    queueKey: string,
): string {
    const row = readQueueRow(pipeline?.queueDefinitionRaw, queueKey);
    const sort = Array.isArray(row?.sort) ? row.sort[0] : null;
    if (!sort || typeof sort !== "object") return "Updated (newest first)";
    const field = String((sort as { field?: unknown }).field ?? "updated_at").replace(/_/g, " ");
    const dir = String((sort as { direction?: unknown }).direction ?? "desc");
    return `${field.charAt(0).toUpperCase()}${field.slice(1)} (${dir === "asc" ? "oldest first" : "newest first"})`;
}

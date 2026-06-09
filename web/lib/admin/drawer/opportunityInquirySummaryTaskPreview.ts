import type { SupabaseClient } from "@supabase/supabase-js";

export type InquirySummaryTaskPreviewRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
};

/** Shell-owned open tasks for inquiry summary right column (drawer_visible / drawer_primary). */
export type InquirySummaryTaskPreviewPayload = {
    state: "loaded";
    open_tasks: InquirySummaryTaskPreviewRow[];
    open_count: number;
};

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

/**
 * Lightweight open-task preview — single indexed query, no scheduled sends.
 * Reminders stay client-side on full-bound operational strip.
 */
export async function attachOpportunityInquirySummaryTaskPreview(
    supabase: SupabaseClient,
    orgId: string,
    host: Record<string, unknown>,
): Promise<void> {
    const opportunityId = trimOrNull(host.id);
    if (!opportunityId) {
        host._inquiry_summary_tasks = { state: "loaded", open_tasks: [], open_count: 0 } satisfies InquirySummaryTaskPreviewPayload;
        return;
    }
    const { data, error } = await supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .eq("status", "open")
        .order("due_at", { ascending: true })
        .limit(6);
    if (error) {
        host._inquiry_summary_tasks = { state: "loaded", open_tasks: [], open_count: 0 } satisfies InquirySummaryTaskPreviewPayload;
        return;
    }
    const open_tasks = ((data ?? []) as InquirySummaryTaskPreviewRow[]).map((r) => ({
        id: String(r.id ?? "").trim(),
        title: trimOrNull(r.title) ?? "Task",
        due_at: String(r.due_at ?? ""),
        status: trimOrNull(r.status) ?? "open",
        source: trimOrNull(r.source) ?? "",
    })).filter((r) => r.id);
    host._inquiry_summary_tasks = {
        state: "loaded",
        open_tasks,
        open_count: open_tasks.length,
    };
}

function readInquirySummaryTasksRaw(record: Record<string, unknown>): unknown {
    if (record._inquiry_summary_tasks != null) return record._inquiry_summary_tasks;
    const overview = record._overview_data;
    if (overview && typeof overview === "object" && !Array.isArray(overview)) {
        const nested = (overview as Record<string, unknown>)._inquiry_summary_tasks;
        if (nested != null) return nested;
    }
    return null;
}

export function parseInquirySummaryTaskPreview(
    record: Record<string, unknown> | null | undefined,
): InquirySummaryTaskPreviewPayload | null {
    if (!record || typeof record !== "object") return null;
    const raw = readInquirySummaryTasksRaw(record);
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.state !== "loaded") return null;
    const tasks = Array.isArray(o.open_tasks) ? o.open_tasks : [];
    const open_tasks: InquirySummaryTaskPreviewRow[] = [];
    for (const t of tasks) {
        if (!t || typeof t !== "object") continue;
        const row = t as Record<string, unknown>;
        const id = trimOrNull(row.id);
        if (!id) continue;
        open_tasks.push({
            id,
            title: trimOrNull(row.title) ?? "Task",
            due_at: String(row.due_at ?? ""),
            status: trimOrNull(row.status) ?? "open",
            source: trimOrNull(row.source) ?? "",
        });
    }
    return {
        state: "loaded",
        open_tasks,
        open_count:
            typeof o.open_count === "number" && Number.isFinite(o.open_count) ?
                Math.max(0, Math.floor(o.open_count))
            :   open_tasks.length,
    };
}

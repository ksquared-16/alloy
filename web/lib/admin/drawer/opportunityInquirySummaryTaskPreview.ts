import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";

export type InquirySummaryTaskPreviewRow = {
    id: string;
    title: string;
    due_at: string;
    status: string;
    source: string;
    work_intent_key?: string;
    operating_plan_template_key?: string;
    lifecycle_stage_key?: string;
    lifecycle_provenance?: string;
    attempt_count?: number;
    last_outcome_label?: string;
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
        .select("id, title, due_at, status, source, metadata")
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
    const open_tasks = ((data ?? []) as Array<Record<string, unknown>>)
        .map((r) => mapTaskPreviewRow(r))
        .filter((r): r is InquirySummaryTaskPreviewRow => Boolean(r?.id));
    host._inquiry_summary_tasks = {
        state: "loaded",
        open_tasks,
        open_count: open_tasks.length,
    };
}

function readAttemptCount(metadata: Record<string, unknown>): number | undefined {
    const raw = metadata.attempt_count;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        return Math.floor(raw);
    }
    return undefined;
}

function mapTaskPreviewRow(raw: Record<string, unknown>): InquirySummaryTaskPreviewRow | null {
    const id = trimOrNull(raw.id);
    if (!id) return null;
    const metadata =
        raw.metadata != null && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
            ? (raw.metadata as Record<string, unknown>)
            : {};
    const taskRow = {
        id,
        org_id: "",
        entity_type: "opportunities",
        entity_id: null,
        assigned_to_user_id: null,
        created_by: "",
        title: trimOrNull(raw.title) ?? "Task",
        description: null,
        due_at: String(raw.due_at ?? ""),
        status: trimOrNull(raw.status) ?? "open",
        source: trimOrNull(raw.source) ?? "",
        proposal_id: null,
        metadata,
        created_at: "",
        updated_at: "",
    } satisfies OperationalTaskRow;
    const work = parseOperationalWorkViewFromTaskRow(taskRow);
    const row: InquirySummaryTaskPreviewRow = {
        id,
        title: trimOrNull(raw.title) ?? "Task",
        due_at: String(raw.due_at ?? ""),
        status: trimOrNull(raw.status) ?? "open",
        source: trimOrNull(raw.source) ?? "",
    };
    const workIntentKey = trimOrNull(metadata.work_intent_key);
    if (workIntentKey) row.work_intent_key = workIntentKey;
    const operatingPlanTemplateKey = trimOrNull(metadata.operating_plan_template_key);
    if (operatingPlanTemplateKey) row.operating_plan_template_key = operatingPlanTemplateKey;
    const lifecycleStageKey =
        trimOrNull(metadata.lifecycle_stage_key) ?? trimOrNull(work.context_snapshot?.lifecycle_stage_key);
    if (lifecycleStageKey) row.lifecycle_stage_key = lifecycleStageKey;
    const lifecycleProvenance = trimOrNull(metadata.lifecycle_provenance) ?? work.provenance.source;
    if (lifecycleProvenance) row.lifecycle_provenance = lifecycleProvenance;
    const attemptCount = readAttemptCount(metadata);
    if (attemptCount != null) row.attempt_count = attemptCount;
    const lastOutcomeLabel = trimOrNull(metadata.last_outcome_label);
    if (lastOutcomeLabel) row.last_outcome_label = lastOutcomeLabel;
    return row;
}

function mapParsedTaskPreviewRow(row: Record<string, unknown>): InquirySummaryTaskPreviewRow | null {
    const id = trimOrNull(row.id);
    if (!id) return null;
    const mapped: InquirySummaryTaskPreviewRow = {
        id,
        title: trimOrNull(row.title) ?? "Task",
        due_at: String(row.due_at ?? ""),
        status: trimOrNull(row.status) ?? "open",
        source: trimOrNull(row.source) ?? "",
    };
    const workIntentKey = trimOrNull(row.work_intent_key);
    if (workIntentKey) mapped.work_intent_key = workIntentKey;
    const operatingPlanTemplateKey = trimOrNull(row.operating_plan_template_key);
    if (operatingPlanTemplateKey) mapped.operating_plan_template_key = operatingPlanTemplateKey;
    const lifecycleStageKey = trimOrNull(row.lifecycle_stage_key);
    if (lifecycleStageKey) mapped.lifecycle_stage_key = lifecycleStageKey;
    const lifecycleProvenance = trimOrNull(row.lifecycle_provenance);
    if (lifecycleProvenance) mapped.lifecycle_provenance = lifecycleProvenance;
    if (typeof row.attempt_count === "number" && Number.isFinite(row.attempt_count)) {
        mapped.attempt_count = Math.max(0, Math.floor(row.attempt_count));
    }
    const lastOutcomeLabel = trimOrNull(row.last_outcome_label);
    if (lastOutcomeLabel) mapped.last_outcome_label = lastOutcomeLabel;
    return mapped;
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
        const mapped = mapParsedTaskPreviewRow(t as Record<string, unknown>);
        if (mapped) open_tasks.push(mapped);
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

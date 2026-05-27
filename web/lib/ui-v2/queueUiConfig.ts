import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";

export type QueueUiTone = "standard" | "attention" | "critical";
export type QueueUiLayout = "pipeline_with_attention" | "single_section";
export type QueueUiRowPreviewVariant = "crm_compact" | "basic";
export type QueueUiRowPreviewField =
    | "title"
    | "status"
    | "primary_contact"
    | "phone"
    | "email"
    | "child_name"
    | "program"
    | "desired_start_date"
    | "tour_date";
export type QueueUiRowPreviewAction =
    | "open"
    | "call"
    | "email"
    | "message"
    | "orchestrator"
    | "update_status";

/** Default captions for CRM compact row groups; override via queue definition `ui.row_preview.field_labels`. */
export const DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS: Record<string, string> = {
    title: "Title",
    status: "Status",
    primary_contact: "Contact",
    phone: "Phone",
    email: "Email",
    child_name: "Child",
    program: "Program",
    /** Inline label before program per child (e.g. `Program: Preschool`). */
    program_inline: "Program",
    /** CRM compact section heading above desired start + tour row. */
    timing: "Timing",
    /** CRM compact section above multi- or single-child rows with program. */
    children_programs: "Children / Programs",
    desired_start_date: "Desired Start Date",
    tour_date: "Tour",
    age_band: "Age band",
    room: "Room",
};

export function mergeQueueRowPreviewFieldLabels(override?: Record<string, string> | null): Record<string, string> {
    return { ...DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS, ...(override ?? {}) };
}

export function getQueueRowPreviewFieldLabel(ui: QueueUiConfig, key: string): string {
    return ui.row_preview.fieldLabels[key] ?? DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS[key] ?? key;
}

export type QueueUiSection = {
    key: string;
    label: string;
    tone?: QueueUiTone;
    queue_keys: string[];
};

export type QueueUiConfig = {
    layout: QueueUiLayout;
    primary_total_label?: string;
    primary_total_queue?: string;
    sections: QueueUiSection[];
    row_preview: {
        variant: QueueUiRowPreviewVariant;
        fields: QueueUiRowPreviewField[];
        actions: QueueUiRowPreviewAction[];
        /** Resolved labels for CRM compact groups (defaults + optional queue `ui.row_preview.field_labels`). */
        fieldLabels: Record<string, string>;
    };
};

function uniqPreserve(xs: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of xs) {
        const k = x.trim();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

export function getQueueUiConfig(def: QueueDefinitionV1): QueueUiConfig {
    const allKeys = def.queues.map((q) => q.key);

    const ui = (def as QueueDefinitionV1 & { ui?: unknown }).ui as
        | {
              layout?: QueueUiLayout;
              primary_total_label?: string;
              primary_total_queue?: string;
              sections?: QueueUiSection[];
              /** JSON queue defs use `field_labels`; resolved config uses camelCase `fieldLabels`. */
              row_preview?: Partial<QueueUiConfig["row_preview"]> & { field_labels?: Record<string, string> };
          }
        | undefined;

    const fallback: QueueUiConfig = {
        layout: "single_section",
        primary_total_label: undefined,
        primary_total_queue: undefined,
        sections: [{ key: "all", label: "Queues", queue_keys: allKeys }],
        row_preview: { variant: "basic", fields: ["title", "status"], actions: ["open"], fieldLabels: mergeQueueRowPreviewFieldLabels() },
    };

    if (!ui) return fallback;

    const sections =
        Array.isArray(ui.sections) && ui.sections.length
            ? ui.sections
                  .map((s) => ({
                      key: String(s.key ?? "").trim(),
                      label: String(s.label ?? "").trim(),
                      tone: s.tone,
                      queue_keys: uniqPreserve((Array.isArray(s.queue_keys) ? s.queue_keys : []).map(String)),
                  }))
                  .filter((s) => s.key && s.label && s.queue_keys.length > 0)
            : fallback.sections;

    const row_preview = ui.row_preview ?? {};
    const variant = row_preview.variant === "crm_compact" ? "crm_compact" : "basic";
    const fields = Array.isArray(row_preview.fields) && row_preview.fields.length ? row_preview.fields : fallback.row_preview.fields;
    const actions =
        Array.isArray(row_preview.actions) && row_preview.actions.length ? row_preview.actions : fallback.row_preview.actions;
    const labelOverride =
        row_preview.field_labels && typeof row_preview.field_labels === "object"
            ? row_preview.field_labels
            : row_preview.fieldLabels && typeof row_preview.fieldLabels === "object"
              ? row_preview.fieldLabels
              : null;
    const fieldLabels = mergeQueueRowPreviewFieldLabels(labelOverride);

    return {
        layout: ui.layout === "pipeline_with_attention" ? "pipeline_with_attention" : "single_section",
        primary_total_label: ui.primary_total_label,
        primary_total_queue: ui.primary_total_queue,
        sections,
        row_preview: { variant, fields, actions, fieldLabels },
    };
}

export function queuePrimaryTotalFromSummaries(params: {
    ui: QueueUiConfig;
    summaries: Array<{ key: string; count: number | null | undefined }>;
}): number | null {
    const target = (params.ui.primary_total_queue ?? "").trim();
    if (!target) return null;
    const q = params.summaries.find((s) => s.key === target);
    if (!q) return null;
    return q.count ?? 0;
}

export function partitionQueueUiSections(ui: QueueUiConfig): {
    throughput: QueueUiSection[];
    attention: QueueUiSection[];
} {
    const attention = ui.sections.filter((s) => s.tone === "critical");
    const throughput = ui.sections.filter((s) => s.tone !== "critical");
    return { throughput, attention };
}


import type { EntityDrawerFieldConfig, EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { ReactNode } from "react";

/** Tokens in `record_layouts.config_json.overview_rows` → canonical `EntityDrawerFieldConfig.key` values. */
export const SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY: Record<string, string> = {
    start_at: "start_at",
    assigned_vendor: "assigned_vendor_id",
    status: "status_key",
    customer_name: "_customer_name",
    phone: "_contact_phone",
    email: "_contact_email",
    address: "_location_label",
    service: "service_type",
    price: "price_cents",
};

/** Human-readable labels for layout tokens (config-driven; stable for owners + future tooling). */
const SCHEDULE_ROW_TOKEN_LABELS: Record<string, string> = {
    start_at: "Start time",
    assigned_vendor: "Assigned vendor",
    status: "Status",
    customer_name: "Account",
    phone: "Phone",
    email: "Email",
    address: "Address",
    service: "Service",
    price: "Price",
};

export function resolveScheduleOverviewRowFieldKey(token: string): string {
    const t = token.trim();
    return SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY[t] ?? t;
}

export function scheduleOverviewRowTokenLabel(token: string): string {
    const t = token.trim();
    if (SCHEDULE_ROW_TOKEN_LABELS[t]) return SCHEDULE_ROW_TOKEN_LABELS[t]!;
    const k = resolveScheduleOverviewRowFieldKey(token);
    if (k !== t) return k.replace(/^_/g, "").replace(/_/g, " ");
    return t
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function flattenOverviewFieldIndex(sections: EntityDrawerSectionConfig[]): Map<string, EntityDrawerFieldConfig> {
    const m = new Map<string, EntityDrawerFieldConfig>();
    for (const s of sections) {
        for (const f of s.fields ?? []) m.set(f.key, f);
        for (const sub of s.subsections ?? []) {
            for (const f of sub.fields ?? []) m.set(f.key, f);
        }
    }
    return m;
}

export function collectScheduleRowResolvedKeys(rows: string[][]): Set<string> {
    const keys = new Set<string>();
    for (const row of rows) {
        for (const tok of row) {
            keys.add(resolveScheduleOverviewRowFieldKey(tok));
        }
    }
    return keys;
}

/**
 * Drops fields placed in the row grid from section configs; removes unified status section when status is in rows.
 */
export function scheduleSectionsAfterRowExtraction(
    sections: EntityDrawerSectionConfig[],
    rowKeys: Set<string>,
    customSectionContent: Record<string, ReactNode>
): EntityDrawerSectionConfig[] {
    const out: EntityDrawerSectionConfig[] = [];
    for (const s of sections) {
        if (s.key === "__unified_status" && rowKeys.has("status_key")) {
            continue;
        }
        const fields = (s.fields ?? []).filter((f) => !rowKeys.has(f.key));
        const subsections = s.subsections
            ?.map((sub) => ({
                ...sub,
                fields: (sub.fields ?? []).filter((f) => !rowKeys.has(f.key)),
            }))
            .filter((sub) => (sub.fields?.length ?? 0) > 0);
        const next: EntityDrawerSectionConfig = { ...s, fields, subsections };
        const hasTop = (next.fields?.length ?? 0) > 0;
        const hasSubs = (next.subsections?.length ?? 0) > 0;
        const hasCustom = customSectionContent[next.key] != null;
        if (hasTop || hasSubs || hasCustom) out.push(next);
    }
    return out;
}

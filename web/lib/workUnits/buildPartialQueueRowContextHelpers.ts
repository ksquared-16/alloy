/**
 * Shared helpers for case-grain and child-grain QueueRowContext builders.
 */

import type {
    LifecycleSubjectType,
    QueueRowContext,
    QueueRowCountUnit,
    QueueRowNextBestAction,
} from "@/lib/workUnits/lifecycleSubjectContracts";

export type PartialQueueRowContextQueueMeta = {
    key: string;
    label: string;
    lifecycle_key?: string;
    stage_key?: string;
    /**
     * Declared membership grain for this queue lane.
     * Defaults to `case` — honest for current production paths.
     */
    subject_grain?: LifecycleSubjectType;
    count_unit?: QueueRowCountUnit;
    location_scope_source?: string | null;
    included_disposition_keys?: readonly string[];
};

/**
 * Target boring case labels — full mapping ships with case status migration (phase 5).
 * Until then, pipeline keys may still appear on case_status_label.
 */
export function resolveBoringCaseStatusLabel(statusKey: string, fallbackLabel: string): string {
    const k = statusKey.trim().toLowerCase();
    switch (k) {
        case "open":
        case "new_inquiry":
        case "new":
            return "Active";
        case "closed":
        case "lost":
            return "Closed";
        case "archived":
            return "Archived";
        case "inactive":
            return "Inactive";
        default:
            return fallbackLabel;
    }
}

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

export function buildAttentionSummary(row: Record<string, unknown>): QueueRowContext["attention_summary"] {
    const needs =
        row._needs_attention === true ||
        (typeof row._attention_reason === "string" && row._attention_reason.trim() !== "");
    if (!needs) return null;

    const label =
        trimOrNull(row._attention_reason_label) ??
        trimOrNull(row._attention_reason) ??
        null;

    return {
        needs_attention: true,
        primary_reason_label: label,
    };
}

export function buildWorkSummary(row: Record<string, unknown>): QueueRowContext["work_summary"] {
    const preview = row._operational_summary_preview;
    if (preview == null || typeof preview !== "object" || Array.isArray(preview)) {
        return null;
    }
    const p = preview as Record<string, unknown>;
    const headline = trimOrNull(p.headline) ?? trimOrNull(p.primary_label);
    const openCountRaw = p.open_count ?? p.open_items_count;
    const openCount =
        typeof openCountRaw === "number" && Number.isFinite(openCountRaw)
            ? Math.max(0, Math.floor(openCountRaw))
            : headline
              ? 1
              : 0;
    if (!openCount && !headline) return null;
    return {
        open_count: openCount,
        primary_open_label: headline,
    };
}

export function buildNextBestAction(row: Record<string, unknown>): QueueRowNextBestAction | null {
    const preview = row._operational_recommendation_preview;
    if (preview == null || typeof preview !== "object" || Array.isArray(preview)) {
        return null;
    }
    const p = preview as Record<string, unknown>;
    const label = trimOrNull(p.suggested_action_label) ?? trimOrNull(p.headline);
    if (!label) return null;
    const actionKey = trimOrNull(p.suggested_action_key) ?? undefined;
    return {
        label,
        action_key: actionKey,
        source: "recommendation",
    };
}

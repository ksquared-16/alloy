import { BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL } from "@/lib/lifecycle/businessProcessUiLabels";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    WORK_VIEW_FILTER_FIELD_OPTIONS,
    WORK_VIEW_FILTER_OPERATOR_OPTIONS,
    type WorkViewConfigV1Stored,
    type WorkViewFilterV1,
} from "@/lib/lifecycle/workViewsConfigV1";

function fieldLabel(fieldKey: string): string {
    return WORK_VIEW_FILTER_FIELD_OPTIONS.find((f) => f.key === fieldKey)?.label ?? fieldKey;
}

function operatorLabel(operator: string): string {
    return WORK_VIEW_FILTER_OPERATOR_OPTIONS.find((o) => o.value === operator)?.label ?? operator;
}

function formatFilterValue(value: unknown): string {
    if (value == null || value === "") return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const raw = String(value).trim();
    if (!raw) return "";
    if (raw === "today") return "Today";
    if (raw === "tomorrow") return "Tomorrow";
    if (raw === "this_week") return "This week";
    if (raw === "next_week") return "Next week";
    if (raw.startsWith("relative:")) {
        const parts = raw.split(":");
        if (parts.length >= 4) {
            const direction = parts[1] === "previous" ? "Previous" : "Next";
            return `${direction} ${parts[2]} ${parts[3]}`;
        }
    }
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatWorkViewConditionsSummary(filters: WorkViewFilterV1[] | undefined): string {
    if (!filters?.length) return "No conditions";
    const first = filters[0]!;
    const field = fieldLabel(first.field_key);
    const op = operatorLabel(first.operator);
    const valuePart = formatFilterValue(first.value);
    const needsValue = !["is_empty", "is_not_empty"].includes(first.operator);
    const core =
        needsValue && valuePart ? `${field} ${op} ${valuePart}` : `${field} ${op}`;
    const suffix = filters.length > 1 ? ` (+${filters.length - 1})` : "";
    return `${core}${suffix}`;
}

function layoutDisplayName(layoutId: string | undefined, layouts: EntityLayoutRecord[]): string {
    if (!layoutId?.trim()) return BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL;
    const record = layouts.find((l) => l.id === layoutId);
    if (!record) return "Custom layout";
    return formatLayoutTitleWithVersion(record.name, record.version);
}

export function formatWorkViewPresentationSummary(
    queueLayoutId: string | undefined,
    focusPanelLayoutId: string | undefined,
    layouts: EntityLayoutRecord[],
): string {
    const queue = layoutDisplayName(queueLayoutId, layouts);
    const focus = layoutDisplayName(focusPanelLayoutId, layouts);
    return `Queue: ${queue} · Focus Panel: ${focus}`;
}

export function formatWorkViewVisibilitySummary(view: Pick<WorkViewConfigV1Stored, "visible_in_runtime" | "display_order">): string {
    const vis = view.visible_in_runtime !== false ? "Visible" : "Hidden";
    return `${vis} · Order ${view.display_order ?? 1}`;
}

export function formatWorkViewBasicsSummary(mission: string | undefined): string {
    const trimmed = mission?.trim();
    if (trimmed) return trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed;
    return "Name and purpose";
}

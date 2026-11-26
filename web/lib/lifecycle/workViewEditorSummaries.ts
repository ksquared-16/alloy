import { BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL } from "@/lib/lifecycle/businessProcessUiLabels";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import type { WorkViewConfigV1Stored, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { WORK_VIEW_CATCH_ALL_SUMMARY, WORK_VIEW_FILTER_OPERATOR_OPTIONS } from "@/lib/lifecycle/workViewsConfigV1";
import { getWorkViewConditionField } from "@/lib/lifecycle/workViewConditionFieldRegistry";
import { formatRelativeDateTokenLabel } from "@/lib/lifecycle/workViewFilterValueControls";

function fieldLabel(fieldKey: string): string {
    return getWorkViewConditionField(fieldKey)?.label ?? fieldKey;
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
    // Relative date tokens are `prev:14:days` / `next:1:months` — the format the value control writes
    // and the evaluator reads. This used to look for a `relative:` prefix that NOTHING in the codebase
    // has ever written, so a perfectly good dynamic condition summarised as "Prev:14:days" and read as
    // broken configuration. `formatRelativeDateTokenLabel` is the one formatter for these.
    const relative = formatRelativeDateTokenLabel(raw);
    if (relative) return relative;
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatWorkViewConditionsSummary(filters: WorkViewFilterV1[] | undefined): string {
    if (!filters?.length) return WORK_VIEW_CATCH_ALL_SUMMARY;
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
    // "Drawer body", not "Focus Panel": this id drives the legacy opportunity-drawer-body
    // runtime. The Focus Panel resolves its own surface by published variant and never reads
    // an assigned layout id, so naming it here claimed an effect the assignment does not have.
    return `Queue: ${queue} · Drawer body: ${focus}`;
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

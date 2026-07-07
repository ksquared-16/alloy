/**
 * Process-level Work Views (Configuration Runtime).
 * Stored on `lifecycle_builder_v1.processes[].work_views_v1`.
 *
 * Stage-scoped `perspectives_v1` remains a compatibility layer for runtime convergence.
 */

import { randomUUID } from "crypto";

import {
    canonicalWorkViewConditionFieldKey,
    WORK_VIEW_CONDITION_FIELD_DEFS,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";

export const WORK_VIEWS_V1_METADATA_KEY = "work_views_v1" as const;

export type WorkViewFilterOperatorV1 =
    | "equals"
    | "not_equals"
    | "is_any_of"
    | "is_empty"
    | "is_not_empty"
    | "date_is"
    | "date_between";

export type WorkViewFilterV1 = {
    field_key: string;
    operator: WorkViewFilterOperatorV1;
    value: unknown;
};

export type WorkViewSortV1 = {
    field_key: string;
    direction: "asc" | "desc";
};

/** How a Work View's conditions combine. `all` = AND (every condition), `any` = OR (any condition). */
export type WorkViewFilterMatchV1 = "all" | "any";

export type WorkViewConfigV1Stored = {
    id: string;
    label: string;
    mission?: string;
    /** Condition combinator. Absent = `all` (AND) — preserves pre-V3 behavior for saved views. */
    match?: WorkViewFilterMatchV1;
    filters_v1?: WorkViewFilterV1[];
    sort_v1?: WorkViewSortV1;
    /** Optional multi-sort rules; first rule mirrors `sort_v1` for runtime. */
    sorts_v1?: WorkViewSortV1[];
    visible_in_runtime?: boolean;
    display_order?: number;
    queue_layout_id?: string;
    focus_panel_layout_id?: string;
    /** Compatibility-only — maps to synced queue lane for runtime preview until migration. */
    compat_queue_key?: string;
};

/** Summary label when a Work View includes all eligible process rows (empty `filters_v1`). */
export const WORK_VIEW_CATCH_ALL_SUMMARY = "All work in this process" as const;

/**
 * Process-wide catch-all Work View — empty or absent `filters_v1`.
 * Runtime: every row on the work unit all-records base passes the view predicate.
 * Builder: "All work in this process" mode; skips mixed-grain stage validation.
 */
export function isWorkViewCatchAll(
    view: Pick<WorkViewConfigV1Stored, "filters_v1"> | null | undefined,
): boolean {
    return !view?.filters_v1?.length;
}

const FILTER_OPERATORS = new Set<WorkViewFilterOperatorV1>([
    "equals",
    "not_equals",
    "is_any_of",
    "is_empty",
    "is_not_empty",
    "date_is",
    "date_between",
]);

const ID_REGEX = /^[a-z][a-z0-9_-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseFilter(raw: unknown): WorkViewFilterV1 | null {
    if (!isRecord(raw)) return null;
    const rawFieldKey = typeof raw.field_key === "string" ? raw.field_key.trim() : "";
    const operator = typeof raw.operator === "string" ? raw.operator.trim() : "";
    if (!rawFieldKey || !FILTER_OPERATORS.has(operator as WorkViewFilterOperatorV1)) return null;
    // Phase 5 — normalize legacy generic keys (`stage`/`status`/`location`) to canonical typed keys
    // at load time, so canonical keys persist on the next save.
    const field_key = canonicalWorkViewConditionFieldKey(rawFieldKey);
    return {
        field_key,
        operator: operator as WorkViewFilterOperatorV1,
        value: raw.value ?? null,
    };
}

function parseSort(raw: unknown): WorkViewSortV1 | null {
    if (!isRecord(raw)) return null;
    const field_key = typeof raw.field_key === "string" ? raw.field_key.trim() : "";
    const direction = raw.direction === "desc" ? "desc" : "asc";
    if (!field_key) return null;
    return { field_key, direction };
}

export function parseWorkViewRow(raw: unknown): WorkViewConfigV1Stored | null {
    if (!isRecord(raw)) return null;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!id || !label) return null;

    const stored: WorkViewConfigV1Stored = { id, label };
    if (typeof raw.mission === "string" && raw.mission.trim()) stored.mission = raw.mission.trim();
    // `match` combinator (V3). Only persist when explicitly `any`; absent/`all` keeps the default AND
    // so legacy saved views are never silently reinterpreted.
    if (raw.match === "any") stored.match = "any";
    else if (raw.match === "all") stored.match = "all";
    if (Array.isArray(raw.filters_v1)) {
        const filters = raw.filters_v1.map(parseFilter).filter(Boolean) as WorkViewFilterV1[];
        if (filters.length) stored.filters_v1 = filters;
    }
    const sort = parseSort(raw.sort_v1);
    if (sort) stored.sort_v1 = sort;
    if (Array.isArray(raw.sorts_v1)) {
        const sorts = raw.sorts_v1.map(parseSort).filter(Boolean) as WorkViewSortV1[];
        if (sorts.length) {
            stored.sorts_v1 = sorts;
            if (!stored.sort_v1) stored.sort_v1 = sorts[0];
        }
    }
    if (typeof raw.visible_in_runtime === "boolean") stored.visible_in_runtime = raw.visible_in_runtime;
    if (typeof raw.display_order === "number" && Number.isFinite(raw.display_order)) {
        stored.display_order = Math.max(1, Math.floor(raw.display_order));
    }
    if (typeof raw.queue_layout_id === "string" && raw.queue_layout_id.trim()) {
        stored.queue_layout_id = raw.queue_layout_id.trim();
    }
    if (typeof raw.focus_panel_layout_id === "string" && raw.focus_panel_layout_id.trim()) {
        stored.focus_panel_layout_id = raw.focus_panel_layout_id.trim();
    }
    if (typeof raw.compat_queue_key === "string" && raw.compat_queue_key.trim()) {
        stored.compat_queue_key = raw.compat_queue_key.trim();
    }
    return stored;
}

export function parseWorkViewsV1(raw: unknown): WorkViewConfigV1Stored[] | null {
    if (raw == null) return null;
    if (!Array.isArray(raw)) return null;
    const rows = raw.map(parseWorkViewRow).filter(Boolean) as WorkViewConfigV1Stored[];
    return rows.length ? normalizeWorkViewsDisplayOrder(rows) : [];
}

export function normalizeWorkViewsDisplayOrder(rows: readonly WorkViewConfigV1Stored[]): WorkViewConfigV1Stored[] {
    return [...rows]
        .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) || a.label.localeCompare(b.label))
        .map((row, index) => ({
            ...row,
            display_order: row.display_order ?? index + 1,
            visible_in_runtime: row.visible_in_runtime !== false,
        }));
}

export function workViewsV1Equal(a: readonly WorkViewConfigV1Stored[], b: readonly WorkViewConfigV1Stored[]): boolean {
    return JSON.stringify(normalizeWorkViewsDisplayOrder(a)) === JSON.stringify(normalizeWorkViewsDisplayOrder(b));
}

/** Resolve a view's condition combinator, defaulting to `all` (AND) when unset/invalid. */
export function resolveWorkViewMatchV1(match: unknown): WorkViewFilterMatchV1 {
    return match === "any" ? "any" : "all";
}

export function createEmptyWorkViewDraft(label = "New work view"): WorkViewConfigV1Stored {
    const base = slugifyWorkViewId(label);
    return {
        id: base,
        label,
        mission: "",
        // No seeded condition — a new Work View is **include-all** by default (empty filters evaluate as
        // include-all over the work unit's all-records base). The previous `tour_date = today` seed
        // silently narrowed every new view (e.g. an "All Leads" view) to today's tours → 0 records.
        filters_v1: [],
        sort_v1: { field_key: "updated_at", direction: "desc" },
        sorts_v1: [{ field_key: "updated_at", direction: "desc" }],
        visible_in_runtime: true,
        display_order: 1,
    };
}

export function slugifyWorkViewId(raw: string): string {
    const s = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_")
        .slice(0, 48);
    const candidate = s && ID_REGEX.test(s) ? s : `work_view_${randomUUID().slice(0, 8)}`;
    return candidate;
}

/**
 * Selectable condition field options for the Work View editor — derived from the typed condition
 * registry. Generic `status` / `stage` are intentionally excluded (replaced by typed fields such as
 * Opportunity Stage / Opportunity Status / Child Enrollment Status). See
 * {@link WORK_VIEW_CONDITION_FIELD_DEFS} and {@link workViewConditionFieldGroups}.
 */
export const WORK_VIEW_FILTER_FIELD_OPTIONS: ReadonlyArray<{ key: string; label: string }> =
    WORK_VIEW_CONDITION_FIELD_DEFS.filter((def) => def.runtimeSupported).map((def) => ({
        key: def.key,
        label: def.label,
    }));

export const WORK_VIEW_FILTER_OPERATOR_OPTIONS: ReadonlyArray<{ value: WorkViewFilterOperatorV1; label: string }> = [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
    { value: "date_is", label: "date is" },
    { value: "date_between", label: "date between" },
];

export const WORK_VIEW_SORT_FIELD_OPTIONS = [
    { key: "updated_at", label: "Updated" },
    { key: "tour_time", label: "Tour time" },
    { key: "created_at", label: "Created" },
    { key: "priority", label: "Priority" },
] as const;

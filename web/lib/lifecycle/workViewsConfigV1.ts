/**
 * Process-level Work Views (Configuration Runtime).
 * Stored on `lifecycle_builder_v1.processes[].work_views_v1`.
 *
 * Stage-scoped `perspectives_v1` remains a compatibility layer for runtime convergence.
 */

import { randomUUID } from "crypto";

import {
    canonicalWorkViewConditionFieldKey,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import { workViewFilterFieldOptions } from "@/lib/lifecycle/workViewCanonicalOperands";
import { canonicalWorkViewSortFieldKey } from "@/lib/lifecycle/workViewSortOperands";
import { parseStageGrain, type StageGrain } from "@/lib/lifecycle/stageGrainV1";

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
    /**
     * DECLARED Row Grain — what one row of this lens IS.
     *
     * Row Grain is normally derived from the stages a lens filters on, and for a stage-scoped lens
     * that derivation is authoritative. But a lens can be deliberately STAGE-INDEPENDENT ("every
     * child with an active enrollment participation, wherever they are"), and such a lens has no
     * stage predicate to derive from: the deriver reads "no stage predicate" as "spans every active
     * stage" and, in a process with both family and child stages, refuses it as grain-ambiguous.
     * Declaring the grain is how a stage-independent lens says what it is.
     *
     * This does NOT relax G-1. A declaration that contradicts the lens's own stage predicate is a
     * lie, not an override, and `resolveLensRowGrain` refuses it.
     */
    row_grain_v1?: StageGrain;
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

/**
 * Include-all Work Views (empty `filters_v1`) must resolve on the department aggregate host
 * and all-records lane — not a stage-specific `compat_queue_key`. Strip erroneous bindings at
 * load time so runtime counts/rows and pill routing agree with predicate-only semantics.
 */
export function normalizeCatchAllWorkViewCompatBinding(
    view: WorkViewConfigV1Stored,
): WorkViewConfigV1Stored {
    if (!isWorkViewCatchAll(view) || !view.compat_queue_key?.trim()) return view;
    const { compat_queue_key: _removed, ...rest } = view;
    return rest;
}

/** Repair every catch-all view in a process work_views_v1 list. Returns changed rows + whether any changed. */
export function repairWorkViewsCatchAllCompatBindings(
    rows: readonly WorkViewConfigV1Stored[],
): { workViews: WorkViewConfigV1Stored[]; changed: boolean } {
    let changed = false;
    const workViews = rows.map((row) => {
        const repaired = normalizeCatchAllWorkViewCompatBinding(row);
        if (repaired !== row) changed = true;
        return repaired;
    });
    return { workViews: normalizeWorkViewsDisplayOrder(workViews), changed };
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
    const rawFieldKey = typeof raw.field_key === "string" ? raw.field_key.trim() : "";
    const direction = raw.direction === "desc" ? "desc" : "asc";
    if (!rawFieldKey) return null;
    const field_key = canonicalWorkViewSortFieldKey(rawFieldKey);
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
    // Declared Row Grain — only a VALID grain persists. An unrecognized value is dropped rather than
    // carried forward as a grain nothing can resolve.
    const declaredGrain = parseStageGrain(raw.row_grain_v1);
    if (declaredGrain) stored.row_grain_v1 = declaredGrain;
    if (typeof raw.queue_layout_id === "string" && raw.queue_layout_id.trim()) {
        stored.queue_layout_id = raw.queue_layout_id.trim();
    }
    if (typeof raw.focus_panel_layout_id === "string" && raw.focus_panel_layout_id.trim()) {
        stored.focus_panel_layout_id = raw.focus_panel_layout_id.trim();
    }
    if (typeof raw.compat_queue_key === "string" && raw.compat_queue_key.trim()) {
        stored.compat_queue_key = raw.compat_queue_key.trim();
    }
    return normalizeCatchAllWorkViewCompatBinding(stored);
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
 * Selectable condition field options for the Work View editor — operational predicates plus
 * canonical provider operands. Pass tenant field definitions for custom-field parity.
 */
export function buildWorkViewFilterFieldOptions(
    tenantFieldDefinitions?: readonly import("@/lib/layout/tenantLayoutFieldPickerCatalog").TenantFieldDefinitionRow[],
): ReadonlyArray<{ key: string; label: string }> {
    return workViewFilterFieldOptions(tenantFieldDefinitions);
}

/** Operational-only seed list — prefer {@link buildWorkViewFilterFieldOptions}. */
export const WORK_VIEW_FILTER_FIELD_OPTIONS: ReadonlyArray<{ key: string; label: string }> =
    workViewFilterFieldOptions();

export const WORK_VIEW_FILTER_OPERATOR_OPTIONS: ReadonlyArray<{ value: WorkViewFilterOperatorV1; label: string }> = [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
    { value: "date_is", label: "date is" },
    { value: "date_between", label: "date between" },
];

export { WORK_VIEW_SORT_FIELD_OPTIONS } from "@/lib/lifecycle/workViewSortOperands";

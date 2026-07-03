/**
 * Presentation Runtime V2 — Workspace Process Surface config (pure).
 *
 * The Workspace Process Surface is ONE template the runtime repeats per configured
 * business process (ProcessSummaryCard). The card grammar is fixed —
 *   Identity → Operational Answer → Evidence → Today's Work → CTA
 * — and its CONTENT is live runtime data (ProcessTileModel). The only thing an operator
 * configures is the BEHAVIOR of the Today's Work section: whether it shows, how many rows,
 * the row order, and whether counts render. This module is that config + the pure function
 * the runtime applies to the live work-view list.
 *
 * Persistence: `entity_layouts` (surface="workspace", entityType="workspace",
 * layoutKey="workspace_processes") with the config in `doc.metadata.workspaceProcessSurface`.
 */

import type { WorkViewLinkModel } from "@/lib/presentation/runtime/types";

export type TodaysWorkSort =
    /** Records needing attention first (then overdue, then count) — the operational default. */
    | "attention"
    /** Highest lane count first. */
    | "count"
    /** Keep the configured work_views_v1 order. */
    | "configured";

export type WorkspaceProcessSurfaceConfig = {
    version: 1;
    /**
     * The Primary Signal each process presents — a selected Operational Calculation key,
     * keyed by the process's business process (internal binding: the
     * `primaryOperationalAnswerKey`). Surface Builder chooses WHICH signal; it does not
     * configure the calculation. Absent → the runtime uses the registry default for the
     * process (never a hardcoded health metric).
     */
    primarySignalByProcess: Record<string, string>;
    todaysWork: {
        /** Show the Today's Work section on each process card. */
        visible: boolean;
        /** Max work-view rows per card; 0 = show all. */
        maxRows: number;
        /** Row ordering behavior. */
        sort: TodaysWorkSort;
        /** Render the per-view count badge. */
        showCounts: boolean;
    };
};

export const DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG: WorkspaceProcessSurfaceConfig = {
    version: 1,
    primarySignalByProcess: {},
    todaysWork: {
        visible: true,
        maxRows: 0,
        sort: "attention",
        showCounts: true,
    },
};

/** String→string record of process → calculation key, ignoring non-string entries. */
function normalizePrimarySignalMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
}

/** Coerce an unknown persisted value into a valid config (defaults fill any gaps). */
export function normalizeWorkspaceProcessSurfaceConfig(value: unknown): WorkspaceProcessSurfaceConfig {
    const d = DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;
    if (!value || typeof value !== "object") return d;
    const v = value as Record<string, unknown>;
    const primarySignalByProcess = normalizePrimarySignalMap(v.primarySignalByProcess);
    const tw = v.todaysWork;
    if (!tw || typeof tw !== "object") {
        return { ...d, primarySignalByProcess };
    }
    const t = tw as Record<string, unknown>;
    const sort: TodaysWorkSort =
        t.sort === "count" || t.sort === "configured" ? t.sort : "attention";
    const maxRows =
        typeof t.maxRows === "number" && Number.isFinite(t.maxRows) && t.maxRows >= 0
            ? Math.floor(t.maxRows)
            : d.todaysWork.maxRows;
    return {
        version: 1,
        primarySignalByProcess,
        todaysWork: {
            visible: typeof t.visible === "boolean" ? t.visible : d.todaysWork.visible,
            maxRows,
            sort,
            showCounts: typeof t.showCounts === "boolean" ? t.showCounts : d.todaysWork.showCounts,
        },
    };
}

function positive(n: number | null | undefined): number {
    return typeof n === "number" && n > 0 ? n : 0;
}

/**
 * Apply the Today's Work behavior config to a process's live work-view rows. Pure: sorts
 * (stable) and truncates per the config; visibility:false → empty. Never fabricates rows or
 * counts — it only orders and slices what the runtime already resolved.
 */
export function applyTodaysWorkConfig(
    workViews: readonly WorkViewLinkModel[],
    config: WorkspaceProcessSurfaceConfig,
): WorkViewLinkModel[] {
    const { visible, maxRows, sort } = config.todaysWork;
    if (!visible) return [];

    const indexed = workViews.map((view, index) => ({ view, index }));
    if (sort === "attention") {
        indexed.sort((a, b) => {
            const aScore = positive(a.view.attentionCount) * 1_000_000 + positive(a.view.overdueCount) * 1_000 + positive(a.view.count);
            const bScore = positive(b.view.attentionCount) * 1_000_000 + positive(b.view.overdueCount) * 1_000 + positive(b.view.count);
            if (aScore !== bScore) return bScore - aScore;
            return a.index - b.index; // stable within equal scores
        });
    } else if (sort === "count") {
        indexed.sort((a, b) => {
            const diff = positive(b.view.count) - positive(a.view.count);
            return diff !== 0 ? diff : a.index - b.index;
        });
    }
    // "configured" → keep original order (indexed is already in order).

    const ordered = indexed.map((e) => e.view);
    return maxRows > 0 ? ordered.slice(0, maxRows) : ordered;
}

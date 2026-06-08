/**
 * Builder-owned lifecycle work-unit sibling header — single hydration pass, stable paint.
 */

import {
    filterWorkUnitsForBuilderOwnedDeptDisplay,
    type WorkUnitListRow,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import type { LifecycleSiblingWorkUnitNavRow } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

export type LifecycleSiblingHydrationWorkUnit = {
    id: string;
    name: string | null;
    key?: string | null;
    sort_order?: number | null;
};

export type LifecycleSiblingHydrationBlock = {
    work_units: LifecycleSiblingHydrationWorkUnit[];
    totals_by_work_unit_id: Record<string, number>;
};

export type LifecycleSiblingHydrationSource = "bootstrap" | "client_fetch" | "dept_cache_totals";

const LIFECYCLE_HEADER_SKELETON_CHIP_COUNT = 4;

export function sortLifecycleSiblingWorkUnits<T extends LifecycleSiblingHydrationWorkUnit>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        const ao = Number(a.sort_order);
        const bo = Number(b.sort_order);
        const aOrder = Number.isFinite(ao) ? ao : 9999;
        const bOrder = Number.isFinite(bo) ? bo : 9999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        // Unified tie-break with sortLifecycleDeptWorkUnits so the /work-units lifecycle pills and the
        // /dept work-unit queue order identically (canonical work_units.sort_order, then name/key/id).
        return (a.name ?? a.key ?? a.id).localeCompare(b.name ?? b.key ?? b.id);
    });
}

export function dedupeLifecycleSiblingWorkUnitsById<T extends { id: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
        const id = row.id.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(row);
    }
    return out;
}

export function mapLifecycleSiblingNavRows(
    rows: readonly LifecycleSiblingHydrationWorkUnit[]
): LifecycleSiblingWorkUnitNavRow[] {
    return sortLifecycleSiblingWorkUnits(dedupeLifecycleSiblingWorkUnitsById([...rows])).map((w) => ({
        id: w.id,
        name: w.name,
        key: w.key ?? null,
        metadata: (w as { metadata?: unknown }).metadata,
        total: null,
    }));
}

export function attachLifecycleSiblingTotals(params: {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    totalsByWorkUnitId: Record<string, number | null | undefined>;
    currentWorkUnitId: string;
    currentWorkUnitTotal: number | null;
}): LifecycleSiblingWorkUnitNavRow[] {
    return params.siblings.map((s) => {
        if (s.id === params.currentWorkUnitId && params.currentWorkUnitTotal != null) {
            return { ...s, total: Math.max(0, Math.floor(params.currentWorkUnitTotal)) };
        }
        const t = params.totalsByWorkUnitId[s.id];
        return {
            ...s,
            total: typeof t === "number" && Number.isFinite(t) ? Math.max(0, Math.floor(t)) : null,
        };
    });
}

/** Authoritative sibling list is loaded — safe to paint lifecycle header (not partial cache). */
export function lifecycleSiblingHeaderPaintReady(params: {
    hydrationComplete: boolean;
    siblings: LifecycleSiblingWorkUnitNavRow[] | null;
}): boolean {
    return params.hydrationComplete && (params.siblings?.length ?? 0) > 0;
}

export function buildLifecycleSiblingHeaderSkeletonSections(): import("@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes").WorkUnitAboveFoldChipSection[] {
    const chips = Array.from({ length: LIFECYCLE_HEADER_SKELETON_CHIP_COUNT }, (_, i) => ({
        key: `lifecycle_sibling_skeleton_${i}`,
        label: "—",
        priority: "standard" as const,
        selected: i === 0,
        count: "skeleton" as const,
    }));
    return [
        { key: "lifecycle_work_units", label: "Work Units", chips },
        {
            key: "needs_attention",
            label: "Needs Attention",
            chips: [
                {
                    key: "lifecycle_na_skeleton",
                    label: "—",
                    priority: "critical" as const,
                    selected: false,
                    count: "skeleton" as const,
                },
            ],
        },
    ];
}

export function lifecycleSiblingTotalsFromDeptSummaries(
    workUnitSummaries: Record<string, { total: number; needs_attention: number | null }> | undefined
): Record<string, number> {
    const out: Record<string, number> = {};
    if (!workUnitSummaries) return out;
    for (const [id, row] of Object.entries(workUnitSummaries)) {
        if (row && typeof row.total === "number" && Number.isFinite(row.total)) {
            out[id] = Math.max(0, Math.floor(row.total));
        }
    }
    return out;
}

export function mergeLifecycleSiblingHydrationBlock(
    block: LifecycleSiblingHydrationBlock | null | undefined
): {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    totalsByWorkUnitId: Record<string, number>;
} | null {
    if (!block?.work_units?.length) return null;
    const siblings = mapLifecycleSiblingNavRows(block.work_units);
    const totals: Record<string, number> = {};
    for (const [id, n] of Object.entries(block.totals_by_work_unit_id ?? {})) {
        if (typeof n === "number" && Number.isFinite(n)) totals[id] = Math.max(0, Math.floor(n));
    }
    return { siblings, totalsByWorkUnitId: totals };
}

export function logLifecycleSiblingHydrationDev(
    event: string,
    detail: Record<string, unknown>
): void {
    if (process.env.NODE_ENV === "production") return;
    console.info("[lifecycle-wu-hydration]", { event, ...detail });
}

export function toLifecycleSiblingListRows(
    items: Array<{
        id: string;
        name?: string | null;
        key?: string | null;
        is_active?: boolean;
        metadata?: unknown;
        sort_order?: number | null;
    }>
): WorkUnitListRow[] {
    return items.map((w) => ({
        id: String(w.id),
        name: w.name ?? null,
        key: w.key ?? null,
        metadata: w.metadata,
        is_active: w.is_active,
        sort_order: w.sort_order,
    }));
}

export function filterSortLifecycleSiblingWorkUnits(rows: WorkUnitListRow[]): LifecycleSiblingHydrationWorkUnit[] {
    const filtered = filterWorkUnitsForBuilderOwnedDeptDisplay(rows.filter((w) => w.is_active !== false));
    return sortLifecycleSiblingWorkUnits(
        dedupeLifecycleSiblingWorkUnitsById(
            filtered.map((w) => ({
                id: w.id,
                name: w.name,
                key: w.key,
                sort_order: (w as { sort_order?: number | null }).sort_order ?? null,
            }))
        )
    );
}

import {
    filterWorkUnitsForBuilderOwnedDeptDisplay,
    isLifecycleStageWorkUnitRow,
    type WorkUnitListRow,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";

export type DeptWorkUnitListRow = {
    id: string;
    name: string | null;
    key: string | null;
    sort_order?: number | null;
    metadata?: unknown;
};

export function sortLifecycleDeptWorkUnits<T extends DeptWorkUnitListRow>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        const ao = Number(a.sort_order);
        const bo = Number(b.sort_order);
        const aOrder = Number.isFinite(ao) ? ao : 9999;
        const bOrder = Number.isFinite(bo) ? bo : 9999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name ?? a.key ?? a.id).localeCompare(b.name ?? b.key ?? b.id);
    });
}

export function lifecycleDeptThroughputWorkUnits(
    workUnits: DeptWorkUnitListRow[],
    builderOwnedLifecycleRuntime: boolean
): DeptWorkUnitListRow[] {
    const list = builderOwnedLifecycleRuntime
        ? workUnits.filter((w) => isLifecycleStageWorkUnitRow(w))
        : workUnits.filter((w) => {
              const key = (w.key ?? "").trim().toLowerCase();
              return key !== "needs_attention" && key !== "enrollment_pipeline";
          });
    return sortLifecycleDeptWorkUnits(list);
}

export function mapBootstrapWorkUnits(
    rows: Array<{ id: string; name?: string | null; key?: string | null; sort_order?: number | null; metadata?: unknown }>
): DeptWorkUnitListRow[] {
    return sortLifecycleDeptWorkUnits(
        rows.map((w) => ({
            id: String(w.id),
            name: w.name ?? null,
            key: w.key ?? null,
            sort_order: w.sort_order ?? null,
            metadata: w.metadata,
        }))
    );
}

export function filterSortLifecycleWorkUnitRows(rows: WorkUnitListRow[]): WorkUnitListRow[] {
    return sortLifecycleDeptWorkUnits(
        filterWorkUnitsForBuilderOwnedDeptDisplay(rows).map((w) => ({
            id: w.id,
            name: w.name,
            key: w.key,
            sort_order: w.sort_order ?? null,
            metadata: w.metadata,
        }))
    );
}

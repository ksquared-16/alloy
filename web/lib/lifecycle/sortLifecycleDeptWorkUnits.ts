import {
    filterWorkUnitsForBuilderOwnedDeptDisplay,
    isLifecycleStageWorkUnitRow,
    type WorkUnitListRow,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";

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

/**
 * Canonical lifecycle stage order from /settings/lifecycle (builder stages in `lifecycle_builder_v1`),
 * as `stage_key -> index`. This is the authoritative order the user edits in settings, independent of
 * whether `work_units.sort_order` was synced.
 */
export function buildLifecycleStageOrderIndex(departmentMetadata: unknown): ReadonlyMap<string, number> {
    const index = new Map<string, number>();
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(departmentMetadata));
    if (!process) return index;
    activeStagesForProcess(process).forEach((stage, i) => {
        const key = (stage.key ?? "").trim();
        if (key) index.set(key, i);
    });
    return index;
}

/**
 * Stable re-sort by canonical lifecycle stage order (from {@link buildLifecycleStageOrderIndex}).
 * Sync-independent — does NOT rely on `work_units.sort_order` being populated. Stages absent from the
 * index keep their prior relative order (stable sort) and sort after known stages. No-op when the
 * index is empty (e.g. non-builder-owned depts or missing metadata) → preserves existing behavior.
 */
export function sortByLifecycleStageOrder<T extends { metadata?: unknown }>(
    rows: T[],
    stageOrderIndex: ReadonlyMap<string, number>
): T[] {
    if (stageOrderIndex.size === 0) return rows;
    return [...rows].sort((a, b) => {
        const aKey = stageKeyFromLifecycleWorkUnitMetadata(a.metadata) ?? "";
        const bKey = stageKeyFromLifecycleWorkUnitMetadata(b.metadata) ?? "";
        const ai = stageOrderIndex.get(aKey) ?? 9999;
        const bi = stageOrderIndex.get(bKey) ?? 9999;
        return ai - bi;
    });
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

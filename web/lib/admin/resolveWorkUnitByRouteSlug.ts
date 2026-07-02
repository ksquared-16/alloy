import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { workUnitKeyToRouteSlug, workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";
import { alloyRuntimeTrace } from "@/lib/perf/alloyRuntimeTrace";

export type WorkUnitRouteSlugRow = {
    id: string;
    department_id: string;
    key: string;
    name: string;
    queue_definition: unknown;
    sort_order?: number | null;
    is_active?: boolean | null;
};

export type WorkUnitRouteSlugMatchKind = "work_unit_key" | "queue_lane_key";

export type ResolvedWorkUnitRouteSlug = {
    kind: WorkUnitRouteSlugMatchKind;
    workUnitId: string;
    departmentId: string;
    workUnitKey: string;
    workUnitName: string;
    routeSlug: string;
    /** When kind is `queue_lane_key`, the lane to select on the resolved work unit. */
    initialQueueKey: string | null;
};

export type AmbiguousWorkUnitRouteSlugCandidate = {
    workUnitId: string;
    departmentId: string;
    workUnitKey: string;
    workUnitName: string;
    departmentKey: string | null;
    departmentName: string | null;
};

export type ResolveWorkUnitRouteSlugResult =
    | { status: "resolved"; match: ResolvedWorkUnitRouteSlug }
    | { status: "not_found" }
    | { status: "ambiguous"; candidates: AmbiguousWorkUnitRouteSlugCandidate[] };

type DepartmentHint = { id: string; key: string | null; name: string | null };

function preferDepartmentKey(deptKey: string | null | undefined): number {
    const k = (deptKey ?? "").trim().toLowerCase();
    if (k === "enrollment") return 0;
    return 1;
}

function sortWorkUnitRows(rows: WorkUnitRouteSlugRow[]): WorkUnitRouteSlugRow[] {
    return [...rows].sort((a, b) => {
        const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
        const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
        if (ao !== bo) return ao - bo;
        return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
}

function pipelineExecutionLanesForRow(row: WorkUnitRouteSlugRow) {
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(row.queue_definition);
    if (!bundle) return [];
    const primary = extractPipelineExecutionLanes(bundle.def);
    return primary.length > 0 ? primary : extractDrawerLifecycleExecutionLanes(bundle.def);
}

function findQueueLaneOwner(
    rows: WorkUnitRouteSlugRow[],
    laneKey: string,
): WorkUnitRouteSlugRow | null {
    const normalizedLane = laneKey.trim().toLowerCase();
    if (!normalizedLane) return null;

    for (const row of sortWorkUnitRows(rows)) {
        const lanes = pipelineExecutionLanesForRow(row);
        if (lanes.some((lane) => lane.key.trim().toLowerCase() === normalizedLane)) {
            return row;
        }
    }
    return null;
}

function findLifecycleStageWorkUnitForQueueLane(
    rows: WorkUnitRouteSlugRow[],
    laneKey: string,
    departmentsById: Map<string, DepartmentHint>,
): WorkUnitRouteSlugRow | null {
    const stageKeys = operatorStageKeysForPipelineQueueKey(laneKey);
    if (!stageKeys.length) return null;

    const candidates: WorkUnitRouteSlugRow[] = [];
    for (const stageKey of stageKeys) {
        const wuKey = lifecycleStageWorkUnitKey(stageKey).toLowerCase();
        for (const row of rows) {
            if ((row.key ?? "").trim().toLowerCase() === wuKey) {
                candidates.push(row);
            }
        }
    }

    if (!candidates.length) return null;
    const narrowed = disambiguateWorkUnitKeyMatches(candidates, departmentsById);
    return narrowed.length === 1 ? narrowed[0]! : null;
}

function disambiguateWorkUnitKeyMatches(
    rows: WorkUnitRouteSlugRow[],
    departmentsById: Map<string, DepartmentHint>,
): WorkUnitRouteSlugRow[] {
    const sorted = sortWorkUnitRows(rows);
    if (sorted.length <= 1) return sorted;

    const withDeptRank = [...sorted].sort((a, b) => {
        const ad = departmentsById.get(a.department_id);
        const bd = departmentsById.get(b.department_id);
        const deptCmp = preferDepartmentKey(ad?.key) - preferDepartmentKey(bd?.key);
        if (deptCmp !== 0) return deptCmp;
        const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
        const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
        return ao - bo;
    });

    const top = withDeptRank[0];
    const topDept = departmentsById.get(top.department_id);
    const tied = withDeptRank.filter((row) => {
        const dept = departmentsById.get(row.department_id);
        return (
            preferDepartmentKey(dept?.key) === preferDepartmentKey(topDept?.key) &&
            (typeof row.sort_order === "number" ? row.sort_order : 0) ===
                (typeof top.sort_order === "number" ? top.sort_order : 0)
        );
    });

    return tied.length === 1 ? [top] : tied;
}

/**
 * Resolve operator `/workspace/work-unit/:slug` to a work unit (+ optional queue lane).
 * Slug source: `work_units.key` first; else configured pipeline queue lane keys.
 */
export function resolveWorkUnitByRouteSlug(args: {
    slug: string;
    workUnits: WorkUnitRouteSlugRow[];
    departments?: DepartmentHint[];
}): ResolveWorkUnitRouteSlugResult {
    const routeSlug = workUnitKeyToRouteSlug(args.slug);
    const platformKey = workUnitRouteSlugToKey(routeSlug);
    if (!platformKey) return { status: "not_found" };

    const activeRows = args.workUnits.filter((row) => row.is_active !== false);
    const departmentsById = new Map(
        (args.departments ?? []).map((d) => [d.id, d] as const),
    );

    // WU.ROUTE_RESOLVE canonical runtime trace — emit the configured identity the
    // incoming slug resolved to. Runs server-side (by-slug API / server loader),
    // so it lands in Vercel logs as the second link of the golden-flow chain.
    const resolved = (
        match: ResolvedWorkUnitRouteSlug,
    ): ResolveWorkUnitRouteSlugResult => {
        alloyRuntimeTrace("WU.ROUTE_RESOLVE", {
            source: "configured_work_units",
            incoming_slug: args.slug,
            route_slug: match.routeSlug,
            resolved_work_unit_id: match.workUnitId,
            resolved_work_unit_key: match.workUnitKey,
            resolved_process_label: match.workUnitName,
            resolved_active_work_view_key: match.initialQueueKey ?? match.workUnitKey,
            resolved_queue_key: match.initialQueueKey,
            match_kind: match.kind,
        });
        return { status: "resolved", match };
    };

    const directMatches = activeRows.filter(
        (row) => (row.key ?? "").trim().toLowerCase() === platformKey,
    );

    if (directMatches.length === 1) {
        const row = directMatches[0]!;
        return resolved({
            kind: "work_unit_key",
            workUnitId: row.id,
            departmentId: row.department_id,
            workUnitKey: row.key,
            workUnitName: row.name,
            routeSlug,
            initialQueueKey: null,
        });
    }

    if (directMatches.length > 1) {
        const narrowed = disambiguateWorkUnitKeyMatches(directMatches, departmentsById);
        if (narrowed.length === 1) {
            const row = narrowed[0]!;
            return resolved({
                kind: "work_unit_key",
                workUnitId: row.id,
                departmentId: row.department_id,
                workUnitKey: row.key,
                workUnitName: row.name,
                routeSlug,
                initialQueueKey: null,
            });
        }
        return {
            status: "ambiguous",
            candidates: narrowed.map((row) => {
                const dept = departmentsById.get(row.department_id);
                return {
                    workUnitId: row.id,
                    departmentId: row.department_id,
                    workUnitKey: row.key,
                    workUnitName: row.name,
                    departmentKey: dept?.key ?? null,
                    departmentName: dept?.name ?? null,
                };
            }),
        };
    }

    const laneOwner = findQueueLaneOwner(activeRows, platformKey);
    if (laneOwner) {
        return resolved({
            kind: "queue_lane_key",
            workUnitId: laneOwner.id,
            departmentId: laneOwner.department_id,
            workUnitKey: laneOwner.key,
            workUnitName: laneOwner.name,
            routeSlug,
            initialQueueKey: platformKey,
        });
    }

    const lifecycleStageOwner = findLifecycleStageWorkUnitForQueueLane(
        activeRows,
        platformKey,
        departmentsById,
    );
    if (lifecycleStageOwner) {
        return resolved({
            kind: "work_unit_key",
            workUnitId: lifecycleStageOwner.id,
            departmentId: lifecycleStageOwner.department_id,
            workUnitKey: lifecycleStageOwner.key,
            workUnitName: lifecycleStageOwner.name,
            routeSlug,
            initialQueueKey: null,
        });
    }

    return { status: "not_found" };
}

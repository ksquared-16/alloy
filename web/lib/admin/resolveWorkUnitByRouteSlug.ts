import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { pickDeptWorkViewHostWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { workUnitKeyToRouteSlug, workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

export type WorkUnitRouteSlugRow = {
    id: string;
    department_id: string;
    key: string;
    name: string;
    queue_definition: unknown;
    sort_order?: number | null;
    is_active?: boolean | null;
};

export type WorkUnitRouteSlugMatchKind = "work_unit_key" | "work_view" | "queue_lane_key";

export type ResolvedWorkUnitRouteSlug = {
    kind: WorkUnitRouteSlugMatchKind;
    workUnitId: string;
    departmentId: string;
    workUnitKey: string;
    workUnitName: string;
    routeSlug: string;
    /** When kind is `queue_lane_key`, the lane to select on the resolved work unit. */
    initialQueueKey: string | null;
    /** When kind is `work_view`, the configured Work View to select on the resolved work unit. */
    initialWorkViewId: string | null;
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

type DepartmentHint = {
    id: string;
    key: string | null;
    name: string | null;
    /** `departments.metadata` — required for `work_view` slug matching (configured `work_views_v1`). */
    metadata?: unknown;
};

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

/**
 * Host work unit for a configured Work View: the work unit owning the view's bound lane
 * (`compat_queue_key`) when one exists, else the department's pipeline/stage work unit —
 * the same host `workViewNavEntriesForDepartment` targets when it builds the view's nav entry.
 */
function hostWorkUnitForConfiguredWorkView(
    view: WorkViewConfigV1Stored,
    deptRows: WorkUnitRouteSlugRow[],
    departmentId: string,
    departmentsById: Map<string, DepartmentHint>,
): WorkUnitRouteSlugRow | null {
    const compat = view.compat_queue_key?.trim();
    if (compat) {
        const laneOwner =
            findQueueLaneOwner(deptRows, compat) ??
            findLifecycleStageWorkUnitForQueueLane(deptRows, compat, departmentsById);
        if (laneOwner) return laneOwner;
    }
    return pickDeptWorkViewHostWorkUnit(deptRows, departmentId);
}

function findConfiguredWorkViewMatch(
    platformKey: string,
    rows: WorkUnitRouteSlugRow[],
    departments: DepartmentHint[],
    departmentsById: Map<string, DepartmentHint>,
): { view: WorkViewConfigV1Stored; departmentId: string; host: WorkUnitRouteSlugRow } | null {
    const ordered = [...departments].sort(
        (a, b) =>
            preferDepartmentKey(a.key) - preferDepartmentKey(b.key) ||
            (a.name ?? a.id).localeCompare(b.name ?? b.id),
    );
    for (const dept of ordered) {
        if (dept.metadata == null) continue;
        const view =
            savedWorkViewsFromDepartmentMetadata(dept.metadata).find((v) => v.id === platformKey) ??
            null;
        if (!view) continue;
        const deptRows = rows.filter((row) => row.department_id === dept.id);
        const host = hostWorkUnitForConfiguredWorkView(view, deptRows, dept.id, departmentsById);
        if (host) return { view, departmentId: dept.id, host };
    }
    return null;
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
 * Resolve operator `/workspace/work-unit/:slug` to a work unit (+ optional work view / queue lane).
 *
 * Precedence:
 *   1. `work_unit_key`  — an explicit work-unit key is structural identity; it always wins.
 *   2. `work_view`      — configured Work View ids (`work_views_v1`) are the operator-facing
 *      routing namespace. They must outrank raw queue-lane keys because a view created from a
 *      lane shares its slugified id (e.g. "New Leads" → `new_leads` view id AND `new_leads`
 *      lane key): the configured view must win so the route selects the view (its label,
 *      predicates, and count), not the bare lane.
 *   3. `queue_lane_key` — legacy pipeline lane slugs for departments without configured views.
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

    const directMatches = activeRows.filter(
        (row) => (row.key ?? "").trim().toLowerCase() === platformKey,
    );

    if (directMatches.length === 1) {
        const row = directMatches[0]!;
        return {
            status: "resolved",
            match: {
                kind: "work_unit_key",
                workUnitId: row.id,
                departmentId: row.department_id,
                workUnitKey: row.key,
                workUnitName: row.name,
                routeSlug,
                initialQueueKey: null,
                initialWorkViewId: null,
            },
        };
    }

    if (directMatches.length > 1) {
        const narrowed = disambiguateWorkUnitKeyMatches(directMatches, departmentsById);
        if (narrowed.length === 1) {
            const row = narrowed[0]!;
            return {
                status: "resolved",
                match: {
                    kind: "work_unit_key",
                    workUnitId: row.id,
                    departmentId: row.department_id,
                    workUnitKey: row.key,
                    workUnitName: row.name,
                    routeSlug,
                    initialQueueKey: null,
                    initialWorkViewId: null,
                },
            };
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

    // Configured Work View id match — outranks queue-lane slugs (see precedence doc above).
    const workViewMatch = findConfiguredWorkViewMatch(
        platformKey,
        activeRows,
        args.departments ?? [],
        departmentsById,
    );
    if (workViewMatch) {
        return {
            status: "resolved",
            match: {
                kind: "work_view",
                workUnitId: workViewMatch.host.id,
                departmentId: workViewMatch.departmentId,
                workUnitKey: workViewMatch.host.key,
                workUnitName: workViewMatch.host.name,
                routeSlug,
                initialQueueKey: null,
                initialWorkViewId: workViewMatch.view.id,
            },
        };
    }

    const laneOwner = findQueueLaneOwner(activeRows, platformKey);
    if (laneOwner) {
        return {
            status: "resolved",
            match: {
                kind: "queue_lane_key",
                workUnitId: laneOwner.id,
                departmentId: laneOwner.department_id,
                workUnitKey: laneOwner.key,
                workUnitName: laneOwner.name,
                routeSlug,
                initialQueueKey: platformKey,
                initialWorkViewId: null,
            },
        };
    }

    const lifecycleStageOwner = findLifecycleStageWorkUnitForQueueLane(
        activeRows,
        platformKey,
        departmentsById,
    );
    if (lifecycleStageOwner) {
        return {
            status: "resolved",
            match: {
                kind: "work_unit_key",
                workUnitId: lifecycleStageOwner.id,
                departmentId: lifecycleStageOwner.department_id,
                workUnitKey: lifecycleStageOwner.key,
                workUnitName: lifecycleStageOwner.name,
                routeSlug,
                initialQueueKey: null,
                initialWorkViewId: null,
            },
        };
    }

    return { status: "not_found" };
}

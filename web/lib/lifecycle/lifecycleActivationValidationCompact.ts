/**
 * Operator-facing compact validation rows (technical checks stay in server payload).
 */

import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import {
    LIFECYCLE_RECORDS_QUERY_ZERO_COPY,
    LIFECYCLE_RECORDS_QUERY_ZERO_EXISTING_COPY,
    LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";

export type LifecycleActivationCompactCheckId =
    | "workspace_tile"
    | "work_units_visible"
    | "queue_filters"
    | "records_query_ready"
    | "actions_configured";

export type LifecycleActivationCompactCheck = {
    id: LifecycleActivationCompactCheckId;
    label: string;
    pass: boolean;
    summary: string;
    href: string | null;
    repairable: boolean;
    /** True when pass is informational (e.g. zero matching records). */
    informational?: boolean;
};

const COMPACT_ORDER: LifecycleActivationCompactCheckId[] = [
    "workspace_tile",
    "work_units_visible",
    "queue_filters",
    "records_query_ready",
    "actions_configured",
];

function byId(checks: LifecycleActivationCheckResult[]): Map<string, LifecycleActivationCheckResult> {
    return new Map(checks.map((c) => [c.id, c]));
}

function allPass(map: Map<string, LifecycleActivationCheckResult>, ids: string[]): boolean {
    return ids.every((id) => map.get(id)?.pass === true);
}

/** Map verbose server checks → five compact operator rows. */
export function buildLifecycleActivationCompactChecks(
    checks: LifecycleActivationCheckResult[]
): LifecycleActivationCompactCheck[] {
    const map = byId(checks);

    const workspaceTilePass = allPass(map, [
        "workspace_tile",
        "workspace_api",
        "workspace_rendered_tiles",
    ]);
    const workspaceTileSummary = workspaceTilePass
        ? "Lifecycle appears on the workspace."
        : map.get("workspace_tile")?.detail ??
          map.get("workspace_api")?.detail ??
          "Open workspace after repair or check access.";

    const lifecycleWuPass = map.get("dept_runtime_lifecycle_work_units")?.pass !== false;
    const noLegacyLanesPass = map.get("dept_no_legacy_pipeline_lanes")?.pass !== false;
    const workUnitsPass =
        map.get("dept_queue")?.pass === true && lifecycleWuPass && noLegacyLanesPass;
    const workUnitsSummary = !lifecycleWuPass
        ? (map.get("dept_runtime_lifecycle_work_units")?.detail ??
          "Create lifecycle work unit queues for each stage.")
        : !noLegacyLanesPass
          ? (map.get("dept_no_legacy_pipeline_lanes")?.detail ??
            "Legacy enrollment pipeline lanes would still appear on /dept.")
          : workUnitsPass
            ? (map.get("dept_queue")?.detail ?? "Work unit queues are listed on the department page.")
            : (map.get("dept_queue")?.detail ?? "Create and name each stage work unit queue.");

    const queueFiltersCheck =
        map.get("work_unit_queue_filters") ?? map.get("work_unit_records");
    const queueFiltersPass = queueFiltersCheck?.pass === true;
    const filterMismatch =
        queueFiltersCheck?.detail?.includes("filters do not include") ||
        queueFiltersCheck?.detail?.includes("filters missing") ||
        queueFiltersCheck?.detail?.includes("Repair queue filters");
    const queueFiltersSummary = filterMismatch
        ? "Sync queue filters to the statuses selected for this stage."
        : queueFiltersPass
          ? (queueFiltersCheck?.detail ?? "Queue filters match selected statuses.")
          : (queueFiltersCheck?.detail ?? "Assign statuses and create the work unit queue first.");

    const recordsQueryCheck =
        map.get("work_unit_records_query") ?? map.get("work_unit_records");
    const recordsQueryPass = recordsQueryCheck?.pass === true;
    const recordsZeroInfo =
        recordsQueryPass &&
        (recordsQueryCheck?.detail?.includes(LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY) ||
            recordsQueryCheck?.detail?.includes(LIFECYCLE_RECORDS_QUERY_ZERO_EXISTING_COPY) ||
            recordsQueryCheck?.detail?.includes(LIFECYCLE_RECORDS_QUERY_ZERO_COPY) ||
            recordsQueryCheck?.detail?.includes("No records match these statuses") ||
            recordsQueryCheck?.detail?.includes("assigned to another work unit"));
    const recordsNeedsAttach =
        recordsQueryPass && recordsQueryCheck?.detail?.includes("assigned to another work unit");
    const recordsQuerySummary = recordsQueryPass
        ? (recordsQueryCheck?.detail ?? "Records query succeeded.")
        : (recordsQueryCheck?.detail ?? "Records query is not ready yet.");

    const actionsPass = map.get("drawer_actions")?.pass !== false;
    const actionsSummary =
        map.get("drawer_actions")?.detail ?? "Optional: configure lifecycle actions when ready.";

    const rows: LifecycleActivationCompactCheck[] = [
        {
            id: "workspace_tile",
            label: "Workspace tile visible",
            pass: workspaceTilePass,
            summary: workspaceTileSummary,
            href: "/adminV2/workspace",
            repairable: !workspaceTilePass,
        },
        {
            id: "work_units_visible",
            label: "Work units visible",
            pass: workUnitsPass,
            summary: workUnitsSummary,
            href: map.get("dept_queue")?.href ?? null,
            repairable: !workUnitsPass,
        },
        {
            id: "queue_filters",
            label: "Queue filters connected",
            pass: queueFiltersPass,
            summary: queueFiltersSummary,
            href: queueFiltersCheck?.href ?? null,
            repairable: filterMismatch === true,
        },
        {
            id: "records_query_ready",
            label: "Records query ready",
            pass: recordsQueryPass,
            summary: recordsQuerySummary,
            href: recordsQueryCheck?.href ?? null,
            repairable: recordsNeedsAttach === true,
            informational: recordsZeroInfo,
        },
        {
            id: "actions_configured",
            label: "Actions configured",
            pass: actionsPass,
            summary: actionsSummary,
            href: map.get("drawer_actions")?.href ?? null,
            repairable: false,
        },
    ];

    return COMPACT_ORDER.map((id) => rows.find((r) => r.id === id)!);
}

export function lifecycleActivationCompactAllPass(compact: LifecycleActivationCompactCheck[]): boolean {
    return compact.every((c) => c.pass);
}

/** IDs and org-scoped copy for “Show technical details”. */
export function lifecycleActivationTechnicalDetailLines(
    checks: LifecycleActivationCheckResult[],
    opts?: { runtimeDepartmentId?: string; orgId?: string }
): string[] {
    const lines: string[] = [];
    if (opts?.runtimeDepartmentId) {
        lines.push(`Runtime department ID: ${opts.runtimeDepartmentId}`);
    }
    if (opts?.orgId) {
        lines.push(`Organization ID: ${opts.orgId}`);
    }
    for (const c of checks) {
        if (
            c.id === "builder_owned_marker" ||
            c.id === "runtime_department_row" ||
            c.id === "identity_sync" ||
            c.id === "workspace_browser_cache" ||
            c.id === "builder_catalog" ||
            c.id === "backing_department" ||
            c.id === "settings_only_legacy" ||
            c.id === "user_access" ||
            c.id === "workspace_access"
        ) {
            lines.push(`${c.label}: ${c.pass ? "Pass" : "Fail"} — ${c.detail}`);
        }
    }
    return lines;
}

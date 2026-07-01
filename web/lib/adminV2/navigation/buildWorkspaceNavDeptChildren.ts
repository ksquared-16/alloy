import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { workUnitKeyToRouteSlug, workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import type { WorkspaceNavTreeWu } from "@/lib/adminV2/navigation/workspaceNavTreeCache";

/** One expandable row under a department in the AdminV2 sidebar. */
export type WorkspaceNavTreeChild = {
    rowKey: string;
    label: string;
    workUnitId: string;
    workUnitKey: string | null;
    /** When set, navigates to the work-unit route with `?queue=` (same as dept oper console). */
    queueKey: string | null;
    kind: "configured_queue" | "work_unit";
};

function workUnitNavLabel(wu: WorkspaceNavTreeWu): string {
    const meta = wu.metadata;
    if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
        const m = meta as Record<string, unknown>;
        for (const field of ["nav_label", "display_name", "label"]) {
            const v = m[field];
            if (typeof v === "string" && v.trim()) return v.trim();
        }
    }
    const name = (wu.name ?? "").trim();
    if (name) return name;
    const key = (wu.key ?? "").trim();
    if (key) {
        return key
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }
    return "Untitled work unit";
}

/**
 * Operator-facing children for a department — mirrors dept workspace throughput routing:
 * - `pipeline_with_attention` execution work unit → configured pipeline `queues[].label` lanes
 * - otherwise → one row per non–needs_attention work unit (`work_units.name` / metadata)
 */
export function buildWorkspaceNavDeptChildren(
    departmentId: string,
    wus: WorkspaceNavTreeWu[]
): WorkspaceNavTreeChild[] {
    const forDept = wus.filter((w) => w.department_id === departmentId);
    if (!forDept.length) return [];

    const pipelineWu = pickDeptPipelineWorkUnit(forDept, departmentId);
    if (pipelineWu) {
        const bundle = tryLoadWorkUnitQueueDefinitionBundle(pipelineWu.queue_definition);
        if (bundle) {
            const lanes = extractPipelineExecutionLanes(bundle.def);
            if (lanes.length) {
                return lanes.map((lane) => ({
                    rowKey: `${pipelineWu.id}:${lane.key}`,
                    label: lane.label,
                    workUnitId: pipelineWu.id,
                    workUnitKey: pipelineWu.key ?? null,
                    queueKey: lane.key,
                    kind: "configured_queue" as const,
                }));
            }
        }
    }

    return [...forDept]
        .filter((w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention")
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
        .map((wu) => ({
            rowKey: wu.id,
            label: workUnitNavLabel(wu),
            workUnitId: wu.id,
            workUnitKey: (wu.key ?? "").trim() || null,
            queueKey: null,
            kind: "work_unit" as const,
        }));
}

function operatorNavSlugForChild(child: WorkspaceNavTreeChild): string | null {
    if (child.queueKey) return workUnitKeyToRouteSlug(child.queueKey);
    if (child.workUnitKey) return workUnitKeyToRouteSlug(child.workUnitKey);
    return null;
}

export function workspaceNavChildOperatorHref(child: WorkspaceNavTreeChild): string | null {
    if (child.queueKey) return operatorWorkUnitHrefFromKey(child.queueKey);
    if (child.workUnitKey) return operatorWorkUnitHrefFromKey(child.workUnitKey);
    return null;
}

export function workspaceNavChildHref(
    workspaceBase: string,
    departmentId: string,
    child: WorkspaceNavTreeChild
): string {
    const operatorHref = workspaceNavChildOperatorHref(child);
    if (operatorHref) return operatorHref;
    const base = `${workspaceBase}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(child.workUnitId)}`;
    if (!child.queueKey) return base;
    return `${base}?queue=${encodeURIComponent(child.queueKey)}`;
}

/** Dept oper console + sidebar — path/queue only; caller applies sticky site via `appendWorkspaceSiteToPath`. */
export function workspaceDeptQueueNavHref(
    workspaceBase: string,
    departmentId: string,
    workUnitId: string,
    queueKey: string | null
): string {
    return workspaceNavChildHref(workspaceBase, departmentId, {
        rowKey: queueKey ? `${workUnitId}:${queueKey}` : workUnitId,
        label: "",
        workUnitId,
        workUnitKey: null,
        queueKey,
        kind: queueKey ? "configured_queue" : "work_unit",
    });
}

export function isWorkspaceNavChildActive(args: {
    departmentId: string | null;
    workUnitId: string | null;
    workUnitSlug: string | null;
    activeQueueKey: string | null;
    child: WorkspaceNavTreeChild;
    deptId: string;
}): boolean {
    const { departmentId, workUnitId, workUnitSlug, activeQueueKey, child, deptId } = args;
    const childSlug = operatorNavSlugForChild(child);
    if (workUnitSlug && childSlug) {
        return workUnitRouteSlugsEquivalent(workUnitSlug, childSlug);
    }
    if (departmentId !== deptId || workUnitId !== child.workUnitId) return false;
    if (child.queueKey) return activeQueueKey === child.queueKey;
    return !activeQueueKey;
}

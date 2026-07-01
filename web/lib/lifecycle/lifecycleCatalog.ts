import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import { readProcessTracks } from "@/lib/businessProcesses/businessProcessConfigReader";
import {
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import type {
    LifecycleCatalogEntry,
    LifecycleCatalogValidationTruth,
    LifecycleWorkspaceRuntimeStatus,
} from "@/lib/lifecycle/lifecycleCatalogTypes";
import { isProtectedSharedLifecycleDepartment } from "@/lib/lifecycle/cleanupEnrollmentLifecycleProcesses";
import { LIFECYCLE_CATALOG_CONFIG_SOURCE } from "@/lib/lifecycle/lifecycleCatalogEntrySource";
import { fetchWorkspaceActiveDepartments } from "@/lib/workspace/workspaceActiveDepartments";

export type LifecycleCatalogDepartmentInput = {
    id: string;
    key: string;
    name: string;
    is_active: boolean;
    metadata: unknown;
};

/**
 * Build catalog rows from department rows — one entry per active process in lifecycle_builder_v1 only.
 * No default Enrollment seed, work_unit derivation, or status_stages synthesis.
 */
export function catalogEntriesFromDepartmentRows(
    deptRows: LifecycleCatalogDepartmentInput[],
    opts: {
        workspaceById: Map<string, { name: string }>;
        wuCountByDept: Map<string, number>;
        departmentIdAllowed: (departmentId: string) => boolean;
    }
): LifecycleCatalogEntry[] {
    const entries: LifecycleCatalogEntry[] = [];

    for (const dept of deptRows) {
        const config = lifecycleBuilderFromDepartmentMetadata(dept.metadata);
        const activationOwned = isLifecycleBuilderOwnedDepartmentMetadata(dept.metadata);
        const tile = opts.workspaceById.get(dept.id);
        const userHasAccess = opts.departmentIdAllowed(dept.id);
        const visibleInApi = Boolean(tile);

        for (const process of config.processes) {
            if (!process.is_active) continue;
            const stage_count = activeStagesForProcess(process).length;
            const track_count = readProcessTracks(process)?.tracks.length ?? 0;
            const lifecycle_name = process.name.trim();
            const name_matches_tile =
                !activationOwned ||
                !lifecycle_name ||
                (tile?.name ?? dept.name).trim().toLowerCase() === lifecycle_name.toLowerCase();

            const source = activationOwned ? "builder_owned" : "legacy";
            const activation = lifecycleActivationFromMetadata(dept.metadata);
            const protectedShared = isProtectedSharedLifecycleDepartment(dept.key, activationOwned);
            const can_delete =
                !protectedShared &&
                (activationOwned ||
                    (activation?.activation_owned === true && activation.process_id === process.id));

            entries.push({
                id: lifecycleCatalogId(dept.id, process.id),
                config_source: LIFECYCLE_CATALOG_CONFIG_SOURCE,
                department_id: dept.id,
                department_key: dept.key,
                department_name: dept.name,
                process_id: process.id,
                process_key: process.key,
                lifecycle_name,
                source,
                stage_count,
                track_count,
                work_unit_count: opts.wuCountByDept.get(dept.id) ?? 0,
                activation_owned: activationOwned,
                can_delete,
                can_repair: workspaceRuntimeStatus({
                    backingExists: true,
                    isActive: dept.is_active !== false,
                    visibleInApi,
                    userHasAccess,
                    nameMatches: name_matches_tile,
                    activationOwned,
                }) !== "visible",
                workspace: {
                    backing_department_exists: true,
                    department_is_active: dept.is_active !== false,
                    visible_in_workspace_api: visibleInApi,
                    user_has_access: userHasAccess,
                    name_matches_tile: name_matches_tile,
                    runtime_status: workspaceRuntimeStatus({
                        backingExists: true,
                        isActive: dept.is_active !== false,
                        visibleInApi,
                        userHasAccess,
                        nameMatches: name_matches_tile,
                        activationOwned,
                    }),
                    tile_name: tile?.name ?? null,
                },
            });
        }
    }

    return entries.sort((a, b) => a.lifecycle_name.localeCompare(b.lifecycle_name));
}

export function lifecycleCatalogId(departmentId: string, processId: string): string {
    return `${departmentId}:${processId}`;
}

export function parseLifecycleCatalogId(id: string): { departmentId: string; processId: string } | null {
    const i = id.indexOf(":");
    if (i <= 0) return null;
    const departmentId = id.slice(0, i).trim();
    const processId = id.slice(i + 1).trim();
    if (!departmentId || !processId) return null;
    return { departmentId, processId };
}

function workspaceRuntimeStatus(opts: {
    backingExists: boolean;
    isActive: boolean;
    visibleInApi: boolean;
    userHasAccess: boolean;
    nameMatches: boolean;
    activationOwned: boolean;
}): LifecycleWorkspaceRuntimeStatus {
    if (!opts.backingExists) return "not_visible";
    if (!opts.isActive) return "inactive";
    if (!opts.userHasAccess) return "access_issue";
    if (!opts.visibleInApi) return "not_visible";
    if (opts.activationOwned && !opts.nameMatches) return "name_mismatch";
    return "visible";
}

export async function buildLifecycleCatalog(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions
): Promise<LifecycleCatalogEntry[]> {
    const { data: deptRows, error } = await supabase
        .from("departments")
        .select("id, key, name, is_active, metadata")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const scopedWorkspace = await fetchWorkspaceActiveDepartments(supabase, orgId, dim);
    const workspaceById = new Map(scopedWorkspace.map((d) => [d.id, d]));

    const { data: workUnits } = await supabase
        .from("work_units")
        .select("id, department_id, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true);
    const wuCountByDept = new Map<string, number>();
    for (const wu of workUnits ?? []) {
        const did = (wu as { department_id: string }).department_id;
        wuCountByDept.set(did, (wuCountByDept.get(did) ?? 0) + 1);
    }

    const departments: LifecycleCatalogDepartmentInput[] = (deptRows ?? []).map((row) => {
        const dept = row as {
            id: string;
            key: string;
            name: string;
            is_active: boolean;
            metadata: unknown;
        };
        return dept;
    });

    return catalogEntriesFromDepartmentRows(departments, {
        workspaceById,
        wuCountByDept,
        departmentIdAllowed: (id) => departmentIdAllowed(dim, id),
    });
}

export function catalogEntryForProcess(
    entries: LifecycleCatalogEntry[],
    departmentId: string,
    processId: string
): LifecycleCatalogEntry | null {
    return entries.find((e) => e.department_id === departmentId && e.process_id === processId) ?? null;
}

export function catalogValidationTruth(entry: LifecycleCatalogEntry | null): LifecycleCatalogValidationTruth {
    if (!entry) {
        return {
            exists_in_builder: false,
            backing_department_exists: false,
            visible_in_workspace_api: false,
            visible_after_cache_refresh: "unknown",
            user_has_access: false,
            workspace_pass: false,
            detail: "Lifecycle not found in catalog.",
        };
    }
    const pass =
        entry.workspace.backing_department_exists &&
        entry.workspace.department_is_active &&
        entry.workspace.visible_in_workspace_api &&
        entry.workspace.user_has_access &&
        entry.workspace.name_matches_tile;

    let detail = "Visible on /workspace.";
    if (!entry.workspace.backing_department_exists) detail = "No backing department row.";
    else if (!entry.workspace.department_is_active) detail = "Department is inactive.";
    else if (!entry.workspace.user_has_access) detail = "Current user cannot access this department on /workspace.";
    else if (!entry.workspace.visible_in_workspace_api)
        detail = "Not returned by GET /api/admin/departments (same source as /workspace).";
    else if (!entry.workspace.name_matches_tile)
        detail = `Workspace tile is “${entry.workspace.tile_name ?? entry.department_name}” but Lifecycle name is “${entry.lifecycle_name}”.`;

    return {
        exists_in_builder: true,
        backing_department_exists: entry.workspace.backing_department_exists,
        visible_in_workspace_api: entry.workspace.visible_in_workspace_api,
        visible_after_cache_refresh: "unknown",
        user_has_access: entry.workspace.user_has_access,
        workspace_pass: pass,
        detail,
    };
}

export function findProcessInDepartmentMetadata(
    metadata: unknown,
    processId: string
): LifecycleBuilderProcessRecord | null {
    const config = lifecycleBuilderFromDepartmentMetadata(metadata);
    return config.processes.find((p) => p.id === processId && p.is_active) ?? null;
}

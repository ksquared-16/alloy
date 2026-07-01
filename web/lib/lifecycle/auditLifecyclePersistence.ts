import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    isLifecycleBuilderOwnedDepartmentMetadata,
    lifecycleBuilderOwnedFromMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { buildLifecycleCatalog, catalogEntryForProcess } from "@/lib/lifecycle/lifecycleCatalog";
import { fetchWorkspaceActiveDepartments } from "@/lib/workspace/workspaceActiveDepartments";

export type LifecyclePersistenceAudit = {
    lifecycle_name: string | null;
    runtime_department_id: string;
    department_row_exists: boolean;
    department_metadata_keys: string[];
    builder_owned_marker: boolean;
    builder_owned: ReturnType<typeof lifecycleBuilderOwnedFromMetadata>;
    lifecycle_builder_config: boolean;
    process_id: string | null;
    stages_config_location: string;
    activation_config_location: string | null;
    catalog_source: string | null;
    in_workspace_api: boolean;
    workspace_api_department_ids: string[];
};

export async function auditLifecycleDepartmentPersistence(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    dim: AdminAccessScopeDimensions,
    processId?: string | null
): Promise<LifecyclePersistenceAudit> {
    const deptId = departmentId.trim();
    const { data: row } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("id", deptId)
        .eq("org_id", orgId)
        .maybeSingle();

    const meta =
        row?.metadata !== null && typeof row?.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
    const builder = lifecycleBuilderFromDepartmentMetadata(row?.metadata);
    const activation = lifecycleActivationFromMetadata(row?.metadata);
    const procId =
        (processId ?? builder.active_process_id ?? activation?.process_id ?? null)?.trim() || null;

    const catalog = await buildLifecycleCatalog(supabase, orgId, dim);
    const entry = procId ? catalogEntryForProcess(catalog, deptId, procId) : null;
    const workspace = await fetchWorkspaceActiveDepartments(supabase, orgId, dim);
    const apiIds = workspace.map((d) => d.id);

    return {
        lifecycle_name: (row as { name?: string } | null)?.name ?? activation?.lifecycle_name ?? null,
        runtime_department_id: deptId,
        department_row_exists: Boolean(row),
        department_metadata_keys: Object.keys(meta).sort(),
        builder_owned_marker: isLifecycleBuilderOwnedDepartmentMetadata(meta),
        builder_owned: lifecycleBuilderOwnedFromMetadata(meta),
        lifecycle_builder_config: builder.processes.length > 0,
        process_id: procId,
        stages_config_location: "departments.metadata.lifecycle_builder_v1.processes[].stages",
        activation_config_location: activation ? "departments.metadata.lifecycle_activation_v1" : null,
        catalog_source: entry?.source ?? null,
        in_workspace_api: apiIds.includes(deptId),
        workspace_api_department_ids: apiIds,
    };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import { resolveLifecycleDepartmentWorkspaceAccess } from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import type { WorkspaceTilePipelineTrace } from "@/lib/workspace/workspaceRootTilePipeline";

export type LifecycleDepartmentIdAudit = {
    selected_department_id: string;
    selected_lifecycle_name: string;
    selected_process_id: string;
    expected_workspace_tile_name: string;
    sources: {
        validate_route_department_id: string;
        catalog_row_department_id: string | null;
        activation_metadata_department_id: string;
        view_link_department_id: string;
        backing_department_query_id: string | null;
    };
    presence: {
        in_builder_catalog: boolean;
        catalog_id_matches_selected: boolean;
        in_backing_department_row: boolean;
        in_get_workspace_api: boolean;
        in_workspace_rendered_tiles: boolean;
    };
    workspace_api_department_ids: string[];
    workspace_rendered_tile_ids: string[];
    mismatch_hints: string[];
};

export function expectedWorkspaceTileName(
    lifecycleName: string,
    activationOwned: boolean,
    departmentName?: string | null
): string {
    const name = lifecycleName.trim();
    if (activationOwned && name) return name;
    return (departmentName ?? name).trim();
}

export async function explainSelectedDepartmentMissingFromWorkspaceApi(
    supabase: SupabaseClient,
    orgId: string,
    selectedDepartmentId: string,
    dim: AdminAccessScopeDimensions,
    trace: WorkspaceTilePipelineTrace,
    currentUserId?: string | null
): Promise<string[]> {
    if (trace.apiDepartmentIds.includes(selectedDepartmentId)) return [];

    const hints: string[] = [];

    const { data: row, error } = await supabase
        .from("departments")
        .select("id, org_id, is_active, name, key")
        .eq("id", selectedDepartmentId)
        .maybeSingle();

    if (error) {
        hints.push(`backing_query_error: ${error.message}`);
        return hints;
    }

    if (!row) {
        hints.push("not_created: No departments row exists for this id.");
        return hints;
    }

    const r = row as { id: string; org_id: string; is_active?: boolean; name?: string };
    if (r.org_id !== orgId) {
        hints.push(`wrong_org: Department org_id is ${r.org_id}, session org is ${orgId}.`);
    }
    if (r.is_active === false) {
        hints.push("inactive: Department is_active is false (workspace filters inactive out).");
    }
    if (!departmentIdAllowed(dim, selectedDepartmentId)) {
        hints.push("access_scoped_out: Current user workspace access scope excludes this department id.");
    }

    if (currentUserId?.trim()) {
        const accessState = await resolveLifecycleDepartmentWorkspaceAccess(
            supabase,
            orgId,
            currentUserId.trim(),
            selectedDepartmentId
        );
        if (accessState.department_scope === "restricted" && !accessState.membership_provisioned) {
            hints.push(
                "access_membership_missing: department_scope=restricted but no user_department_access row for this department — run Repair workspace visibility."
            );
        }
    }

    const catalogMismatch = trace.apiDepartmentIds.length > 0 && !trace.apiDepartmentIds.includes(selectedDepartmentId);
    if (catalogMismatch && hints.length === 0) {
        hints.push(
            "mismatched_department_id: Row exists in org but GET /api/admin/departments (scoped) did not return this id — validation may be checking a different id than workspace, or gate scope differs."
        );
    }

    if (hints.length === 0) {
        hints.push(
            "unknown: Department row exists and appears in scope, but id is absent from workspace API list — compare validate_route_department_id vs catalog_row_department_id in audit table."
        );
    }

    return hints;
}

export async function buildLifecycleDepartmentIdAudit(
    supabase: SupabaseClient,
    orgId: string,
    selectedDepartmentId: string,
    processId: string,
    lifecycleName: string,
    activationOwned: boolean,
    catalogEntry: LifecycleCatalogEntry | null,
    trace: WorkspaceTilePipelineTrace,
    dim: AdminAccessScopeDimensions
): Promise<LifecycleDepartmentIdAudit> {
    const selected = selectedDepartmentId.trim();
    const { data: backingRow } = await supabase
        .from("departments")
        .select("id, name, is_active, org_id")
        .eq("id", selected)
        .eq("org_id", orgId)
        .maybeSingle();

    const inCatalog = Boolean(catalogEntry);
    const catalogId = catalogEntry?.department_id ?? null;
    const catalogMatches = catalogId === selected;
    const inBacking = Boolean(backingRow);
    const inApi = trace.apiDepartmentIds.includes(selected);
    const inRendered = trace.renderedTileIds.includes(selected);

    const mismatch_hints: string[] = [];
    if (catalogId && catalogId !== selected) {
        mismatch_hints.push(
            `catalog_row_department_id (${catalogId}) differs from validate_route_department_id (${selected}).`
        );
    }
    if (!inApi) {
        mismatch_hints.push(
            ...(await explainSelectedDepartmentMissingFromWorkspaceApi(
                supabase,
                orgId,
                selected,
                dim,
                trace,
                null
            ))
        );
    }

    return {
        selected_department_id: selected,
        selected_lifecycle_name: lifecycleName,
        selected_process_id: processId,
        expected_workspace_tile_name: expectedWorkspaceTileName(
            lifecycleName,
            activationOwned,
            (backingRow as { name?: string } | null)?.name ?? catalogEntry?.department_name
        ),
        sources: {
            validate_route_department_id: selected,
            catalog_row_department_id: catalogId,
            activation_metadata_department_id: selected,
            view_link_department_id: selected,
            backing_department_query_id: inBacking ? selected : null,
        },
        presence: {
            in_builder_catalog: inCatalog,
            catalog_id_matches_selected: catalogMatches,
            in_backing_department_row: inBacking,
            in_get_workspace_api: inApi,
            in_workspace_rendered_tiles: inRendered,
        },
        workspace_api_department_ids: [...trace.apiDepartmentIds],
        workspace_rendered_tile_ids: [...trace.renderedTileIds],
        mismatch_hints,
    };
}

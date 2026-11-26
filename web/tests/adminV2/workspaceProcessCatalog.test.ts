import { describe, expect, it } from "vitest";

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    catalogEntriesAvailableToCreate,
    catalogIdFromWorkspaceProcessSurfaceId,
    isVisibleLifecycleCatalogEntry,
    resolveSummaryCatalogIds,
    surfaceObjectForCatalogEntry,
    workspaceProcessSurfaceId,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";

function catalogEntry(partial: Partial<LifecycleCatalogEntry>): LifecycleCatalogEntry {
    return {
        id: "dept-uuid-0000-0000-0000-000000000001:proc-uuid-0000-0000-0000-000000000002",
        config_source: "departments.metadata.lifecycle_builder_v1",
        department_id: "dept-uuid-0000-0000-0000-000000000001",
        department_key: "enrollment",
        department_name: "Enrollment",
        process_id: "proc-uuid-0000-0000-0000-000000000002",
        process_key: "enrollment",
        lifecycle_name: "Enrollment",
        source: "builder_owned",
        stage_count: 3,
        track_count: 1,
        work_unit_count: 1,
        activation_owned: true,
        can_delete: false,
        can_repair: false,
        workspace: {
            backing_department_exists: true,
            department_is_active: true,
            visible_in_workspace_api: true,
            user_has_access: true,
            name_matches_tile: true,
            runtime_status: "visible",
            tile_name: "Enrollment",
        },
        ...partial,
    };
}

describe("workspaceProcessCatalog", () => {
    it("round-trips catalog ids through surface ids", () => {
        const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:ffffffff-1111-2222-3333-444444444444";
        const surfaceId = workspaceProcessSurfaceId(id);
        expect(surfaceId).toBe(
            "workspace-process-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-ffffffff-1111-2222-3333-444444444444",
        );
        expect(catalogIdFromWorkspaceProcessSurfaceId(surfaceId)).toBe(id);
    });

    it("bootstraps a single visible catalog process (Enrollment-only org)", () => {
        const enrollment = catalogEntry({});
        const ids = resolveSummaryCatalogIds([enrollment], DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG);
        expect(ids).toEqual([enrollment.id]);
    });

    it("does not seed fake operational-calculation domains", () => {
        const enrollment = catalogEntry({});
        const surfaces = resolveSummaryCatalogIds([enrollment], DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG).map(
            (id) => surfaceObjectForCatalogEntry(enrollment),
        );
        expect(surfaces.map((s) => s.title)).toEqual(["Enrollment"]);
        expect(surfaces.map((s) => s.id)).not.toContain("workspace-process-operational_health");
    });

    it("lists only catalog processes available to create when multiple exist", () => {
        const enrollment = catalogEntry({ id: "a:a", lifecycle_name: "Enrollment" });
        const billing = catalogEntry({
            id: "b:b",
            lifecycle_name: "Billing",
            process_key: "billing",
            department_key: "billing",
        });
        const catalog = [enrollment, billing];
        const configured = resolveSummaryCatalogIds(catalog, {
            ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
            summaryCatalogIds: [enrollment.id],
        });
        expect(configured).toEqual([enrollment.id]);
        expect(catalogEntriesAvailableToCreate(catalog, {
            ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
            summaryCatalogIds: [enrollment.id],
        }).map((e) => e.lifecycle_name)).toEqual(["Billing"]);
    });

    it("filters invisible lifecycle rows", () => {
        const hidden = catalogEntry({
            workspace: {
                ...catalogEntry({}).workspace,
                visible_in_workspace_api: false,
            },
        });
        expect(isVisibleLifecycleCatalogEntry(hidden)).toBe(false);
    });
});

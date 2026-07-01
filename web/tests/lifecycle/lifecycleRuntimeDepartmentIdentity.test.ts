import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    applyRuntimeDepartmentId,
    buildIdentityFromCatalogEntry,
    buildIdentityForNewLifecycle,
    identityHasSyncDrift,
} from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const catalogEntry = (partial: Partial<LifecycleCatalogEntry>): LifecycleCatalogEntry => ({
    id: "dept-a:p1",
    config_source: "departments.metadata.lifecycle_builder_v1",
    department_id: "dept-a",
    department_key: "enrollment",
    department_name: "Enrollment",
    process_id: "p1",
    process_key: "enrollment",
    lifecycle_name: "Enrollment",
    source: "legacy",
    stage_count: 1,
    track_count: 0,
    work_unit_count: 0,
    activation_owned: false,
    can_delete: false,
    can_repair: true,
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
});

describe("lifecycleRuntimeIdentity", () => {
    it("selected lifecycle has one runtimeDepartmentId on create", () => {
        const id = buildIdentityForNewLifecycle("new-dept", "proc-1", "Admissions");
        expect(id.runtimeDepartmentId).toBe("new-dept");
        expect(id.catalogDepartmentId).toBe("new-dept");
        expect(id.lifecycleId).toBe("new-dept:proc-1");
    });

    it("validation uses runtimeDepartmentId only", () => {
        const validation = read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx");
        expect(validation).toContain("identity.runtimeDepartmentId");
        expect(validation).toContain("encodeURIComponent(runtimeDepartmentId)");
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "selectedDepartmentId"
        );
    });

    it("View link uses runtimeDepartmentId only", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "workspaceDeptHref(runtimeDepartmentId)"
        );
        expect(read("lib/lifecycle/lifecycleRuntimeIdentity.ts")).toContain("workspaceDeptHref");
    });

    it("repair updates runtimeDepartmentId in board state", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("onIdentityChange(applyRuntimeDepartmentId");
        expect(read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx")).toContain(
            "setIdentity(nextIdentity)"
        );
    });

    it("catalog refreshes after repair in primary builder", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx")).toContain(
            "await loadCatalog()"
        );
    });

    it("validation fails when catalog ID differs from runtime ID", () => {
        const legacy = buildIdentityFromCatalogEntry(catalogEntry({}));
        const drifted = applyRuntimeDepartmentId(legacy, "dedicated-dept");
        expect(identityHasSyncDrift(drifted)).toBe(true);
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "identityHasSyncDrift"
        );
    });

    it("work unit and API paths use runtimeDepartmentId", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("const runtimeDepartmentId = identity?.runtimeDepartmentId");
        expect(board).toContain("department_id: runtimeDepartmentId");
        expect(board).not.toContain("initialDepartmentId");
    });

    it("delete lifecycle uses runtimeDepartmentId", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("identity?.runtimeDepartmentId ?? entry.department_id");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "/lifecycle-activation"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "encodeURIComponent(runtimeDepartmentId)"
        );
    });

    it("primary builder does not boot-scan enrollment departments", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("for (const d of items)");
        expect(board).toContain("hydrateFromSelection(runtimeDepartmentId");
    });

    it("shows identity sync banner and use runtime department", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleIdentitySyncBanner.tsx")).toContain(
            "Use runtime department"
        );
    });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildLifecycleBuilderOwnedMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata,
    mergeLifecycleBuilderOwnedIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    effectiveDepartmentScopeDimensions,
    portalAdminBypassesDepartmentScope,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycleBuilderOwned metadata", () => {
    it("create persists canonical lifecycle_builder_owned_v1", () => {
        const meta = buildLifecycleBuilderOwnedMetadata({
            created_by: "user-1",
            process_id: "proc-1",
        });
        expect(isLifecycleBuilderOwnedDepartmentMetadata(meta)).toBe(true);
        expect(meta.lifecycle_builder_owned_v1).toMatchObject({
            source: "lifecycle_builder",
            created_by: "user-1",
            process_id: "proc-1",
        });
    });

    it("reads legacy lifecycle_activation_owned_v1 flag", () => {
        expect(isLifecycleBuilderOwnedDepartmentMetadata({ lifecycle_activation_owned_v1: true })).toBe(true);
    });

    it("merge updates process_id on department metadata", () => {
        const base = buildLifecycleBuilderOwnedMetadata({ created_by: "u1", process_id: null });
        const next = mergeLifecycleBuilderOwnedIntoMetadata(base, { process_id: "p2" });
        const owned = next.lifecycle_builder_owned_v1 as { process_id: string };
        expect(owned.process_id).toBe("p2");
    });
});

describe("portal admin department scope bypass", () => {
    const restrictedAccess: AdminAccessContextSuccess = {
        ok: true,
        userId: "u1",
        orgId: "org-1",
        roleKeys: ["admin"],
        permissionKeys: [],
        departmentScope: "restricted",
        allowedDepartmentIds: ["dept-a"],
        siteScope: "all",
        allowedSiteLocationIds: [],
    };

    it("admin role bypasses restricted profile scope for list APIs", () => {
        expect(portalAdminBypassesDepartmentScope(["admin"])).toBe(true);
        const dim = effectiveDepartmentScopeDimensions(
            scopeDimensionsFromAccess(restrictedAccess),
            restrictedAccess.roleKeys
        );
        expect(dim.departmentScope).toBe("all");
    });

    it("custom role without admin/ops keeps restricted scope", () => {
        const dim = effectiveDepartmentScopeDimensions(
            scopeDimensionsFromAccess({
                ...restrictedAccess,
                roleKeys: ["enrollment_coordinator"],
            }),
            ["enrollment_coordinator"]
        );
        expect(dim.departmentScope).toBe("restricted");
        expect(dim.allowedDepartmentIds).toEqual(["dept-a"]);
    });
});

describe("lifecycle admin scope and persistence wiring", () => {
    it("departments GET uses effective scope via admin route gate", () => {
        expect(read("lib/admin/adminRouteGate.ts")).toContain("effectiveDepartmentScopeDimensions");
        expect(read("app/api/admin/departments/route.ts")).toContain('departmentScope === "restricted"');
    });

    it("create form uses client create path and builder-owned metadata", () => {
        expect(read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts")).toContain("newBuilderOwnedDepartmentMetadata");
        expect(read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx")).toContain(
            "createLifecycleViaBuilderPath"
        );
    });

    it("validation fails without runtime department and marker", () => {
        const validate = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(validate).toContain("runtime_department_row");
        expect(validate).toContain("builder_owned_marker");
        expect(validate).toContain("settings_only_legacy");
    });

    it("catalog uses builder-owned marker", () => {
        expect(read("lib/lifecycle/lifecycleCatalog.ts")).toContain("isLifecycleBuilderOwnedDepartmentMetadata");
    });

    it("exposes access-scope-debug and dev create verify in development UI", () => {
        expect(read("app/api/admin/access-scope-debug/route.ts")).toContain("portal_admin_bypasses_department_scope");
        expect(read("components/adminV2/settings/lifecycle/LifecycleDevCreateVerifyButton.tsx")).toContain(
            "createLifecycleViaBuilderPath"
        );
        expect(read("components/adminV2/settings/lifecycle/AdminAccessScopeDebugPanel.tsx")).toContain("department_scope_raw");
    });
});

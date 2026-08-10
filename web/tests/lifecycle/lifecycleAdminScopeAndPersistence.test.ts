import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildLifecycleBuilderOwnedMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata,
    mergeLifecycleBuilderOwnedIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
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

/**
 * W-8 (I-20, closes C8) — no role widens a scope dimension.
 *
 * This block previously asserted the opposite: that `admin` bypassed a restricted profile. It is
 * inverted rather than deleted so the regression it locks is the exact behaviour that shipped.
 */
describe("W-8 — no role widens department scope", () => {
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

    it.each([["admin"], ["ops"], ["admin", "ops"], ["enrollment_coordinator"]])(
        "keeps the stored restricted scope for roleKeys %j",
        (...roleKeys: string[]) => {
            const dim = scopeDimensionsFromAccess({ ...restrictedAccess, roleKeys });
            expect(dim.departmentScope).toBe("restricted");
            expect(dim.allowedDepartmentIds).toEqual(["dept-a"]);
            expect(departmentIdAllowed(dim, "dept-a")).toBe(true);
            expect(departmentIdAllowed(dim, "dept-b")).toBe(false);
        }
    );

    it("accessScope.ts contains no role literal in an enforcement branch", () => {
        // The exit criterion for W-8. Role governs admission, never the scope a route enforces.
        // The W-8 comment block names the deleted symbols on purpose, so assert on executable
        // lines only — otherwise the explanation of the fix would read as the fix being absent.
        const executable = read("lib/admin/accessScope.ts")
            .split("\n")
            .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
            .join("\n");
        expect(executable).not.toContain("portalAdminBypassesDepartmentScope");
        expect(executable).not.toContain("effectiveDepartmentScopeDimensions");
        expect(executable).not.toContain("PORTAL_DEPARTMENT_SCOPE_BYPASS_ROLES");
        expect(executable).not.toMatch(/["']admin["']/);
        expect(executable).not.toMatch(/["']ops["']/);
    });

    it("the self-provisioning write that the bypass kept latent is gone", () => {
        const src = read("lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess.ts");
        expect(src).not.toContain('.from("user_department_access").insert');
        expect(src).toContain("SELF_DEPARTMENT_PROVISIONING_MESSAGE");
    });
});

describe("lifecycle admin scope and persistence wiring", () => {
    it("departments GET uses stored scope via admin route gate", () => {
        expect(read("lib/admin/adminRouteGate.ts")).toContain("scopeDimensionsFromAccess");
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

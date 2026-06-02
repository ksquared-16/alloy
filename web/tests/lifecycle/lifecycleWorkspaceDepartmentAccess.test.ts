import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    departmentVisibleInWorkspaceApi,
    ensureLifecycleDepartmentWorkspaceAccess,
    resolveLifecycleDepartmentWorkspaceAccess,
    refreshDepartmentScopeDimensions,
} from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function createAccessProvisionMock(config: {
    department?: { id: string; is_active: boolean } | null;
    profile?: { department_scope: string } | null;
    existingAccess?: { id: string } | null;
    insertError?: string | null;
}): SupabaseClient {
    const from = vi.fn((table: string) => {
        if (table === "departments") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: () =>
                                Promise.resolve({
                                    data: config.department ?? { id: "dept-new", is_active: true },
                                    error: null,
                                }),
                        }),
                    }),
                }),
            };
        }
        if (table === "user_access_profiles") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: () =>
                                Promise.resolve({ data: config.profile ?? null, error: null }),
                        }),
                    }),
                }),
            };
        }
        if (table === "user_department_access") {
            const chain = {
                eq: vi.fn(function (this: unknown) {
                    return chain;
                }),
                maybeSingle: () =>
                    Promise.resolve({ data: config.existingAccess ?? null, error: null }),
            };
            return {
                select: () => ({
                    eq: () => chain,
                }),
                insert: () =>
                    Promise.resolve({
                        error: config.insertError ? { message: config.insertError } : null,
                    }),
            };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    });
    return { from } as unknown as SupabaseClient;
}

describe("ensureLifecycleDepartmentWorkspaceAccess", () => {
    it("creates user_department_access when department_scope is restricted", async () => {
        const supabase = createAccessProvisionMock({
            profile: { department_scope: "restricted" },
            existingAccess: null,
        });
        const result = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId: "org-1",
            departmentId: "dept-new",
            currentUserId: "user-1",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inserted).toBe(true);
            expect(result.department_scope).toBe("restricted");
        }
    });

    it("does not insert when department_scope is all", async () => {
        const supabase = createAccessProvisionMock({
            profile: { department_scope: "all" },
        });
        const result = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId: "org-1",
            departmentId: "dept-new",
            currentUserId: "user-1",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inserted).toBe(false);
            expect(result.department_scope).toBe("all");
        }
    });

    it("resolve marks membership missing when restricted and no row", async () => {
        const supabase = createAccessProvisionMock({
            profile: { department_scope: "restricted" },
            existingAccess: null,
        });
        const state = await resolveLifecycleDepartmentWorkspaceAccess(
            supabase,
            "org-1",
            "user-1",
            "dept-new"
        );
        expect(state.department_scope).toBe("restricted");
        expect(state.membership_provisioned).toBe(false);
        expect(state.visible_in_departments_api).toBe(false);
    });

    it("resolve passes membership after provision (validation workspace_access truth)", async () => {
        const supabase = createAccessProvisionMock({
            profile: { department_scope: "restricted" },
            existingAccess: { id: "uda-1" },
        });
        const state = await resolveLifecycleDepartmentWorkspaceAccess(
            supabase,
            "org-1",
            "user-1",
            "dept-new"
        );
        expect(state.membership_provisioned).toBe(true);
        expect(state.visible_in_departments_api).toBe(true);
    });

    it("departmentVisibleInWorkspaceApi false when id not in allowedDepartmentIds", async () => {
        const supabase = createAccessProvisionMock({});
        const dim: AdminAccessScopeDimensions = {
            departmentScope: "restricted",
            allowedDepartmentIds: ["dept-other"],
            siteScope: "all",
            allowedSiteLocationIds: [],
        };
        const visible = await departmentVisibleInWorkspaceApi(supabase, "org-1", "dept-new", dim);
        expect(visible).toBe(false);
    });

    it("departmentVisibleInWorkspaceApi true when allowed and active", async () => {
        const supabase = createAccessProvisionMock({});
        const dim: AdminAccessScopeDimensions = {
            departmentScope: "restricted",
            allowedDepartmentIds: ["dept-new"],
            siteScope: "all",
            allowedSiteLocationIds: [],
        };
        const visible = await departmentVisibleInWorkspaceApi(supabase, "org-1", "dept-new", dim);
        expect(visible).toBe(true);
    });

    it("refreshDepartmentScopeDimensions reloads allow list after insert", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "user_department_access") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () =>
                                    Promise.resolve({
                                        data: [{ department_id: "dept-a" }, { department_id: "dept-new" }],
                                        error: null,
                                    }),
                            }),
                        }),
                    };
                }
                return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
            }),
        } as unknown as SupabaseClient;

        const dim = await refreshDepartmentScopeDimensions(supabase, "org-1", "user-1", {
            departmentScope: "restricted",
            allowedDepartmentIds: ["dept-a"],
            siteScope: "all",
            allowedSiteLocationIds: [],
        });
        expect(dim.allowedDepartmentIds).toContain("dept-new");
    });
});

describe("lifecycle workspace department access wiring", () => {
    it("POST departments provisions access for activation-owned metadata", () => {
        const route = read("app/api/admin/departments/route.ts");
        expect(route).toContain("ensureLifecycleDepartmentWorkspaceAccess");
        expect(route).toContain("isLifecycleBuilderOwnedDepartmentMetadata");
    });

    it("repair provisions user_department_access", () => {
        expect(read("lib/lifecycle/repairLifecycleWorkspaceVisibility.ts")).toContain(
            "provisioned_user_department_access"
        );
        expect(read("app/api/admin/lifecycle-catalog/repair/route.ts")).toContain("access.userId");
    });

    it("validation includes workspace_access check", () => {
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain("workspace_access");
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "resolveLifecycleDepartmentWorkspaceAccess"
        );
    });

    it("does not loosen global departmentScope filters", () => {
        expect(read("app/api/admin/departments/route.ts")).toContain('departmentScope === "restricted"');
        expect(read("app/api/admin/departments/route.ts")).not.toContain('departmentScope = "all"');
    });
});

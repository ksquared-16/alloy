import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    departmentVisibleInWorkspaceApi,
    ensureLifecycleDepartmentWorkspaceAccess,
    resolveLifecycleDepartmentWorkspaceAccess,
    refreshDepartmentScopeDimensions,
    SELF_DEPARTMENT_PROVISIONING_MESSAGE,
} from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";

/**
 * W-8: every `user_department_access` insert attempted through this module is recorded here so a
 * test can assert on the *absence* of the write, not merely on the returned shape. A future change
 * that re-adds self-provisioning fails these tests even if it keeps the same result type.
 */
let insertCalls: unknown[] = [];

beforeEach(() => {
    insertCalls = [];
});

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
                insert: (row: unknown) => {
                    insertCalls.push(row);
                    return Promise.resolve({
                        error: config.insertError ? { message: config.insertError } : null,
                    });
                },
            };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    });
    return { from } as unknown as SupabaseClient;
}

describe("ensureLifecycleDepartmentWorkspaceAccess", () => {
    /**
     * W-8 (I-20) — this suite previously asserted that a restricted principal got a
     * `user_department_access` row created for itself. That write was the self-authority path the
     * deleted `portalAdminBypassesDepartmentScope` gate kept latent; the assertion is inverted, and
     * the mock's `insert` is now asserted never to be reached.
     */
    it("refuses, and never inserts, when the caller is restricted and lacks the department", async () => {
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
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toBe(SELF_DEPARTMENT_PROVISIONING_MESSAGE);
        }
        expect(insertCalls).toEqual([]);
    });

    it("reports existing access without writing when the caller already holds the department", async () => {
        const supabase = createAccessProvisionMock({
            profile: { department_scope: "restricted" },
            existingAccess: { id: "uda-1" },
        });
        const result = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId: "org-1",
            departmentId: "dept-new",
            currentUserId: "user-1",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.department_scope).toBe("restricted");
            expect(result.already_had_access).toBe(true);
        }
        expect(insertCalls).toEqual([]);
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
            expect(result.department_scope).toBe("all");
        }
        expect(insertCalls).toEqual([]);
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

    it("resolve passes membership when the row exists (validation workspace_access truth)", async () => {
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

    it("refreshDepartmentScopeDimensions reloads the allow list from user_department_access", async () => {
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
    it("POST departments checks — but never grants — access for activation-owned metadata", () => {
        const route = read("app/api/admin/departments/route.ts");
        expect(route).toContain("ensureLifecycleDepartmentWorkspaceAccess");
        expect(route).toContain("isLifecycleBuilderOwnedDepartmentMetadata");
        // W-8: a restricted creator is refused, not silently widened.
        expect(route).toContain("status: 403");
    });

    it("W-8 — neither product path can provision user_department_access for its caller", () => {
        const repair = read("lib/lifecycle/repairLifecycleWorkspaceVisibility.ts");
        expect(repair).not.toContain("provisioned_user_department_access");
        expect(read("app/api/admin/lifecycle-catalog/repair/route.ts")).toContain("access.userId");
        // The insert lived only here; no caller may reintroduce one of its own.
        for (const rel of [
            "lib/lifecycle/repairLifecycleWorkspaceVisibility.ts",
            "app/api/admin/departments/route.ts",
            "app/api/admin/lifecycle-catalog/repair/route.ts",
            "lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess.ts",
        ]) {
            expect(read(rel)).not.toMatch(/from\(\s*["']user_department_access["']\s*\)\s*\.insert/);
        }
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

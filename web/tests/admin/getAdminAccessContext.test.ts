import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    resolveAdminAccessCore,
} from "@/lib/admin/resolveAdminAccessCore";
import * as supabaseAdmin from "@/lib/supabaseAdmin";

describe("chooseOrgAndRoleKeysFromMembershipRows", () => {
    it("prefers smallest org_id among admin/ops rows when mixed with custom roles", () => {
        const rows = [
            { org_id: "z-org", role: "coordinator" },
            { org_id: "a-org", role: "admin" },
            { org_id: "m-org", role: "ops" },
        ];
        const out = chooseOrgAndRoleKeysFromMembershipRows(rows);
        expect(out?.orgId).toBe("a-org");
        expect(out?.roleKeys).toEqual(["admin"]);
    });

    it("uses smallest org among all memberships when no admin/ops", () => {
        const rows = [
            { org_id: "b-org", role: "school_director" },
            { org_id: "a-org", role: "regional_lead" },
        ];
        const out = chooseOrgAndRoleKeysFromMembershipRows(rows);
        expect(out?.orgId).toBe("a-org");
        expect(out?.roleKeys).toEqual(["regional_lead"]);
    });

    it("aggregates multiple roles for chosen org when admin path picks org", () => {
        const rows = [
            { org_id: "org-1", role: "admin" },
            { org_id: "org-1", role: "custom_role" },
        ];
        const out = chooseOrgAndRoleKeysFromMembershipRows(rows);
        expect(out?.orgId).toBe("org-1");
        expect(out?.roleKeys).toEqual(["admin", "custom_role"]);
    });
});

type AuRow = { role: string; org_id: string } | null;

/** Minimal Supabase mock matching query shapes used by resolveAdminAccessCore. */
function createAccessMockSupabase(config: {
    user_roles: { org_id: string; role: string }[];
    grants?: { permission_key: string }[];
    profile?: { department_scope: string; site_scope: string } | null;
    dept_access?: { department_id: string }[];
    site_access?: { location_id: string }[];
    legacy_profile_role?: string | null;
    app_users_by_id?: AuRow;
    app_users_by_auth?: AuRow;
}): SupabaseClient {
    const grantsDefault = config.grants ?? [];
    const profileLegacy = config.legacy_profile_role ?? null;
    const auId = config.app_users_by_id ?? null;
    const auAuth = config.app_users_by_auth ?? null;

    const from = vi.fn((table: string) => {
        if (table === "user_roles") {
            return {
                select: () => ({
                    eq: () => Promise.resolve({ data: config.user_roles, error: null }),
                }),
            };
        }
        if (table === "user_profiles") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: () =>
                            Promise.resolve({
                                data: profileLegacy ? { role: profileLegacy } : null,
                                error: null,
                            }),
                    }),
                }),
            };
        }
        if (table === "app_users") {
            return {
                select: (cols: string) => ({
                    eq: (col: string) => ({
                        maybeSingle: () => {
                            const row =
                                col === "id"
                                    ? auId
                                    : col === "auth_user_id"
                                      ? auAuth
                                      : null;
                            if (!row) {
                                return Promise.resolve({ data: null, error: null });
                            }
                            if (cols.includes("role")) {
                                return Promise.resolve({ data: { role: row.role, org_id: row.org_id }, error: null });
                            }
                            return Promise.resolve({ data: { org_id: row.org_id }, error: null });
                        },
                    }),
                }),
            };
        }
        if (table === "role_permission_grants") {
            return {
                select: () => ({
                    eq: () => ({
                        in: () => ({
                            eq: () => Promise.resolve({ data: grantsDefault, error: null }),
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
                                Promise.resolve({
                                    data: config.profile ?? null,
                                    error: null,
                                }),
                        }),
                    }),
                }),
            };
        }
        if (table === "user_department_access") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () =>
                            Promise.resolve({
                                data: config.dept_access ?? [],
                                error: null,
                            }),
                    }),
                }),
            };
        }
        if (table === "user_site_access") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () =>
                            Promise.resolve({
                                data: config.site_access ?? [],
                                error: null,
                            }),
                    }),
                }),
            };
        }
        throw new Error(`unexpected table ${table}`);
    });

    return { from } as unknown as SupabaseClient;
}

describe("resolveAdminAccessCore", () => {
    it("admin membership resolves portalEligible with default all/all when profile missing", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [{ org_id: "org-x", role: "admin" }],
            grants: [{ permission_key: "crm.read" }],
            profile: null,
        });
        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core).not.toBeNull();
        expect(core!.orgId).toBe("org-x");
        expect(core!.roleKeys).toEqual(["admin"]);
        expect(core!.permissionKeys).toEqual(["crm.read"]);
        expect(core!.departmentScope).toBe("all");
        expect(core!.siteScope).toBe("all");
        expect(core!.allowedDepartmentIds).toBeNull();
        expect(core!.allowedSiteLocationIds).toBeNull();
        expect(core!.portalEligible).toBe(true);
    });

    it("ops membership resolves all/all when profile missing", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [{ org_id: "org-x", role: "ops" }],
            grants: [],
            profile: null,
        });
        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core?.portalEligible).toBe(true);
        expect(core?.roleKeys).toEqual(["ops"]);
        expect(core?.departmentScope).toBe("all");
        expect(core?.siteScope).toBe("all");
    });

    it("custom role resolves roleKeys with portalEligible false", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [{ org_id: "org-x", role: "school_director" }],
            grants: [{ permission_key: "crm.custom" }],
            profile: null,
        });
        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core?.roleKeys).toEqual(["school_director"]);
        expect(core?.portalEligible).toBe(false);
        expect(core?.permissionKeys).toEqual(["crm.custom"]);
    });

    it("restricted profile resolves allowed department and site ids", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [{ org_id: "org-x", role: "admin" }],
            grants: [],
            profile: { department_scope: "restricted", site_scope: "restricted" },
            dept_access: [{ department_id: "dept-a" }, { department_id: "dept-b" }],
            site_access: [{ location_id: "site-1" }],
        });
        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core?.departmentScope).toBe("restricted");
        expect(core?.allowedDepartmentIds?.sort()).toEqual(["dept-a", "dept-b"]);
        expect(core?.siteScope).toBe("restricted");
        expect(core?.allowedSiteLocationIds).toEqual(["site-1"]);
    });

    it("legacy app_users admin fills org when user_roles empty", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [],
            grants: [],
            profile: null,
            app_users_by_id: { role: "admin", org_id: "legacy-org" },
            app_users_by_auth: null,
        });
        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core?.orgId).toBe("legacy-org");
        expect(core?.roleKeys).toEqual(["admin"]);
        expect(core?.portalEligible).toBe(true);
    });

    it("legacy profile admin resolves org via app_users.org_id lookup", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [],
            grants: [],
            profile: null,
            legacy_profile_role: "admin",
            app_users_by_id: null,
            app_users_by_auth: { role: "admin", org_id: "legacy-org-2" },
        });
        const core = await resolveAdminAccessCore(sb, "auth-user-9");
        expect(core?.orgId).toBe("legacy-org-2");
        expect(core?.roleKeys).toEqual(["admin"]);
        expect(core?.portalEligible).toBe(true);
    });
});

describe("layout vs API org alignment (same resolver)", () => {
    it("getAdminOrgIdForUser matches resolveAdminAccessCore org when portalEligible", async () => {
        const sb = createAccessMockSupabase({
            user_roles: [{ org_id: "same-org", role: "admin" }],
            grants: [],
            profile: null,
        });

        vi.spyOn(supabaseAdmin, "createAdminClient").mockReturnValue(sb as never);

        const { getAdminOrgIdForUser } = await import("@/lib/admin/entityLabelsServer");
        const orgId = await getAdminOrgIdForUser("user-1");
        expect(orgId).toBe("same-org");

        const core = await resolveAdminAccessCore(sb, "user-1");
        expect(core?.orgId).toBe(orgId);

        vi.spyOn(supabaseAdmin, "createAdminClient").mockRestore();
    });
});

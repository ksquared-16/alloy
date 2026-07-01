import { describe, expect, it, vi, afterEach } from "vitest";
import { GET } from "@/app/api/admin/rbac/roles/route";

vi.mock("@/lib/admin/canManageUsersAndRoles", () => {
    return {
        requirePortalOrUsersRolesManageAuth: vi.fn(async () => ({
            ok: true,
            access: {
                ok: true,
                userId: "u1",
                orgId: "org-1",
                roleKeys: ["admin"],
                permissionKeys: [],
                departmentScope: "all",
                allowedDepartmentIds: null,
                siteScope: "all",
                allowedSiteLocationIds: null,
            },
        })),
        requireUsersRolesManageAuth: vi.fn(async () => ({
            ok: true,
            access: {
                ok: true,
                userId: "u1",
                orgId: "org-1",
                roleKeys: ["admin"],
                permissionKeys: [],
                departmentScope: "all",
                allowedDepartmentIds: null,
                siteScope: "all",
                allowedSiteLocationIds: null,
            },
        })),
    };
});

function createEmptyRoleDefinitionsQuery() {
    const q: {
        select: () => typeof q;
        eq: () => typeof q;
        order: () => typeof q | Promise<{ data: unknown[]; error: null }>;
        _orderCalls: number;
    } = {
        _orderCalls: 0,
        select: () => q,
        eq: () => q,
        order: () => {
            q._orderCalls += 1;
            // route orders twice: is_system then role_label
            if (q._orderCalls >= 2) return Promise.resolve({ data: [], error: null });
            return q;
        },
    };
    vi.spyOn(q, "select");
    vi.spyOn(q, "eq");
    vi.spyOn(q, "order");
    return q;
}

vi.mock("@/lib/supabaseAdmin", () => {
    const q = createEmptyRoleDefinitionsQuery();
    return {
        createAdminClient: vi.fn(() => ({
            from: vi.fn(() => q),
        })),
    };
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("GET /api/admin/rbac/roles", () => {
    it("includes default system roles when org has none in role_definitions", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const json = (await res.json()) as { roles?: Array<{ role_key: string }> };
        const keys = (json.roles ?? []).map((r) => r.role_key).sort();
        expect(keys).toEqual(["admin", "ops", "regional_lead", "school_director"].sort());
    });
});


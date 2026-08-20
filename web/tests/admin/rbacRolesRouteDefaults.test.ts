/**
 * W-61 (tier A) — `GET /api/admin/rbac/roles` returns no role that has no persisted row.
 *
 * This file used to assert the opposite. It locked `mergeRoleDefinitionsWithDefaults`:
 * with an EMPTY `role_definitions` result it required the response to contain all four
 * hard-coded defaults. That is the read-time fabrication `W-61` removes, so the lock is
 * inverted here rather than deleted — a deleted test would leave the criterion unguarded,
 * and the fabrication could return without failing anything.
 *
 * The empty case is the load-bearing one: it is the only case where fabrication is
 * observable, because a merge over a full result set is indistinguishable from a
 * pass-through.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/rbac/roles/route";

const access = {
    ok: true,
    userId: "u1",
    orgId: "org-1",
    roleKeys: ["admin"],
    permissionKeys: [],
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "all",
    allowedSiteLocationIds: null,
};

vi.mock("@/lib/admin/canManageUsersAndRoles", () => ({
    requirePortalOrUsersRolesManageAuth: vi.fn(async () => ({ ok: true, access })),
    requireUsersRolesManageAuth: vi.fn(async () => ({ ok: true, access })),
}));

/** What the mocked `role_definitions` read resolves to for the next GET. */
let roleRows: unknown[] = [];
let roleError: { message: string } | null = null;

vi.mock("@/lib/supabaseAdmin", () => {
    const makeQuery = () => {
        let orderCalls = 0;
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        // The route orders twice (is_system, then role_label); the second call resolves.
        q.order = () => (++orderCalls >= 2 ? Promise.resolve({ data: roleRows, error: roleError }) : q);
        return q;
    };
    return { createAdminClient: vi.fn(() => ({ from: vi.fn(() => makeQuery()) })) };
});

async function getRoles() {
    const res = await GET();
    const json = (await res.json()) as { roles?: Array<{ role_key: string; created_at: string | null }> };
    return { status: res.status, roles: json.roles ?? [] };
}

const persisted = (role_key: string, role_label: string) => ({
    role_key,
    role_label,
    is_system: true,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
    roleRows = [];
    roleError = null;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("W-61 — GET /api/admin/rbac/roles does not fabricate roles", () => {
    it("returns no roles when the org has no role_definitions rows", async () => {
        const { status, roles } = await getRoles();

        expect(status).toBe(200);
        // Previously this returned admin/ops/regional_lead/school_director out of a constant.
        expect(roles).toEqual([]);
    });

    it("never invents the four formerly-hard-coded defaults", async () => {
        roleRows = [persisted("admin", "Admin")];
        const { roles } = await getRoles();

        expect(roles.map((r) => r.role_key)).toEqual(["admin"]);
        for (const fabricated of ["ops", "regional_lead", "school_director"]) {
            expect(roles.some((r) => r.role_key === fabricated)).toBe(false);
        }
    });

    it("every returned role carries a persisted created_at", async () => {
        // Fabricated rows were the only ones with `created_at: null` — that was their tell.
        roleRows = [persisted("admin", "Admin"), persisted("ops", "Ops")];
        const { roles } = await getRoles();

        expect(roles).toHaveLength(2);
        expect(roles.every((r) => r.created_at !== null)).toBe(true);
    });

    it("is not vacuous — persisted rows are still returned unchanged", async () => {
        // Without this, a route that returned [] unconditionally would pass every test above.
        roleRows = [persisted("admin", "Admin"), persisted("custom_role", "Custom role")];
        const { roles } = await getRoles();

        expect(roles.map((r) => r.role_key)).toEqual(["admin", "custom_role"]);
    });

    it("surfaces a read failure instead of serving a fabricated list", async () => {
        roleError = { message: "role_definitions unavailable" };
        const { status } = await getRoles();

        expect(status).toBe(500);
    });
});

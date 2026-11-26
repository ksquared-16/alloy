/**
 * An invitation limited to selected locations is ONE write — and a refused restriction never leaves
 * an invited account behind.
 *
 * Before: the membership was created all/all and narrowed by a second request; when that request
 * failed (or the inviter could not write scope) the operator's "Selected locations" left an
 * organization-wide account. Now the restriction travels with the invite: validated before the email
 * is sent, written by create_membership_with_access_scope in one transaction. An all-locations invite
 * keeps the existing path and asks for no new authority.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permissionKeys: [] as string[] }));

vi.mock("@/lib/admin/canManageUsersAndRoles", async (orig) => {
    const actual = await orig<typeof import("@/lib/admin/canManageUsersAndRoles")>();
    return {
        ...actual,
        requireAccessAdministration: vi.fn(async () => ({ ok: true, access: { orgId: "org-1", userId: "actor-1", permissionKeys: state.permissionKeys } })),
    };
});

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ invites: [] as string[], rpcs: [] as Array<{ name: string; args: Row }>, locations: [] as Row[] }));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => {
        const from = (table: string) => {
            const filters: Array<(r: Row) => boolean> = [];
            const rows = () => (table === "locations" ? db.locations : table === "role_definitions" ? [{ org_id: "org-1", role_key: "teacher", is_active: true }] : []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        };
        return {
            from,
            rpc: async (name: string, args: Row) => { db.rpcs.push({ name, args }); return { data: { user_id: args.p_user_id, org_id: args.p_org_id, role: args.p_role }, error: null }; },
            auth: { admin: { inviteUserByEmail: async (email: string) => { db.invites.push(email); return { data: { user: { id: "new-user", email } }, error: null }; } } },
        };
    },
}));

import { POST } from "@/app/api/admin/users/route";

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const post = (body: Row) => POST(new Request("http://x/api/admin/users", { method: "POST", body: JSON.stringify({ email: "new@example.com", role: "teacher", ...body }) }));

beforeEach(() => {
    db.invites = []; db.rpcs = [];
    db.locations = [
        { id: SITE_A, org_id: "org-1", location_type: "site" },
        { id: SITE_B, org_id: "org-2", location_type: "site" },
    ];
    state.permissionKeys = ["admin.users.write", "admin.access_scope.write"];
});

describe("an invitation limited to selected locations", () => {
    it("is written by ONE transactional function, with the selected sites", async () => {
        const res = await post({ site_scope: "restricted", site_location_ids: [SITE_A] });
        expect(res.status).toBe(200);
        expect(db.rpcs).toHaveLength(1);
        expect(db.rpcs[0]).toMatchObject({
            name: "create_membership_with_access_scope",
            args: { p_user_id: "new-user", p_org_id: "org-1", p_role: "teacher", p_actor_user_id: "actor-1", p_site_scope: "restricted", p_site_location_ids: [SITE_A] },
        });
        expect(await res.json()).toMatchObject({ site_scope: "restricted", site_location_ids: [SITE_A] });
    });

    it("needs the scope-write authority the second request used to need — refused BEFORE any invitation is sent", async () => {
        state.permissionKeys = ["admin.users.write"];
        const res = await post({ site_scope: "restricted", site_location_ids: [SITE_A] });
        expect(res.status).toBe(403);
        expect(db.invites).toEqual([]);
        expect(db.rpcs).toEqual([]);
    });

    it("refuses another organization's site, or an empty restriction, before any invitation is sent", async () => {
        for (const body of [{ site_scope: "restricted", site_location_ids: [SITE_B] }, { site_scope: "restricted", site_location_ids: [] }, { site_scope: "nowhere" }]) {
            const res = await post(body);
            expect(res.status).toBe(400);
        }
        expect(db.invites).toEqual([]);
        expect(db.rpcs).toEqual([]);
    });
});

describe("an all-locations invitation is unchanged", () => {
    it("uses the existing membership owner and asks for no new authority", async () => {
        state.permissionKeys = ["admin.users.write"];
        const res = await post({});
        expect(res.status).toBe(200);
        expect(db.rpcs.map((r) => r.name)).toEqual(["create_membership_with_access_profile"]);
        expect(await res.json()).toMatchObject({ site_scope: "all", site_location_ids: [] });
    });
});

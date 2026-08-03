/**
 * W-2 — Self-elevation ban (I-11; partially closes G3).
 *
 * Plan: `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §5.
 * Regression lock **RL-11** — a principal cannot modify its own authority.
 *
 * This is not the D3-dependent delegation ceiling (W-18). No reading of D3 permits a principal to
 * modify its own authority, so the ban is unconditional and ships ahead of that decision.
 *
 * The plan named `PATCH /api/admin/users/[userId]/role`. Its exit criterion is broader — *"a
 * principal cannot alter its own membership through any product path"* — and an audit of the
 * membership writers found two more self-authority paths reachable from the same Access screen
 * (`components/adminV2/settings/access/AccessUsersConfigurationPage.tsx`): `access-scope` PATCH
 * (widening your own department/site scope) and `remove` POST (deleting your own membership).
 * All three are covered.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import {
    isSelfAuthorityMutation,
    SELF_AUTHORITY_MUTATION_MESSAGE,
} from "@/lib/admin/selfAuthorityMutation";

const orgId = "22222222-2222-2222-2222-222222222222";
const CALLER = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";

const { mockRequireUsersRolesManageAuth } = vi.hoisted(() => ({
    mockRequireUsersRolesManageAuth: vi.fn(),
}));

vi.mock("@/lib/admin/canManageUsersAndRoles", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/canManageUsersAndRoles")>(
        "@/lib/admin/canManageUsersAndRoles"
    );
    return { ...actual, requireUsersRolesManageAuth: mockRequireUsersRolesManageAuth };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/admin/resolveAdminAccessCore", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/resolveAdminAccessCore")>(
        "@/lib/admin/resolveAdminAccessCore"
    );
    return { ...actual, resolveAdminAccessDimensionsForOrgMember: vi.fn() };
});

import { createAdminClient } from "@/lib/supabaseAdmin";
import { PATCH as rolePATCH } from "@/app/api/admin/users/[userId]/role/route";
import { PATCH as accessScopePATCH } from "@/app/api/admin/users/[userId]/access-scope/route";
import { POST as removePOST } from "@/app/api/admin/users/[userId]/remove/route";

/** Every role the product can assign, plus the caller's own current role. */
const ROLE_VALUES = ["admin", "ops", "regional_lead", "school_director", "coordinator"];

/** The three product paths that write `(principal, org)` authority. */
function pathsFor(targetUserId: string): { name: string; call: () => Promise<Response> }[] {
    const params = { params: Promise.resolve({ userId: targetUserId }) };
    return [
        {
            name: "PATCH /api/admin/users/[userId]/role",
            call: () =>
                rolePATCH(
                    new NextRequest(`http://localhost/api/admin/users/${targetUserId}/role`, {
                        method: "PATCH",
                        body: JSON.stringify({ role: "admin" }),
                        headers: { "Content-Type": "application/json" },
                    }),
                    params
                ),
        },
        {
            name: "PATCH /api/admin/users/[userId]/access-scope",
            call: () =>
                accessScopePATCH(
                    new NextRequest(`http://localhost/api/admin/users/${targetUserId}/access-scope`, {
                        method: "PATCH",
                        body: JSON.stringify({ department_scope: "all", site_scope: "all" }),
                        headers: { "Content-Type": "application/json" },
                    }),
                    params
                ),
        },
        {
            name: "POST /api/admin/users/[userId]/remove",
            call: () =>
                removePOST(
                    new Request(`http://localhost/api/admin/users/${targetUserId}/remove`, {
                        method: "POST",
                    }),
                    params
                ),
        },
    ];
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUsersRolesManageAuth.mockResolvedValue({
        ok: true,
        access: {
            ok: true,
            userId: CALLER,
            orgId,
            // A caller who fully passes the manage gate — the denial below is the *self* rule,
            // not a missing capability.
            roleKeys: ["admin"],
            permissionKeys: ["settings.users_roles"],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        },
    });
});

describe("isSelfAuthorityMutation", () => {
    it("is true when caller and target are the same principal", () => {
        expect(isSelfAuthorityMutation({ callerUserId: CALLER, targetUserId: CALLER })).toBe(true);
    });

    it("tolerates surrounding whitespace on the route param", () => {
        expect(isSelfAuthorityMutation({ callerUserId: CALLER, targetUserId: ` ${CALLER} ` })).toBe(
            true
        );
    });

    it("is false for a different principal", () => {
        expect(isSelfAuthorityMutation({ callerUserId: CALLER, targetUserId: OTHER })).toBe(false);
    });

    it("is false when either id is missing — never treats blank as a match", () => {
        expect(isSelfAuthorityMutation({ callerUserId: "", targetUserId: "" })).toBe(false);
        expect(isSelfAuthorityMutation({ callerUserId: CALLER, targetUserId: "" })).toBe(false);
        expect(isSelfAuthorityMutation({ callerUserId: "", targetUserId: CALLER })).toBe(false);
    });
});

describe("W-2 — a principal cannot modify its own authority (RL-11)", () => {
    for (const path of pathsFor(CALLER)) {
        it(`${path.name} → 403 when the caller is the target`, async () => {
            const res = await path.call();
            expect(res.status).toBe(403);
            await expect(res.json()).resolves.toEqual({ error: SELF_AUTHORITY_MUTATION_MESSAGE });
        });

        it(`${path.name} → no write is attempted after the denial`, async () => {
            // The guard returns before the admin client is constructed, so no statement can reach
            // the database. This is the tier-B form of "the row is unchanged after the denial".
            await path.call();
            expect(createAdminClient).not.toHaveBeenCalled();
        });
    }

    it("denies self-assignment of every role value, including the caller's current one", async () => {
        const params = { params: Promise.resolve({ userId: CALLER }) };
        for (const role of ROLE_VALUES) {
            const res = await rolePATCH(
                new NextRequest(`http://localhost/api/admin/users/${CALLER}/role`, {
                    method: "PATCH",
                    body: JSON.stringify({ role }),
                    headers: { "Content-Type": "application/json" },
                }),
                params
            );
            expect(res.status, `role=${role}`).toBe(403);
        }
        expect(createAdminClient).not.toHaveBeenCalled();
    });
});

describe("W-2 — mutating another principal is unaffected", () => {
    for (const path of pathsFor(OTHER)) {
        it(`${path.name} → proceeds past the self guard for a different target`, async () => {
            // Reaching the admin client means the guard did not fire. The handler's own outcome
            // beyond that point is not this test's subject.
            await path.call().catch(() => undefined);
            expect(createAdminClient).toHaveBeenCalled();
        });
    }
});

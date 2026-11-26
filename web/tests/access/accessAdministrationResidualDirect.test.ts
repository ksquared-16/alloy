/**
 * DIRECT CERTIFICATION — starting a member's password reset.
 *
 * THE REAL GATE RUNS. `requireAccessAdministration` is NOT mocked; only the access context it reads
 * is, so what these cases exercise is the promoted Access Administration authority rather than a
 * stand-in for it.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal asserts `resetPasswordForEmail` was never called, so
 * "no email was sent" is measured rather than inferred.
 *
 * The personas are the other three authorities the Access Administration Split created. Each one is
 * a plausible wrong answer — a role administrator, a scope administrator and a device administrator
 * all plainly "administer access" — and each must be refused, because the split is only real if the
 * four keys stay four.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAccess, fromSpy, getUserById, resetForEmail } = vi.hoisted(() => ({
    mockAccess: vi.fn(),
    fromSpy: vi.fn(),
    getUserById: vi.fn(),
    resetForEmail: vi.fn(),
}));

/* Only the context is mocked — requireAccessAdministration itself is the code under test. */
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from: fromSpy,
        auth: { admin: { getUserById }, resetPasswordForEmail: resetForEmail },
    }),
}));

import { POST as SEND_RESET } from "@/app/api/admin/send-password-reset/route";
import {
    ADMIN_ACCESS_SCOPE_WRITE,
    ADMIN_ROLES_WRITE,
    ADMIN_USERS_WRITE,
    ATTENDANCE_DEVICES_MANAGE,
} from "@/lib/admin/canManageUsersAndRoles";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const MEMBER_EMAIL = "member@northwind.invalid";

const access = (permissionKeys: string[], roleKeys: string[] = [], orgId = ORG) => ({
    ok: true as const,
    userId: "user-1",
    orgId,
    roleKeys,
    permissionKeys,
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
});

const USER_ADMIN = () => access([ADMIN_USERS_WRITE]);
const ROLE_ADMIN = () => access(["portal.access", ADMIN_ROLES_WRITE]);
const SCOPE_ADMIN = () => access(["portal.access", ADMIN_ACCESS_SCOPE_WRITE]);
const DEVICE_ADMIN = () => access(["portal.access", ATTENDANCE_DEVICES_MANAGE]);
const PORTAL_ONLY = () => access(["portal.access"]);
/** Holds the admin ROLE and no grant — the rule this slice removed would have admitted them. */
const TITULAR_ADMIN = () => access(["portal.access"], ["admin"]);
const DEFAULT_ADMIN = () =>
    access(["portal.access", ADMIN_USERS_WRITE, ADMIN_ROLES_WRITE, ADMIN_ACCESS_SCOPE_WRITE], ["admin"]);
/** The ops default package carries admin.users.READ and not write. */
const DEFAULT_OPS = () =>
    access(["portal.access", "admin.users.read", "admin.roles.read", "work.operate", "reports.read"], ["ops"]);

const req = (body: unknown) =>
    new NextRequest("http://localhost/api/admin/send-password-reset", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
const send = (body: unknown = { user_id: MEMBER }) => SEND_RESET(req(body));

/** `user_roles` filtered by (org_id, user_id) — the membership test every sibling route applies. */
function membershipTable(memberOrgId: string, seen: Record<string, string>[]) {
    return () => ({
        select: () => {
            const filters: Record<string, string> = {};
            const chain = {
                eq: (col: string, val: string) => {
                    filters[col] = val;
                    return chain;
                },
                limit: () => chain,
                maybeSingle: async () => {
                    seen.push({ ...filters });
                    const match = filters.org_id === memberOrgId && filters.user_id === MEMBER;
                    return { data: match ? { user_id: MEMBER } : null, error: null };
                },
            };
            return chain;
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test.invalid";
    getUserById.mockResolvedValue({ data: { user: { id: MEMBER, email: MEMBER_EMAIL } } });
    resetForEmail.mockResolvedValue({ data: {}, error: null });
    fromSpy.mockImplementation(membershipTable(ORG, []));
});

describe("Password reset direct — the user administrator is admitted, and the reset is sent", () => {
    it("a holder of admin.users.write starts the reset for the named member", async () => {
        mockAccess.mockResolvedValue(USER_ADMIN());
        const res = await send();
        expect(res.status, `refused unexpectedly: ${JSON.stringify(await res.clone().json())}`).toBe(200);
        expect(resetForEmail).toHaveBeenCalledTimes(1);
        // The address is the one the AUTHENTICATED IDENTITY carries, resolved from the member id.
        expect(getUserById).toHaveBeenCalledWith(MEMBER);
        expect(resetForEmail.mock.calls[0][0]).toBe(MEMBER_EMAIL);
        expect(resetForEmail.mock.calls[0][1]).toMatchObject({
            redirectTo: "https://app.test.invalid/reset-password",
        });
    });

    it("the default administrator is admitted — by the package, not the title", async () => {
        mockAccess.mockResolvedValue(DEFAULT_ADMIN());
        expect((await send()).status).toBe(200);
        expect(resetForEmail).toHaveBeenCalledTimes(1);
    });

    it("the response never reports whether the provider accepted it", async () => {
        // Non-enumeration survives the repair: once membership is proven, a provider failure and a
        // delivered mail are indistinguishable to the caller.
        mockAccess.mockResolvedValue(USER_ADMIN());
        resetForEmail.mockRejectedValue(new Error("provider exploded"));
        const res = await send();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true });
    });
});

describe("Password reset direct — the Access Administration Split stays four keys", () => {
    const REFUSED: [string, () => ReturnType<typeof access>][] = [
        ["portal admission alone", PORTAL_ONLY],
        ["the admin ROLE with no grant — the rule this slice removed", TITULAR_ADMIN],
        ["a ROLE administrator — what a role may do is not who may hold an account", ROLE_ADMIN],
        ["an ACCESS-SCOPE administrator — where a person operates is not their credential", SCOPE_ADMIN],
        ["a DEVICE administrator", DEVICE_ADMIN],
        ["the default ops package, which carries admin.users.read and not write", DEFAULT_OPS],
    ];

    it.each(REFUSED)("%s is refused, and no reset is sent", async (_label, who) => {
        mockAccess.mockResolvedValue(who());
        const res = await send();
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: ADMIN_USERS_WRITE });
        expect(resetForEmail, "a refusal must not send mail").not.toHaveBeenCalled();
        expect(fromSpy, "authority settles before the member is even looked up").not.toHaveBeenCalled();
    });

    it("a FAILED context read denies rather than opening the door", async () => {
        mockAccess.mockResolvedValue({ ok: false, status: 403 });
        expect((await send()).status).toBe(403);
        expect(resetForEmail).not.toHaveBeenCalled();
    });
});

describe("Password reset direct — the target is a member, not an address", () => {
    it("a member of another organization is not found, and nothing is sent", async () => {
        /*
         * THE ESCAPE THIS SLICE CLOSED. The route used to take an arbitrary `email` and hand it to
         * the service-role client, so an administrator of one tenant could start a credential reset
         * for a member of another. Membership is now the boundary.
         */
        mockAccess.mockResolvedValue(USER_ADMIN());
        const seen: Record<string, string>[] = [];
        fromSpy.mockImplementation(membershipTable(OTHER_ORG, seen));
        const res = await send();
        expect(res.status).toBe(404);
        expect(resetForEmail, "no mail may reach a foreign member").not.toHaveBeenCalled();
        expect(getUserById, "a foreign id is not even resolved to an address").not.toHaveBeenCalled();
        // The lookup was pinned to the CALLER's org, not to anything in the body.
        expect(seen[0]).toMatchObject({ org_id: ORG, user_id: MEMBER });
    });

    it("an email in the body is ignored — it cannot name a stranger", async () => {
        mockAccess.mockResolvedValue(USER_ADMIN());
        const res = await send({ email: "someone.else@elsewhere.invalid" });
        expect(res.status, "the old contract must not still work").toBe(400);
        expect(resetForEmail).not.toHaveBeenCalled();
    });

    it("an email alongside a valid member id still does not decide the address", async () => {
        mockAccess.mockResolvedValue(USER_ADMIN());
        await send({ user_id: MEMBER, email: "attacker@elsewhere.invalid" });
        expect(resetForEmail.mock.calls[0][0]).toBe(MEMBER_EMAIL);
    });

    it("a member with no resolvable identity is not found, and nothing is sent", async () => {
        mockAccess.mockResolvedValue(USER_ADMIN());
        getUserById.mockResolvedValue({ data: { user: null } });
        expect((await send()).status).toBe(404);
        expect(resetForEmail).not.toHaveBeenCalled();
    });
});

describe("Password reset direct — W-17 composition, no TTL", () => {
    it("granting admin.users.write opens the next request; revoking closes it", async () => {
        // No grant row is edited and no clock advanced: each call resolves its own context.
        mockAccess.mockResolvedValue(PORTAL_ONLY());
        expect((await send()).status).toBe(403);
        expect(resetForEmail).not.toHaveBeenCalled();

        mockAccess.mockResolvedValue(USER_ADMIN());
        expect((await send()).status).toBe(200);
        expect(resetForEmail).toHaveBeenCalledTimes(1);

        resetForEmail.mockClear();
        mockAccess.mockResolvedValue(PORTAL_ONLY());
        expect((await send()).status).toBe(403);
        expect(resetForEmail).not.toHaveBeenCalled();
    });
});

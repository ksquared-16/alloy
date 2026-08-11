import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    removalRefusal,
    removalResidualAuthority,
    removalRevokesAuthority,
    residualAuthorityReport,
} from "@/lib/access/membershipRemovalResidual";

/**
 * W-20 / `T-19` (§48) — *"Removing a `school_director` who has an old `app_users.role = 'admin'` row
 * **promotes them**… The product reports `{ ok: true }`."*
 *
 * §48 re-prices `W-20` as the corpus's only `S1` and separates the two questions `W-0`'s `Q2 = 0`
 * conflated: Q2 counted who would be **locked out** if the fallback were deleted; `T-19` asks who is
 * **admitted** by it after the product says they were removed. The deletion half waits on census
 * `Q15`. This half — the removal states what it actually revoked, and refuses to claim more — waits
 * on nothing, by §1.6.
 */

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CALLER = "caller-1";
const TARGET = "target-1";

describe("W-20/T-19 — the residual-authority guard (pure)", () => {
    it("reports no residual when the legacy tables hold nothing", () => {
        const residual = removalResidualAuthority({
            fallbackWouldBeConsulted: true,
            legacyRead: { status: "absent" },
        });
        expect(residual).toEqual({ kind: "none" });
        expect(removalRevokesAuthority(residual)).toBe(true);
        expect(removalRefusal({ residual, acknowledged: false })).toBeNull();
        expect(residualAuthorityReport(residual)).toBeNull();
    });

    it("does not consult the legacy tables at all when a membership survives elsewhere", () => {
        // The fallback fires only for a principal with NO membership row anywhere, so a principal
        // who keeps one is not on the legacy path and the removal means what it says in this org.
        const residual = removalResidualAuthority({ fallbackWouldBeConsulted: false, legacyRead: null });
        expect(residual).toEqual({ kind: "other_membership" });
        expect(removalRefusal({ residual, acknowledged: false })).toBeNull();
    });

    it("refuses an unacknowledged removal that would revoke nothing, and names the role", () => {
        const residual = removalResidualAuthority({
            fallbackWouldBeConsulted: true,
            legacyRead: { status: "present", orgId: ORG, role: "admin" },
        });
        expect(residual).toEqual({ kind: "legacy_authority", role: "admin", orgId: ORG });
        expect(removalRevokesAuthority(residual)).toBe(false);

        const refusal = removalRefusal({ residual, acknowledged: false });
        expect(refusal).not.toBeNull();
        expect(refusal!.acknowledgeable).toBe(true);
        expect(refusal!.message).toContain("will NOT revoke");
        expect(refusal!.message).toContain("administrator");
    });

    it("permits the removal once the caller states it has been shown the residual, and reports it", () => {
        const residual = removalResidualAuthority({
            fallbackWouldBeConsulted: true,
            legacyRead: { status: "present", orgId: ORG, role: "ops" },
        });
        expect(removalRefusal({ residual, acknowledged: true })).toBeNull();
        expect(residualAuthorityReport(residual)).toEqual({
            source: "legacy_identity_record",
            role: "ops",
            org_id: ORG,
        });
    });

    it("refuses a failed legacy read, and the refusal CANNOT be acknowledged away", () => {
        // W-43's lesson applied to a guard: an unknown treated as absent restores the false success.
        // And an operator cannot acknowledge a fact nobody established, so `acknowledged` is inert.
        const residual = removalResidualAuthority({
            fallbackWouldBeConsulted: true,
            legacyRead: { status: "unknown", table: "app_users", reason: "boom" },
        });
        for (const acknowledged of [false, true]) {
            const refusal = removalRefusal({ residual, acknowledged });
            expect(refusal, `acknowledged=${acknowledged}`).not.toBeNull();
            expect(refusal!.acknowledgeable).toBe(false);
            expect(refusal!.message).toContain("Nothing was changed");
        }
    });

    it("treats 'the fallback would fire and nobody looked' as unknown, not as absent", () => {
        // The shape a future caller could reintroduce by skipping the read. It must not read as safe.
        const residual = removalResidualAuthority({ fallbackWouldBeConsulted: true, legacyRead: null });
        expect(residual.kind).toBe("unknown");
        expect(removalRefusal({ residual, acknowledged: true })).not.toBeNull();
    });
});

/* ------------------------------------------------------------------------- */
/* The route — what the product actually does                                */
/* ------------------------------------------------------------------------- */

const { mockRequireUsersRolesManageAuth } = vi.hoisted(() => ({
    mockRequireUsersRolesManageAuth: vi.fn(),
}));

vi.mock("@/lib/admin/canManageUsersAndRoles", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/canManageUsersAndRoles")>(
        "@/lib/admin/canManageUsersAndRoles",
    );
    return { ...actual, requireUsersRolesManageAuth: mockRequireUsersRolesManageAuth };
});

const { mockClient } = vi.hoisted(() => ({ mockClient: { value: null as unknown } }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => mockClient.value) }));

import { POST as removePOST } from "@/app/api/admin/users/[userId]/remove/route";

type MaybeRow = { data: unknown; error: { message: string } | null };

/**
 * A Supabase double over the four reads and one write this route can perform.
 *
 * `deletes` records every attempted `user_roles` delete, because the assertion that matters for a
 * guard is not that it returned 409 — it is that the destructive statement was never issued.
 */
function clientWith(params: {
    memberships?: { org_id: string; role: string }[];
    membershipError?: { message: string };
    userProfile?: MaybeRow;
    appUsersById?: MaybeRow;
    appUsersByAuthId?: MaybeRow;
}) {
    const deletes: { filters: Record<string, unknown> }[] = [];
    const reads: string[] = [];

    const selectChain = (result: MaybeRow) => {
        const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => result,
            then: (resolve: (v: MaybeRow) => unknown) => resolve(result),
        };
        return chain;
    };

    return {
        deletes,
        reads,
        from(table: string) {
            reads.push(table);
            if (table === "user_roles") {
                return {
                    select: () =>
                        selectChain({
                            data: params.membershipError ? null : (params.memberships ?? []),
                            error: params.membershipError ?? null,
                        }),
                    delete: () => {
                        const filters: Record<string, unknown> = {};
                        const record = { filters };
                        deletes.push(record);
                        const chain: Record<string, unknown> = {
                            eq: (col: string, val: unknown) => {
                                filters[col] = val;
                                return chain;
                            },
                            then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
                        };
                        return chain;
                    },
                };
            }
            if (table === "user_profiles") {
                return selectChain(params.userProfile ?? { data: null, error: null });
            }
            if (table === "app_users") {
                // Distinguished by which column the caller filters on.
                let column = "";
                const chain: Record<string, unknown> = {
                    select: () => chain,
                    eq: (col: string) => {
                        column = col;
                        return chain;
                    },
                    maybeSingle: async () =>
                        column === "auth_user_id"
                            ? (params.appUsersByAuthId ?? { data: null, error: null })
                            : (params.appUsersById ?? { data: null, error: null }),
                };
                return chain;
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

function removeRequest(body?: unknown) {
    return new Request("http://localhost/api/admin/users/target-1/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

const params = Promise.resolve({ userId: TARGET });

describe("W-20/T-19 — POST /api/admin/users/[userId]/remove", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireUsersRolesManageAuth.mockResolvedValue({
            ok: true,
            access: { orgId: ORG, userId: CALLER },
        });
    });

    it("removes and reports a true revocation when nothing else admits the principal", async () => {
        const client = clientWith({ memberships: [{ org_id: ORG, role: "school_director" }] });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), { params });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ ok: true, revoked_access: true });
        expect(client.deletes).toHaveLength(1);
        expect(client.deletes[0].filters).toEqual({ user_id: TARGET, org_id: ORG });
    });

    it("REFUSES the removal, and never issues the delete, when a legacy admin row would admit them", async () => {
        // The T-19 principal: one membership in this org, and an old `app_users.role = 'admin'`.
        const client = clientWith({
            memberships: [{ org_id: ORG, role: "school_director" }],
            appUsersById: { data: { role: "admin", org_id: ORG }, error: null },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), { params });
        expect(res.status).toBe(409);
        const json = (await res.json()) as { error: string; acknowledgeable: boolean; residual_authority: unknown };
        expect(json.acknowledgeable).toBe(true);
        expect(json.error).toContain("will NOT revoke");
        expect(json.residual_authority).toEqual({
            source: "legacy_identity_record",
            role: "admin",
            org_id: ORG,
        });
        // The distinction that makes this a guard rather than a report.
        expect(client.deletes).toHaveLength(0);
    });

    it("performs the removal once acknowledged, and states that access was NOT revoked", async () => {
        const client = clientWith({
            memberships: [{ org_id: ORG, role: "school_director" }],
            appUsersById: { data: { role: "admin", org_id: ORG }, error: null },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest({ acknowledge_residual_authority: true }), { params });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            ok: true,
            revoked_access: false,
            residual_authority: { source: "legacy_identity_record", role: "admin", org_id: ORG },
        });
        expect(client.deletes).toHaveLength(1);
    });

    it("also refuses when the legacy grant comes from user_profiles.role", async () => {
        // The resolver's first precedence step, which needs an org from app_users to bind.
        const client = clientWith({
            memberships: [{ org_id: ORG, role: "coordinator" }],
            userProfile: { data: { role: "ops" }, error: null },
            appUsersById: { data: { org_id: OTHER_ORG }, error: null },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), { params });
        expect(res.status).toBe(409);
        const json = (await res.json()) as { residual_authority: { role: string; org_id: string } };
        expect(json.residual_authority).toEqual({
            source: "legacy_identity_record",
            role: "ops",
            org_id: OTHER_ORG,
        });
        expect(client.deletes).toHaveLength(0);
    });

    it("does not read the legacy tables when a membership in another org survives", async () => {
        const client = clientWith({
            memberships: [
                { org_id: ORG, role: "school_director" },
                { org_id: OTHER_ORG, role: "coordinator" },
            ],
            // Present, and must never be consulted — this principal is not on the fallback path.
            appUsersById: { data: { role: "admin", org_id: ORG }, error: null },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), { params });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ ok: true, revoked_access: true });
        expect(client.reads).not.toContain("app_users");
        expect(client.reads).not.toContain("user_profiles");
        expect(client.deletes).toHaveLength(1);
    });

    it("refuses, without deleting, when the membership read fails", async () => {
        const client = clientWith({ membershipError: { message: "connection reset" } });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), { params });
        expect(res.status).toBe(500);
        expect(client.deletes).toHaveLength(0);
    });

    it("refuses, without deleting, when the legacy read fails — and acknowledgement cannot override it", async () => {
        const client = clientWith({
            memberships: [{ org_id: ORG, role: "school_director" }],
            appUsersById: { data: null, error: { message: "boom" } },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest({ acknowledge_residual_authority: true }), { params });
        expect(res.status).toBe(409);
        const json = (await res.json()) as { acknowledgeable: boolean };
        expect(json.acknowledgeable).toBe(false);
        expect(client.deletes).toHaveLength(0);
    });

    it("still refuses a bodyless POST — the pre-W-20 caller shape is not a bypass", async () => {
        // Both legacy clients sent `{ method: "POST" }` with no body before this workstream. An
        // unparseable body must read as "no acknowledgement", never as consent.
        const client = clientWith({
            memberships: [{ org_id: ORG, role: "school_director" }],
            appUsersById: { data: { role: "admin", org_id: ORG }, error: null },
        });
        mockClient.value = client;

        const res = await removePOST(removeRequest(), { params });
        expect(res.status).toBe(409);
        expect(client.deletes).toHaveLength(0);
    });

    it("keeps the self-authority ban in front of every read", async () => {
        const client = clientWith({ memberships: [{ org_id: ORG, role: "admin" }] });
        mockClient.value = client;

        const res = await removePOST(removeRequest({}), {
            params: Promise.resolve({ userId: CALLER }),
        });
        expect(res.status).toBe(403);
        expect(client.deletes).toHaveLength(0);
        expect(client.reads).toHaveLength(0);
    });
});

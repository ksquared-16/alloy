import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    replacementRemovalRefusal,
    replacementRemovalRefusalMessage,
} from "@/lib/access/memberRoleAssignment";

/**
 * W-54 / `I-34`ᴬ (§46, Wave 13) — *"until `W-17` lands, the editor must not be able to reach the
 * destructive path with a partial view."*
 *
 * `IA-7` (session 1) closed the DISPLAY half of `M2-17`: the union is rendered, the loss is
 * itemized, and the canonical surface requires an acknowledgement. This closes the WRITE half. The
 * acknowledgement never left the browser — the body was `{ role }` alone — so the route could not
 * tell an operator who had been shown `{admin, regional_lead}` and accepted the loss from one who
 * had been shown a single collapsed value. The two legacy editors are the second case by
 * construction: they cannot render a set.
 */

const orgId = "org-1";
const CALLER = "caller-1";
const TARGET = "target-1";

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

import { PATCH as rolePATCH } from "@/app/api/admin/users/[userId]/role/route";

/**
 * A Supabase double covering the three reads this route performs. `heldRoles` is what the principal
 * holds NOW; `heldError` injects the read failure the guard must fail closed on.
 */
function clientWith(params: { heldRoles: string[]; heldError?: { message: string } }) {
    const rpc = vi.fn().mockResolvedValue({
        data: [{ user_id: TARGET, org_id: orgId, role: "admin" }],
        error: null,
    });
    return {
        rpc,
        from: (table: string) => {
            if (table === "role_definitions") {
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    maybeSingle: async () => ({ data: { role_key: "admin" }, error: null }),
                };
                return chain;
            }
            if (table === "user_roles") {
                let calls = 0;
                const chain = {
                    select: () => chain,
                    eq: () => {
                        calls += 1;
                        // Resolves after the second `.eq()` — (user_id, org_id).
                        return calls >= 2
                            ? Object.assign(
                                  Promise.resolve({
                                      data: params.heldError ? null : params.heldRoles.map((role) => ({ role })),
                                      error: params.heldError ?? null,
                                  }),
                                  chain,
                              )
                            : chain;
                    },
                };
                return chain;
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

function callPatch(body: unknown) {
    return rolePATCH(
        new NextRequest(`http://localhost/api/admin/users/${TARGET}/role`, {
            method: "PATCH",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ userId: TARGET }) },
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUsersRolesManageAuth.mockResolvedValue({
        ok: true,
        access: {
            ok: true,
            userId: CALLER,
            orgId,
            roleKeys: ["admin"],
            permissionKeys: ["settings.users_roles"],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        },
    });
});

describe("W-54 — replacementRemovalRefusal", () => {
    it("permits a single-role membership being replaced — a collapsed view of one role is complete", () => {
        // The removal is real (`coordinator` goes) but it is the operation the operator asked for,
        // and no acknowledgement is needed because there was nothing a collapse could have hidden.
        expect(
            replacementRemovalRefusal({
                currentRoleKeys: ["coordinator"],
                nextRoleKey: "admin",
                acknowledgedRoleKeys: null,
            }),
        ).toBeNull();
    });

    it("permits an empty membership", () => {
        expect(
            replacementRemovalRefusal({ currentRoleKeys: [], nextRoleKey: "admin", acknowledgedRoleKeys: null }),
        ).toBeNull();
    });

    it("permits a no-op", () => {
        expect(
            replacementRemovalRefusal({
                currentRoleKeys: ["admin"],
                nextRoleKey: "admin",
                acknowledgedRoleKeys: null,
            }),
        ).toBeNull();
    });

    it("REFUSES a multi-role replacement submitted with no acknowledgement at all", () => {
        const refusal = replacementRemovalRefusal({
            currentRoleKeys: ["admin", "regional_lead"],
            nextRoleKey: "admin",
            acknowledgedRoleKeys: null,
        });
        expect(refusal).not.toBeNull();
        expect(refusal!.removed).toEqual(["regional_lead"]);
        expect(refusal!.unacknowledged).toEqual(["regional_lead"]);
    });

    it("PERMITS the same replacement when the request carried the full held set", () => {
        expect(
            replacementRemovalRefusal({
                currentRoleKeys: ["admin", "regional_lead"],
                nextRoleKey: "admin",
                acknowledgedRoleKeys: ["admin", "regional_lead"],
            }),
        ).toBeNull();
    });

    it("REFUSES a stale view — the request carried a set that is missing a role now held", () => {
        // The operator's screen was rendered before `coordinator` was added.
        const refusal = replacementRemovalRefusal({
            currentRoleKeys: ["admin", "regional_lead", "coordinator"],
            nextRoleKey: "admin",
            acknowledgedRoleKeys: ["admin", "regional_lead"],
        });
        expect(refusal!.removed).toEqual(["coordinator", "regional_lead"]);
        expect(refusal!.unacknowledged).toEqual(["coordinator"]);
    });

    it("the message names the roles that would be lost", () => {
        const refusal = replacementRemovalRefusal({
            currentRoleKeys: ["admin", "regional_lead"],
            nextRoleKey: "admin",
            acknowledgedRoleKeys: [],
        })!;
        expect(replacementRemovalRefusalMessage(refusal)).toContain("regional_lead");
    });

    it("normalizes both sides — padding and duplicates neither defeat nor trigger the check", () => {
        // The acknowledgement is the FULL held set, so it lists the retained role too.
        expect(
            replacementRemovalRefusal({
                currentRoleKeys: [" admin ", "regional_lead", "regional_lead"],
                nextRoleKey: " admin ",
                acknowledgedRoleKeys: [" regional_lead ", "admin"],
            }),
        ).toBeNull();
    });

    it("an acknowledgement that omits a currently held role is a STALE view, not a valid one", () => {
        const refusal = replacementRemovalRefusal({
            currentRoleKeys: ["admin", "regional_lead"],
            nextRoleKey: "admin",
            acknowledgedRoleKeys: ["regional_lead"],
        });
        expect(refusal!.unacknowledged).toEqual(["admin"]);
    });
});

describe("W-54 — the route refuses, and the refusal precedes the write", () => {
    it("performs an ordinary single-role replacement", async () => {
        const client = clientWith({ heldRoles: ["coordinator"] });
        mockClient.value = client;
        const res = await callPatch({ role: "admin" });
        expect(res.status).toBe(200);
        expect(client.rpc).toHaveBeenCalledTimes(1);
    });

    it("refuses a destructive replacement with no acknowledgement, and writes NOTHING", async () => {
        const client = clientWith({ heldRoles: ["admin", "regional_lead"] });
        mockClient.value = client;
        const res = await callPatch({ role: "admin" });
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.unacknowledged_roles).toEqual(["regional_lead"]);
        expect(client.rpc, "the write must not have been attempted").not.toHaveBeenCalled();
    });

    it("accepts the same replacement when the caller carried the set it was shown", async () => {
        const client = clientWith({ heldRoles: ["admin", "regional_lead"] });
        mockClient.value = client;
        const res = await callPatch({ role: "admin", expected_role_keys: ["admin", "regional_lead"] });
        expect(res.status).toBe(200);
        expect(client.rpc).toHaveBeenCalledTimes(1);
    });

    it("a FAILED read of the current roles denies rather than defaulting to empty", async () => {
        // W-43's lesson applied to a guard: an unreadable membership treated as an empty one makes
        // `removed` empty and waves the destructive write straight through.
        const client = clientWith({ heldRoles: [], heldError: { message: "connection reset" } });
        mockClient.value = client;
        const res = await callPatch({ role: "admin" });
        expect(res.status).toBe(500);
        expect(client.rpc).not.toHaveBeenCalled();
    });
});

describe("W-54 Tier A — the canonical surface sends what it showed", () => {
    const src = readFileSync(
        join(process.cwd(), "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx"),
        "utf8",
    );

    it("the role save body carries expected_role_keys", () => {
        const save = src.slice(src.indexOf("const saveRole"), src.indexOf("const saveAccess"));
        expect(save).toContain("expected_role_keys");
    });

    it("it is derived from the SAME predicate the surface displayed, not re-derived", () => {
        const save = src.slice(src.indexOf("const saveRole"), src.indexOf("const saveAccess"));
        expect(save).toMatch(/expected_role_keys:\s*heldRoleKeys\(selected\)/);
    });

    it("bites: dropping the field makes the route refuse a multi-role member", async () => {
        const client = clientWith({ heldRoles: ["admin", "regional_lead"] });
        mockClient.value = client;
        const res = await callPatch({ role: "admin" }); // the pre-W-54 body
        expect(res.status).toBe(409);
    });
});

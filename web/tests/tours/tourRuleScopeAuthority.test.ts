/**
 * S3-C — inherited versus local edit authority, enforced by the server.
 *
 * An organization-wide rule seen from a location is inherited. A location-scoped edit or delete
 * of it is refused with 409, and the refusal is measured: the write is never attempted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, writes, ruleRow } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    writes: [] as string[],
    ruleRow: { current: { id: "r1", location_id: null as string | null } },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from: () => {
            const b: Record<string, unknown> = {};
            const chain = () => b;
            Object.assign(b, {
                select: chain,
                eq: chain,
                maybeSingle: async () => ({ data: ruleRow.current, error: null }),
                single: async () => ({ data: { ...ruleRow.current, is_active: false }, error: null }),
                update: () => {
                    writes.push("update");
                    return b;
                },
                delete: () => {
                    writes.push("delete");
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            });
            return b;
        },
    }),
}));

import { DELETE, PATCH } from "@/app/api/admin/tours/availability-rules/[ruleId]/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const OTHER_LOC = "44444444-4444-4444-8444-444444444444";

const call = (method: "PATCH" | "DELETE", scope: string | null) => {
    const url = `http://localhost/api/admin/tours/availability-rules/r1${scope == null ? "" : `?scope=${scope}`}`;
    const req = new NextRequest(url, { method, body: method === "PATCH" ? JSON.stringify({ is_active: false }) : undefined });
    const params = { params: Promise.resolve({ ruleId: "r1" }) };
    return method === "PATCH" ? PATCH(req, params) : DELETE(req, params);
};

beforeEach(() => {
    writes.length = 0;
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "ops" });
    mockAccess.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", permissionKeys: ["tours.configure"], roleKeys: ["ops"] });
});

describe("inherited organization rule, edited from a location", () => {
    beforeEach(() => {
        ruleRow.current = { id: "r1", location_id: null };
    });

    it.each(["PATCH", "DELETE"] as const)("%s is refused with 409 and writes nothing", async (method) => {
        const res = await call(method, LOC);
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe("TOUR_RULE_SCOPE_MISMATCH");
        expect(writes).toEqual([]);
    });

    it.each(["PATCH", "DELETE"] as const)("%s at organization scope proceeds", async (method) => {
        const res = await call(method, "org");
        expect(res.status).toBe(200);
        expect(writes).toEqual([method === "PATCH" ? "update" : "delete"]);
    });
});

describe("a location's own rule", () => {
    beforeEach(() => {
        ruleRow.current = { id: "r1", location_id: LOC };
    });

    it("is editable from that location", async () => {
        expect((await call("PATCH", LOC)).status).toBe(200);
        expect(writes).toEqual(["update"]);
    });

    it("is refused from another location and from organization scope", async () => {
        expect((await call("PATCH", OTHER_LOC)).status).toBe(409);
        expect((await call("DELETE", "org")).status).toBe(409);
        expect(writes).toEqual([]);
    });

    it("callers that name no scope keep the previous behaviour", async () => {
        expect((await call("PATCH", null)).status).toBe(200);
    });

    it("a malformed scope is a 400, not a pass", async () => {
        expect((await call("PATCH", "not-a-uuid")).status).toBe(400);
        expect(writes).toEqual([]);
    });
});

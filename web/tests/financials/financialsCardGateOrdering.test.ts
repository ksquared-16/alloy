/**
 * THE VERDICT MOVED OFF THE DATABASE; THE GATE DID NOT MOVE.
 *
 * `fin.read` used to resolve through two more table reads here, measured on deployed staging at
 * `perm;dur=` 204–565 ms. This request had already read those same rows: `getAdminContextCached`
 * resolves the access bundle, whose `fetchPermissionKeys` queries `role_permission_grants` with the
 * same predicates `resolveActorPermissionGrants` uses. The capability is now answered from
 * `ctx.permissionKeys` — the same fact, at request time, from the module that names the key.
 *
 * That is a change to a security boundary, so it is tested by EXECUTING the route rather than by
 * reading it. Every property the database-backed gate guaranteed is re-asserted here against the
 * new mechanism: a denied caller receives no part of the model, an unverifiable caller is denied,
 * the answer is recomputed per request so a revocation denies the very next one, and the keys of
 * one principal or organization never decide another's request.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockRequireAdminOrOps,
    mockGetAdminContextCached,
    mockGetAdminAuthCached,
    mockCreateAdminClient,
    mockAssertFinancialsReadAllowed,
    mockBuildFinancialsCardVM,
    mockProjectPhotos,
} = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockGetAdminAuthCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockAssertFinancialsReadAllowed: vi.fn(),
    mockBuildFinancialsCardVM: vi.fn(),
    mockProjectPhotos: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: mockRequireAdminOrOps,
    getAdminAuthCached: mockGetAdminAuthCached,
}));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/financials/financialsPermissions", async () => {
    const actual = await vi.importActual<typeof import("@/lib/financials/financialsPermissions")>(
        "@/lib/financials/financialsPermissions",
    );
    return { ...actual, assertFinancialsReadAllowed: mockAssertFinancialsReadAllowed };
});
vi.mock("@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM", () => ({
    buildFinancialsCardVM: mockBuildFinancialsCardVM,
}));
vi.mock("@/lib/documents/projectPersonProfilePhotos", () => ({
    projectResolvedProfilePhotosOntoRows: mockProjectPhotos,
    documentActorFromAdminParts: () => ({ userId: "user-1", orgId: "org-1", role: "admin" }),
}));

const { GET } = await import("@/app/api/admin/financials/card/route");

const req = () => new NextRequest("https://example.test/api/admin/financials/card?customer_id=cust-1");
const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};
/*
 * The capability is now a property of the request's own resolved context, so "allowed" and
 * "denied" are key SETS rather than a resolver's answer. `DENIED_KEYS` deliberately carries a
 * different real capability: the route must refuse a caller who is authenticated, admitted to the
 * portal and holds other grants, but not this one.
 */
const ALLOWED_KEYS = ["fin.read", "fin.write"] as const;
const DENIED_KEYS = ["enrollment.read"] as const;
const ctxWith = (keys: readonly string[] | null | undefined, over: Record<string, unknown> = {}) => ({
    ok: true,
    orgId: "org-1",
    userId: "user-1",
    role: "admin",
    ...(keys === undefined ? {} : { permissionKeys: keys }),
    ...over,
});
const VM = { rows: [{ id: "row-1" }], subjects: [], collectible: { currentlyCollectibleCents: 12_345 } };

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue(ctxWith(ALLOWED_KEYS));
    mockGetAdminAuthCached.mockResolvedValue({ userId: "user-1" });
    mockCreateAdminClient.mockReturnValue({});
    mockProjectPhotos.mockResolvedValue([]);
});

describe("the fin.read verdict still decides, and decides first", () => {
    it("a denied operator gets 403 and not one row of the model", async () => {
        mockGetAdminContextCached.mockResolvedValue(ctxWith(DENIED_KEYS));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(403);
        const body = await res.text();
        expect(body, "no part of the model reaches a denied caller").not.toContain("12345");
        expect(body).not.toContain("row-1");
        expect(JSON.parse(body)).toMatchObject({ required_permission: "fin.read" });
    });

    /*
     * FAIL CLOSED, every shape of "we could not establish the capability". A resolver that throws
     * no longer exists on this path, so the unverifiable cases are the ones that can actually reach
     * the route: keys absent entirely, keys explicitly null, and an empty set.
     */
    it.each([
        ["absent", undefined],
        ["null", null],
        ["empty", [] as readonly string[]],
    ])("a context whose permission keys are %s denies", async (_label, keys) => {
        mockGetAdminContextCached.mockResolvedValue(ctxWith(keys));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status, "an unverifiable caller is not an authorized one").toBe(403);
        expect(await res.text()).not.toContain("12345");
    });

    it("a context resolution that THROWS denies, and never answers with the model", async () => {
        mockGetAdminContextCached.mockRejectedValue(new Error("access bundle unreachable"));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        await expect(GET(req()).then((r) => r.text())).rejects.toBeTruthy();
    });

    it("nothing is returned before the verdict lands, even when the read finishes first", async () => {
        /*
         * The read is still ISSUED before the capability is tested — that overlap is what took the
         * verdict off the critical path and it must not silently revert to a pre-read gate. The
         * context is what the verdict now waits on, so deferring the context is what reproduces
         * "the read finished first".
         */
        const ctxLanded = deferred<Record<string, unknown>>();
        mockGetAdminContextCached.mockReturnValue(ctxLanded.promise);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);

        let settled = false;
        const res = GET(req()).then((r) => { settled = true; return r; });
        await new Promise((r) => setTimeout(r, 20));
        expect(settled, "the response waits for the capability").toBe(false);

        ctxLanded.resolve(ctxWith(ALLOWED_KEYS));
        expect((await res).status).toBe(200);
    });

    it("the verdict is recomputed per request — a revocation denies the very next one", async () => {
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        mockGetAdminContextCached
            .mockResolvedValueOnce(ctxWith(ALLOWED_KEYS))
            .mockResolvedValueOnce(ctxWith(DENIED_KEYS));
        expect((await GET(req())).status).toBe(200);
        expect(
            (await GET(req())).status,
            "a grant revoked between requests denies the second — no verdict is carried over",
        ).toBe(403);
        expect(mockGetAdminContextCached, "the context is resolved per request").toHaveBeenCalledTimes(2);
    });

    /*
     * ISOLATION. The capability is read off the context the request resolved, so one principal's or
     * organization's keys must never decide another's request. These fail if the answer is ever
     * memoised anywhere outside the request.
     */
    it("a second principal is judged on their OWN keys, not the first principal's", async () => {
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        mockGetAdminContextCached
            .mockResolvedValueOnce(ctxWith(ALLOWED_KEYS, { userId: "user-1" }))
            .mockResolvedValueOnce(ctxWith(DENIED_KEYS, { userId: "user-2" }));
        expect((await GET(req())).status).toBe(200);
        expect((await GET(req())).status, "user-2 does not inherit user-1's capability").toBe(403);
    });

    it("a second organization is judged on its OWN keys", async () => {
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        mockGetAdminContextCached
            .mockResolvedValueOnce(ctxWith(ALLOWED_KEYS, { orgId: "org-1" }))
            .mockResolvedValueOnce(ctxWith(DENIED_KEYS, { orgId: "org-2" }));
        expect((await GET(req())).status).toBe(200);
        expect((await GET(req())).status, "org-2 does not inherit org-1's capability").toBe(403);
    });

    it("the grants tables are NOT read again by the capability check", async () => {
        /*
         * The defect this repair removes. `createAdminClient` is the only handle the route could
         * reach `user_roles` / `role_permission_grants` through for the capability, and the verdict
         * must now come from the context instead. The composed read is mocked, so any `.from()` here
         * would be the permission step re-acquiring what the request already holds.
         */
        const from = vi.fn(() => { throw new Error("the capability must not query the grants tables"); });
        mockCreateAdminClient.mockReturnValue({ from });
        mockGetAdminContextCached.mockResolvedValue(ctxWith(ALLOWED_KEYS));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(from, "no grants re-read").not.toHaveBeenCalled();
    });

    it("an allowed operator still gets the model", async () => {
        mockGetAdminContextCached.mockResolvedValue(ctxWith(ALLOWED_KEYS));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("12345");
    });
});

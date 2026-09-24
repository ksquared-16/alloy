/**
 * THE READ MOVED OFF THE GATE'S SHOULDER; THE GATE DID NOT MOVE.
 *
 * `fin.read` resolves through two table reads, and measured on deployed staging that cost
 * `perm;dur=` 204–565 ms of a 2,677–3,446 ms response — spent alone, with the composed read not
 * yet started. The route now ISSUES the verdict and the read together and joins the verdict before
 * anything is returned.
 *
 * That is a change to a security boundary, so it is tested by EXECUTING the route rather than by
 * reading it: a source grep cannot tell a verdict that is awaited before the body from one that is
 * awaited after it, and "the read starts first" and "the read is returned first" differ by exactly
 * the defect worth guarding.
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
const ALLOWED = { ok: true as const };
const DENIED = { ok: false as const, message: "no", requiredPermission: "fin.read" as const };
const VM = { rows: [{ id: "row-1" }], subjects: [], collectible: { currentlyCollectibleCents: 12_345 } };

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: "org-1", userId: "user-1", role: "admin" });
    mockGetAdminAuthCached.mockResolvedValue({ userId: "user-1" });
    mockCreateAdminClient.mockReturnValue({});
    mockProjectPhotos.mockResolvedValue([]);
});

describe("the fin.read verdict still decides, and decides first", () => {
    it("a denied operator gets 403 and not one row of the model", async () => {
        mockAssertFinancialsReadAllowed.mockResolvedValue(DENIED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(403);
        const body = await res.text();
        expect(body, "no part of the model reaches a denied caller").not.toContain("12345");
        expect(body).not.toContain("row-1");
        expect(JSON.parse(body)).toMatchObject({ required_permission: "fin.read" });
    });

    it("a verdict that THROWS denies, exactly as one that answers no does", async () => {
        mockAssertFinancialsReadAllowed.mockRejectedValue(new Error("grants table unreachable"));
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status, "an unverifiable caller is not an authorized one").toBe(403);
        expect(await res.text()).not.toContain("12345");
    });

    it("nothing is returned before the verdict lands, even when the read finishes first", async () => {
        const verdict = deferred<typeof ALLOWED>();
        mockAssertFinancialsReadAllowed.mockReturnValue(verdict.promise);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);

        let settled = false;
        const res = GET(req()).then((r) => { settled = true; return r; });
        await new Promise((r) => setTimeout(r, 20));
        expect(mockBuildFinancialsCardVM, "the read starts without waiting for the verdict").toHaveBeenCalled();
        expect(settled, "but the response waits for it").toBe(false);

        verdict.resolve(ALLOWED);
        expect((await res).status).toBe(200);
    });

    it("the verdict is asked fresh on every request, never carried over", async () => {
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        mockAssertFinancialsReadAllowed.mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(DENIED);
        expect((await GET(req())).status).toBe(200);
        expect((await GET(req())).status, "a grant revoked between requests denies the second").toBe(403);
        expect(mockAssertFinancialsReadAllowed).toHaveBeenCalledTimes(2);
    });

    it("an allowed operator still gets the model", async () => {
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("12345");
    });

    it("a read that fails is still a 500, not a silent empty card", async () => {
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockRejectedValue(new Error("charges read failed"));
        const res = await GET(req());
        expect(res.status).toBe(500);
        expect(await res.text(), "the real failure survives the deferred join").toContain("charges read failed");
    });

    it("the overlap is real: the verdict and the read are in flight at the same time", async () => {
        const verdict = deferred<typeof ALLOWED>();
        const read = deferred<typeof VM>();
        mockAssertFinancialsReadAllowed.mockReturnValue(verdict.promise);
        mockBuildFinancialsCardVM.mockReturnValue(read.promise);

        const res = GET(req());
        await new Promise((r) => setTimeout(r, 20));
        expect(
            mockBuildFinancialsCardVM.mock.calls.length,
            "the read was issued while the verdict was still pending — that is the repair",
        ).toBe(1);
        verdict.resolve(ALLOWED);
        read.resolve(VM);
        expect((await res).status).toBe(200);
    });

    it("the Server-Timing header reports completion offsets, not only spans", async () => {
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const header = (await GET(req())).headers.get("server-timing") ?? "";
        /* Deltas alone stop meaning anything once spans overlap; the offsets make that visible. */
        for (const name of ["auth", "auth_at", "perm", "perm_at", "read_at", "total"]) {
            expect(header, `${header} carries ${name}`).toContain(`${name};dur=`);
        }
    });
});

/**
 * The admission check and the access bundle are now asked at the same time. They are different
 * resolvers answering different questions, so overlapping them is free — but the ORDER OF REFUSAL
 * is a contract: a caller with no portal admission must be told that, not handed a 401 or a 403
 * from whichever resolver happened to answer first.
 */
describe("admission and the access bundle overlap without changing who is refused", () => {
    it("all three resolvers are asked before any of them answers", async () => {
        const admission = deferred<null>();
        const context = deferred<{ ok: boolean; orgId?: string; userId?: string; role?: string }>();
        const authed = deferred<{ userId: string }>();
        mockRequireAdminOrOps.mockReturnValue(admission.promise);
        mockGetAdminContextCached.mockReturnValue(context.promise);
        mockGetAdminAuthCached.mockReturnValue(authed.promise);
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);

        const res = GET(req());
        await new Promise((r) => setTimeout(r, 20));
        expect(mockRequireAdminOrOps).toHaveBeenCalled();
        expect(mockGetAdminContextCached, "the access bundle does not wait its turn").toHaveBeenCalled();
        expect(mockGetAdminAuthCached).toHaveBeenCalled();

        admission.resolve(null);
        context.resolve({ ok: true, orgId: "org-1", userId: "user-1", role: "admin" });
        authed.resolve({ userId: "user-1" });
        expect((await res).status).toBe(200);
    });

    it("no portal admission is still answered by the admission check, whatever the bundle says", async () => {
        mockRequireAdminOrOps.mockResolvedValue(
            new Response(JSON.stringify({ error: "portal" }), { status: 418 }),
        );
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 403 });
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status, "admission answers first, as it did when it ran first").toBe(418);
        expect(mockBuildFinancialsCardVM, "a refused caller reads nothing").not.toHaveBeenCalled();
        expect(mockAssertFinancialsReadAllowed, "and is asked for no grant").not.toHaveBeenCalled();
    });

    it("a failed context is refused before the permission check is ever asked", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 403 });
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(403);
        expect(await res.text()).not.toContain("12345");
        expect(mockAssertFinancialsReadAllowed).not.toHaveBeenCalled();
        expect(mockBuildFinancialsCardVM).not.toHaveBeenCalled();
    });

    it("an unauthenticated caller is 401 and reads nothing", async () => {
        mockGetAdminAuthCached.mockResolvedValue(null);
        mockAssertFinancialsReadAllowed.mockResolvedValue(ALLOWED);
        mockBuildFinancialsCardVM.mockResolvedValue(VM);
        const res = await GET(req());
        expect(res.status).toBe(401);
        expect(mockBuildFinancialsCardVM).not.toHaveBeenCalled();
    });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const { mockGetAdminContext, mockGetAccess, mockRequireAdminOrOps, mockRunSearch } = vi.hoisted(() => ({
    mockGetAdminContext: vi.fn(),
    mockGetAccess: vi.fn(),
    mockRequireAdminOrOps: vi.fn(),
    mockRunSearch: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/admin/getAdminContext")>()),
    getAdminContextCached: mockGetAdminContext,
}));

vi.mock("@/lib/admin/getAdminAccessContext", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/admin/getAdminAccessContext")>()),
    getAdminAccessContextCached: mockGetAccess,
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/search/runSearch", () => ({ runSearch: mockRunSearch }));

const { GET } = await import("@/app/api/admin/global-search/route");

const req = (q: string) => new NextRequest(`http://x/api/admin/global-search?q=${encodeURIComponent(q)}`);

describe("GET /api/admin/global-search — Search V2 contract", () => {
    beforeEach(() => {
        mockRequireAdminOrOps.mockResolvedValue(null);
        mockGetAdminContext.mockResolvedValue({ ok: true, orgId: ORG, userId: USER, role: "admin" });
        mockGetAccess.mockResolvedValue({
            ok: true,
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        });
        mockRunSearch.mockResolvedValue({
            q: "joe",
            intent: { subject_terms: ["joe"], context_terms: [] },
            results: [],
        });
    });

    afterEach(() => vi.clearAllMocks());

    it("refuses an unauthenticated caller before any search runs", async () => {
        mockRequireAdminOrOps.mockResolvedValue(
            new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        );
        const res = await GET(req("joe"));
        expect(res.status).toBe(401);
        expect(mockRunSearch).not.toHaveBeenCalled();
    });

    it("refuses when the access context is forbidden, before any search runs", async () => {
        mockGetAccess.mockResolvedValue({ ok: false, status: 403 });
        const res = await GET(req("joe"));
        expect(res.status).toBe(403);
        expect(mockRunSearch).not.toHaveBeenCalled();
    });

    it("requires a query", async () => {
        const res = await GET(new NextRequest("http://x/api/admin/global-search?q="));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Q_REQUIRED");
        expect(mockRunSearch).not.toHaveBeenCalled();
    });

    it("rejects a too-short query", async () => {
        const res = await GET(req("j"));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Q_TOO_SHORT");
        expect(mockRunSearch).not.toHaveBeenCalled();
    });

    it("passes the operator's resolved scope dimensions into the search", async () => {
        mockGetAccess.mockResolvedValue({
            ok: true,
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "restricted",
            allowedSiteLocationIds: ["site-1"],
        });
        await GET(req("joe"));
        expect(mockRunSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: ORG,
                dimensions: expect.objectContaining({
                    siteScope: "restricted",
                    allowedSiteLocationIds: ["site-1"],
                }),
            })
        );
    });

    it("returns the V2 envelope with intent and results", async () => {
        const res = await GET(req("joe"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.intent).toEqual({ subject_terms: ["joe"], context_terms: [] });
        expect(Array.isArray(body.results)).toBe(true);
    });

    it("does not leak internals when the search throws", async () => {
        mockRunSearch.mockRejectedValue(new Error("relation \"persons\" does not exist"));
        const res = await GET(req("joe"));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe("SEARCH_FAILED");
    });
});

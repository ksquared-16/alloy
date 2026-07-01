import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { GET as getEntitySearch } from "@/app/api/admin/ai/task-assist/entity-search/route";

const orgId = "11111111-1111-4111-8111-111111111111";

const { mockRunSearch, mockGetAdminContextCached, mockGetAdminAccessContextCached } = vi.hoisted(() => ({
    mockRunSearch: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockGetAdminAccessContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: () => mockGetAdminAccessContextCached(),
}));

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: vi.fn(() => Promise.resolve(null)) };
});

vi.mock("@/lib/agent/taskAssist/taskAssistEntitySearchService", () => ({
    runTaskAssistEntitySearch: (...args: unknown[]) => mockRunSearch(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

describe("GET /api/admin/ai/task-assist/entity-search", () => {
    beforeEach(() => {
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId: "u", role: "admin" });
        mockGetAdminAccessContextCached.mockResolvedValue({
            ok: true,
            userId: "u",
            orgId,
            roleKeys: ["admin"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("rejects empty q", async () => {
        const req = new NextRequest("http://localhost/api/admin/ai/task-assist/entity-search?q=");
        const res = await getEntitySearch(req);
        expect(res.status).toBe(400);
    });

    it("rejects short q (non-uuid)", async () => {
        const req = new NextRequest("http://localhost/api/admin/ai/task-assist/entity-search?q=a");
        const res = await getEntitySearch(req);
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error?: string };
        expect(j.error).toBe("Q_TOO_SHORT");
    });

    it("returns normalized candidates and passes orgId to search", async () => {
        mockRunSearch.mockResolvedValue({
            q: "smith",
            candidates: [
                {
                    entity_type: "opportunities",
                    entity_id: "33333333-3333-4333-8333-333333333333",
                    label: "Smith inquiry",
                    subtitle: "Customer: Smith",
                    confidence: "medium",
                    source: "opportunity_name",
                    matched_fields: ["name"],
                },
            ],
        });
        const req = new NextRequest("http://localhost/api/admin/ai/task-assist/entity-search?q=smith");
        const res = await getEntitySearch(req);
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; candidates?: unknown[]; q?: string };
        expect(j.ok).toBe(true);
        expect(j.q).toBe("smith");
        expect(j.candidates).toHaveLength(1);
        expect(mockRunSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId,
                rawQ: "smith",
                includeCustomers: true,
            }),
        );
    });

    it("entity_type=opportunities disables customer bridge in service call", async () => {
        mockRunSearch.mockResolvedValue({ q: "x", candidates: [] });
        const req = new NextRequest("http://localhost/api/admin/ai/task-assist/entity-search?q=smith&entity_type=opportunities");
        const res = await getEntitySearch(req);
        expect(res.status).toBe(200);
        expect(mockRunSearch).toHaveBeenCalledWith(expect.objectContaining({ includeCustomers: false }));
    });
});

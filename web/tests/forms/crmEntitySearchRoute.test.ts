import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as crmEntitySearch } from "@/app/api/admin/forms/crm-entity-search/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const { mockGetAdminContext } = vi.hoisted(() => ({
    mockGetAdminContext: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContext,
    };
});

describe("GET /api/admin/forms/crm-entity-search", () => {
    beforeEach(() => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "admin",
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns 403 for non-admin roles", async () => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "ops",
        });
        const res = await crmEntitySearch(
            new NextRequest("http://x/api/admin/forms/crm-entity-search?entity_type=person&q=ab")
        );
        expect(res.status).toBe(403);
    });

    it("returns 400 for invalid entity_type", async () => {
        const res = await crmEntitySearch(
            new NextRequest("http://x/api/admin/forms/crm-entity-search?entity_type=vendor&q=ab")
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when q is too short", async () => {
        const res = await crmEntitySearch(
            new NextRequest("http://x/api/admin/forms/crm-entity-search?entity_type=person&q=a")
        );
        expect(res.status).toBe(400);
    });
});

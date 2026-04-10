import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/record-overview-layouts/route";
import { PUT } from "@/app/api/admin/config/record-overview-layout/route";
import * as getAdminContext from "@/lib/admin/getAdminContext";
import * as supabaseAdmin from "@/lib/supabaseAdmin";

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(),
}));

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";

const validConfig = {
    version: 1,
    header_keys: ["title"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [{ kind: "system_field", key: "title" }],
        },
    ],
};

function mockAdminCtx(role: string) {
    vi.spyOn(getAdminContext, "getAdminContext").mockResolvedValue({
        ok: true,
        orgId,
        userId,
        role,
    });
}

describe("GET /api/admin/record-overview-layouts", () => {
    beforeEach(() => {
        mockAdminCtx("admin");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 404 when no row", async () => {
        const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: () => ({
                select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }) }),
            }),
        } as never);

        const req = new NextRequest(
            "http://localhost/api/admin/record-overview-layouts?entity_type=job&surface=overview"
        );
        const res = await GET(req);
        expect(res.status).toBe(404);
    });

    it("returns layout when present", async () => {
        const row = { id: "11111111-1111-1111-1111-111111111111", config: validConfig };
        const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: () => ({
                select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }) }),
            }),
        } as never);

        const req = new NextRequest(
            "http://localhost/api/admin/record-overview-layouts?entity_type=jobs&surface=overview"
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const j = (await res.json()) as { layout: { config: typeof validConfig } };
        expect(j.layout.config.version).toBe(1);
    });
});

describe("PUT /api/admin/config/record-overview-layout", () => {
    beforeEach(() => {
        mockAdminCtx("admin");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 403 for non-admin", async () => {
        mockAdminCtx("ops");
        const req = new NextRequest("http://localhost/api/admin/config/record-overview-layout", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "job",
                surface: "overview",
                config: validConfig,
                expected_config_version: 0,
            }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(403);
    });

    it("409 when stale expected_config_version", async () => {
        const maybeSingle = vi.fn(async () => ({
            data: { id: "11111111-1111-1111-1111-111111111111", config: { version: 2 } },
            error: null,
        }));
        const mockFrom = vi.fn(() => ({
            select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
        }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: mockFrom,
        } as never);

        const req = new NextRequest("http://localhost/api/admin/config/record-overview-layout", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "job",
                surface: "overview",
                config: { ...validConfig, version: 3 },
                expected_config_version: 0,
            }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(409);
    });

    it("200 on first write (no row) with expected 0", async () => {
        const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        const insert = vi.fn(() => ({
            select: () => ({
                single: async () => ({
                    data: { id: "11111111-1111-1111-1111-111111111111", config: validConfig },
                    error: null,
                }),
            }),
        }));
        const mockFrom = vi.fn(() => ({
            select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
            insert,
        }));
        vi.mocked(supabaseAdmin.createAdminClient).mockReturnValue({
            from: mockFrom,
        } as never);

        const req = new NextRequest("http://localhost/api/admin/config/record-overview-layout", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "job",
                surface: "overview",
                config: validConfig,
                expected_config_version: 0,
            }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(200);
        expect(insert).toHaveBeenCalled();
    });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const orgId = "22222222-2222-2222-2222-222222222222";

const { mockGetAdminAccessContextCached, mockReadMetricTrend } = vi.hoisted(() => ({
    mockGetAdminAccessContextCached: vi.fn(),
    mockReadMetricTrend: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return { ...actual, getAdminAccessContextCached: mockGetAdminAccessContextCached };
});

vi.mock("@/lib/metrics/snapshots/readMetricTrend", () => ({
    readMetricTrend: mockReadMetricTrend,
}));

vi.mock("@/lib/metrics/resolveMetricSiteAccess", () => ({
    assertMetricSiteAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

import { GET } from "@/app/api/admin/metrics/trends/route";

describe("GET /api/admin/metrics/trends", () => {
    beforeEach(() => {
        mockGetAdminAccessContextCached.mockResolvedValue({
            ok: true,
            orgId,
            departmentScope: "all",
            allowedDepartmentIds: [],
            siteScope: "all",
            allowedSiteLocationIds: [],
            roleKeys: ["admin"],
        });
        mockReadMetricTrend.mockResolvedValue({
            latest: { value: 0.5, computedAt: "2026-06-23T00:00:00Z" },
            prior: { value: 0.4, computedAt: "2026-06-22T00:00:00Z" },
            delta: 0.1,
            deltaPercent: 0.25,
            direction: "up",
            sparklineY: [0, 0.5, 1],
            trendLabel: "+10.0 pts vs previous snapshot",
            hasTrend: true,
        });
    });

    it("returns batch trend payloads", async () => {
        const req = new NextRequest(
            "http://localhost/api/admin/metrics/trends?keys=comms.delivery_rate&window=rolling_30d&site_id=site-1"
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.site_id).toBe("site-1");
        expect(body.trends).toHaveLength(1);
        expect(body.trends[0].sparkline_y).toEqual([0, 0.5, 1]);
        expect(body.trends[0].trend_label).toContain("pts");
    });

    it("rejects unknown keys", async () => {
        const req = new NextRequest("http://localhost/api/admin/metrics/trends?keys=bogus");
        const res = await GET(req);
        expect(res.status).toBe(400);
    });
});

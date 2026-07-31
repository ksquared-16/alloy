import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const orgId = "22222222-2222-2222-2222-222222222222";

const { mockGetAdminAccessContextCached, fromSpy, maybeSingleOrgSettings } = vi.hoisted(() => ({
    mockGetAdminAccessContextCached: vi.fn(),
    fromSpy: vi.fn(),
    maybeSingleOrgSettings: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return {
        ...actual,
        getAdminAccessContextCached: mockGetAdminAccessContextCached,
        // W-1: the route now gates through `requireAnalyticsReadAccess`, which reads the bundle.
        loadAdminAccessBundleCached: mockGetAdminAccessContextCached,
    };
});

vi.mock("@/lib/metrics/metricEngine", () => ({
    resolveMetrics: vi.fn().mockResolvedValue([
        {
            metric: {
                key: "enrollment.tour_conversion_rate",
                label: "Tour conversion rate",
                format: "percent",
                value: 0.5,
                formattedValue: "50.0%",
                window: "rolling_30d",
                windowStartIso: "2026-05-24T00:00:00.000Z",
                windowEndIso: "2026-06-23T00:00:00.000Z",
                computedAtIso: "2026-06-23T00:00:00.000Z",
                sources: ["tour_bookings"],
                resolveMode: "live",
                meta: { completed: 1, scheduled: 2 },
            },
            kpi: {
                key: "enrollment.tour_conversion_rate",
                label: "Tour conversion rate",
                metricKey: "enrollment.tour_conversion_rate",
                status: "healthy",
                targetKind: "rate_min",
                targetMinRate: 0.5,
                thresholds: { healthyMinRate: 0.5, warningMinRate: 0.3 },
                observedValueRate: 0.5,
            },
        },
    ]),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: (table: string) => {
            fromSpy(table);
            if (table === "org_settings") {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: maybeSingleOrgSettings,
                        }),
                    }),
                };
            }
            return {};
        },
    })),
}));

import { GET } from "@/app/api/admin/metrics/resolve/route";

describe("GET /api/admin/metrics/resolve", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminAccessContextCached.mockResolvedValue({
            ok: true,
            orgId,
            userId: "user-1",
            roleKeys: ["admin"],
            portalEligible: true,
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        });
    });

    it("returns 400 with available_keys for unknown metric", async () => {
        const req = new NextRequest(
            "http://localhost/api/admin/metrics/resolve?keys=not.real.metric"
        );
        const res = await GET(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.unknown_keys).toContain("not.real.metric");
        expect(body.available_keys).toContain("enrollment.tour_conversion_rate");
    });

    it("returns 400 when keys missing", async () => {
        const req = new NextRequest("http://localhost/api/admin/metrics/resolve");
        const res = await GET(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Missing or invalid keys/i);
    });

    it("returns resolved metrics with source_metadata and kpi", async () => {
        const req = new NextRequest(
            "http://localhost/api/admin/metrics/resolve?keys=enrollment.tour_conversion_rate&mode=live"
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.org_id).toBe(orgId);
        expect(body.mode).toBe("live");
        expect(body.metrics).toHaveLength(1);
        expect(body.metrics[0].metric_key).toBe("enrollment.tour_conversion_rate");
        expect(body.metrics[0].source_metadata.pack).toBe("enrollment");
        expect(body.metrics[0].kpi?.status).toBe("healthy");
    });

    it("rejects invalid mode", async () => {
        const req = new NextRequest(
            "http://localhost/api/admin/metrics/resolve?keys=ops.work_overdue_count&mode=invalid"
        );
        const res = await GET(req);
        expect(res.status).toBe(400);
    });
});

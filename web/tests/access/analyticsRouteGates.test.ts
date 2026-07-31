/**
 * W-1 — Gate the analytics routes (I-17, I-23; closes G2).
 *
 * Plan: `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §5.
 * Regression lock **RL-1** — no route gates on `access.ok` alone.
 *
 * Tier B: fabricated access contexts against the pure gate, plus real handler invocation for the
 * three routes that were genuinely ungated. The fixture idiom follows
 * `web/tests/admin/usersRolesAuth.test.ts:6-19`.
 *
 * The plan named six routes. Three of them —
 * `analytics/metrics/[id]/{trend,preview,snapshot}` — were already portal-gated at their first
 * statement via `requireAnalyticsV2Admin*`; the `access.ok` lines the plan cited are a *second*
 * access resolution used only to build scope dimensions, after the gate. Those three are covered
 * here as regression locks rather than fixes. See the W-1 execution record in §5 of the plan.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import {
    canReadAnalytics,
    ANALYTICS_READ_PERMISSION,
    ANALYTICS_MANAGE_PERMISSION,
} from "@/lib/admin/canReadAnalytics";

const orgId = "22222222-2222-2222-2222-222222222222";

const { mockLoadAdminAccessBundleCached, mockGetAdminContextCached } = vi.hoisted(() => ({
    mockLoadAdminAccessBundleCached: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return {
        ...actual,
        loadAdminAccessBundleCached: mockLoadAdminAccessBundleCached,
        getAdminAccessContextCached: mockLoadAdminAccessBundleCached,
    };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

// Data layers below the gate — never reached by a denied request; present so import resolves.
vi.mock("@/lib/metrics/metricEngine", () => ({ resolveMetrics: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/metrics/snapshots/readMetricTrend", () => ({ readMetricTrend: vi.fn() }));
vi.mock("@/lib/metrics/resolveMetricSiteAccess", () => ({
    assertMetricSiteAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/admin/resolveOrgSiteLocations", () => ({
    resolveOrgSiteLocationsForAdmin: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/analytics/runtime/operationalSurface", () => ({
    buildOperationalSurfaceModel: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/metrics/platform/placementResolver", () => ({
    loadMetricDefinitionById: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/metrics/platform/metricSnapshots", () => ({
    getMetricPlatformSnapshotSeries: vi.fn().mockResolvedValue([]),
    evaluateAndSnapshotMetric: vi.fn(),
}));
vi.mock("@/lib/metrics/platform/metricEvaluator", () => ({ evaluateMetricDefinition: vi.fn() }));

import { createAdminClient } from "@/lib/supabaseAdmin";
import { readMetricTrend } from "@/lib/metrics/snapshots/readMetricTrend";
import { resolveOrgSiteLocationsForAdmin } from "@/lib/admin/resolveOrgSiteLocations";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";

import { GET as intelligenceOperationalGET } from "@/app/api/admin/intelligence/operational/route";
import { GET as metricsResolveGET } from "@/app/api/admin/metrics/resolve/route";
import { GET as metricsTrendsGET } from "@/app/api/admin/metrics/trends/route";
import { GET as analyticsTrendGET } from "@/app/api/admin/analytics/metrics/[id]/trend/route";
import { POST as analyticsPreviewPOST } from "@/app/api/admin/analytics/metrics/[id]/preview/route";
import { POST as analyticsSnapshotPOST } from "@/app/api/admin/analytics/metrics/[id]/snapshot/route";

/** An `ok` bundle for an authenticated org member. `portalEligible` and grants are the variables. */
function bundle(partial: { portalEligible: boolean; roleKeys: string[]; permissionKeys?: string[] }) {
    return {
        ok: true as const,
        userId: "user-1",
        orgId,
        roleKeys: partial.roleKeys,
        permissionKeys: partial.permissionKeys ?? [],
        departmentScope: "all" as const,
        allowedDepartmentIds: null,
        siteScope: "all" as const,
        allowedSiteLocationIds: null,
        portalEligible: partial.portalEligible,
    };
}

/** The exposure W-1 closes: an authenticated org member the portal refuses to admit. */
const SCHOOL_DIRECTOR = bundle({ portalEligible: false, roleKeys: ["school_director"] });
const REGIONAL_LEAD = bundle({ portalEligible: false, roleKeys: ["regional_lead"] });
const ADMIN = bundle({ portalEligible: true, roleKeys: ["admin"] });

const routeParams = { params: Promise.resolve({ id: "metric-1" }) };

/**
 * Probe for "the gate admitted this caller": the first mocked collaborator each handler reaches
 * *after* its authorization check. Asserting the handler reached the data layer is a positive
 * statement about the gate; asserting only "not 403" would also pass if the handler crashed inside
 * the gate itself.
 */
async function reachedDataLayerAfter(
    call: () => Promise<Response>,
    probe: () => { mock: { calls: unknown[] } }
): Promise<boolean> {
    // The data layer is stubbed thin, so an admitted request may throw past the gate. That is not
    // the subject of this test — the probe is.
    await call().catch(() => undefined);
    return probe().mock.calls.length > 0;
}

/** The three routes that gated on `access.ok` alone before W-1. */
const FIXED_ROUTES: {
    name: string;
    call: () => Promise<Response>;
    probe: () => { mock: { calls: unknown[] } };
}[] = [
    {
        name: "GET /api/admin/intelligence/operational",
        call: () =>
            intelligenceOperationalGET(
                new NextRequest("http://localhost/api/admin/intelligence/operational")
            ),
        probe: () => resolveOrgSiteLocationsForAdmin as unknown as { mock: { calls: unknown[] } },
    },
    {
        name: "GET /api/admin/metrics/resolve",
        call: () =>
            metricsResolveGET(
                new NextRequest(
                    "http://localhost/api/admin/metrics/resolve?keys=enrollment.tour_conversion_rate"
                )
            ),
        probe: () => createAdminClient as unknown as { mock: { calls: unknown[] } },
    },
    {
        name: "GET /api/admin/metrics/trends",
        call: () =>
            metricsTrendsGET(
                new NextRequest(
                    "http://localhost/api/admin/metrics/trends?keys=enrollment.tour_conversion_rate"
                )
            ),
        probe: () => readMetricTrend as unknown as { mock: { calls: unknown[] } },
    },
];

/** The three routes already gated by `requireAnalyticsV2Admin*` — locked, not changed. */
const ALREADY_GATED_ROUTES: { name: string; call: () => Promise<Response> }[] = [
    {
        name: "GET /api/admin/analytics/metrics/[id]/trend",
        call: () =>
            analyticsTrendGET(
                new NextRequest("http://localhost/api/admin/analytics/metrics/metric-1/trend"),
                routeParams
            ),
    },
    {
        name: "POST /api/admin/analytics/metrics/[id]/preview",
        call: () =>
            analyticsPreviewPOST(
                new NextRequest("http://localhost/api/admin/analytics/metrics/metric-1/preview", {
                    method: "POST",
                }),
                routeParams
            ),
    },
    {
        name: "POST /api/admin/analytics/metrics/[id]/snapshot",
        call: () =>
            analyticsSnapshotPOST(
                new NextRequest("http://localhost/api/admin/analytics/metrics/metric-1/snapshot", {
                    method: "POST",
                }),
                routeParams
            ),
    },
];

beforeEach(() => {
    vi.clearAllMocks();
});

describe("canReadAnalytics", () => {
    it("admits a portal-eligible principal with no analytics grant (behaviour preserved)", () => {
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: [] })).toBe(true);
    });

    it("refuses an org member who is neither portal-eligible nor granted (G2 — the exposure)", () => {
        expect(canReadAnalytics({ portalEligible: false, permissionKeys: [] })).toBe(false);
        expect(canReadAnalytics({ portalEligible: false, permissionKeys: ["crm.customers.read"] })).toBe(
            false
        );
    });

    it("admits a non-portal principal holding the declared capability (I-16 direction)", () => {
        expect(
            canReadAnalytics({ portalEligible: false, permissionKeys: [ANALYTICS_READ_PERMISSION] })
        ).toBe(true);
        expect(
            canReadAnalytics({ portalEligible: false, permissionKeys: [ANALYTICS_MANAGE_PERMISSION] })
        ).toBe(true);
    });

    it("declares capabilities that exist in the seeded catalog", () => {
        // Both keys are seeded by `20260505164000_permission_grid_keys.sql` (the `reports` grid row),
        // so the gate is grantable through the product rather than being permanently closed.
        expect([ANALYTICS_READ_PERMISSION, ANALYTICS_MANAGE_PERMISSION]).toEqual([
            "reports.read",
            "reports.write",
        ]);
    });
});

describe("W-1 — routes that gated on access.ok alone now require portal eligibility (RL-1)", () => {
    for (const route of FIXED_ROUTES) {
        it(`${route.name} → 403 for an ok-but-not-portalEligible principal`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue(SCHOOL_DIRECTOR);
            const res = await route.call();
            expect(res.status).toBe(403);
        });

        it(`${route.name} → 403 for regional_lead with an unrelated grant`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue({
                ...REGIONAL_LEAD,
                permissionKeys: ["crm.customers.read"],
            });
            const res = await route.call();
            expect(res.status).toBe(403);
        });

        it(`${route.name} → 401 propagates before 403 (I-23 gate order)`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue({ ok: false, status: 401 });
            const res = await route.call();
            expect(res.status).toBe(401);
        });

        it(`${route.name} → admits an admin (no behaviour change for today's operators)`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue(ADMIN);
            expect(await reachedDataLayerAfter(route.call, route.probe)).toBe(true);
        });

        it(`${route.name} → admits a non-portal principal granted reports.read`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue({
                ...REGIONAL_LEAD,
                permissionKeys: [ANALYTICS_READ_PERMISSION],
            });
            expect(await reachedDataLayerAfter(route.call, route.probe)).toBe(true);
        });

        it(`${route.name} → denies before touching the data layer`, async () => {
            mockLoadAdminAccessBundleCached.mockResolvedValue(SCHOOL_DIRECTOR);
            expect(await reachedDataLayerAfter(route.call, route.probe)).toBe(false);
        });
    }
});

describe("W-1 — routes already portal-gated stay gated (RL-1 regression lock)", () => {
    for (const route of ALREADY_GATED_ROUTES) {
        it(`${route.name} → 403 for an ok-but-not-portalEligible principal`, async () => {
            // `getAdminContextCached` returns 403 for a non-portal-eligible principal; these routes
            // consult it as their first statement, before any data access.
            mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 403 });
            mockLoadAdminAccessBundleCached.mockResolvedValue(SCHOOL_DIRECTOR);
            const res = await route.call();
            expect(res.status).toBe(403);
        });

        it(`${route.name} → 401 propagates before 403 (I-23 gate order)`, async () => {
            mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
            mockLoadAdminAccessBundleCached.mockResolvedValue({ ok: false, status: 401 });
            const res = await route.call();
            expect(res.status).toBe(401);
        });

        it(`${route.name} → gates before touching the metric definition`, async () => {
            mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 403 });
            mockLoadAdminAccessBundleCached.mockResolvedValue(SCHOOL_DIRECTOR);
            await route.call();
            expect(loadMetricDefinitionById).not.toHaveBeenCalled();
        });
    }
});

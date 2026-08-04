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

import fs from "node:fs";
import path from "node:path";
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

/**
 * RL-1 family coverage — added by the Mission 2 re-verification (2026-08-04).
 *
 * The six route-level locks above name six files. They cannot notice a *seventh* analytics route
 * arriving ungated, and between the W-1 execution (2026-07-31) and this re-verification the repo
 * grew from 539 to 559 API routes. That gap was closed by hand this run; this block is the durable
 * form of that census, so the next contributor does not have to repeat it.
 *
 * **This is not RL-1's tier-A half.** That is W-14's declared `(route → capability)` table across
 * all 559 routes. This is scoped to the three families W-1 owns, and it proves only that each route
 * *references* a gate that enforces portal eligibility — never that the gate's result is honoured.
 * W-1's own finding (a route holding two access resolutions, only the first gating) is exactly the
 * error this cannot catch, and W-4's record states the same limit for the same reason.
 */
const ANALYTICS_FAMILY_DIRS = [
    "app/api/admin/analytics",
    "app/api/admin/metrics",
    "app/api/admin/intelligence",
] as const;

/**
 * Gates that deny a principal the portal refuses to admit.
 *
 * `requireAdminOrOps` qualifies through `getAdminOrgContextLightCached`, which returns null unless
 * `bundle.portalEligible` (`lib/adminAuth.ts:43-45`). `getAdminContextCached` returns 403 on the
 * same condition. `requireAnalyticsV2Admin*` wrap the latter.
 */
const SUFFICIENT_GATES = [
    "requireAnalyticsReadAccess",
    "requireAnalyticsV2AdminContext",
    "requireAnalyticsV2AdminMutate",
    "requireAdminOrOps",
    "getAdminContextCached",
    "loadAdminRouteGate",
] as const;

/**
 * The G2 primitives. These resolve an access context that is `ok` for *any* authenticated org
 * member, so a route holding only these is the exposure W-1 closed.
 */
const RAW_RESOLUTIONS = ["getAdminAccessContextCached", "loadAdminAccessBundleCached"] as const;

/** Reviewed exceptions. Empty by design — an entry here is a security decision, per W-4's ratchet. */
const FAMILY_GATE_EXCEPTIONS: { route: string; reason: string }[] = [];

function routeFilesUnder(dirs: readonly string[]): string[] {
    const webRoot = path.resolve(__dirname, "../..");
    const found: string[] = [];

    const walk = (abs: string) => {
        if (!fs.existsSync(abs)) return;
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            const next = path.join(abs, entry.name);
            if (entry.isDirectory()) walk(next);
            else if (entry.name === "route.ts") found.push(path.relative(webRoot, next));
        }
    };

    for (const dir of dirs) walk(path.join(webRoot, dir));
    return found.sort();
}

function gatesPortalEligibility(source: string): boolean {
    return SUFFICIENT_GATES.some((gate) => source.includes(gate));
}

describe("W-1 — every analytics-family route references a portal-enforcing gate (RL-1 coverage)", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const routes = routeFilesUnder(ANALYTICS_FAMILY_DIRS);

    it("finds the analytics family, so the assertions below are not vacuous", () => {
        // 26 route files as of 2026-08-04. Asserted as a floor: new routes are expected, and each
        // one must satisfy the gate assertion below rather than change this number.
        expect(routes.length).toBeGreaterThanOrEqual(20);
        expect(routes).toContain("app/api/admin/metrics/resolve/route.ts");
        expect(routes).toContain("app/api/admin/intelligence/operational/route.ts");
    });

    it("rejects a route that holds only a raw access resolution (the G2 shape)", () => {
        // Proves the predicate can fail. A check that cannot be shown to go red is not evidence.
        const g2Shape = `
            const access = await getAdminAccessContextCached();
            if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        `;
        expect(gatesPortalEligibility(g2Shape)).toBe(false);
        expect(RAW_RESOLUTIONS.some((raw) => g2Shape.includes(raw))).toBe(true);
        expect(gatesPortalEligibility(`await requireAnalyticsReadAccess();`)).toBe(true);
    });

    it("actually reads every family route — an empty gate list flags all of them", () => {
        // Non-vacuity, measured against the real files rather than a synthetic string: if the scan
        // silently read nothing (wrong root, bad glob), this would flag zero and the assertion
        // below would pass for the wrong reason.
        const noGates: readonly string[] = [];
        const flaggedWithNoGates = routes.filter((route) => {
            const source = fs.readFileSync(path.join(webRoot, route), "utf8");
            return source.length > 0 && !noGates.some((gate) => source.includes(gate));
        });
        expect(flaggedWithNoGates).toEqual(routes);
        expect(flaggedWithNoGates.length).toBe(routes.length);
    });

    it("names no route that gates on a raw access resolution alone", () => {
        const excepted = new Set(FAMILY_GATE_EXCEPTIONS.map((e) => e.route));
        const ungated = routes.filter((route) => {
            if (excepted.has(route)) return false;
            return !gatesPortalEligibility(fs.readFileSync(path.join(webRoot, route), "utf8"));
        });
        expect(ungated).toEqual([]);
    });

    it("carries no stale exception", () => {
        for (const exception of FAMILY_GATE_EXCEPTIONS) {
            expect(routes).toContain(exception.route);
            expect(exception.reason.length).toBeGreaterThan(0);
        }
    });
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

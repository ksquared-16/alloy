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
/**
 * A real admin. Carries `reports.read` because a real admin HOLDS it — the catalog seeds it and
 * `seed_default_rbac` enumerates it, verified against the certification tenant.
 *
 * It used to carry `portalEligible` alone, and passed because `canReadAnalytics` opened with
 * `if (portalEligible) return true`. That leg was `I-35`ᴮ's last violation — an admission predicate
 * satisfying a capability gate — and W-13 removed it. The fixture was modelling admission as
 * authorization; the invariant it was protecting ("today's operators keep analytics") is preserved,
 * but by the GRANT (`20260819120000`), not by the code.
 */
const ADMIN = bundle({
    portalEligible: true,
    roleKeys: ["admin"],
    permissionKeys: [ANALYTICS_READ_PERMISSION],
});

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
    it("REFUSES a portal-eligible principal with no analytics grant (I-35ᴮ)", () => {
        // This assertion is inverted from what it was, deliberately. Admission may deny, never
        // authorize: `portalEligible` is a fact about reaching the portal's front door, not about
        // being allowed to read org-wide analytics. `04…:752` — half-answering AD-22 means "the
        // fifth layer survives under a new name".
        //
        // No real operator loses anything: `admin` already held `reports.read`, and
        // `20260819120000` granted it to `ops` for every org before this leg was removed. What is
        // refused here is a principal that no longer exists in the data.
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: [] })).toBe(false);
    });

    it("admits a portal-eligible principal who HOLDS the grant — today's operators", () => {
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: [ANALYTICS_READ_PERMISSION] })).toBe(true);
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: [ANALYTICS_MANAGE_PERMISSION] })).toBe(true);
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
 *
 * **The 2026-09-04 gap is closed, 2026-09-06 (seventh issuance).** The sixth issuance recorded that
 * `lib/adminAuth.ts` exports three further portal-enforcing gates absent from this list, declined to
 * add them, and named the durable repair: *require every export of `ACCESS_PRIMITIVE_MODULES` to be
 * classified as gate, raw resolution, or reviewed non-gate.* It deferred that to "a run that can
 * prove it red" because it could not execute the suite. This run can, so it is built below
 * (*"every export of an access-primitive module is classified"*), and the three are now listed:
 *
 * - `getAdminAuthCached` — verified at source, not cited: `loadAdminAuth` returns null unless
 *   `bundle.ok && bundle.portalEligible` (`lib/adminAuth.ts:43-45`).
 * - `getAdminAuth` — its `@deprecated` alias (`:92`), identical behaviour.
 * - `requireAdmin` — strictly stronger (`:98-107`): portal **and** `role === "admin"`.
 *
 * Listing them is the *permissive* direction, which the sixth issuance rightly distrusted, so the
 * two things that make it safe here are stated rather than assumed. It is **inert on today's
 * corpus** — all 103 class-wide subject routes already call a gate that was listed, so no route's
 * verdict changes — and it is no longer a *speculative* widening, because the classification lock
 * now fails on any unclassified export. The permissive step and the restrictive step land together;
 * neither is load-bearing alone.
 *
 * **The standing limit is unchanged and applies to these three too:** this proves a gate is
 * *called*, never that its `null`/`Response` result is honoured — the same limit every other entry
 * carries, and W-1's own two-resolution finding is exactly the error it cannot catch.
 */
const SUFFICIENT_GATES = [
    "requireAnalyticsReadAccess",
    "requireAnalyticsV2AdminContext",
    "requireAnalyticsV2AdminMutate",
    "requireAdminOrOps",
    "getAdminContextCached",
    // `@deprecated` alias of `getAdminContextCached` (`lib/admin/getAdminContext.ts:73`) —
    // identical behaviour, and **12 live route files call it**. Omitting it made the class-wide
    // scan able to flag a genuinely gated route. See the alias-completeness lock below.
    "getAdminContext",
    "loadAdminRouteGate",
    // Listed 2026-09-06 (seventh issuance), closing the gap the sixth recorded. All three enforce
    // portal eligibility through `loadAdminAuth` (`lib/adminAuth.ts:43-45`); `getAdminAuth` is the
    // `@deprecated` alias of the first and `requireAdmin` is strictly stronger.
    "getAdminAuthCached",
    "getAdminAuth",
    "requireAdmin",
] as const;

/**
 * The G2 primitives. These resolve an access context that is `ok` for *any* authenticated org
 * member, so a route holding only these is the exposure W-1 closed.
 */
const RAW_RESOLUTIONS = [
    "getAdminAccessContextCached",
    // `@deprecated` alias of the line above (`lib/admin/getAdminAccessContext.ts:119`). It is the
    // **same primitive under a second exported name**, so a route calling it holds the G2 shape
    // while escaping this selector entirely — invisible rather than flagged. Zero routes call it
    // today: latent, one import away from live, and recorded rather than absorbed.
    "getAdminAccessContext",
    "loadAdminAccessBundleCached",
] as const;

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

/**
 * Comments removed, so a gate *named in prose* cannot satisfy the lock.
 *
 * The 2026-08-04 form of this check was `source.includes(gate)` over the raw file. A route whose
 * only mention of `requireAdminOrOps` was a TODO comment would have passed it — the §10.2 failure
 * mode (mention vs. branch) reappearing inside the lock added to close a hand census. Line comments
 * are stripped only when `//` is not preceded by `:`, so a `http://` inside a string literal does
 * not truncate the line.
 */
function codeOnly(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** The gate must be *called*, not merely named — `gate(` in code, not `gate` anywhere. */
function callsAny(source: string, gates: readonly string[]): boolean {
    const code = codeOnly(source);
    return gates.some((gate) => new RegExp(`\\b${gate}\\s*\\(`).test(code));
}

function gatesPortalEligibility(source: string): boolean {
    return callsAny(source, SUFFICIENT_GATES);
}

describe("W-1 — every analytics-family route references a portal-enforcing gate (RL-1 coverage)", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const routes = routeFilesUnder(ANALYTICS_FAMILY_DIRS);

    it("finds the analytics family, so the assertions below are not vacuous", () => {
        // 26 files on 2026-08-04, **27 on 2026-08-06**. Asserted as a floor that follows the live
        // count up — W-4's lesson that a ratchet left below its floor hands out free slack applies
        // here too: a floor of 20 against 27 files would let seven routes be deleted unnoticed.
        expect(routes.length).toBeGreaterThanOrEqual(27);
        expect(routes).toContain("app/api/admin/metrics/resolve/route.ts");
        expect(routes).toContain("app/api/admin/intelligence/operational/route.ts");
    });

    it("does not credit a gate that appears only in a comment", () => {
        // The predicate's own failure mode, asserted directly. Both shapes name a sufficient gate;
        // only the one that calls it is credited.
        const commentOnly = `
            // TODO: gate this with requireAdminOrOps before shipping.
            /** Superseded: used to call getAdminContextCached(). */
            const access = await loadAdminAccessBundleCached();
        `;
        expect(gatesPortalEligibility(commentOnly)).toBe(false);
        expect(gatesPortalEligibility(`await requireAdminOrOps(request);`)).toBe(true);
        // …and the 2026-08-04 form of this predicate — `source.includes(gate)` — credited it.
        // That is the gap this assertion closes, stated as a fact about the source rather than
        // a claim in a comment.
        expect(SUFFICIENT_GATES.some((gate) => commentOnly.includes(gate))).toBe(true);
    });

    it("keeps a URL in a string literal out of the comment stripper", () => {
        // `//` inside `http://` must not truncate the rest of the line and hide a real gate call.
        const withUrl = `const r = new NextRequest("http://localhost/x"); await requireAdminOrOps(r);`;
        expect(gatesPortalEligibility(withUrl)).toBe(true);
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

/**
 * RL-1 widened to the exposure class — added 2026-08-06, the third issuance of W-1.
 *
 * The family census above scans three hand-listed directories. **G2 is not a property of those
 * directories.** It is a shape: *resolve an access context that is `ok` for any authenticated org
 * member, then gate on nothing else.* An analytics-shaped route landing under a fourth directory
 * reopens G2 and the family scan cannot see it — the same "a lock naming N files cannot notice the
 * N+1th" limit the 2026-08-04 re-verification recorded, one level up.
 *
 * So this block takes **all of `web/app/api`** as its subject and the raw primitive as its
 * selector: the lock now follows the exposure rather than the folder. 92 of the repo's 570 route
 * files resolve a raw bundle; every one of them must also call a gate that denies someone the
 * portal refuses to admit, or a reviewed capability predicate.
 *
 * **Same honest limit, unchanged.** This proves a sufficient gate is *called*, never that its
 * result is honoured — W-1's own two-resolution finding is exactly the error it cannot catch, and
 * RL-1's tier-A half is still W-14's declared `(route → capability)` table.
 */
const API_ROOT = "app/api";

/**
 * Capability gates: they admit on a granted permission key rather than on portal eligibility.
 *
 * `canReadProgramPublication` (`configuration/programs/route.ts:49-57`) is the plan's own named
 * reference shape for W-1 (§5) — it is the seventh route in the raw difference and is correctly
 * gated. A route gating on a capability is not "gating on `access.ok` alone", which is what RL-1
 * asserts, so it belongs here rather than in an exception list.
 */
const CAPABILITY_GATES = ["canReadProgramPublication", "canManageProgramPublication"] as const;

/** Reviewed exceptions. Empty by design — an entry here is a security decision (W-4's ratchet). */
const G2_CLASS_EXCEPTIONS: { route: string; reason: string }[] = [];

function resolvesRawAccessContext(source: string): boolean {
    return callsAny(source, RAW_RESOLUTIONS);
}

describe("W-1 — no route in web/app/api gates on a raw access resolution alone (RL-1, class-wide)", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const subject = routeFilesUnder([API_ROOT]).filter((route) =>
        resolvesRawAccessContext(fs.readFileSync(path.join(webRoot, route), "utf8"))
    );

    it("selects the routes that hold the G2 primitive, and finds enough of them to be meaningful", () => {
        // 92 of 570 route files on 2026-08-06; 91 on 2026-08-07 after W-8; **103 of 603 on
        // 2026-09-04**, the sixth issuance, across an interval of 995 web commits.
        //
        // A floor, ratcheted to the live count: if the selector silently stopped matching, this
        // fails rather than passing on an empty subject. Lowering it is therefore a decision, not
        // a retune — recorded here because a floor that drifts down quietly locks nothing.
        //
        // **The 2026-09-04 ratchet was derived statically, and 2026-09-06 confirmed it exactly.**
        // The sixth issuance could not execute this suite — that worktree had no installed
        // dependencies — so it set the floor by replicating `callsAny` over the same file set and
        // argued the result was a safe *lower* bound: every way the derivation could diverge from
        // this predicate (`codeOnly` joining a match across a stripped block comment, `\s*`
        // spanning a newline, `readdirSync` seeing files ripgrep's gitignore filter does not) moves
        // the count up, never down. It closed by asking the next runner that could execute the
        // suite to confirm the exact figure.
        //
        // **Confirmed 2026-09-06 (seventh issuance): the executed subject is exactly 103**, on a
        // base 28 web commits later with the API route count unmoved at 603. So the bound was not
        // merely safe, it was tight — all three divergence paths contributed zero, which is the
        // evidence that comment-stripping really is a no-op on this corpus rather than an argument
        // that it should be. The figure was read from this predicate itself (a temporary
        // impossible floor makes `toBeGreaterThanOrEqual` report the live value), not from a
        // second replication that could diverge the same way the first might have.
        //
        // W-8 removed the one route that left: `app/api/admin/departments/route.ts` called
        // `getAdminAccessContextCached` *only* to read `roleKeys` for
        // `portalAdminBypassesDepartmentScope`. With no role able to widen a scope dimension there
        // is nothing to read, so the raw resolution is gone. The route did not lose a gate — GET
        // still runs `loadAdminRouteGate` and POST `getAdminContextCached`, both of which require
        // portal eligibility. It resolves less because it needs less, which is the direction G2
        // wants; the count fell for the reason the lock exists to produce.
        expect(subject.length).toBeGreaterThanOrEqual(103);
        expect(subject).not.toContain("app/api/admin/departments/route.ts");
        expect(subject).toContain("app/api/admin/configuration/programs/route.ts");
        expect(subject).toContain("app/api/admin/lifecycle-catalog/repair/route.ts");
        // `metrics/resolve` is deliberately *not* in the subject: W-1 moved its raw resolution
        // inside `requireAnalyticsReadAccess`, which is what closing G2 looks like from here.
        expect(subject).not.toContain("app/api/admin/metrics/resolve/route.ts");
    });

    it("reads every selected route — an empty gate list flags all of them", () => {
        const flaggedWithNoGates = subject.filter((route) => {
            const source = fs.readFileSync(path.join(webRoot, route), "utf8");
            return source.length > 0 && !callsAny(source, []);
        });
        expect(flaggedWithNoGates).toEqual(subject);
    });

    it("names no route that resolves an access context and gates on nothing else", () => {
        const excepted = new Set(G2_CLASS_EXCEPTIONS.map((e) => e.route));
        const ungated = subject.filter((route) => {
            if (excepted.has(route)) return false;
            const source = fs.readFileSync(path.join(webRoot, route), "utf8");
            return !callsAny(source, [...SUFFICIENT_GATES, ...CAPABILITY_GATES]);
        });
        expect(ungated).toEqual([]);
    });

    it("carries no stale exception", () => {
        for (const exception of G2_CLASS_EXCEPTIONS) {
            expect(subject).toContain(exception.route);
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

/* --------------------------------------------------------------------------------------------- *
 * RL-1 subject completeness — a second exported name defeats a hand-maintained symbol list
 * --------------------------------------------------------------------------------------------- */

/**
 * `SUFFICIENT_GATES` and `RAW_RESOLUTIONS` name *implementations*. The modules defining them also
 * export `@deprecated` aliases (`export const getAdminContext = getAdminContextCached`), and
 * `callsAny` matches `symbol(` — so an alias matches neither list.
 *
 * The two directions are not symmetric:
 *
 * - an alias of a **raw resolution** missing from `RAW_RESOLUTIONS` removes the route from the
 *   subject entirely — a G2 exposure the class-wide scan cannot see. This is the dangerous one.
 * - an alias of a **sufficient gate** missing from `SUFFICIENT_GATES` flags a correctly gated
 *   route — noisy, not unsafe.
 *
 * This is the 2026-08-06 subject defect one level up. That run moved the subject from three
 * hand-listed *directories* to the primitive; the primitive list is still hand-listed. The repair
 * is the same change of question — ask the defining module what it exports, rather than
 * maintaining a list beside it that a one-line `export const` silently invalidates.
 */
const ACCESS_PRIMITIVE_MODULES = [
    "lib/admin/getAdminContext.ts",
    "lib/admin/getAdminAccessContext.ts",
    "lib/adminAuth.ts",
] as const;

/** `export const A = B;` — a re-export of an existing symbol under a second name. */
function exportedAliases(source: string): { alias: string; target: string }[] {
    const found: { alias: string; target: string }[] = [];
    const re = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*;/g;
    const code = codeOnly(source);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) found.push({ alias: match[1], target: match[2] });
    return found;
}

describe("W-1 — every alias of a listed symbol is listed too (RL-1 subject completeness)", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const aliases = ACCESS_PRIMITIVE_MODULES.flatMap((mod) =>
        exportedAliases(fs.readFileSync(path.join(webRoot, mod), "utf8"))
    );

    it("finds the aliases, so the assertions below are not vacuous", () => {
        expect(aliases.length).toBeGreaterThanOrEqual(3);
        expect(aliases).toContainEqual({ alias: "getAdminContext", target: "getAdminContextCached" });
        expect(aliases).toContainEqual({ alias: "getAdminAccessContext", target: "getAdminAccessContextCached" });
    });

    it("lists every alias of a raw access primitive", () => {
        const missing = aliases
            .filter((a) => (RAW_RESOLUTIONS as readonly string[]).includes(a.target))
            .filter((a) => !(RAW_RESOLUTIONS as readonly string[]).includes(a.alias))
            .map((a) => a.alias);
        expect(missing).toEqual([]);
    });

    it("lists every alias of a sufficient gate", () => {
        const missing = aliases
            .filter((a) => (SUFFICIENT_GATES as readonly string[]).includes(a.target))
            .filter((a) => !(SUFFICIENT_GATES as readonly string[]).includes(a.alias))
            .map((a) => a.alias);
        expect(missing).toEqual([]);
    });

    it("did not select an alias-only G2 route under the 2026-08-06 primitive list", () => {
        // The defect asserted against source rather than claimed in prose: a route holding the G2
        // shape through the alias never entered the subject, so it could be neither flagged nor
        // excepted — it was absent. Zero routes do this today; the point is that nothing stopped one.
        const aliasOnlyG2Route = [
            'import { getAdminAccessContext } from "@/lib/admin/getAdminAccessContext";',
            "export async function GET() {",
            "    const access = await getAdminAccessContext();",
            "    if (!access.ok) return new Response(null, { status: access.status });",
            "    return Response.json({ orgWideMetrics: [] });",
            "}",
        ].join("\n");

        const PRIMITIVES_2026_08_06 = ["getAdminAccessContextCached", "loadAdminAccessBundleCached"];
        expect(callsAny(aliasOnlyG2Route, PRIMITIVES_2026_08_06)).toBe(false);

        // With the alias listed it is selected, and it is flagged: it gates on nothing else.
        expect(resolvesRawAccessContext(aliasOnlyG2Route)).toBe(true);
        expect(callsAny(aliasOnlyG2Route, [...SUFFICIENT_GATES, ...CAPABILITY_GATES])).toBe(false);
    });

    it("does not let the alias swallow the implementation it aliases", () => {
        // `\bgetAdminAccessContext\s*\(` must not match `getAdminAccessContextCached(`, or the
        // subject would be unchanged for the wrong reason and the 92 floor would go stale silently.
        expect(callsAny("const a = await getAdminAccessContextCached();", ["getAdminAccessContext"])).toBe(false);
        expect(callsAny("const a = await getAdminContextCached();", ["getAdminContext"])).toBe(false);
    });
});

/* --------------------------------------------------------------------------------------------- *
 * RL-1 subject completeness, one level up — a wholly new export defeats the alias lock
 * --------------------------------------------------------------------------------------------- */

/**
 * **The fifth instance of this workstream's recurring escape class, and the first closed in the
 * restrictive direction before it had a victim.**
 *
 * The pattern, four repairs deep: 2026-08-04 listed *directories*; 2026-08-06 moved the subject to
 * the *primitive*; 2026-08-07 caught the *alias*; each repair left a hand-maintained list policing
 * the layer beneath it. The alias lock asks whether an alias of an **already listed** symbol is
 * listed — so a module exporting a *wholly new* gate or a *wholly new* raw resolution is invisible
 * to every list here. `getAdminAuthCached` sat unlisted that way from the day it was written; the
 * sixth issuance found it by hand, which is precisely the labour these locks exist to retire.
 *
 * This lock asks the last question left: **every runtime export of an access-primitive module must
 * be classified.** Gate, raw resolution, capability gate, or an entry in `REVIEWED_NON_GATES` with
 * a reason. A new `export async function requireSomethingNew()` fails this immediately, and the
 * failure names the symbol — so the next contributor makes a decision instead of silently widening
 * the blind spot. The list stops being hand-maintained against the module; the module drives it.
 *
 * Types are excluded deliberately: `export type` / `export interface` emit no runtime symbol and
 * cannot be called, so they can neither gate nor resolve.
 *
 * **What it still cannot do.** It reads three named modules. A *fourth* module exporting an access
 * primitive is outside its subject — the same "a lock naming N cannot notice the N+1th" limit, now
 * at the module layer, which is where W-14's declared route table is the real answer. Recorded here
 * so the next reader does not mistake this for completeness.
 */
const REVIEWED_NON_GATES: { symbol: string; reason: string }[] = [
    {
        symbol: "adminContextFailureResponse",
        reason:
            "Renders a failure into a NextResponse (`getAdminContext.ts:76`). It is the thing a gate " +
            "returns, not a gate — it decides nothing about a principal.",
    },
    {
        symbol: "logAdminAudit",
        reason:
            "Re-exported audit writer (`adminAuth.ts:132`, from `@/lib/admin/adminAuditLog`). Records " +
            "that an action happened; authorizes nothing.",
    },
];

/** Runtime (value) exports only — `export type` and `export interface` are erased at compile time. */
function runtimeExports(source: string): string[] {
    const code = codeOnly(source);
    const found = new Set<string>();

    // `export async function X`, `export function X`, `export const X`, `export class X`.
    // The `(?!type|interface)` guard is unnecessary here because those forms are matched by keyword,
    // but `export const` must not swallow `export const enum` (a type-level form).
    const declared = /export\s+(?:async\s+)?(?:function|class)\s+(\w+)|export\s+const\s+(?!enum\b)(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = declared.exec(code)) !== null) found.add(match[1] ?? match[2]);

    // `export { X }` and `export { X } from "…"` — but not `export type { X }`.
    const braced = /export\s+(?!type\b)\{([^}]*)\}/g;
    while ((match = braced.exec(code)) !== null) {
        for (const part of match[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            // `export { type Foo }` — an inline type specifier emits no runtime symbol.
            if (name && /^\w+$/.test(name) && !/^\s*type\s/.test(part)) found.add(name);
        }
    }

    return [...found].sort();
}

describe("W-1 — every export of an access-primitive module is classified (RL-1 subject completeness)", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const exportsByModule = ACCESS_PRIMITIVE_MODULES.map((mod) => ({
        mod,
        symbols: runtimeExports(fs.readFileSync(path.join(webRoot, mod), "utf8")),
    }));

    it("finds the exports, so the assertions below are not vacuous", () => {
        // Anchored on one symbol of each classification, so an empty or collapsed scan fails here
        // rather than passing the classification assertion on nothing.
        const all = exportsByModule.flatMap((m) => m.symbols);
        expect(all.length).toBeGreaterThanOrEqual(9);
        expect(all).toContain("requireAdminOrOps"); // gate
        expect(all).toContain("loadAdminAccessBundleCached"); // raw resolution
        expect(all).toContain("adminContextFailureResponse"); // reviewed non-gate
        expect(all).toContain("logAdminAudit"); // reviewed non-gate, via `export { X } from`
    });

    it("emits no runtime symbol for a type-only export", () => {
        // The exclusion stated as a fact about the scanner rather than in prose. If `export type`
        // leaked in, every module would carry unclassifiable symbols and the register below would
        // fill up with types — classification theatre.
        expect(runtimeExports("export type AdminRole = string;")).toEqual([]);
        expect(runtimeExports("export interface AdminAuthResult { a: 1 }")).toEqual([]);
        expect(runtimeExports('export type { Foo } from "./foo";')).toEqual([]);
        expect(runtimeExports("export const enum E { A }")).toEqual([]);
        // …and it does find the runtime forms it must.
        expect(runtimeExports("export async function requireX() {}")).toEqual(["requireX"]);
        expect(runtimeExports('export { logAdminAudit } from "@/x";')).toEqual(["logAdminAudit"]);
        expect(runtimeExports("export { a as b };")).toEqual(["b"]);
    });

    it("classifies every runtime export as gate, raw resolution, or reviewed non-gate", () => {
        const classified = new Set<string>([
            ...SUFFICIENT_GATES,
            ...RAW_RESOLUTIONS,
            ...CAPABILITY_GATES,
            ...REVIEWED_NON_GATES.map((entry) => entry.symbol),
        ]);

        const unclassified = exportsByModule.flatMap(({ mod, symbols }) =>
            symbols.filter((symbol) => !classified.has(symbol)).map((symbol) => `${mod}:${symbol}`)
        );

        // A new export of an access primitive lands here by name. Adding it to a list is a
        // security decision; `REVIEWED_NON_GATES` is where "it is not a gate" gets argued in
        // writing rather than assumed by omission.
        expect(unclassified).toEqual([]);
    });

    it("carries no stale entry in the reviewed non-gate register", () => {
        // The register is an exemption list, so it must not outlive its subject — the failure mode
        // W-4's ratchet and the family exception list both guard against.
        const all = new Set(exportsByModule.flatMap((m) => m.symbols));
        const stale = REVIEWED_NON_GATES.filter((entry) => !all.has(entry.symbol)).map((e) => e.symbol);
        expect(stale).toEqual([]);
    });

    it("requires every reviewed non-gate to carry a reason", () => {
        const unreasoned = REVIEWED_NON_GATES.filter((entry) => entry.reason.trim().length < 20);
        expect(unreasoned).toEqual([]);
    });
});

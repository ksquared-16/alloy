/**
 * DIRECT CERTIFICATION — the Operational Intelligence residual.
 *
 * THE REAL GATE RUNS. `requireAnalyticsManageAccess` and `canManageAnalytics` are NOT mocked; only
 * the access bundle they read is, so what these cases exercise is the promoted Analytics authority
 * rather than a stand-in for it.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal asserts the persistence function was never called,
 * so "nothing was written" is measured rather than inferred; every admission asserts the draft the
 * caller asked for reached the writer with the caller's own org on it.
 *
 * The personas that matter are the plausible-but-wrong ones. `reports.read` is the sharpest: it is
 * the key an organization gives someone to LOOK at Operational Intelligence, and it is a strict
 * subset of the writer in the read gate — so if it ever satisfied the manage gate, every viewer
 * would silently become an author of the definitions their numbers are computed from.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockBundle, popDraft, popPublish, eqDraft, eqPublish, configureFuture } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockBundle: vi.fn(),
    popDraft: vi.fn(),
    popPublish: vi.fn(),
    eqDraft: vi.fn(),
    eqPublish: vi.fn(),
    configureFuture: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
/* Only the bundle is mocked — requireAnalyticsManageAccess itself is the code under test. */
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, loadAdminAccessBundleCached: mockBundle };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ __client: true }) }));
vi.mock("@/lib/organizationPopulations/persist", () => ({
    createOrganizationPopulationDraft: popDraft,
    publishOrganizationPopulation: popPublish,
    listOrganizationPopulations: vi.fn(),
    ensureDefaultActiveChildrenPopulation: vi.fn(),
}));
vi.mock("@/lib/organizationWeightings/persist", () => ({
    createOrganizationEquivalencyDraft: eqDraft,
    publishOrganizationEquivalency: eqPublish,
    listOrganizationEquivalencies: vi.fn(),
    ensureDefaultUnweightedWeighting: vi.fn(),
    ensureDefaultFteWeighting: vi.fn(),
    ensureDefaultCategoryEquivalency: vi.fn(),
    ensureDefaultWeeklyHoursEquivalency: vi.fn(),
}));
vi.mock("@/lib/operationalQuestions/configureFutureRoomCapacity", () => ({
    configureFutureRoomCapacityMeasurement: configureFuture,
}));
vi.mock("@/lib/operationalQuestions/configureRoomUtilization", () => ({
    configureRoomUtilizationMeasurement: vi.fn(),
}));
vi.mock("@/lib/operationalQuestions/configurePopulationQuestions", () => ({
    configureEquivalentChildCountMeasurement: vi.fn(),
    configureRoomUtilizationFteMeasurement: vi.fn(),
}));

import { POST as POPULATIONS } from "@/app/api/admin/organization-populations/route";
import { POST as WEIGHTINGS } from "@/app/api/admin/organization-weightings/route";
import { POST as CONFIGURE } from "@/app/api/admin/operational-questions/configure/route";
import { ANALYTICS_MANAGE_PERMISSION } from "@/lib/admin/canReadAnalytics";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

/** `reports.write`, named once so a rename cannot make these cases pass against the wrong key. */
const WRITE = ANALYTICS_MANAGE_PERMISSION;

const bundle = (permissionKeys: string[], orgId = ORG) => ({
    ok: true as const,
    userId: "user-1",
    orgId,
    roleKeys: [],
    permissionKeys,
    portalEligible: true,
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
});
const ctx = (role = "member", orgId = ORG) => ({ ok: true as const, userId: "user-1", orgId, role, permissionKeys: [] });

const REPORTS_WRITER = () => bundle([WRITE]);
const REPORTS_READER = () => bundle(["portal.access", "reports.read"]);
const PORTAL_ONLY = () => bundle(["portal.access"]);
/** Every neighbouring configuration authority, and none of them is Analytics. */
const WRONG_AUTHORITY = () =>
    bundle([
        "portal.access",
        "business_process.configure",
        "business_process.activate",
        "layouts.manage",
        "fields.manage",
        "sections.manage",
        "settings.manage",
        "work.operate",
        "configuration.vocabulary.manage",
    ]);
/** The default admin package carries reports.write. */
const DEFAULT_ADMIN = () => bundle(["portal.access", "reports.read", WRITE]);
/** The default ops package carries reports.read and NOT reports.write. */
const DEFAULT_OPS = () =>
    bundle(["portal.access", "reports.read", "work.operate", "crm.customers.write", "fin.write", "settings.manage"]);

const req = (url: string, body: unknown) =>
    new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });

const CALLS: [string, () => Promise<Response>, () => ReturnType<typeof vi.fn>][] = [
    ["populations", () => POPULATIONS(req("/api/admin/organization-populations", { name: "Infants expected" })), () => popDraft],
    ["weightings", () => WEIGHTINGS(req("/api/admin/organization-weightings", { name: "FTE", scheme: "weekly_hours" })), () => eqDraft],
    ["configure", () => CONFIGURE(req("/api/admin/operational-questions/configure", { name: "Future Room Capacity" })), () => configureFuture],
];

beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.mockResolvedValue(ctx());
    popDraft.mockResolvedValue({ id: "pop-1" });
    eqDraft.mockResolvedValue({ id: "eq-1" });
    configureFuture.mockResolvedValue({ measurement: { id: "m-1" } });
});

describe("OI residual direct — the reporting owner is admitted and the definition is written", () => {
    it.each(CALLS)("a reports.write holder reaches the writer on %s", async (_label, call, writer) => {
        mockBundle.mockResolvedValue(REPORTS_WRITER());
        const res = await call();
        expect(res.status, `refused unexpectedly: ${JSON.stringify(await res.clone().json())}`).toBe(201);
        expect(writer()).toHaveBeenCalledTimes(1);
        // The write carries the CALLER's organization, never one from the body.
        expect((writer().mock.calls[0] as unknown[])[1]).toMatchObject({ orgId: ORG });
    });

    it.each(CALLS)("the default administrator is admitted on %s — by the package, not the title", async (_l, call, writer) => {
        mockBundle.mockResolvedValue(DEFAULT_ADMIN());
        expect((await call()).status).toBe(201);
        expect(writer()).toHaveBeenCalledTimes(1);
    });

    it("populations publishes only when asked, and through the same authority", async () => {
        mockBundle.mockResolvedValue(REPORTS_WRITER());
        popPublish.mockResolvedValue({ id: "pop-1", lifecycle: "published" });
        await POPULATIONS(req("/api/admin/organization-populations", { name: "X", publish: true }));
        expect(popPublish).toHaveBeenCalledTimes(1);

        popPublish.mockClear();
        await POPULATIONS(req("/api/admin/organization-populations", { name: "X" }));
        expect(popPublish).not.toHaveBeenCalled();
    });
});

describe("OI residual direct — who is refused, and nothing is written", () => {
    const REFUSED: [string, () => ReturnType<typeof bundle>][] = [
        ["portal admission alone", PORTAL_ONLY],
        ["a reports.READER — looking at the numbers is not authoring their definitions", REPORTS_READER],
        ["every neighbouring configuration authority at once", WRONG_AUTHORITY],
        ["the default ops package, which carries reports.read and not reports.write", DEFAULT_OPS],
    ];

    for (const [who, subject] of REFUSED) {
        it.each(CALLS)(`${who} is refused on %s`, async (_l, call, writer) => {
            mockBundle.mockResolvedValue(subject());
            const res = await call();
            expect(res.status).toBe(403);
            expect(writer(), "a refusal must not reach the writer").not.toHaveBeenCalled();
        });
    }

    it.each(CALLS)("the admin ROLE with no grant is refused on %s — the rule this slice removed", async (_l, call, writer) => {
        // The title is present on the context and absent from the grants. Before this slice the
        // title decided; now it decides nothing.
        mockCtx.mockResolvedValue(ctx("admin"));
        mockBundle.mockResolvedValue(bundle(["portal.access"]));
        expect((await call()).status).toBe(403);
        expect(writer()).not.toHaveBeenCalled();
    });

    it.each(CALLS)("a FAILED access read denies on %s rather than opening the door", async (_l, call, writer) => {
        mockBundle.mockResolvedValue({ ok: false, status: 403 });
        expect((await call()).status).toBe(403);
        expect(writer()).not.toHaveBeenCalled();
    });
});

describe("OI residual direct — the tenant is the caller's", () => {
    it.each(CALLS)("a principal resolved into another organization writes only there on %s", async (_l, call, writer) => {
        mockCtx.mockResolvedValue(ctx("member", OTHER_ORG));
        mockBundle.mockResolvedValue(REPORTS_WRITER());
        await call();
        // The handlers pin every write to ctx.orgId and read no org from the body, so this
        // organization's definitions are unreachable from a context resolved elsewhere.
        expect((writer().mock.calls[0] as unknown[])[1]).toMatchObject({ orgId: OTHER_ORG });
        expect(JSON.stringify(writer().mock.calls[0])).not.toContain(ORG);
    });
});

describe("OI residual direct — W-17 composition, no TTL", () => {
    it.each(CALLS)("granting reports.write opens the next request on %s; revoking closes it", async (_l, call, writer) => {
        // No grant row is edited and no clock advanced: each call resolves its own bundle.
        mockBundle.mockResolvedValue(PORTAL_ONLY());
        expect((await call()).status).toBe(403);
        expect(writer()).not.toHaveBeenCalled();

        mockBundle.mockResolvedValue(REPORTS_WRITER());
        expect((await call()).status).toBe(201);
        expect(writer()).toHaveBeenCalledTimes(1);

        writer().mockClear();
        mockBundle.mockResolvedValue(PORTAL_ONLY());
        expect((await call()).status).toBe(403);
        expect(writer()).not.toHaveBeenCalled();
    });
});

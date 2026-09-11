import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const CANDIDATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPP = "22222222-2222-4222-8222-222222222222";
const OVERRIDE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const createOverrideMock = vi.hoisted(() => vi.fn());
const releaseOverrideMock = vi.hoisted(() => vi.fn());
const applyCanonicalMock = vi.hoisted(() => vi.fn());
const loadSectionOrderMock = vi.hoisted(() => vi.fn());
const routeIdentityMock = vi.hoisted(() => vi.fn());
const releaseManualMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(() =>
        Promise.resolve({ ok: true, orgId: ORG, userId: USER, role: "admin" })
    ),
    adminContextFailureResponse: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: vi.fn(() =>
        Promise.resolve({
            ok: true,
            userId: USER,
            orgId: ORG,
            roleKeys: ["admin"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        })
    ),
}));

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/admin/accessScope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/accessScope")>();
    return {
        ...actual,
        assertExistingOpportunityMutableInAdminScope: vi.fn(async () => true),
    };
});

vi.mock("@/lib/orchestration/placement/placementOverrideMutations", () => ({
    createPlacementOverride: createOverrideMock,
    releasePlacementOverride: releaseOverrideMock,
    applyCanonicalSectionOrder: applyCanonicalMock,
    releaseManualPositionOverrides: releaseManualMock,
}));

vi.mock("@/lib/orchestration/placement/loadWaitlistSectionOrder", () => ({
    loadWaitlistSectionOrder: loadSectionOrderMock,
}));

// The route resolves a slug with the SAME resolver the work-unit page uses, so the test has to
// stand that resolver up rather than reach around it.
vi.mock("@/lib/admin/resolveWorkUnitRouteIdentity", () => ({
    resolveWorkUnitRouteIdentity: routeIdentityMock,
}));

vi.mock("@/lib/orchestration/placement/placementPresetRegistry", () => ({
    getPlacementProfileFromRegistry: vi.fn(() => ({
        profile_id: "childcare_enrollment_waitlist_v2",
        buckets: [{ bucket_key: "tier_staff_community", priority_order: 10, label_key: "bucket_staff_community" }],
    })),
}));

describe("placement override admin routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        routeIdentityMock.mockResolvedValue({
            gate: { ok: true },
            platformKey: "waitlist",
            resolution: { status: "resolved", match: { workUnitId: "44444444-4444-4444-8444-444444444444" } },
            departments: [],
        });
        createAdminClientMock.mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: { opportunity_id: OPP }, error: null })),
                        })),
                    })),
                })),
            })),
        });
    });

    it("POST create returns 201 on success", async () => {
        createOverrideMock.mockResolvedValue({
            ok: true,
            override: { id: OVERRIDE, override_kind: "tier_boost" },
        });
        const { POST } = await import("@/app/api/admin/placement-candidates/[candidateId]/overrides/route");
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/overrides", {
            method: "POST",
            body: JSON.stringify({
                override_kind: "tier_boost",
                reason: "Staff household",
                payload: { effective_bucket_key: "tier_staff_community" },
            }),
        });
        const res = await POST(req, { params: Promise.resolve({ candidateId: CANDIDATE }) });
        expect(res.status).toBe(201);
        expect(createOverrideMock).toHaveBeenCalled();
    });

    it("POST create rejects invalid override_kind", async () => {
        const { POST } = await import("@/app/api/admin/placement-candidates/[candidateId]/overrides/route");
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/overrides", {
            method: "POST",
            body: JSON.stringify({ override_kind: "bogus", reason: "x" }),
        });
        const res = await POST(req, { params: Promise.resolve({ candidateId: CANDIDATE }) });
        expect(res.status).toBe(400);
    });

    it("POST release returns ok on success", async () => {
        releaseOverrideMock.mockResolvedValue({ ok: true, override: { id: OVERRIDE, is_active: false } });
        const { POST } = await import(
            "@/app/api/admin/placement-candidates/[candidateId]/overrides/[overrideId]/release/route"
        );
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/overrides/y/release", {
            method: "POST",
            body: JSON.stringify({ release_reason: "No longer needed" }),
        });
        const res = await POST(req, {
            params: Promise.resolve({ candidateId: CANDIDATE, overrideId: OVERRIDE }),
        });
        expect(res.status).toBe(200);
        expect(releaseOverrideMock).toHaveBeenCalled();
    });

    const WORK_UNIT_SLUG = "waitlist";
    const SECTION = ["s1", "s2", CANDIDATE, "s4", "s5"];

    function sectionOrder(over: Partial<{ finalOrder: string[]; pinnedIds: string[] }> = {}) {
        return {
            sectionKey: "infant",
            workUnitSlug: WORK_UNIT_SLUG,
            finalOrder: over.finalOrder ?? SECTION,
            pinnedIds: over.pinnedIds ?? [],
        };
    }

    async function post(body: Record<string, unknown>) {
        const { POST } = await import("@/app/api/admin/placement-candidates/[candidateId]/manual-position/route");
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/manual-position", {
            method: "POST",
            body: JSON.stringify(body),
        });
        return POST(req, { params: Promise.resolve({ candidateId: CANDIDATE }) });
    }

    it("POST manual-position move writes one canonical order for the section", async () => {
        loadSectionOrderMock.mockResolvedValue(sectionOrder());
        applyCanonicalMock.mockResolvedValue({ ok: true, written: 1, released: 0 });
        const res = await post({
            action: "move",
            reason: "Sibling starting soon",
            pin_ordinal: 1,
            work_unit_key: WORK_UNIT_SLUG,
        });
        expect(res.status).toBe(200);
        expect(applyCanonicalMock).toHaveBeenCalled();
        // The response states where the row actually ended up, which is the contract being kept.
        await expect(res.json()).resolves.toMatchObject({ ok: true, position: 1, position_total: 5 });
    });

    it("the resulting position equals the requested position, for every position", async () => {
        for (let target = 1; target <= SECTION.length; target += 1) {
            vi.clearAllMocks();
            loadSectionOrderMock.mockResolvedValue(sectionOrder());
            applyCanonicalMock.mockResolvedValue({ ok: true, written: 1, released: 0 });
            const res = await post({ action: "move", pin_ordinal: target, work_unit_key: WORK_UNIT_SLUG, reason: "r" });
            expect(res.status, `target ${target}`).toBe(200);
            await expect(res.json()).resolves.toMatchObject({ position: target });
        }
    });

    it("the ordinals handed to the writer are unique, so no two rows contend for a seat", async () => {
        loadSectionOrderMock.mockResolvedValue(sectionOrder({ pinnedIds: ["s1", "s4"] }));
        applyCanonicalMock.mockResolvedValue({ ok: true, written: 2, released: 0 });
        await post({ action: "move", pin_ordinal: 2, work_unit_key: WORK_UNIT_SLUG, reason: "r" });
        const ordinals = applyCanonicalMock.mock.calls[0]![1].ordinals as Map<string, number>;
        const values = [...ordinals.values()];
        expect(new Set(values).size).toBe(values.length);
        expect(values.every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
    });

    it("refuses a move that does not name a work unit rather than writing a bare ordinal", async () => {
        routeIdentityMock.mockResolvedValue({ gate: { ok: true }, platformKey: null, resolution: null, departments: [] });
        const res = await post({ action: "move", reason: "no queue named", pin_ordinal: 1 });
        expect(res.status).toBe(400);
        expect(applyCanonicalMock).not.toHaveBeenCalled();
    });

    it("refuses when the candidate is not ranked in that work unit", async () => {
        loadSectionOrderMock.mockResolvedValue(null);
        const res = await post({ action: "move", pin_ordinal: 1, work_unit_key: WORK_UNIT_SLUG, reason: "r" });
        expect(res.status).toBe(409);
        expect(applyCanonicalMock).not.toHaveBeenCalled();
    });

    it("refuses a position outside the section instead of clamping it", async () => {
        loadSectionOrderMock.mockResolvedValue(sectionOrder());
        const res = await post({ action: "move", pin_ordinal: 99, work_unit_key: WORK_UNIT_SLUG, reason: "r" });
        expect(res.status).toBe(400);
        expect(applyCanonicalMock).not.toHaveBeenCalled();
    });

    it("POST manual-position reset releases pin overrides", async () => {
        releaseManualMock.mockResolvedValue({ ok: true, released_ids: [OVERRIDE] });
        const { POST } = await import("@/app/api/admin/placement-candidates/[candidateId]/manual-position/route");
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/manual-position", {
            method: "POST",
            body: JSON.stringify({ action: "reset", reason: "Reset manual adjustment" }),
        });
        const res = await POST(req, { params: Promise.resolve({ candidateId: CANDIDATE }) });
        expect(res.status).toBe(200);
        expect(releaseManualMock).toHaveBeenCalled();
    });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const CANDIDATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPP = "22222222-2222-4222-8222-222222222222";
const OVERRIDE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const createOverrideMock = vi.hoisted(() => vi.fn());
const releaseOverrideMock = vi.hoisted(() => vi.fn());
const upsertPinMock = vi.hoisted(() => vi.fn());
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
    upsertPlacementPinOverride: upsertPinMock,
    releaseManualPositionOverrides: releaseManualMock,
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

    it("POST manual-position move upserts pin override", async () => {
        upsertPinMock.mockResolvedValue({
            ok: true,
            override: { id: OVERRIDE, override_kind: "pin" },
        });
        const { POST } = await import("@/app/api/admin/placement-candidates/[candidateId]/manual-position/route");
        const req = new NextRequest("http://localhost/api/admin/placement-candidates/x/manual-position", {
            method: "POST",
            body: JSON.stringify({ action: "move", reason: "Sibling starting soon", pin_ordinal: 1 }),
        });
        const res = await POST(req, { params: Promise.resolve({ candidateId: CANDIDATE }) });
        expect(res.status).toBe(200);
        expect(upsertPinMock).toHaveBeenCalled();
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

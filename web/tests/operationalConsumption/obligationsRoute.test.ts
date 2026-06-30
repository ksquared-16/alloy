import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockToday, svc } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockToday: vi.fn(),
    svc: { listResolvedObligations: vi.fn(), getObligationDetail: vi.fn(), reviewObligation: vi.fn(), recomputeObligation: vi.fn() },
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<typeof import("@/lib/childcareOperational/operationalEnrollmentApi")>("@/lib/childcareOperational/operationalEnrollmentApi");
    return { ...actual, resolveOperationalEnrollmentTodayYmd: mockToday };
});
vi.mock("@/lib/operationalConsumption/obligationReviewService", () => svc);

import * as route from "@/app/api/admin/financial/consumption/obligations/route";

function get(qs: string): NextRequest {
    return new NextRequest(`http://test/api/admin/financial/consumption/obligations${qs}`, { method: "GET" });
}
function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api/admin/financial/consumption/obligations", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockToday.mockResolvedValue("2026-06-29");
    svc.listResolvedObligations.mockResolvedValue([{ id: "o1" }]);
    svc.getObligationDetail.mockResolvedValue({ id: "o1", explanation: {}, timeline: [] });
    svc.reviewObligation.mockResolvedValue({ id: "o1", reviewStatus: "reviewed" });
    svc.recomputeObligation.mockResolvedValue({ changed: false, current: { amountCents: 2500 }, recomputed: { amountCents: 2500 }, persisted: false });
});

describe("draft obligation review route", () => {
    it("GET enforces the role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        expect((await route.GET(get(""))).status).toBe(403);
        expect(svc.listResolvedObligations).not.toHaveBeenCalled();
    });

    it("GET lists with parsed filters (org-scoped)", async () => {
        const res = await route.GET(get("?review_status=review_required&source_family=attendance&review_required=true"));
        expect(res.status).toBe(200);
        expect(svc.listResolvedObligations).toHaveBeenCalledWith(expect.anything(), orgId, expect.objectContaining({ reviewStatus: "review_required", sourceFamily: "attendance", reviewRequired: true }));
    });

    it("GET ?id= returns one obligation detail", async () => {
        const res = await route.GET(get("?id=o1"));
        expect(res.status).toBe(200);
        expect(svc.getObligationDetail).toHaveBeenCalledWith(expect.anything(), orgId, "o1", "2026-06-29");
    });

    it("POST requires id + action", async () => {
        expect((await route.POST(post({ action: "mark_reviewed" }))).status).toBe(400);
        expect((await route.POST(post({ id: "o1" }))).status).toBe(400);
    });

    it("POST dispatches a review action with the actor", async () => {
        const res = await route.POST(post({ id: "o1", action: "suppress", reason: "dup" }));
        expect(res.status).toBe(200);
        expect(svc.reviewObligation).toHaveBeenCalledWith(expect.anything(), orgId, "o1", "suppress", "2026-06-29", expect.objectContaining({ reason: "dup", actorUserId: userId }));
    });

    it("POST recompute without persist is a PREVIEW (no review write)", async () => {
        const res = await route.POST(post({ id: "o1", action: "recompute" }));
        expect(res.status).toBe(200);
        expect(svc.recomputeObligation).toHaveBeenCalledWith(expect.anything(), orgId, "o1", "2026-06-29", expect.objectContaining({ persist: false }));
        expect(svc.reviewObligation).not.toHaveBeenCalled();
    });

    it("POST recompute with persist routes through the persisting review action", async () => {
        const res = await route.POST(post({ id: "o1", action: "recompute", persist: true }));
        expect(res.status).toBe(200);
        expect(svc.reviewObligation).toHaveBeenCalledWith(expect.anything(), orgId, "o1", "recompute", "2026-06-29", expect.anything());
    });
});

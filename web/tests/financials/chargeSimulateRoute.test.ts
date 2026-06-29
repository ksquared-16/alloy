import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockToday, svc } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockToday: vi.fn(),
    svc: { previewTemplateCharge: vi.fn(), writeTemplateDraftCharge: vi.fn() },
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<typeof import("@/lib/childcareOperational/operationalEnrollmentApi")>(
        "@/lib/childcareOperational/operationalEnrollmentApi",
    );
    return { ...actual, resolveOperationalEnrollmentTodayYmd: mockToday };
});
vi.mock("@/lib/financials/chargeLifecycle/chargeLifecycleService", () => svc);

import * as route from "@/app/api/admin/financial/charge-templates/simulate/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockToday.mockResolvedValue("2026-06-29");
    svc.previewTemplateCharge.mockResolvedValue({ intent: { eligible: true }, wouldWrite: "create", existing: null });
    svc.writeTemplateDraftCharge.mockResolvedValue({ status: "created", chargeId: "c1", resolutionKey: "k" });
});

describe("charge template simulate route", () => {
    it("enforces the role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await route.POST(post({ action: "preview", template_id: "t1" }));
        expect(res.status).toBe(403);
        expect(svc.previewTemplateCharge).not.toHaveBeenCalled();
    });

    it("requires template_id", async () => {
        expect((await route.POST(post({ action: "preview" }))).status).toBe(400);
    });

    it("dispatches preview and draft", async () => {
        expect((await route.POST(post({ action: "preview", template_id: "t1" }))).status).toBe(200);
        expect(svc.previewTemplateCharge).toHaveBeenCalled();
        expect((await route.POST(post({ action: "draft", template_id: "t1", agreement_id: "a1" }))).status).toBe(200);
        expect(svc.writeTemplateDraftCharge).toHaveBeenCalledWith(expect.anything(), orgId, expect.objectContaining({ actorUserId: userId }));
    });
});

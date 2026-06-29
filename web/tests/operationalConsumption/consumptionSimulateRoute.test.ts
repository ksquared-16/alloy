import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockToday, svc } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockToday: vi.fn(),
    svc: { previewConsumption: vi.fn(), draftConsumption: vi.fn() },
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
vi.mock("@/lib/operationalConsumption/consumptionService", () => svc);

import * as route from "@/app/api/admin/financial/consumption/simulate/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockToday.mockResolvedValue("2026-06-29");
    svc.previewConsumption.mockResolvedValue({ eventType: { eventKey: "enrollment.registration" }, resolution: { obligations: [] } });
    svc.draftConsumption.mockResolvedValue({ persisted: { consumptionEventId: "ce1", resolvedObligationIds: [], draftChargeId: null, draftChargeStatus: null } });
});

describe("operational consumption simulate route", () => {
    it("enforces the role gate (authorization)", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await route.POST(post({ action: "preview", event_key: "enrollment.registration", source_entity_id: "a1" }));
        expect(res.status).toBe(403);
        expect(svc.previewConsumption).not.toHaveBeenCalled();
    });

    it("requires event_key and source_entity_id", async () => {
        expect((await route.POST(post({ action: "preview", source_entity_id: "a1" }))).status).toBe(400);
        expect((await route.POST(post({ action: "preview", event_key: "enrollment.registration" }))).status).toBe(400);
    });

    it("dispatches preview and draft, passing org + actor through", async () => {
        const previewRes = await route.POST(post({ action: "preview", event_key: "enrollment.registration", source_entity_id: "a1" }));
        expect(previewRes.status).toBe(200);
        expect(svc.previewConsumption).toHaveBeenCalledWith(expect.anything(), orgId, expect.objectContaining({ eventKey: "enrollment.registration", sourceEntityId: "a1" }), "2026-06-29");

        const draftRes = await route.POST(post({ action: "draft", event_key: "enrollment.registration", source_entity_id: "a1" }));
        expect(draftRes.status).toBe(200);
        expect(svc.draftConsumption).toHaveBeenCalledWith(expect.anything(), orgId, expect.objectContaining({ sourceEntityId: "a1" }), "2026-06-29", userId);
    });

    it("rejects an unknown action", async () => {
        expect((await route.POST(post({ action: "frobnicate", event_key: "enrollment.registration", source_entity_id: "a1" }))).status).toBe(400);
    });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, svc } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    svc: {
        listFinancialServices: vi.fn(),
        createFinancialService: vi.fn(),
        updateFinancialService: vi.fn(),
        setFinancialServiceActive: vi.fn(),
    },
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/financials/services/financialServicesStore", () => svc);

import * as servicesRoute from "@/app/api/admin/financial/services/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    svc.listFinancialServices.mockResolvedValue([{ id: "svc_1", key: "meals", label: "Meals" }]);
    svc.createFinancialService.mockResolvedValue({ id: "svc_2" });
    svc.updateFinancialService.mockResolvedValue({ id: "svc_1" });
    svc.setFinancialServiceActive.mockResolvedValue([]);
});

describe("financial services route", () => {
    it("GET lists services (read, org-scoped)", async () => {
        const res = await servicesRoute.GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.services).toHaveLength(1);
    });

    it("POST create enforces the role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await servicesRoute.POST(post({ action: "create", label: "X", service_type: "recurring" }));
        expect(res.status).toBe(403);
        expect(svc.createFinancialService).not.toHaveBeenCalled();
    });

    it("POST dispatches create / update / set_active", async () => {
        expect((await servicesRoute.POST(post({ action: "create", label: "Meals", service_type: "usage" }))).status).toBe(201);
        expect(svc.createFinancialService).toHaveBeenCalled();
        expect((await servicesRoute.POST(post({ action: "update", id: "svc_1", label: "Meals", service_type: "usage" }))).status).toBe(200);
        expect(svc.updateFinancialService).toHaveBeenCalled();
        expect((await servicesRoute.POST(post({ action: "set_active", id: "svc_1", is_active: false }))).status).toBe(200);
        expect(svc.setFinancialServiceActive).toHaveBeenCalledWith(expect.anything(), orgId, "svc_1", false);
    });

    it("rejects an unknown action", async () => {
        expect((await servicesRoute.POST(post({ action: "frobnicate" }))).status).toBe(400);
    });
});

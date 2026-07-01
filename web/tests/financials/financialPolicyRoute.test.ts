import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockToday, svc } = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockToday: vi.fn(),
    svc: {
        listFinancialPolicies: vi.fn(),
        createFinancialPolicy: vi.fn(),
        createFinancialPolicyVersion: vi.fn(),
        retireFinancialPolicy: vi.fn(),
        voidScheduledFinancialPolicy: vi.fn(),
    },
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
vi.mock("@/lib/financials/policies/financialPolicyService", () => svc);

import * as route from "@/app/api/admin/financial/policies/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockToday.mockResolvedValue("2026-06-29");
    svc.listFinancialPolicies.mockResolvedValue([{ id: "p1" }]);
    svc.createFinancialPolicy.mockResolvedValue({ id: "p1" });
    svc.createFinancialPolicyVersion.mockResolvedValue({ policy: { id: "p2" } });
    svc.retireFinancialPolicy.mockResolvedValue({ id: "p1" });
    svc.voidScheduledFinancialPolicy.mockResolvedValue({ voided: true });
});

describe("financial policies route", () => {
    it("GET lists policies", async () => {
        const res = await route.GET();
        expect(res.status).toBe(200);
        expect((await res.json()).policies).toHaveLength(1);
    });

    it("POST create enforces the role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await route.POST(post({ action: "create" }));
        expect(res.status).toBe(403);
        expect(svc.createFinancialPolicy).not.toHaveBeenCalled();
    });

    it("dispatches create / version / retire / void with the acting user", async () => {
        expect((await route.POST(post({ action: "create", scope_type: "org", policy_type: "proration", value: { method: "daily" }, effective_start: "2026-01-01" }))).status).toBe(201);
        expect(svc.createFinancialPolicy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId, actorUserId: userId }));
        expect((await route.POST(post({ action: "version", prior_id: "p1", effective_start: "2027-01-01", value: { method: "business_day" } }))).status).toBe(201);
        expect((await route.POST(post({ action: "retire", id: "p1", effective_end: "2026-12-31" }))).status).toBe(200);
        expect((await route.POST(post({ action: "void", id: "p2" }))).status).toBe(200);
    });

    it("rejects an unknown action", async () => {
        expect((await route.POST(post({ action: "frobnicate" }))).status).toBe(400);
    });
});

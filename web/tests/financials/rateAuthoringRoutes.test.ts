import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const {
    mockRequireAdminOrOps,
    mockGetAdminContextCached,
    mockCreateAdminClient,
    mockResolveTodayYmd,
    svc,
} = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockResolveTodayYmd: vi.fn(),
    svc: {
        createRatePlan: vi.fn(),
        createRatePlanVersion: vi.fn(),
        retireRatePlan: vi.fn(),
        voidScheduledRatePlanVersion: vi.fn(),
        createRateRule: vi.fn(),
        createRateRuleVersion: vi.fn(),
        retireRateRule: vi.fn(),
        voidScheduledRateRuleVersion: vi.fn(),
    },
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async () => {
    const actual = await vi.importActual<typeof import("@/lib/childcareOperational/operationalEnrollmentApi")>(
        "@/lib/childcareOperational/operationalEnrollmentApi",
    );
    return { ...actual, resolveOperationalEnrollmentTodayYmd: mockResolveTodayYmd };
});
vi.mock("@/lib/financials/rates/rateAuthoringService", () => svc);

import * as plansRoute from "@/app/api/admin/financial/rate-plans/route";
import * as rulesRoute from "@/app/api/admin/financial/rate-rules/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockResolveTodayYmd.mockResolvedValue("2026-06-29");
    svc.createRatePlan.mockResolvedValue({ id: "plan-1" });
    svc.createRatePlanVersion.mockResolvedValue({ plan: { id: "plan-2" }, carriedRuleCount: 1 });
    svc.retireRatePlan.mockResolvedValue({ id: "plan-1" });
    svc.voidScheduledRatePlanVersion.mockResolvedValue({ voided: true, id: "plan-2", reopenedPriorId: "plan-1" });
    svc.createRateRule.mockResolvedValue({ id: "rule-1" });
    svc.createRateRuleVersion.mockResolvedValue({ rule: { id: "rule-2" } });
    svc.retireRateRule.mockResolvedValue({ id: "rule-1" });
    svc.voidScheduledRateRuleVersion.mockResolvedValue({ voided: true, id: "rule-2", reopenedPriorId: "rule-1" });
});

describe("POST /api/admin/financial/rate-plans", () => {
    it("enforces the financial role gate before any write", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await plansRoute.POST(post({ action: "create" }));
        expect(res.status).toBe(403);
        expect(svc.createRatePlan).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await plansRoute.POST(post({ action: "create" }));
        expect(res.status).toBe(401);
    });

    it("dispatches create with the acting user as actor", async () => {
        const res = await plansRoute.POST(
            post({ action: "create", scope_type: "org", plan_key: "tuition", billing_basis: "monthly", effective_start: "2026-01-01" }),
        );
        expect(res.status).toBe(201);
        expect(svc.createRatePlan).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ orgId, actorUserId: userId, planKey: "tuition" }),
        );
    });

    it("dispatches version / retire / void", async () => {
        expect((await plansRoute.POST(post({ action: "version", prior_plan_id: "plan-1", effective_start: "2027-01-01" }))).status).toBe(201);
        expect(svc.createRatePlanVersion).toHaveBeenCalled();

        expect((await plansRoute.POST(post({ action: "retire", plan_id: "plan-1", effective_end: "2026-12-31" }))).status).toBe(200);
        expect(svc.retireRatePlan).toHaveBeenCalled();

        expect((await plansRoute.POST(post({ action: "void", plan_id: "plan-2" }))).status).toBe(200);
        expect(svc.voidScheduledRatePlanVersion).toHaveBeenCalled();
    });

    it("rejects an unknown action", async () => {
        const res = await plansRoute.POST(post({ action: "frobnicate" }));
        expect(res.status).toBe(400);
    });

    it("maps service errors to HTTP status", async () => {
        const { OperationalEnrollmentServiceError } = await vi.importActual<
            typeof import("@/lib/childcareOperational/operationalEnrollmentErrors")
        >("@/lib/childcareOperational/operationalEnrollmentErrors");
        svc.createRatePlan.mockRejectedValue(new OperationalEnrollmentServiceError("validation_failed", "bad dates"));
        const res = await plansRoute.POST(post({ action: "create" }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.code).toBe("validation_failed");
    });

    it("exports no GET (authoring is POST-only)", () => {
        expect((plansRoute as Record<string, unknown>).GET).toBeUndefined();
    });
});

describe("POST /api/admin/financial/rate-rules", () => {
    it("enforces the role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await rulesRoute.POST(post({ action: "create" }));
        expect(res.status).toBe(403);
        expect(svc.createRateRule).not.toHaveBeenCalled();
    });

    it("dispatches create / version / retire / void", async () => {
        expect(
            (await rulesRoute.POST(
                post({ action: "create", rate_plan_id: "plan-1", schedule_basis: "five_day", rate_basis: "monthly", amount_cents: 120000, effective_start: "2026-01-01" }),
            )).status,
        ).toBe(201);
        expect(svc.createRateRule).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId, actorUserId: userId }));

        expect((await rulesRoute.POST(post({ action: "version", prior_rule_id: "rule-1", effective_start: "2027-01-01", amount_cents: 130000 }))).status).toBe(201);
        expect(svc.createRateRuleVersion).toHaveBeenCalled();

        expect((await rulesRoute.POST(post({ action: "retire", rule_id: "rule-1", effective_end: "2026-12-31" }))).status).toBe(200);
        expect(svc.retireRateRule).toHaveBeenCalled();

        expect((await rulesRoute.POST(post({ action: "void", rule_id: "rule-2" }))).status).toBe(200);
        expect(svc.voidScheduledRateRuleVersion).toHaveBeenCalled();
    });
});

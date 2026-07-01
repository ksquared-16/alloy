import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockResolveTodayYmd, svc } =
    vi.hoisted(() => ({
        mockRequireAdminOrOps: vi.fn(),
        mockGetAdminContextCached: vi.fn(),
        mockCreateAdminClient: vi.fn(),
        mockResolveTodayYmd: vi.fn(),
        svc: {
            createCapacityRule: vi.fn(),
            createCapacityRuleVersion: vi.fn(),
            retireCapacityRule: vi.fn(),
            voidScheduledCapacityRule: vi.fn(),
            createRatioRule: vi.fn(),
            createRatioRuleVersion: vi.fn(),
            retireRatioRule: vi.fn(),
            voidScheduledRatioRule: vi.fn(),
            createOperatingWindow: vi.fn(),
            createOperatingWindowVersion: vi.fn(),
            retireOperatingWindow: vi.fn(),
            voidScheduledOperatingWindow: vi.fn(),
            createScheduleRule: vi.fn(),
            createScheduleRuleVersion: vi.fn(),
            retireScheduleRule: vi.fn(),
            voidScheduledScheduleRule: vi.fn(),
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
    return { ...actual, resolveOperationalEnrollmentTodayYmd: mockResolveTodayYmd };
});
vi.mock("@/lib/childcareOperational/config/configRuleAuthoringService", () => svc);

import * as capacityRoute from "@/app/api/admin/operational-config/capacity-rules/route";
import * as ratioRoute from "@/app/api/admin/operational-config/ratio-rules/route";
import * as windowRoute from "@/app/api/admin/operational-config/operating-windows/route";
import * as scheduleRoute from "@/app/api/admin/operational-config/schedule-rules/route";

function post(body: unknown): NextRequest {
    return new NextRequest("http://test/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockResolveTodayYmd.mockResolvedValue("2026-06-29");
    Object.values(svc).forEach((fn) => fn.mockResolvedValue({ ok: true }));
});

const ROUTES = [
    { name: "capacity", mod: capacityRoute, create: svc.createCapacityRule },
    { name: "ratio", mod: ratioRoute, create: svc.createRatioRule },
    { name: "operating-windows", mod: windowRoute, create: svc.createOperatingWindow },
    { name: "schedule", mod: scheduleRoute, create: svc.createScheduleRule },
] as const;

describe("operational-config authoring routes — role gate + dispatch", () => {
    for (const r of ROUTES) {
        it(`${r.name}: enforces the role gate before any write`, async () => {
            mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
            const res = await r.mod.POST(post({ action: "create" }));
            expect(res.status).toBe(403);
            expect(r.create).not.toHaveBeenCalled();
        });

        it(`${r.name}: returns 401 when unauthenticated`, async () => {
            mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
            const res = await r.mod.POST(post({ action: "create" }));
            expect(res.status).toBe(401);
        });

        it(`${r.name}: rejects an unknown action`, async () => {
            const res = await r.mod.POST(post({ action: "frobnicate" }));
            expect(res.status).toBe(400);
        });

        it(`${r.name}: passes the acting user as actor on create`, async () => {
            const res = await r.mod.POST(post({ action: "create", scope_type: "org", effective_start: "2026-01-01" }));
            expect([200, 201]).toContain(res.status);
            expect(r.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId, actorUserId: userId }));
        });
    }
});

describe("operational-config authoring routes — action coverage", () => {
    it("capacity dispatches version / retire / void", async () => {
        expect((await capacityRoute.POST(post({ action: "version", prior_id: "c1", effective_start: "2027-01-01" }))).status).toBe(201);
        expect(svc.createCapacityRuleVersion).toHaveBeenCalled();
        expect((await capacityRoute.POST(post({ action: "retire", id: "c1", effective_end: "2026-12-31" }))).status).toBe(200);
        expect(svc.retireCapacityRule).toHaveBeenCalled();
        expect((await capacityRoute.POST(post({ action: "void", id: "c2" }))).status).toBe(200);
        expect(svc.voidScheduledCapacityRule).toHaveBeenCalled();
    });

    it("ratio passes tiers through on create + version", async () => {
        await ratioRoute.POST(
            post({ action: "create", scope_type: "org", effective_start: "2026-01-01", tiers: [{ max_children: 4, required_staff: 1 }] }),
        );
        expect(svc.createRatioRule).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ tiers: [expect.objectContaining({ maxChildren: 4, requiredStaff: 1 })] }),
        );
    });
});

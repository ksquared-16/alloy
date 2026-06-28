/**
 * Read-only Financials + operational config-rule API routes
 * (Operational Configuration V1, Batch 0). Verifies auth gating, org scoping,
 * read-only bundle shape, and that no write methods are exported.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const {
    mockRequireAdminOrOps,
    mockGetAdminContextCached,
    mockCreateAdminClient,
    mockLoadRateConfigBundle,
    mockLoadGlConfigBundle,
    mockLoadConfigRuleBundle,
} = vi.hoisted(() => ({
    mockRequireAdminOrOps: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockLoadRateConfigBundle: vi.fn(),
    mockLoadGlConfigBundle: vi.fn(),
    mockLoadConfigRuleBundle: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));

vi.mock("@/lib/financials/rates/rateConfigService", () => ({
    loadRateConfigBundle: (...args: unknown[]) => mockLoadRateConfigBundle(...args),
}));

vi.mock("@/lib/financials/gl/glConfigService", () => ({
    loadGlConfigBundle: (...args: unknown[]) => mockLoadGlConfigBundle(...args),
}));

vi.mock("@/lib/childcareOperational/config/childcareConfigRuleService", () => ({
    loadChildcareConfigRuleBundle: (...args: unknown[]) => mockLoadConfigRuleBundle(...args),
}));

import * as rateRoute from "@/app/api/admin/financial/rate-config/route";
import * as glRoute from "@/app/api/admin/financial/gl-config/route";
import * as configRuleRoute from "@/app/api/admin/operational-config-rules/route";

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminOrOps.mockResolvedValue(null);
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });
    mockLoadRateConfigBundle.mockResolvedValue({ ratePlans: [{ id: "plan-1" }], rateRules: [{ id: "rule-1" }] });
    mockLoadGlConfigBundle.mockResolvedValue({
        glAccounts: [{ id: "acct-1", code: "4000" }],
        glAccountMappings: [{ id: "map-1", key: "tuition" }],
    });
    mockLoadConfigRuleBundle.mockResolvedValue({
        capacityRules: [{ id: "cap-1" }],
        ratioRules: [],
        ratioRuleTiers: [],
        operatingWindows: [],
        scheduleRules: [],
    });
});

describe("GET /api/admin/financial/rate-config (read-only)", () => {
    it("enforces the financial role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await rateRoute.GET();
        expect(res.status).toBe(403);
        expect(mockLoadRateConfigBundle).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await rateRoute.GET();
        expect(res.status).toBe(401);
    });

    it("returns org-scoped rate plans + rules", async () => {
        const res = await rateRoute.GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ratePlans).toHaveLength(1);
        expect(json.rateRules).toHaveLength(1);
        expect(mockLoadRateConfigBundle).toHaveBeenCalledWith(expect.anything(), orgId);
    });

    it("exports no write methods", () => {
        for (const m of WRITE_METHODS) expect((rateRoute as Record<string, unknown>)[m]).toBeUndefined();
    });
});

describe("GET /api/admin/financial/gl-config (read-only)", () => {
    it("enforces the financial role gate", async () => {
        mockRequireAdminOrOps.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await glRoute.GET();
        expect(res.status).toBe(403);
        expect(mockLoadGlConfigBundle).not.toHaveBeenCalled();
    });

    it("returns org-scoped GL codes + mappings", async () => {
        const res = await glRoute.GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.glAccounts).toHaveLength(1);
        expect(json.glAccountMappings).toHaveLength(1);
        expect(mockLoadGlConfigBundle).toHaveBeenCalledWith(expect.anything(), orgId);
    });

    it("exports no write methods", () => {
        for (const m of WRITE_METHODS) expect((glRoute as Record<string, unknown>)[m]).toBeUndefined();
    });
});

describe("GET /api/admin/operational-config-rules (read-only)", () => {
    it("returns 401 when unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await configRuleRoute.GET();
        expect(res.status).toBe(401);
    });

    it("returns org-scoped operational config-rule bundle", async () => {
        const res = await configRuleRoute.GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.capacityRules).toHaveLength(1);
        expect(json).toHaveProperty("ratioRuleTiers");
        expect(json).toHaveProperty("operatingWindows");
        expect(json).toHaveProperty("scheduleRules");
        expect(mockLoadConfigRuleBundle).toHaveBeenCalledWith(expect.anything(), orgId);
    });

    it("exports no write methods", () => {
        for (const m of WRITE_METHODS) expect((configRuleRoute as Record<string, unknown>)[m]).toBeUndefined();
    });
});

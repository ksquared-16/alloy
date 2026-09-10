import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const orgId = "org-1";
const userId = "user-1";

const { mockRequireAdminOrOps, mockGetAdminContextCached, mockCreateAdminClient, mockPreview } = vi.hoisted(
    () => ({
        mockRequireAdminOrOps: vi.fn(),
        mockGetAdminContextCached: vi.fn(),
        mockCreateAdminClient: vi.fn(),
        mockPreview: vi.fn(),
    })
);

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: mockRequireAdminOrOps }));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));

vi.mock("@/lib/financials/chargeResolution/draftChargeResolutionService", () => ({
    previewDraftChargeForAgreementPeriod: (...args: unknown[]) => mockPreview(...args),
}));

import { GET as getPreview } from "@/app/api/admin/financial-charge-preview/route";

const resolvedPreview = {
    status: "resolved" as const,
    resolutionKey: "tuition:agr-1:2026-03:full_day:rule-1",
    scheduleBasis: "full_day" as const,
    rate: {
        plan: { id: "plan-1" },
        rule: { id: "rule-1" },
        rateBasis: "monthly",
        calculationStrategy: "scheduled",
        currencyCode: "USD",
    },
    intent: {
        resolved: true,
        resolutionKey: "tuition:agr-1:2026-03:full_day:rule-1",
        orgId,
        enrollmentAgreementId: "agr-1",
        billableSourceType: "enrollment_agreement",
        billableSourceId: "agr-1",
        chargeCategory: "tuition",
        amountCents: 120000,
        currencyCode: "USD",
        serviceDate: "2026-03-01",
        description: "Tuition 2026-03",
        responsibility: { partyType: "customer", partyId: "cust-1", basis: "household_account_default" },
        metadata: { unit_amount_cents: 120000, quantity: 1, quantity_unit: "period" },
    },
    existing: null,
    wouldWrite: "create" as const,
};

const BASE = "http://localhost/api/admin/financial-charge-preview";
const VALID = `${BASE}?enrollment_agreement_id=agr-1&period_start=2026-03-01&period_end=2026-03-31`;

/**
 * The narrowest client that answers what `resolveActorPermissionGrants` asks.
 *
 * The route resolves the caller's grants now, so a client that answers nothing makes every case
 * below fail for a reason none of them is about. `permissions` is what the caller holds; `[]` is a
 * principal with a membership and no grants, which is the case the refusal test needs.
 */
function grantingClient(permissions: string[]) {
    return {
        from: (name: string) => ({
            select: () => {
                const rows =
                    name === "user_roles"
                        ? [{ org_id: orgId, role: "admin" }]
                        : permissions.map((permission_key) => ({ permission_key }));
                const chain: Record<string, unknown> = {};
                const self = () => chain;
                chain.eq = self;
                chain.in = self;
                chain.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
                return chain;
            },
        }),
    };
}

describe("GET /api/admin/financial-charge-preview (P3.3.1)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAdminOrOps.mockResolvedValue(null);
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
        mockCreateAdminClient.mockReturnValue(grantingClient(["fin.read"]));
        mockPreview.mockResolvedValue(resolvedPreview);
    });

    /*
     * PREVIEWING A CHARGE IS READING FINANCIAL INFORMATION.
     *
     * This route was gated on admission alone until 2026-09-10 — `requireAdminOrOps` reads neither a
     * role nor a grant — so a role an organization had withheld Financials from could still price a
     * family's tuition through it. The refusal below is the whole of the repair, and it is asserted
     * before the input cases so a future edit that moves the gate below the query parsing turns this
     * red rather than quietly letting a denied caller reach a 400.
     */
    it("refuses a caller who may not view financial information", async () => {
        mockCreateAdminClient.mockReturnValue(grantingClient([]));
        const res = await getPreview(new NextRequest(VALID));
        expect(res.status).toBe(403);
        expect((await res.json()).required_permission).toBe("fin.read");
        expect(mockPreview, "and the preview is never computed for them").not.toHaveBeenCalled();
    });

    it("enforces the financial role gate (403 when forbidden)", async () => {
        mockRequireAdminOrOps.mockResolvedValue(
            NextResponse.json({ error: "forbidden" }, { status: 403 })
        );
        const res = await getPreview(new NextRequest(VALID));
        expect(res.status).toBe(403);
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it("returns 401 when org context is unauthenticated", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        const res = await getPreview(new NextRequest(VALID));
        expect(res.status).toBe(401);
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it("returns 400 when enrollment_agreement_id is missing", async () => {
        const res = await getPreview(
            new NextRequest(`${BASE}?period_start=2026-03-01&period_end=2026-03-31`)
        );
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("invalid_input");
    });

    it("returns 400 when the period is malformed", async () => {
        const res = await getPreview(
            new NextRequest(`${BASE}?enrollment_agreement_id=agr-1&period_start=2026-03-01&period_end=bad`)
        );
        expect(res.status).toBe(400);
    });

    it("returns a resolved preview DTO with rate/basis/quantity/amount/currency/responsibility/key", async () => {
        const res = await getPreview(new NextRequest(VALID));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.preview.status).toBe("resolved");
        expect(json.preview.scheduleBasis).toBe("full_day");
        expect(json.preview.amountCents).toBe(120000);
        expect(json.preview.currencyCode).toBe("USD");
        expect(json.preview.quantity).toMatchObject({ value: 1, unit: "period" });
        expect(json.preview.responsibility.partyId).toBe("cust-1");
        expect(json.preview.resolutionKey).toBe("tuition:agr-1:2026-03:full_day:rule-1");
        expect(json.preview.wouldWrite).toBe("create");
        // Period key defaults to YYYY-MM of period_start.
        expect(json.period).toEqual({ key: "2026-03", start: "2026-03-01", end: "2026-03-31" });
        expect(mockPreview).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ orgId, enrollmentAgreementId: "agr-1" })
        );
    });

    it("passes an unresolved preview through with its reason", async () => {
        mockPreview.mockResolvedValue({ status: "unresolved", reason: "no_rate:no_plan" });
        const res = await getPreview(new NextRequest(VALID));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.preview.status).toBe("unresolved");
        expect(json.preview.reason).toBe("no_rate:no_plan");
    });
});

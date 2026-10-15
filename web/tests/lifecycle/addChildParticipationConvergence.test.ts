import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * E2E-04 / E2E-03 convergence — ONE WRITER FOR A CHILD'S PARTICIPATION IN A LEAD.
 *
 * Every Add Child path records the lead↔child participation through
 * `ensureOpportunityCustomerMemberParticipation` — except the route the Focus Panel's Add Child used,
 * which inserted its own row and left the child's initial state empty. The same act produced a
 * different participation shape depending on which button the operator pressed.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const HOUSEHOLD = "44444444-4444-4444-8444-444444444444";

const { mockEnsure, mockAccess, mockCtx, rows } = vi.hoisted(() => ({
    mockEnsure: vi.fn(),
    mockAccess: vi.fn(),
    mockCtx: vi.fn(),
    rows: { ocm: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation", () => ({
    ensureOpportunityCustomerMemberParticipation: (...a: unknown[]) => mockEnsure(...a),
}));
vi.mock("@/lib/admin/getAdminAccessContext", () => ({ getAdminAccessContextCached: () => mockAccess() }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: () => mockCtx() };
});
vi.mock("@/lib/access/enrollmentAuthority", async () => {
    const actual = await vi.importActual<typeof import("@/lib/access/enrollmentAuthority")>("@/lib/access/enrollmentAuthority");
    return { ...actual, requireEnrollmentCapability: () => null };
});
vi.mock("@/lib/admin/assertRowOrg", () => ({ assertRowOrg: async () => ({ ok: true }) }));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            const filters: Record<string, unknown> = {};
            const chain: Record<string, unknown> = {
                select: () => chain,
                insert: () => {
                    throw new Error(`the route must not insert into ${table} itself`);
                },
                eq: (col: string, val: unknown) => {
                    filters[col] = val;
                    return chain;
                },
                maybeSingle: async () => {
                    if (table === "opportunities") return { data: { customer_id: HOUSEHOLD }, error: null };
                    if (table === "customer_members") return { data: { customer_id: HOUSEHOLD, relationship: "child", is_active: true }, error: null };
                    return { data: null, error: null };
                },
                single: async () => {
                    const row = rows.ocm.find((r) => r.id === filters.id);
                    return row ? { data: row, error: null } : { data: null, error: { message: "not found" } };
                },
            };
            return chain;
        },
    }),
}));

import { POST } from "@/app/api/admin/opportunity-customer-members/route";

describe("Focus Panel Add Child links the child through the shared participation writer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rows.ocm = [];
        mockAccess.mockResolvedValue({ ok: true });
        mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "user-1" });
        mockEnsure.mockImplementation(async (args: { opportunityId: string; customerMemberId: string }) => {
            const existing = rows.ocm.find((r) => r.opportunity_id === args.opportunityId && r.customer_member_id === args.customerMemberId);
            if (existing) return { ocmId: existing.id, created: false };
            const row = { id: `ocm-${rows.ocm.length + 1}`, org_id: ORG, opportunity_id: args.opportunityId, customer_member_id: args.customerMemberId, outcome_status_key: "new_inquiry" };
            rows.ocm.push(row);
            return { ocmId: row.id, created: true };
        });
    });

    const post = () =>
        POST(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ opportunity_id: OPP, customer_member_id: CHILD }) }));

    it("writes through ensureOpportunityCustomerMemberParticipation and returns the participation with its initial state", async () => {
        const res = await post();
        expect(res.status).toBe(200);
        expect(mockEnsure).toHaveBeenCalledTimes(1);
        expect(mockEnsure.mock.calls[0]![0]).toMatchObject({ orgId: ORG, opportunityId: OPP, customerMemberId: CHILD, source: "add_inquiry_child" });
        const body = await res.json();
        // Was NULL: the route inserted its own row with no initial state.
        expect(body).toMatchObject({ opportunity_id: OPP, customer_member_id: CHILD, outcome_status_key: "new_inquiry" });
    });

    it("is idempotent — a retry returns the same participation and creates no second one", async () => {
        const first = await (await post()).json();
        const second = await (await post()).json();
        expect(second.id).toBe(first.id);
        expect(rows.ocm).toHaveLength(1);
    });

    it("Add Child still creates no Enrollment track — that begins at the first child-grain move", () => {
        const route = readFileSync(path.join(__dirname, "..", "..", "app/api/admin/opportunity-customer-members/route.ts"), "utf8");
        expect(route).not.toMatch(/createEnrollmentProcessInstance|ensureChildEnrollmentTrack|startEnrollment|process_instances/);
    });
});

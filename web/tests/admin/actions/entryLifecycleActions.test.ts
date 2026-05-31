import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    assertMoveToQualificationAllowed,
    executeCreateLeadAction,
    validateMarkLostPayload,
} from "@/lib/admin/actions/entryLifecycleActions";
import { CREATE_LEAD_ACTION_ENTITY_ID, isCreateLeadExecuteRequest } from "@/lib/admin/actions/createLeadActionConstants";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "person-1" }),
}));

vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: vi.fn().mockResolvedValue({ customer_id: "cust-1" }),
}));

vi.mock("@/lib/bookingCustomerPersonLink", () => ({
    ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
}));

describe("isCreateLeadExecuteRequest", () => {
    it("accepts create_lead with sentinel or empty entity id", () => {
        expect(isCreateLeadExecuteRequest("create_lead", CREATE_LEAD_ACTION_ENTITY_ID)).toBe(true);
        expect(isCreateLeadExecuteRequest("create_lead", "")).toBe(true);
        expect(isCreateLeadExecuteRequest("create_lead", "opp-1")).toBe(false);
    });
});

describe("validateMarkLostPayload", () => {
    it("requires lost_reason", async () => {
        const bad = await validateMarkLostPayload({});
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error).toMatch(/lost reason/i);

        const good = await validateMarkLostPayload({ lost_reason: "no_response" });
        expect(good.ok).toBe(true);
        if (good.ok) expect(good.lostReason).toBe("no_response");
    });
});

describe("assertMoveToQualificationAllowed", () => {
    function supabaseForMove(fromStatus: string | null, person: { email?: string | null; phone?: string | null } | null) {
        const oppSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            status_key: fromStatus,
                            primary_person_id: person ? "person-1" : null,
                            metadata: {},
                        },
                        error: null,
                    }),
                }),
            }),
        });
        const personSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: person, error: null }),
                }),
            }),
        });
        return {
            from: vi.fn((table: string) => {
                if (table === "opportunities") return { select: oppSelect };
                if (table === "persons") return { select: personSelect };
                return { select: vi.fn() };
            }),
        };
    }

    it("rejects when not a new lead", async () => {
        const sb = supabaseForMove("contact_attempted", { email: "a@b.com" });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/new lead/i);
    });

    it("rejects when parent has no phone or email", async () => {
        const sb = supabaseForMove("new_inquiry", { email: null, phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/phone or email/i);
    });

    it("allows new lead with parent contact info", async () => {
        const sb = supabaseForMove("new_inquiry", { email: "parent@example.com", phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
        });
        expect(res.ok).toBe(true);
    });
});

describe("executeCreateLeadAction validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function supabaseForCreate(verticalId: string | null) {
        return {
            from: vi.fn((table: string) => {
                if (table === "verticals") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: verticalId ? { id: verticalId } : null,
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "opportunities") {
                    return {
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "opp-new" }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "opportunity_persons") {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null }),
                    };
                }
                return { select: vi.fn(), insert: vi.fn() };
            }),
        };
    }

    const ctx = { orgId: "org-1", userId: "user-1", accessScope: null };

    it("returns structured error when names missing", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { email: "a@b.com" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/first name/i);
        }
    });

    it("returns structured error when contact missing", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/phone or email/i);
        }
    });

    it("creates lead when minimum fields present", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.opportunity_id).toBe("opp-new");
            expect(res.person_id).toBe("person-1");
        }
    });
});

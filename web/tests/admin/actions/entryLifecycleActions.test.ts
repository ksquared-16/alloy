import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    assertMoveToQualificationAllowed,
    executeCreateLeadAction,
    validateMarkLostPayload,
} from "@/lib/admin/actions/entryLifecycleActions";
import { CREATE_LEAD_ACTION_ENTITY_ID, isCreateLeadExecuteRequest } from "@/lib/admin/actions/createLeadActionConstants";
import { QUALIFICATION_STATUS_KEY } from "@/lib/admin/actions/universalActionConstants";

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

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({
        work_unit_id: null,
        status_key: "new_inquiry",
    }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue(null),
}));

import { applyCreateLeadChildParticipation } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";

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

    it("does not require contact_attempted status for qualification transition", async () => {
        expect(QUALIFICATION_STATUS_KEY).toBe("qualification");
        const sb = supabaseForMove("new_inquiry", { email: "parent@example.com", phone: null });
        const res = await assertMoveToQualificationAllowed(sb as never, "org-1", "opp-1", {
            allowed_from_status_keys: ["new_inquiry"],
            status_key: QUALIFICATION_STATUS_KEY,
        });
        expect(res.ok).toBe(true);
    });
});

describe("executeCreateLeadAction validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function supabaseForCreate(verticalId: string | null) {
        const customerMembersInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "cm-child" }, error: null }),
            }),
        });
        const ocmInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "ocm-child" }, error: null }),
            }),
        });
        let capturedOppInsert: Record<string, unknown> | null = null;
        const sb = {
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
                    const insert = vi.fn((payload: Record<string, unknown>) => {
                        capturedOppInsert = payload;
                        return {
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "opp-new" }, error: null }),
                            }),
                        };
                    });
                    return { insert, getCapturedInsert: () => capturedOppInsert };
                }
                if (table === "opportunity_persons") {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return { insert: customerMembersInsert };
                }
                if (table === "opportunity_customer_members") {
                    return { insert: ocmInsert };
                }
                return { select: vi.fn(), insert: vi.fn() };
            }),
            getCapturedOppInsert: () => capturedOppInsert,
        };
        return sb;
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

    it("creates lead when minimum fields present and org has a vertical", async () => {
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
        expect(sb.getCapturedOppInsert()?.vertical_id).toBe("vert-1");
        expect(ensureCustomerForPersonNative).toHaveBeenCalledWith(
            sb,
            "person-1",
            expect.objectContaining({ vertical_id: "vert-1" })
        );
        expect(applyCreateLeadChildParticipation).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-new",
                customerId: "cust-1",
            })
        );
    });

    it("writes lead status to the canonical opportunities.status_key location", async () => {
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
        });
        expect(res.ok).toBe(true);
        // Lead case status is owned by opportunities.status_key (statusCategoryRegistry "Lead Statuses").
        expect(sb.getCapturedOppInsert()?.status_key).toBe("open");
    });

    it("creates lead when org has no configured vertical", async () => {
        const sb = supabaseForCreate(null);
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            context: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.opportunity_id).toBe("opp-new");
            expect(res.person_id).toBe("person-1");
            expect(res.customer_id).toBe("cust-1");
        }
        expect(sb.getCapturedOppInsert()?.vertical_id).toBeUndefined();
        expect(ensureCustomerForPersonNative).toHaveBeenCalledWith(
            sb,
            "person-1",
            expect.objectContaining({ vertical_id: null })
        );
    });

    it("prefers explicit merged vertical_id over org default", async () => {
        const sb = supabaseForCreate("org-default-vert");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                vertical_id: "explicit-vert",
            },
        });
        expect(res.ok).toBe(true);
        expect(sb.getCapturedOppInsert()?.vertical_id).toBe("explicit-vert");
        expect(ensureCustomerForPersonNative).toHaveBeenCalledWith(
            sb,
            "person-1",
            expect.objectContaining({ vertical_id: "explicit-vert" })
        );
    });

    it("persists child OCM fields when enrollment payload present", async () => {
        vi.mocked(applyCreateLeadChildParticipation).mockResolvedValueOnce({
            customer_member_id: "cm-child",
            ocm_id: "ocm-child",
        });
        const sb = supabaseForCreate("vert-1");
        const merged = {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            location_id: "11111111-1111-4111-8111-111111111111",
            child_program: "infant",
            child_desired_schedule_type: "full_day",
            child_program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
            child_desired_start_date: "2026-09-01",
        };
        const res = await executeCreateLeadAction(sb as never, ctx as never, { merged });
        expect(res.ok).toBe(true);
        expect(applyCreateLeadChildParticipation).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({ merged })
        );
    });

    it("fails lead create when child OCM persistence fails", async () => {
        vi.mocked(applyCreateLeadChildParticipation).mockRejectedValueOnce(
            new Error("Could not link child participation to lead.")
        );
        const sb = supabaseForCreate("vert-1");
        const res = await executeCreateLeadAction(sb as never, ctx as never, {
            merged: {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                child_first_name: "Riley",
                child_program: "infant",
            },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/child participation/i);
        }
    });
});

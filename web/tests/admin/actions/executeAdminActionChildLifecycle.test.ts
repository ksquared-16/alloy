import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn().mockResolvedValue({ ok: true }),
}));

const updateOpportunityCustomerMemberLifecycleStatus = vi.fn();
vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: (...args: unknown[]) =>
        updateOpportunityCustomerMemberLifecycleStatus(...args),
}));

const emitStatusChangedEvent = vi.fn();
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: (...args: unknown[]) => emitStatusChangedEvent(...args),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("ev-action"),
}));

function actionDef(actionType: string, payloadSchema: Record<string, unknown> = {}) {
    return {
        id: "def-1",
        key: "set_waitlisted",
        action_type: actionType,
        entity_type: "opportunity",
        payload_schema: payloadSchema,
        workflow_id: null,
        org_id: null,
        is_active: true,
    };
}

function supabaseForAdminAction(def: ReturnType<typeof actionDef> | null) {
    const actionSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: def ? [def] : [], error: null }),
            }),
        }),
    });
    const oppSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                        status_key: "new_inquiry",
                        customer_id: "cust-1",
                        metadata: {},
                        work_unit_id: "wu-1",
                    },
                    error: null,
                }),
            }),
        }),
    });
    const oppUpdateSingle = vi.fn().mockResolvedValue({
        data: { id: "opp-1", status_key: "waitlisted" },
        error: null,
    });
    const oppUpdateSelect = vi.fn().mockReturnValue({ single: oppUpdateSingle });
    const oppUpdateEqOrg = vi.fn().mockReturnValue({ select: oppUpdateSelect });
    const oppUpdateEqId = vi.fn().mockReturnValue({ eq: oppUpdateEqOrg });
    const oppUpdate = vi.fn().mockReturnValue({ eq: oppUpdateEqId });

    return {
        from: vi.fn((table: string) => {
            if (table === "action_definitions") return { select: actionSelect };
            if (table === "opportunities") return { select: oppSelect, update: oppUpdate };
            if (table === "work_units") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { department_id: "dept-1" },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: vi.fn(), update: vi.fn() };
        }),
    };
}

describe("executeAdminAction child lifecycle routing", () => {
    beforeEach(() => {
        updateOpportunityCustomerMemberLifecycleStatus.mockReset();
        updateOpportunityCustomerMemberLifecycleStatus.mockResolvedValue({
            error: null,
            before: { outcome_status_key: "interested" },
            after: { id: "ocm-1", outcome_status_key: "waitlisted" },
            eventEmitted: true,
        });
        emitStatusChangedEvent.mockReset();
        emitStatusChangedEvent.mockResolvedValue({});
    });

    it("routes child-grain update_status to child lifecycle helper", async () => {
        const sb = supabaseForAdminAction(actionDef("update_status", { status_key: "waitlisted" }));
        const res = await executeAdminAction(
            sb as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "set_waitlisted",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: {
                    row_grain: "child",
                    opportunity_customer_member_id: "ocm-1",
                    status_key: "waitlisted",
                },
            }
        );
        expect(res.ok).toBe(true);
        expect(updateOpportunityCustomerMemberLifecycleStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
                nextStatusKey: "waitlisted",
            })
        );
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
    });

    it("routes candidate-grain update_status to child lifecycle helper", async () => {
        const sb = supabaseForAdminAction(actionDef("update_status", { status_key: "enrolled" }));
        const res = await executeAdminAction(
            sb as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "set_waitlisted",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: {
                    row_grain: "candidate",
                    placement_candidate_id: "pc-1",
                    opportunity_customer_member_id: "ocm-1",
                    status_key: "enrolled",
                },
            }
        );
        expect(res.ok).toBe(true);
        expect(updateOpportunityCustomerMemberLifecycleStatus).toHaveBeenCalled();
    });

    it("routes case-grain update_status to opportunity status path", async () => {
        const sb = supabaseForAdminAction(actionDef("update_status", { status_key: "waitlisted" }));
        const res = await executeAdminAction(
            sb as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "set_waitlisted",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: { status_key: "waitlisted" },
            }
        );
        expect(res.ok).toBe(true);
        expect(updateOpportunityCustomerMemberLifecycleStatus).not.toHaveBeenCalled();
        expect(emitStatusChangedEvent).toHaveBeenCalled();
    });

    it("rejects child grain without ocm id", async () => {
        const sb = supabaseForAdminAction(actionDef("update_status", { status_key: "waitlisted" }));
        const res = await executeAdminAction(
            sb as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "set_waitlisted",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: { row_grain: "child", status_key: "waitlisted" },
            }
        );
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.error).toContain("opportunity_customer_member_id");
    });
});

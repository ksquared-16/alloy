import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";

const assertAllowedStatusKey = vi.fn();
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: (...args: unknown[]) => assertAllowedStatusKey(...args),
}));

const emitChildLifecycleStatusChangedEvent = vi.fn();
vi.mock("@/lib/opportunities/emitChildLifecycleStatusChangedEvent", () => ({
    emitChildLifecycleStatusChangedEvent: (...args: unknown[]) => emitChildLifecycleStatusChangedEvent(...args),
    CHILD_LIFECYCLE_STATUS_CHANGED_EVENT: "child_lifecycle_status_changed",
}));

const ensurePlacementCandidateForWaitlistedChild = vi.fn();
vi.mock("@/lib/orchestration/placement/placementCandidateLifecycleHook", () => ({
    ensurePlacementCandidateForWaitlistedChild: (...args: unknown[]) =>
        ensurePlacementCandidateForWaitlistedChild(...args),
    isPlacementLifecycleCandidateHookEnabled: () => true,
}));

function ocmSupabaseStub(opts: {
    existing?: Record<string, unknown> | null;
    loadErr?: { message: string } | null;
    updateErr?: { message: string } | null;
    updated?: Record<string, unknown> | null;
}) {
    const loadMaybeSingle = vi.fn().mockResolvedValue({
        data: opts.existing ?? null,
        error: opts.loadErr ?? null,
    });
    const loadEqOpp = vi.fn().mockReturnValue({ maybeSingle: loadMaybeSingle });
    const loadEqOrg = vi.fn().mockReturnValue({ eq: loadEqOpp });
    const loadEqId = vi.fn().mockReturnValue({ eq: loadEqOrg });
    const loadSelect = vi.fn().mockReturnValue({ eq: loadEqId });

    const updateSingle = vi.fn().mockResolvedValue({
        data: opts.updated ?? null,
        error: opts.updateErr ?? null,
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEqOpp = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqOrg = vi.fn().mockReturnValue({ eq: updateEqOpp });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
    const update = vi.fn().mockReturnValue({ eq: updateEqId });

    return {
        from: vi.fn().mockReturnValue({ select: loadSelect, update }),
    };
}

describe("updateOpportunityCustomerMemberLifecycleStatus", () => {
    beforeEach(() => {
        assertAllowedStatusKey.mockReset();
        assertAllowedStatusKey.mockResolvedValue({ ok: true });
        emitChildLifecycleStatusChangedEvent.mockReset();
        emitChildLifecycleStatusChangedEvent.mockResolvedValue({ id: "ev-1" });
        ensurePlacementCandidateForWaitlistedChild.mockReset();
        ensurePlacementCandidateForWaitlistedChild.mockResolvedValue({ attempted: true, created: false });
    });

    it("updates OCM outcome_status_key and emits child lifecycle event", async () => {
        const sb = ocmSupabaseStub({
            existing: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "interested",
            },
            updated: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
        });

        const res = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-1",
            nextStatusKey: "waitlisted",
            actorUserId: "user-1",
            source: "test",
            runPlacementHook: false,
        });

        expect(res.error).toBeNull();
        if (res.error) return;
        expect(res.before.outcome_status_key).toBe("interested");
        expect(res.after.outcome_status_key).toBe("waitlisted");
        expect(emitChildLifecycleStatusChangedEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
                previousStatusKey: "interested",
                nextStatusKey: "waitlisted",
            })
        );
        expect(sb.from).toHaveBeenCalledWith("opportunity_customer_members");
    });

    it("rejects invalid status key", async () => {
        assertAllowedStatusKey.mockResolvedValue({ ok: false, message: "invalid status" });
        const sb = ocmSupabaseStub({
            existing: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: null,
            },
        });
        const res = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-1",
            nextStatusKey: "bogus",
        });
        expect(res.error?.message).toBe("invalid status");
        expect(emitChildLifecycleStatusChangedEvent).not.toHaveBeenCalled();
    });

    it("rejects OCM not in org/opportunity scope", async () => {
        const sb = ocmSupabaseStub({ existing: null });
        const res = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-wrong",
            nextStatusKey: "waitlisted",
        });
        expect(res.error?.message).toContain("not found");
    });

    it("runs placement hook when transitioning to waitlisted", async () => {
        const sb = ocmSupabaseStub({
            existing: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "interested",
            },
            updated: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
        });
        await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-1",
            nextStatusKey: "waitlisted",
        });
        expect(ensurePlacementCandidateForWaitlistedChild).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            })
        );
    });

    it("does not call placement hook for non-waitlisted status", async () => {
        const sb = ocmSupabaseStub({
            existing: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
            updated: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "enrolled",
            },
        });
        await updateOpportunityCustomerMemberLifecycleStatus({
            supabase: sb as never,
            orgId: "org-1",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-1",
            nextStatusKey: "enrolled",
        });
        expect(ensurePlacementCandidateForWaitlistedChild).not.toHaveBeenCalled();
    });
});

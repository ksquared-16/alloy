import { describe, expect, it } from "vitest";
import {
    assertChildLifecycleMutationTarget,
    assertWorkflowStatusMutationGrain,
    resolveStatusMutationGrain,
} from "@/lib/admin/actions/resolveStatusMutationGrain";

describe("resolveStatusMutationGrain", () => {
    it("defaults to case grain when row_grain missing", () => {
        expect(resolveStatusMutationGrain({}, "opp-1")).toEqual({
            grain: "case",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: null,
            placementCandidateId: null,
        });
    });

    it("parses child grain with ocm id", () => {
        expect(
            resolveStatusMutationGrain(
                {
                    row_grain: "child",
                    opportunity_id: "opp-1",
                    opportunity_customer_member_id: "ocm-1",
                },
                "opp-1"
            )
        ).toMatchObject({ grain: "child", opportunityCustomerMemberId: "ocm-1" });
    });

    it("parses candidate grain", () => {
        expect(
            resolveStatusMutationGrain({
                row_grain: "candidate",
                placement_candidate_id: "pc-1",
                opportunity_customer_member_id: "ocm-1",
            })
        ).toMatchObject({ grain: "candidate", placementCandidateId: "pc-1" });
    });
});

describe("assertChildLifecycleMutationTarget", () => {
    it("rejects case grain", () => {
        expect(
            assertChildLifecycleMutationTarget({
                grain: "case",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: null,
                placementCandidateId: null,
            }).ok
        ).toBe(false);
    });

    it("rejects child grain without ocm id", () => {
        const res = assertChildLifecycleMutationTarget({
            grain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: null,
            placementCandidateId: null,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("opportunity_customer_member_id");
    });
});

describe("assertWorkflowStatusMutationGrain", () => {
    it("rejects outcome_status_key patch on opportunities entity", () => {
        const res = assertWorkflowStatusMutationGrain({
            entityType: "opportunities",
            patch: { outcome_status_key: "waitlisted" },
            payload: {},
        });
        expect(res.ok).toBe(false);
    });

    it("rejects case entity with child row_grain and status_key", () => {
        const res = assertWorkflowStatusMutationGrain({
            entityType: "opportunities",
            patch: { status_key: "waitlisted" },
            payload: { row_grain: "child" },
        });
        expect(res.ok).toBe(false);
    });

    it("allows opportunity status_key on case grain", () => {
        expect(
            assertWorkflowStatusMutationGrain({
                entityType: "opportunities",
                patch: { status_key: "waitlisted" },
                payload: {},
            }).ok
        ).toBe(true);
    });
});

import { describe, expect, it } from "vitest";
import {
    parseQueueRowGrainContext,
    queueRowGrainActionPayload,
    queueRowGrainContextFromPreviewItem,
} from "@/lib/queues/queueRowGrainContext";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { opportunityDrawerSeedFromQueueItem } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";

describe("queueRowGrainContext", () => {
    it("parses candidate row metadata from queue preview", () => {
        const ctx = parseQueueRowGrainContext({
            id: "pcrow:opp1:cand1",
            row_grain: "candidate",
            placement_candidate_id: "cand1",
            opportunity_customer_member_id: "ocm1",
            child_lifecycle_status: "waitlisted",
            opportunity_id: "opp1",
        });
        expect(ctx).toEqual({
            rowGrain: "candidate",
            opportunityId: "opp1",
            placementCandidateId: "cand1",
            opportunityCustomerMemberId: "ocm1",
            childLifecycleStatus: "waitlisted",
        });
    });

    it("parses child row metadata from _child_lifecycle_grain_row", () => {
        const ctx = parseQueueRowGrainContext({
            id: "ocmrow:opp1:ocm1",
            row_grain: "child",
            opportunity_id: "opp1",
            _child_lifecycle_grain_row: {
                opportunity_customer_member_id: "ocm1",
                child_lifecycle_status: "offer_pending",
            },
        });
        expect(ctx.rowGrain).toBe("child");
        expect(ctx.opportunityCustomerMemberId).toBe("ocm1");
        expect(ctx.childLifecycleStatus).toBe("offer_pending");
    });

    it("builds action payload for drawer intent", () => {
        expect(
            queueRowGrainActionPayload({
                rowGrain: "candidate",
                opportunityId: "opp1",
                placementCandidateId: "cand1",
                opportunityCustomerMemberId: "ocm1",
                childLifecycleStatus: "waitlisted",
            })
        ).toEqual({
            row_grain: "candidate",
            opportunity_id: "opp1",
            placement_candidate_id: "cand1",
            opportunity_customer_member_id: "ocm1",
            child_lifecycle_status: "waitlisted",
        });
    });

    it("derives grain context from preview item and drawer seed", () => {
        const item: QueuePreviewItemVm = {
            id: "pcrow:opp1:cand1",
            title: "Hayes — Mia",
            opportunityId: "opp1",
            rowGrain: "candidate",
            placementCandidateId: "cand1",
            opportunityCustomerMemberId: "ocm1",
            childLifecycleStatus: "waitlisted",
            quickActions: [],
            placementWaitlistCandidate: {
                placementCandidateId: "cand1",
                opportunityId: "opp1",
                childDisplayName: "Mia",
                familyDisplayName: "Hayes",
                parentDisplayName: "Kelly Hayes",
                cohortKey: "infant",
                cohortLabel: "Infant",
                cohortSectionTitle: "Infant",
                bucketLabel: "Waitlist",
                waitSinceLabel: "May 1",
                linkModeLabel: null,
                isSyntheticFallback: false,
                hasActiveOverride: false,
                activeOverrideKinds: [],
                activeOverrides: [],
                hasManualPositionAdjustment: false,
                manualAdjustmentReason: null,
                pinOverrideId: null,
                shadowMode: true,
                forecastHints: [],
                siblingLabel: null,
                siblingCohorts: [],
                siblingContextLines: [],
                siblingContextDiagnostics: null,
                enrolledSiblings: [],
                waitlistedSiblingCount: 0,
                hasWaitlistedSibling: false,
                hasEnrolledSibling: false,
                householdOtherChildCount: 0,
                householdOtherChildNames: null,
            },
        };

        expect(queueRowGrainContextFromPreviewItem(item)).toMatchObject({
            rowGrain: "candidate",
            placementCandidateId: "cand1",
            opportunityCustomerMemberId: "ocm1",
            childLifecycleStatus: "waitlisted",
        });

        expect(opportunityDrawerSeedFromQueueItem(item)).toMatchObject({
            rowGrain: "candidate",
            placementCandidateId: "cand1",
            opportunityCustomerMemberId: "ocm1",
            childLifecycleStatus: "waitlisted",
        });
    });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    dispatchOpenEnrollmentStatusModal,
    resolveEnrollmentStatusActionFromResolvedAction,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient";
import { resolveEnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/resolveEnrollmentStatusTransitionScope";
import { enrollmentScopeFromQueueGrainContext } from "@/lib/admin/enrollmentStatus/enrollmentScopeFromQueueItem";
import { defaultEnrollmentStatusDestinations } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import { parseBosEnrollmentStatusPrompt, bosProposalToEnrollmentExecutionRequest } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBosAdapter";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";

vi.mock("@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient")>();
    return {
        ...actual,
        dispatchOpenEnrollmentStatusModal: vi.fn(),
    };
});

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight", () => ({
    evaluateEnrollmentStatusTransitionPreflight: vi.fn().mockResolvedValue({
        ok: true,
        targetStatusKey: "waitlisted",
        validation: { ok: true, blocking: [], warnings: [], recommendations: [] },
        requiresBypassReason: false,
    }),
}));

vi.mock("@/lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects", () => ({
    applyEnrollmentStatusTransitionOutcomeEffects: vi.fn().mockResolvedValue({
        outcome_execution: null,
        stage_entry_spawn: null,
        outcome_key: null,
        source_builder_stage_key: null,
        errors: [],
    }),
}));

import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";

function enrollmentStatusAction(overrides: Partial<ResolvedActionForClient> = {}): ResolvedActionForClient {
    return {
        key: "update_enrollment_status",
        label: "Change Enrollment Status",
        description: null,
        action_type: "open_form",
        icon: null,
        style: null,
        display_style: "button",
        payload: { form_key: "update_enrollment_status" },
        workflow_id: null,
        ...overrides,
    };
}

describe("enrollment status transition routing", () => {
    beforeEach(() => {
        vi.mocked(dispatchOpenEnrollmentStatusModal).mockClear();
    });

    it("recognizes legacy update_status_add_note as enrollment action", () => {
        expect(
            resolveEnrollmentStatusActionFromResolvedAction(
                enrollmentStatusAction({ key: "update_status_add_note", payload: { form_key: "update_enrollment_status" } }),
            ),
        ).toBe(true);
    });

    it("opens enrollment modal from top-right Actions host callback", async () => {
        const openEnrollmentStatus = vi.fn();
        const out = await applyRegistryResolvedActionClient(enrollmentStatusAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openEnrollmentStatus,
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(true);
        expect(openEnrollmentStatus).toHaveBeenCalledWith({
            opportunityId: "opp-1",
            sourceSurface: "opportunity_drawer",
            initialScope: undefined,
        });
    });

    it("dispatches modal event when host callback missing", async () => {
        const out = await applyRegistryResolvedActionClient(enrollmentStatusAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            entityId: "opp-2",
            enrollmentStatusScope: {
                grain: "child",
                opportunityId: "opp-2",
                opportunityCustomerMemberId: "ocm-1",
            },
            context: { surface: "queue_row" },
        });
        expect(out.ok).toBe(true);
        expect(dispatchOpenEnrollmentStatusModal).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunity_id: "opp-2",
                scope: expect.objectContaining({ opportunityCustomerMemberId: "ocm-1" }),
            }),
        );
    });
});

describe("enrollment scope resolution", () => {
    it("queue row child grain preselects OCM", () => {
        const scope = enrollmentScopeFromQueueGrainContext("opp-1", {
            rowGrain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-billie",
        });
        expect(scope.opportunityCustomerMemberId).toBe("ocm-billie");
        expect(scope.grain).toBe("child");
    });

    it("resolves multi-child opportunity scope without preselect", () => {
        const scope = resolveEnrollmentStatusTransitionScope({
            opportunityId: "opp-1",
            sourceSurface: "opportunity_drawer",
        });
        expect(scope.grain).toBe("case");
        expect(scope.opportunityId).toBe("opp-1");
    });

    it("waitlist is a parking-lot destination", () => {
        const destinations = defaultEnrollmentStatusDestinations({
            grain: "child",
            currentOperatorStage: "qualification",
            currentStatusKey: "qualified",
        });
        const waitlist = destinations.find((d) => d.destinationKey === "waitlist");
        expect(waitlist?.parkingLot).toBe(true);
        expect(waitlist?.defaultStatusKey).toBe("waitlisted");
    });
});

describe("BOS enrollment status adapter", () => {
    it("parses move to waitlist with child and reason", () => {
        const parsed = parseBosEnrollmentStatusPrompt(
            "Move Billie to waitlist because there is no space.",
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.proposal.destinationKey).toBe("waitlist");
        expect(parsed.proposal.childDisplayName).toBe("Billie");
        expect(parsed.proposal.bypassReason).toBe("No space available");

        const request = bosProposalToEnrollmentExecutionRequest({
            proposal: parsed.proposal,
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-billie",
            },
            sourceSurface: "bos_rail",
        });
        expect(request.confirmationRequired).toBe(true);
        expect(request.targetStatusKey).toBe("waitlisted");
        expect(request.bypassReason).toBe("No space available");
    });
});

describe("OCM lifecycle executor contract", () => {
    it("updateOpportunityCustomerMemberLifecycleStatus is used for child transitions", async () => {
        vi.mocked(updateOpportunityCustomerMemberLifecycleStatus).mockResolvedValue({
            error: null,
            before: { outcome_status_key: "qualified" },
            after: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
            eventEmitted: true,
            placementHook: { attempted: true, created: true },
        });

        const result = await executeEnrollmentStatusTransition({
            supabase: {} as import("@supabase/supabase-js").SupabaseClient,
            orgId: "org-1",
            userId: "user-1",
            request: {
                actionKey: "update_enrollment_status",
                scope: {
                    grain: "child",
                    opportunityId: "opp-1",
                    opportunityCustomerMemberId: "ocm-1",
                },
                destinationKey: "waitlist",
                targetStatusKey: "waitlisted",
                confirmationRequired: true,
                bypassReason: "No space available",
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grain).toBe("child");
        expect(updateOpportunityCustomerMemberLifecycleStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityCustomerMemberId: "ocm-1",
                nextStatusKey: "waitlisted",
            }),
        );
    });
});

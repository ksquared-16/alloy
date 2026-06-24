import { describe, expect, it, vi } from "vitest";
import {
    emitAgreementCanceledEvent,
    emitAgreementEndedEvent,
    emitAgreementEndingScheduledEvent,
    emitEnrollmentAgreementCreatedEvent,
    emitOperationalEnrollmentHandoffSummaryEvent,
    emitPlacementChangedEvent,
    emitScheduleAssignmentChangedEvent,
    OPERATOR_ENROLLMENT_EDIT_ACTION,
    OPERATIONAL_ENROLLMENT_EVENT_SCHEMA_VERSION,
    PLACEMENT_CHANGED_EVENT,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

const emitEvent = vi.fn();
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEvent(...args),
}));

describe("operationalEnrollmentEvents", () => {
    it("emits schema_versioned compact payloads", async () => {
        emitEvent.mockResolvedValue("evt-1");

        await emitEnrollmentAgreementCreatedEvent({
            orgId: "org-1",
            agreementId: "agr-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            sourceKey: "approve_enrollment_handoff",
            ctx: { actorUserId: "user-1" },
        });

        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "enrollment_agreement_created",
                entity_type: "child_enrollment_agreements",
                entity_id: "agr-1",
                payload: expect.objectContaining({
                    schema_version: OPERATIONAL_ENROLLMENT_EVENT_SCHEMA_VERSION,
                    agreement_id: "agr-1",
                    actor_user_id: "user-1",
                }),
            })
        );

        await emitOperationalEnrollmentHandoffSummaryEvent({
            orgId: "org-1",
            opportunityId: "opp-1",
            partial: true,
            childCount: 1,
            warnings: ["schedule_pattern_missing:full_time"],
        });

        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "operational_enrollment_handoff_partial",
                entity_type: "opportunities",
                entity_id: "opp-1",
            })
        );
    });

    it("emits operator edit events with operator_enrollment_edit action_type", async () => {
        emitEvent.mockResolvedValue("evt-2");

        await emitPlacementChangedEvent({
            orgId: "org-1",
            placementId: "pl-1",
            enrollmentAgreementId: "agr-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            startDate: "2026-07-01",
            supersedesPlacementId: "pl-0",
            priorPlacementCloseDate: "2026-06-30",
            sourceKey: "operator",
            ctx: { actorUserId: "user-1" },
        });

        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: PLACEMENT_CHANGED_EVENT,
                action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
                payload: expect.objectContaining({
                    schema_version: OPERATIONAL_ENROLLMENT_EVENT_SCHEMA_VERSION,
                    placement_id: "pl-1",
                    supersedes_placement_id: "pl-0",
                }),
            })
        );

        await emitScheduleAssignmentChangedEvent({
            orgId: "org-1",
            assignmentId: "sa-1",
            enrollmentAgreementId: "agr-1",
            schedulePatternId: "pat-1",
            customerMemberId: "cm-1",
            startDate: "2026-08-01",
            ctx: { actorUserId: "user-1" },
        });

        await emitAgreementEndingScheduledEvent({
            orgId: "org-1",
            agreementId: "agr-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            endDate: "2026-09-01",
            ctx: { actorUserId: "user-1" },
        });

        await emitAgreementEndedEvent({
            orgId: "org-1",
            agreementId: "agr-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            endDate: "2026-06-15",
            ctx: { actorUserId: "user-1" },
        });

        await emitAgreementCanceledEvent({
            orgId: "org-1",
            agreementId: "agr-1",
            customerMemberId: "cm-1",
            siteLocationId: "site-1",
            ctx: { actorUserId: "user-1" },
        });

        const operatorCalls = emitEvent.mock.calls.filter(
            (call) => call[0]?.action_type === OPERATOR_ENROLLMENT_EDIT_ACTION
        );
        expect(operatorCalls.length).toBe(5);
    });
});

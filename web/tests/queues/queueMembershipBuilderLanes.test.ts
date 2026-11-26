import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyEnrollmentTemplateToProcess } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import {
    attachChildGrainQueueRowContext,
    isHonestChildCandidateGrainRow,
} from "@/lib/workUnits/buildChildGrainQueueRowContext";
import {
    opportunityRowContextLaneWithBuilderMembership,
    queueRowContextMetaFromLane,
} from "@/lib/workUnits/attachQueueRowContextToItems";
import { isBuilderMembershipLaneAllowed } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import { resolveOpportunityQueueLaneRouting } from "@/lib/queues/queueMembershipRuntimeResolver";

function tracksDepartmentMetadata() {
    const process = applyEnrollmentTemplateToProcess({
        id: "p1",
        key: ENROLLMENT_PROCESS_KEY,
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        stages: [],
    });
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: process.id,
            processes: [process],
        },
    };
}

function withEnv(vars: Record<string, string | undefined>) {
    const prev: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
        prev[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    return () => {
        for (const [key, value] of Object.entries(prev)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

const WAITLIST_NORMALIZED = {
    isV2: true,
    queues: [
        {
            key: "waitlist",
            label: "Waitlist",
            grain: "candidate",
            domain: "waitlist",
            filters: [
                { type: "candidate_status", operator: "in", values: ["active", "paused"] },
                { type: "child_lifecycle_status", operator: "in", values: ["waitlisted"] },
            ],
            aliases: [],
            filters_compat_v1: [],
        },
    ],
} as never;

describe("builder membership lane validation", () => {
    it("allows any valid queue_membership_v1 including family-track stages", () => {
        const lead = defaultEnrollmentQueueMembershipForStage("lead")!;
        const qual = defaultEnrollmentQueueMembershipForStage("qualification")!;
        const tour = defaultEnrollmentQueueMembershipForStage("tour")!;
        expect(isBuilderMembershipLaneAllowed(lead)).toBe(true);
        expect(isBuilderMembershipLaneAllowed(qual)).toBe(true);
        expect(isBuilderMembershipLaneAllowed(tour)).toBe(true);
        expect(isBuilderMembershipLaneAllowed(defaultEnrollmentQueueMembershipForStage("enrolled")!)).toBe(
            true,
        );
    });
});

describe("resolveOpportunityQueueLaneRouting — full lane coverage", () => {
    let restore: () => void;
    const departmentMetadata = tracksDepartmentMetadata();

    beforeEach(() => {
        restore = withEnv({
            ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: undefined,
            ALLOY_QUEUE_CHILD_GRAIN_LANES: undefined,
        });
    });

    afterEach(() => {
        restore();
    });

    function routingForStage(stageKey: string, queueKey: string) {
        const membership = defaultEnrollmentQueueMembershipForStage(stageKey)!;
        return resolveOpportunityQueueLaneRouting({
            normalized: WAITLIST_NORMALIZED,
            executableQueueKey: queueKey,
            workUnitMetadata: {
                lifecycle_stage_key: stageKey,
                [QUEUE_MEMBERSHIP_METADATA_KEY]: membership,
            },
            departmentMetadata,
        });
    }

    it("routes Enrolled via OCM builder", () => {
        const routing = routingForStage("enrolled", "enrollment_completed");
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stageKey).toBe("enrolled");
        expect(routing.countUnit).toBe("enrollment_tracks");
    });

    it("routes Enrolling via OCM builder by stage", () => {
        const routing = routingForStage("enrollment", "enrollment_offers");
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stageKey).toBe("enrollment");
        // S4: membership is by stage_key; default disposition keys are now empty.
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual([]);
    });

    it("routes Tour via case-grain builder membership", () => {
        const routing = routingForStage("tour", "tours");
        expect(routing.routingSource).toBe("builder");
        expect(routing.builderMembership?.subject_type).toBe("case");
        expect(routing.builderMembership?.stage_key).toBe("tour");
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });

    it("routes Tour lifecycle_tour executable key via case membership", () => {
        const routing = routingForStage("tour", "lifecycle_tour");
        expect(routing.routingSource).toBe("builder");
        expect(routing.builderMembership?.stage_key).toBe("tour");
        expect(routing.builderMembership?.subject_type).toBe("case");
    });

    it("routes Waitlist via candidate builder", () => {
        const routing = routingForStage("waitlist", "waitlist");
        expect(routing.routingSource).toBe("builder");
        expect(routing.waitlistGrainCtx?.membershipSource).toBe("builder");
        // S4: waitlist default membership no longer enumerates dispositions; child_lifecycle_statuses
        // falls back to the queue definition's own filter (["waitlisted"]).
        expect(routing.waitlistGrainCtx?.filters.child_lifecycle_statuses).toEqual([
            "waitlisted",
        ]);
        expect(routing.countUnit).toBe("candidates");
    });

    it("routes Lead via builder case membership when tracks configured", () => {
        const membership = defaultEnrollmentQueueMembershipForStage("lead")!;
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "new_leads",
            workUnitMetadata: {
                lifecycle_stage_key: "lead",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: membership,
            },
            departmentMetadata,
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.builderMembership?.subject_type).toBe("case");
    });
});

describe("QueueRowContext with builder membership", () => {
    it("uses membership stage_key and count_unit in meta", () => {
        const membership = defaultEnrollmentQueueMembershipForStage("enrolled")!;
        const lane = opportunityRowContextLaneWithBuilderMembership(
            {
                entityType: "opportunity",
                requestedQueueKey: "enrollment_completed",
                executableQueueKey: "enrollment_completed",
                queueLabel: "Enrolled",
                normalized: WAITLIST_NORMALIZED,
            },
            membership,
        );
        const meta = queueRowContextMetaFromLane(lane);
        expect(meta.stage_key).toBe("enrolled");
        expect(meta.subject_grain).toBe("child");
        expect(meta.count_unit).toBe("enrollment_track");
    });

    it("builds honest child row_subject from OCM row with builder meta", () => {
        const membership = defaultEnrollmentQueueMembershipForStage("enrolled")!;
        const row = {
            id: "ocmrow:opp-1:ocm-1",
            opportunity_id: "opp-1",
            opportunity_customer_member_id: "ocm-1",
            row_grain: "child",
            _child_display_name: "River",
            enrollment_track_stage_key: "enrolled",
            _ocm_enrollment_track_row: {
                opportunity_customer_member_id: "ocm-1",
                stage_key: "enrolled",
                outcome_status_key: "enrolled",
            },
            _child_lifecycle_grain_row: {
                opportunity_customer_member_id: "ocm-1",
                child_display_name: "River",
                child_lifecycle_status: "enrolled",
                enrollment_track_stage_key: "enrolled",
            },
            child_lifecycle_status: "enrolled",
            status_key: "enrolled",
            name: "Lee Family",
        };
        expect(isHonestChildCandidateGrainRow(row)).toBe(true);
        const withCtx = attachChildGrainQueueRowContext(row, {
            key: "enrollment_completed",
            label: "Enrolled",
            lifecycle_key: membership.lifecycle_key,
            stage_key: membership.stage_key,
            subject_grain: "child",
            count_unit: "enrollment_track",
        });
        const ctx = withCtx._queue_row_context as Record<string, unknown>;
        expect(ctx.row_subject).toEqual(
            expect.objectContaining({ subject_type: "child", subject_id: "ocm-1" }),
        );
        expect(ctx.row_count_unit).toBe("enrollment_track");
        const drawer = ctx.drawer_open as { active_subject?: { stage_key?: string; subject_type?: string } };
        expect(drawer.active_subject?.stage_key).toBe("enrolled");
        expect(drawer.active_subject?.subject_type).toBe("child");
    });
});

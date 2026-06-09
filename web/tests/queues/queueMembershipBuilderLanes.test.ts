import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { defaultQueueMembershipForEnrollmentStage } from "@/lib/lifecycle/queueMembershipV1";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import {
    attachChildGrainQueueRowContext,
    isHonestChildCandidateGrainRow,
} from "@/lib/workUnits/buildChildGrainQueueRowContext";
import {
    opportunityRowContextLaneWithBuilderMembership,
    queueRowContextMetaFromLane,
} from "@/lib/workUnits/attachQueueRowContextToItems";
import {
    isBuilderMembershipLaneAllowed,
    isBuilderMembershipStageAllowed,
} from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import { resolveOpportunityQueueLaneRouting } from "@/lib/queues/queueMembershipRuntimeResolver";

function withEnv(builder: string | undefined, lanes: string | undefined, childLanes: string | undefined) {
    const prevB = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    const prevL = process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES;
    const prevC = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    if (builder === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = builder;
    if (lanes === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES;
    else process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES = lanes;
    if (childLanes === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    else if (childLanes === "") delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = childLanes;
    return () => {
        if (prevB === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = prevB;
        if (prevL === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES;
        else process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES = prevL;
        if (prevC === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prevC;
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

describe("builder membership lane allowlist", () => {
    it("blocks case-grain lead and qualification stages", () => {
        const lead = defaultQueueMembershipForEnrollmentStage("lead")!;
        const qual = defaultQueueMembershipForEnrollmentStage("qualification")!;
        expect(isBuilderMembershipLaneAllowed(lead)).toBe(false);
        expect(isBuilderMembershipLaneAllowed(qual)).toBe(false);
        expect(isBuilderMembershipStageAllowed("lead")).toBe(false);
        expect(isBuilderMembershipStageAllowed("qualification")).toBe(false);
    });

    it("allows child/candidate enrollment stages by default", () => {
        expect(isBuilderMembershipStageAllowed("tour")).toBe(true);
        expect(isBuilderMembershipStageAllowed("enrollment")).toBe(true);
        expect(isBuilderMembershipStageAllowed("enrolled")).toBe(true);
        expect(isBuilderMembershipStageAllowed("waitlist")).toBe(true);
        expect(isBuilderMembershipStageAllowed("enrolling")).toBe(true);
    });
});

describe("resolveOpportunityQueueLaneRouting — full lane coverage", () => {
    let restore: () => void;

    beforeEach(() => {
        restore = withEnv("1", undefined, undefined);
    });

    afterEach(() => {
        restore();
    });

    function routingForStage(stageKey: string, queueKey: string) {
        const membership = defaultQueueMembershipForEnrollmentStage(stageKey)!;
        return resolveOpportunityQueueLaneRouting({
            normalized: WAITLIST_NORMALIZED,
            executableQueueKey: queueKey,
            workUnitMetadata: {
                lifecycle_stage_key: stageKey,
                [QUEUE_MEMBERSHIP_METADATA_KEY]: membership,
            },
            departmentMetadata: null,
        });
    }

    it("routes Enrolled via OCM builder", () => {
        const routing = routingForStage("enrolled", "enrollment_completed");
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stage).toBe("enrolled");
        expect(routing.countUnit).toBe("enrollment_tracks");
    });

    it("routes Enrolling via OCM builder", () => {
        const routing = routingForStage("enrollment", "enrollment_offers");
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stage).toBe("enrolling");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toContain("offer_pending");
    });

    it("routes Tour via OCM builder", () => {
        const routing = routingForStage("tour", "tours");
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stage).toBe("tour");
        expect(routing.countUnit).toBe("enrollment_tracks");
    });

    it("routes Waitlist via candidate builder", () => {
        const routing = routingForStage("waitlist", "waitlist");
        expect(routing.routingSource).toBe("builder");
        expect(routing.waitlistGrainCtx?.membershipSource).toBe("builder");
        expect(routing.waitlistGrainCtx?.filters.child_lifecycle_statuses).toEqual([
            "waitlisted",
            "waitlist_paused",
        ]);
        expect(routing.countUnit).toBe("candidates");
    });

    it("keeps Lead on legacy when builder flag on", () => {
        const membership = defaultQueueMembershipForEnrollmentStage("lead")!;
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "new_leads",
            workUnitMetadata: {
                lifecycle_stage_key: "lead",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: membership,
            },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("legacy");
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });

    it("respects lane allowlist env", () => {
        restore();
        restore = withEnv("1", "enrolled", "");
        const enrolled = routingForStage("enrolled", "enrollment_completed");
        expect(enrolled.routingSource).toBe("builder");
        const tour = routingForStage("tour", "tours");
        expect(tour.routingSource).not.toBe("builder");
        expect(tour.builderMembership).toBeNull();
    });
});

describe("QueueRowContext with builder membership", () => {
    it("uses membership stage_key and count_unit in meta", () => {
        const membership = defaultQueueMembershipForEnrollmentStage("enrolled")!;
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
        const membership = defaultQueueMembershipForEnrollmentStage("enrolled")!;
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

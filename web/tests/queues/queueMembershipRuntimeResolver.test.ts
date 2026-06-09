import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { defaultQueueMembershipForEnrollmentStage } from "@/lib/lifecycle/queueMembershipV1";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import { isQueueMembershipFromBuilderEnabled } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import {
    membershipAppliesToExecutableQueueKey,
    resolveOpportunityQueueLaneRouting,
    resolveQueueMembershipForWorkUnitRuntime,
} from "@/lib/queues/queueMembershipRuntimeResolver";

const ENROLLED_MEMBERSHIP = defaultQueueMembershipForEnrollmentStage("enrolled")!;

function withBuilderFlag(value: string | undefined) {
    const prevBuilder = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    const prevChild = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    if (value === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = value;
    delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    return () => {
        if (prevBuilder === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = prevBuilder;
        if (prevChild === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prevChild;
    };
}

describe("queueMembershipFromBuilderFeatureFlag", () => {
    it("is off by default", () => {
        const restore = withBuilderFlag(undefined);
        expect(isQueueMembershipFromBuilderEnabled()).toBe(false);
        restore();
    });

    it("is on when ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1", () => {
        const restore = withBuilderFlag("1");
        expect(isQueueMembershipFromBuilderEnabled()).toBe(true);
        restore();
    });
});

describe("resolveQueueMembershipForWorkUnitRuntime", () => {
    it("prefers work unit metadata over builder stage", () => {
        const wuMembership = {
            ...ENROLLED_MEMBERSHIP,
            included_disposition_keys: ["custom_enrolled"],
        };
        const membership = resolveQueueMembershipForWorkUnitRuntime({
            workUnitMetadata: {
                lifecycle_stage_key: "enrolled",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: wuMembership,
            },
            departmentMetadata: {},
        });
        expect(membership?.included_disposition_keys).toEqual(["custom_enrolled"]);
    });

    it("falls back to enrollment defaults for stage key on WU", () => {
        const membership = resolveQueueMembershipForWorkUnitRuntime({
            workUnitMetadata: { lifecycle_stage_key: "enrolled" },
            departmentMetadata: {},
        });
        expect(membership).toEqual(ENROLLED_MEMBERSHIP);
    });
});

describe("resolveOpportunityQueueLaneRouting", () => {
    let restoreEnv: () => void;

    beforeEach(() => {
        restoreEnv = withBuilderFlag(undefined);
    });

    afterEach(() => {
        restoreEnv();
    });

    const enrolledWuMetadata = {
        lifecycle_stage_key: "enrolled",
        [QUEUE_MEMBERSHIP_METADATA_KEY]: ENROLLED_MEMBERSHIP,
    };

    it("flag off uses child-grain flag path when set", () => {
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "enrollment_completed";
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: enrolledWuMetadata,
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("child_grain_flag");
        expect(routing.ocmTrackLaneCtx?.membershipSource).toBe("child_grain_flag");
        expect(routing.builderMembership).toBeNull();
    });

    it("flag off without child-grain stays legacy", () => {
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: enrolledWuMetadata,
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("legacy");
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });

    it("flag on + valid child config routes OCM builder with disposition keys", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: enrolledWuMetadata,
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.membershipSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(["enrolled"]);
        expect(routing.ocmTrackLaneCtx?.countUnit).toBe("enrollment_tracks");
    });

    it("flag on + enrollment stage maps to enrolling OCM dispositions", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        const enrollingMembership = defaultQueueMembershipForEnrollmentStage("enrollment")!;
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_offers",
            workUnitMetadata: {
                lifecycle_stage_key: "enrollment",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: enrollingMembership,
            },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stage).toBe("enrolling");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(
            enrollingMembership.included_disposition_keys,
        );
    });

    it("flag on + invalid metadata falls back to child-grain or legacy", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "enrollment_completed";
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: {
                lifecycle_stage_key: "enrolled",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: { version: 2 },
            },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("child_grain_flag");
        expect(routing.ocmTrackLaneCtx?.membershipSource).toBe("child_grain_flag");
    });

    it("flag on + missing metadata falls back when child-grain flag set", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "tours";
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "tours",
            workUnitMetadata: { lifecycle_stage_key: "custom" },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("child_grain_flag");
    });

    it("builder flag wins over child-grain flag when valid config exists", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "enrollment_completed";
        const customMembership = {
            ...ENROLLED_MEMBERSHIP,
            included_disposition_keys: ["enrolled", "bonus_track"],
        };
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: {
                [QUEUE_MEMBERSHIP_METADATA_KEY]: customMembership,
            },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(["enrolled", "bonus_track"]);
    });

    it("flag on + valid candidate config routes waitlist with disposition keys", () => {
        restoreEnv();
        restoreEnv = withBuilderFlag("1");
        const waitlistMembership = defaultQueueMembershipForEnrollmentStage("waitlist")!;
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: {
                isV2: true,
                queues: [
                    {
                        key: "waitlist",
                        label: "Waitlist",
                        grain: "candidate",
                        domain: "waitlist",
                        filters: [
                            { type: "candidate_status", operator: "in", values: ["active"] },
                            { type: "child_lifecycle_status", operator: "in", values: ["waitlisted"] },
                        ],
                        aliases: [],
                        filters_compat_v1: [],
                    },
                ],
            } as never,
            executableQueueKey: "waitlist",
            workUnitMetadata: {
                lifecycle_stage_key: "waitlist",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: waitlistMembership,
            },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.waitlistGrainCtx?.membershipSource).toBe("builder");
        expect(routing.waitlistGrainCtx?.filters.child_lifecycle_statuses).toEqual([
            "waitlisted",
            "waitlist_paused",
        ]);
        expect(routing.waitlistGrainCtx?.countUnit).toBe("candidates");
    });
});

describe("membershipAppliesToExecutableQueueKey", () => {
    it("matches lifecycle_wu stage queue keys", () => {
        const membership = defaultQueueMembershipForEnrollmentStage("tour")!;
        expect(membershipAppliesToExecutableQueueKey(membership, lifecycleStageWorkUnitKey("tour"))).toBe(
            true,
        );
        expect(membershipAppliesToExecutableQueueKey(membership, "tours")).toBe(true);
    });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyEnrollmentTemplateToProcess } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import { isQueueMembershipFromBuilderEnabled } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";
import {
    membershipAppliesToExecutableQueueKey,
    resolveOpportunityQueueLaneRouting,
    resolveQueueMembershipForWorkUnitRuntime,
} from "@/lib/queues/queueMembershipRuntimeResolver";

const ENROLLED_MEMBERSHIP = defaultEnrollmentQueueMembershipForStage("enrolled")!;

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

function withEnvVars(vars: Record<string, string | undefined>) {
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

describe("queueMembershipFromBuilderFeatureFlag", () => {
    it("is off without tracks_v1 metadata", () => {
        const restore = withEnvVars({
            ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: undefined,
            ALLOY_QUEUE_CHILD_GRAIN_LANES: undefined,
        });
        expect(isQueueMembershipFromBuilderEnabled()).toBe(false);
        restore();
    });

    it("is on when tracks_v1 configured without env", () => {
        const restore = withEnvVars({ ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: undefined });
        expect(isQueueMembershipFromBuilderEnabled(tracksDepartmentMetadata())).toBe(true);
        restore();
    });

    it("kill switch ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=0 disables tracks runtime", () => {
        const restore = withEnvVars({ ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: "0" });
        expect(isQueueMembershipFromBuilderEnabled(tracksDepartmentMetadata())).toBe(false);
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

    it("falls back to enrollment legacy defaults when builder has matching stage", () => {
        const membership = resolveQueueMembershipForWorkUnitRuntime({
            workUnitMetadata: { lifecycle_stage_key: "enrolled" },
            departmentMetadata: {
                [LIFECYCLE_BUILDER_METADATA_KEY]: {
                    version: 1,
                    active_process_id: "p1",
                    processes: [
                        {
                            id: "p1",
                            key: ENROLLMENT_PROCESS_KEY,
                            name: "Enrollment",
                            primary_entity: "opportunity",
                            sort_order: 0,
                            is_active: true,
                            stages: [
                                {
                                    id: "s1",
                                    key: "enrolled",
                                    label: "Enrolled",
                                    sort_order: 0,
                                    is_active: true,
                                },
                            ],
                        },
                    ],
                },
            },
        });
        expect(membership).toEqual(ENROLLED_MEMBERSHIP);
    });
});

describe("resolveOpportunityQueueLaneRouting", () => {
    let restoreEnv: () => void;

    beforeEach(() => {
        restoreEnv = withEnvVars({
            ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER: undefined,
            ALLOY_QUEUE_CHILD_GRAIN_LANES: undefined,
        });
    });

    afterEach(() => {
        restoreEnv();
    });

    const enrolledWuMetadata = {
        lifecycle_stage_key: "enrolled",
        [QUEUE_MEMBERSHIP_METADATA_KEY]: ENROLLED_MEMBERSHIP,
    };

    it("without tracks uses child-grain env path when set", () => {
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

    it("without tracks and without child-grain env stays legacy", () => {
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: enrolledWuMetadata,
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("legacy");
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });

    it("tracks_v1 + valid child config routes OCM builder with disposition keys (no env)", () => {
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: enrolledWuMetadata,
            departmentMetadata: tracksDepartmentMetadata(),
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.membershipSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(["enrolled"]);
        expect(routing.ocmTrackLaneCtx?.countUnit).toBe("enrollment_tracks");
    });

    it("tracks_v1 + enrollment stage maps to enrolling OCM dispositions", () => {
        const enrollingMembership = defaultEnrollmentQueueMembershipForStage("enrollment")!;
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_offers",
            workUnitMetadata: {
                lifecycle_stage_key: "enrollment",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: enrollingMembership,
            },
            departmentMetadata: tracksDepartmentMetadata(),
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.stageKey).toBe("enrollment");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(
            enrollingMembership.included_disposition_keys,
        );
    });

    it("tracks_v1 + invalid metadata stays legacy (not child-grain)", () => {
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "enrollment_completed";
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "enrollment_completed",
            workUnitMetadata: {
                lifecycle_stage_key: "enrolled",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: { version: 2 },
            },
            departmentMetadata: tracksDepartmentMetadata(),
        });
        expect(routing.routingSource).toBe("legacy");
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });

    it("without tracks + missing metadata falls back when child-grain env set", () => {
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "tours";
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: { isV2: true, queues: [] } as never,
            executableQueueKey: "tours",
            workUnitMetadata: { lifecycle_stage_key: "custom" },
            departmentMetadata: null,
        });
        expect(routing.routingSource).toBe("child_grain_flag");
    });

    it("tracks_v1 wins over child-grain env when valid config exists", () => {
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
            departmentMetadata: tracksDepartmentMetadata(),
        });
        expect(routing.routingSource).toBe("builder");
        expect(routing.ocmTrackLaneCtx?.dispositionKeys).toEqual(["enrolled", "bonus_track"]);
    });

    it("tracks_v1 + valid candidate config routes waitlist with disposition keys", () => {
        const waitlistMembership = defaultEnrollmentQueueMembershipForStage("waitlist")!;
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
            departmentMetadata: tracksDepartmentMetadata(),
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
        const membership = defaultEnrollmentQueueMembershipForStage("tour")!;
        expect(membershipAppliesToExecutableQueueKey(membership, lifecycleStageWorkUnitKey("tour"))).toBe(
            true,
        );
        expect(membershipAppliesToExecutableQueueKey(membership, "tours")).toBe(true);
    });
});

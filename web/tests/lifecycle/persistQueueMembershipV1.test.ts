import { describe, expect, it } from "vitest";
import {
    mergeInertQueueMembershipIntoQueueDefinition,
    resolveMembershipForWorkUnitDenormalization,
} from "@/lib/lifecycle/persistQueueMembershipV1";
import { membershipSeedDecision } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";

const TOUR_MEMBERSHIP: QueueMembershipV1 = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "tour",
    subject_type: "child",
    count_unit: "enrollment_tracks",
    location_scope_source: "ocm_site",
    included_disposition_keys: ["tour_scheduled"],
};

describe("membershipSeedDecision", () => {
    it("preserves explicit valid membership on stage", () => {
        const decision = membershipSeedDecision("tour", { queue_membership_v1: TOUR_MEMBERSHIP });
        expect(decision.action).toBe("skipped_has_explicit");
        expect(decision.membership_before?.subject_type).toBe("child");
    });

    it("does not write bogus membership for unknown stage", () => {
        const decision = membershipSeedDecision("enrolling", {});
        expect(decision.action).toBe("skipped_unknown_stage");
        expect(decision.membership).toBeNull();
    });

    it("seeds default for enrollment stage when missing", () => {
        const decision = membershipSeedDecision("enrollment", {});
        expect(decision.action).toBe("seeded");
        expect(decision.membership?.stage_key).toBe("enrollment");
        expect(decision.membership?.subject_type).toBe("child");
    });
});

describe("resolveMembershipForWorkUnitDenormalization", () => {
    it("preserves explicit work unit membership", () => {
        const custom: QueueMembershipV1 = {
            ...TOUR_MEMBERSHIP,
            included_disposition_keys: ["custom_key"],
        };
        const resolved = resolveMembershipForWorkUnitDenormalization("tour", TOUR_MEMBERSHIP, {
            queue_membership_v1: custom,
        });
        expect(resolved?.included_disposition_keys).toEqual(["custom_key"]);
    });

    it("falls back to stage membership when work unit has none", () => {
        const resolved = resolveMembershipForWorkUnitDenormalization("tour", TOUR_MEMBERSHIP, {});
        expect(resolved).toEqual(TOUR_MEMBERSHIP);
    });
});

describe("mergeInertQueueMembershipIntoQueueDefinition", () => {
    it("adds inert metadata without changing filters", () => {
        const before = {
            version: 2,
            entity_type: "opportunity",
            queues: [
                {
                    key: "lifecycle_tour",
                    filters: [{ type: "case_status", operator: "in", values: ["open"] }],
                },
            ],
        };
        const merged = mergeInertQueueMembershipIntoQueueDefinition(before, TOUR_MEMBERSHIP);
        expect((merged.metadata as { subject_type?: string }).subject_type).toBe("child");
        const queue = (merged.queues as Array<Record<string, unknown>>)[0];
        expect((queue.metadata as { count_unit?: string }).count_unit).toBe("enrollment_tracks");
        expect(queue.filters).toEqual(before.queues[0].filters);
    });
});

describe("lifecycleBuilderFromDepartmentMetadata round-trip", () => {
    it("parses queue_membership_v1 from stage blob", () => {
        const metadata = {
            lifecycle_builder_v1: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            {
                                id: "st-tour",
                                key: "tour",
                                label: "Tour",
                                sort_order: 1,
                                is_active: true,
                                queue_membership_v1: TOUR_MEMBERSHIP,
                            },
                        ],
                    },
                ],
            },
        };
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const stage = builder?.processes[0]?.stages.find((s) => s.key === "tour");
        expect(stage?.queue_membership_v1?.subject_type).toBe("child");
    });
});

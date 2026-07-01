import { describe, expect, it } from "vitest";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { resolveQueueMembershipForStage } from "@/lib/businessProcesses/resolveQueueMembership";

describe("parseQueueMembershipV1", () => {
    it("parses valid membership without enrollment template imports", () => {
        const parsed = parseQueueMembershipV1({
            version: 1,
            lifecycle_key: "billing",
            stage_key: "past_due",
            subject_type: "case",
            count_unit: "cases",
            included_disposition_keys: [],
            included_status_keys: ["past_due"],
        });
        expect(parsed).toEqual({
            version: 1,
            lifecycle_key: "billing",
            stage_key: "past_due",
            subject_type: "case",
            count_unit: "cases",
            included_disposition_keys: [],
            included_status_keys: ["past_due"],
        });
    });

    it("rejects invalid subject_type", () => {
        expect(
            parseQueueMembershipV1({
                version: 1,
                lifecycle_key: "billing",
                stage_key: "review",
                subject_type: "invalid",
                count_unit: "cases",
                included_disposition_keys: [],
            }),
        ).toBeNull();
    });
});

describe("resolveQueueMembershipForStage (generic)", () => {
    it("returns explicit queue_membership_v1 only", () => {
        const explicit = {
            version: 1 as const,
            lifecycle_key: "collections",
            stage_key: "escalation",
            subject_type: "case" as const,
            count_unit: "cases" as const,
            included_disposition_keys: ["escalated"],
        };
        expect(resolveQueueMembershipForStage({ queue_membership_v1: explicit }, "escalation")).toEqual(
            explicit,
        );
    });

    it("returns null when stage has no configured membership", () => {
        expect(resolveQueueMembershipForStage({ key: "custom_stage" }, "custom_stage")).toBeNull();
        expect(resolveQueueMembershipForStage(null, "custom_stage")).toBeNull();
    });
});

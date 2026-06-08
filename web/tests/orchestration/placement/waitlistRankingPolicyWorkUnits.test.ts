import { describe, expect, it } from "vitest";
import {
    filterWaitlistRankingEligibleWorkUnits,
    isWaitlistRankingEligibleWorkUnit,
    pickDefaultWaitlistRankingWorkUnitId,
} from "@/lib/orchestration/placement/waitlistRankingPolicyWorkUnits";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

describe("waitlistRankingPolicyWorkUnits", () => {
    const compliance = {
        id: "wu-compliance",
        key: "compliance_inbox",
        name: "Compliance inbox",
        metadata: {},
    };

    const enrollment = {
        id: "wu-enrollment",
        key: "enrollment_pipeline",
        name: "Enrollment Pipeline",
        metadata: {
            placement_priority_v1: {
                version: 1,
                enabled: true,
                profile_id: "childcare_enrollment_waitlist_v2",
                engine_version: "v2",
            },
        },
        queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
    };

    it("includes enrollment pipeline and excludes compliance inbox", () => {
        expect(isWaitlistRankingEligibleWorkUnit(enrollment)).toBe(true);
        expect(isWaitlistRankingEligibleWorkUnit(compliance)).toBe(false);
    });

    it("defaults to enrollment pipeline when available", () => {
        const eligible = filterWaitlistRankingEligibleWorkUnits([compliance, enrollment]);
        expect(eligible.map((w) => w.key)).toEqual(["enrollment_pipeline"]);
        expect(pickDefaultWaitlistRankingWorkUnitId(eligible)).toBe("wu-enrollment");
    });

    it("keeps previous selection when still eligible", () => {
        const eligible = filterWaitlistRankingEligibleWorkUnits([compliance, enrollment]);
        expect(pickDefaultWaitlistRankingWorkUnitId(eligible, "wu-enrollment")).toBe("wu-enrollment");
    });
});

/** @vitest-environment node */

/**
 * The convergence proof: the engine reads the Participation definition the Process Builder publishes,
 * and is no longer hardcoded. Changing `participation_v1` changes the contract the engine resolves.
 */

import { describe, expect, it } from "vitest";
import {
    resolveEnrollmentParticipationConfig,
    resolveEnrollmentParticipationContract,
    DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG,
} from "@/lib/process/definitions/enrollment";

/** Department metadata carrying a published Participation definition for the Enrollment process. */
function deptMetadataWith(participation: Record<string, unknown> | null) {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment Process",
                    is_active: true,
                    stages: [],
                    ...(participation ? { participation_v1: participation } : {}),
                },
            ],
        },
    };
}

describe("engine reads the published Participation definition (not hardcoded)", () => {
    it("no published config → the default seed contract", () => {
        const contract = resolveEnrollmentParticipationContract(deptMetadataWith(null));
        expect(contract).toEqual({
            processKey: "enrollment",
            subjectType: "child",
            contextType: "opportunity",
            inheritsContextStage: true,
        });
        expect(resolveEnrollmentParticipationConfig(deptMetadataWith(null))).toBe(
            DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG,
        );
    });

    it("PUBLISHING inherits_context_stage=false changes what the engine reads", () => {
        const contract = resolveEnrollmentParticipationContract(
            deptMetadataWith({
                version: 1,
                subject_type: "child",
                context_type: "opportunity",
                inherits_context_stage: false, // operator turned it off in the Process Builder
                participant_creation: "one_per_child_member",
                available_views: ["family", "child"],
            }),
        );
        expect(contract.inheritsContextStage).toBe(false); // engine reflects the published change
    });

    it("a DIFFERENT published subject/context flows to the engine contract (proves not hardcoded)", () => {
        const contract = resolveEnrollmentParticipationContract(
            deptMetadataWith({
                version: 1,
                subject_type: "household",
                context_type: "account",
                inherits_context_stage: true,
                participant_creation: "one_per_context",
                available_views: ["family"],
            }),
        );
        expect(contract.subjectType).toBe("household");
        expect(contract.contextType).toBe("account");
    });

    it("garbage/empty metadata is safe → default", () => {
        expect(resolveEnrollmentParticipationContract(null).inheritsContextStage).toBe(true);
        expect(resolveEnrollmentParticipationContract({}).subjectType).toBe("child");
    });
});

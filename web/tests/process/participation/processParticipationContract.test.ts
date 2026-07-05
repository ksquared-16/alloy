/** @vitest-environment node */

/**
 * The participant model is contract-driven, NOT hardcoded to Enrollment/opportunity. Enrollment is
 * one contract; a future process declares a different subject/context/creation-rule/stage-ownership/
 * grain — and the same generic model must serve it.
 */

import { describe, expect, it } from "vitest";
import {
    contractAllowsGrain,
    type ProcessParticipationContract,
} from "@/lib/process/participation/processParticipationContract";
import { ENROLLMENT_PARTICIPATION_CONTRACT } from "@/lib/process/participation/enrollmentParticipationContract";
import { effectiveStage, projectProcessParticipant } from "@/lib/process/participation/processParticipant";

describe("Enrollment contract declares the five required things", () => {
    it("subject=child, context=opportunity, per-child creation, opportunity stage fallback, grains", () => {
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.processKey).toBe("enrollment");
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.subjectType).toBe("child");
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.contextType).toBe("opportunity");
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.participantCreation).toBe("one_participant_per_child_member");
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.stageOwnership.contextStageFallback).toBe("opportunities.stage_key");
        expect(ENROLLMENT_PARTICIPATION_CONTRACT.grainOptions).toEqual(["family", "child", "candidate"]);
        expect(contractAllowsGrain(ENROLLMENT_PARTICIPATION_CONTRACT, "child")).toBe(true);
        expect(contractAllowsGrain(ENROLLMENT_PARTICIPATION_CONTRACT, "candidate")).toBe(true);
    });
});

describe("a DIFFERENT process contract works with the SAME generic model (not enrollment-hardcoded)", () => {
    // A hypothetical future process: the subject is an account, the context an agreement, and there
    // is NO context stage inheritance (participant stage stands alone).
    const RENEWAL_CONTRACT: ProcessParticipationContract = {
        processKey: "renewal",
        subjectType: "account",
        contextType: "agreement",
        participantCreation: "one_participant_per_context",
        stageOwnership: { participantStage: "process_instances.stage_key", contextStageFallback: null },
        grainOptions: ["family"],
    };

    it("projects a non-enrollment participant and honors its OWN stage ownership (no context fallback)", () => {
        const p = projectProcessParticipant({
            id: "pi-r1",
            org_id: "org-1",
            process_key: "renewal",
            subject_type: "account",
            subject_id: "acct-9",
            context_type: "agreement",
            context_id: "agr-3",
            stage_key: null, // participant has no stage yet
            state: null,
            close_reason_key: null,
            context_stage_key: "active", // the context HAS a stage…
        });
        // …but this contract declares NO fallback, so effective stage is participant-stage-alone → null.
        expect(effectiveStage(p, RENEWAL_CONTRACT)).toBeNull();
        // whereas under a fallback contract the same row would inherit the context stage:
        expect(effectiveStage(p, ENROLLMENT_PARTICIPATION_CONTRACT)).toBe("active");
    });

    it("grain options are per-contract, not global", () => {
        expect(contractAllowsGrain(RENEWAL_CONTRACT, "candidate")).toBe(false);
        expect(contractAllowsGrain(RENEWAL_CONTRACT, "family")).toBe(true);
    });
});

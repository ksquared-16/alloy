/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    parseParticipationConfigV1,
    participationContractFromConfig,
    type ParticipationConfigV1,
} from "@/lib/process/participationConfig";

const VALID: ParticipationConfigV1 = {
    version: 1,
    subject_type: "child",
    context_type: "opportunity",
    inherits_context_stage: true,
    participant_creation: "one_per_child_member",
    available_views: ["family", "child", "candidate"],
};

describe("parseParticipationConfigV1", () => {
    it("round-trips a valid config; clamps views + creation rule", () => {
        expect(parseParticipationConfigV1(VALID)).toEqual(VALID);
        const clamped = parseParticipationConfigV1({
            version: 1,
            subject_type: "  child ",
            context_type: "opportunity",
            inherits_context_stage: false,
            participant_creation: "nonsense",
            available_views: ["family", "bogus", "candidate"],
            operational_state_labels: { enrolled: "  Enrolled ", "": "x", blank: "  " },
        });
        expect(clamped?.subject_type).toBe("child"); // trimmed
        expect(clamped?.inherits_context_stage).toBe(false);
        expect(clamped?.participant_creation).toBe("one_per_child_member"); // invalid → default
        expect(clamped?.available_views).toEqual(["family", "candidate"]); // "bogus" dropped
        expect(clamped?.operational_state_labels).toEqual({ enrolled: "Enrolled" }); // empties dropped
    });

    it("rejects unparseable / wrong-version / missing subject|context", () => {
        expect(parseParticipationConfigV1(null)).toBeNull();
        expect(parseParticipationConfigV1({ version: 2, subject_type: "child", context_type: "opportunity" })).toBeNull();
        expect(parseParticipationConfigV1({ version: 1, context_type: "opportunity" })).toBeNull();
    });
});

describe("participationContractFromConfig", () => {
    it("derives ONLY the four engine fields (no views/labels/creation leak into the engine)", () => {
        const contract = participationContractFromConfig("enrollment", VALID);
        expect(contract).toEqual({
            processKey: "enrollment",
            subjectType: "child",
            contextType: "opportunity",
            inheritsContextStage: true,
        });
        expect(Object.keys(contract).sort()).toEqual([
            "contextType",
            "inheritsContextStage",
            "processKey",
            "subjectType",
        ]);
    });
});

import { describe, expect, it } from "vitest";

import {
    REQUIREMENT_KINDS_AUTHORABLE_V1,
    REQUIREMENT_KINDS_V1,
    isAuthorableRequirementKind,
    parseStageRequirementsV1,
    serializeStageRequirementsV1,
    type StageRequirementV1,
} from "@/lib/lifecycle/stageRequirementsV1";

/**
 * A STAGE SHOULD REQUIRE THE ENROLLMENT PACKET, NOT ITS THREE FORMS.
 *
 * Listing every Form on the stage made the Business Process know about composition it does not own:
 * adding a step to the family's paperwork meant editing the lifecycle. The process still says WHEN
 * enrolment work is required and how strictly; the packet says what completing it consists of.
 *
 * `packet` is authorable where `document`, `consent`, `acknowledgment` and `signature` are not, and
 * the difference is evidence: a packet session and its items already prove, per step, what was
 * completed and against which Form version. The other four have no owner that can prove anything,
 * which is exactly why they are refused.
 */

const packetRequirement: StageRequirementV1 = {
    requirement_id: "enrollment_packet",
    ref: { kind: "packet", packet_definition_id: "pkt-1" },
    level: "required",
    enforcement: "blocking",
};

describe("the packet requirement kind", () => {
    it("is part of the vocabulary", () => {
        expect(REQUIREMENT_KINDS_V1).toContain("packet");
    });

    it("is authorable, unlike the kinds with no evidence owner", () => {
        expect(isAuthorableRequirementKind("packet")).toBe(true);
        expect(REQUIREMENT_KINDS_AUTHORABLE_V1).toEqual(expect.arrayContaining(["field", "form", "packet"]));
        for (const refused of ["document", "consent", "acknowledgment", "signature"] as const) {
            expect(isAuthorableRequirementKind(refused)).toBe(false);
        }
    });

    it("survives a serialize/parse round trip", () => {
        const back = parseStageRequirementsV1(serializeStageRequirementsV1({ version: 1, requirements: [packetRequirement] }));
        expect(back?.requirements).toHaveLength(1);
        expect(back!.requirements[0]!.ref).toEqual({ kind: "packet", packet_definition_id: "pkt-1" });
        expect(back!.requirements[0]!.requirement_id).toBe("enrollment_packet");
        expect(back!.requirements[0]!.level).toBe("required");
    });

    it("persists the packet id under its own column, not the form's", () => {
        // A packet reference must never be readable as a form reference — they resolve against
        // different owners, and a mix-up would send the runtime to the wrong platform.
        const out = serializeStageRequirementsV1({ version: 1, requirements: [packetRequirement] });
        const row = (out.requirements as Record<string, unknown>[])[0]!;
        expect(row.packet_definition_id).toBe("pkt-1");
        expect(row.form_definition_id).toBeUndefined();
        expect(row.kind).toBe("packet");
    });

    it("refuses a packet reference with no packet id", () => {
        const bad = parseStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "x", kind: "packet", level: "required" }],
        });
        expect(bad?.requirements ?? []).toHaveLength(0);
    });

    it("leaves form requirements working", () => {
        // Existing stages still carry form requirements; nothing here removes that support.
        const out = serializeStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "r_form", ref: { kind: "form", form_definition_id: "f-1" }, level: "required" }],
        });
        expect(parseStageRequirementsV1(out)!.requirements[0]!.ref).toEqual({ kind: "form", form_definition_id: "f-1" });
    });
});

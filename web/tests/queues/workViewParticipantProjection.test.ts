/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildProcessParticipant } from "@/lib/process/engine";
import {
    projectParticipantsToRows,
    workViewCountSemantics,
    workViewCountUnitForGrain,
} from "@/lib/queues/workViewParticipantProjection";

/** A Lyons child participant — same household (context "opp-lyons"). */
function child(id: string) {
    return buildProcessParticipant(
        {
            id,
            org_id: "org-1",
            process_key: "enrollment",
            subject_type: "child",
            subject_id: `cm-${id}`,
            context_id: "opp-lyons",
            stage_key: null,
        },
        { contextStageKey: "lead", scopeId: "wu-1", attributes: {} },
    );
}
const A = child("a");
const B = child("b");

describe("Work View count semantics — participant vs row, labeled", () => {
    it("count_unit is derived from grain", () => {
        expect(workViewCountUnitForGrain("family")).toBe("cases");
        expect(workViewCountUnitForGrain("child")).toBe("children");
        expect(workViewCountUnitForGrain("candidate")).toBe("candidates");
    });

    it("family grain: two children in ONE household → 2 participants but 1 row (households)", () => {
        const s = workViewCountSemantics([A, B], "family");
        expect(s.participantCount).toBe(2); // metric truth
        expect(s.rowCount).toBe(1); //          one household row
        expect(s.countUnit).toBe("cases");
        expect(s.countUnitLabel).toBe("households");
        expect(projectParticipantsToRows([A, B], "family")).toHaveLength(1);
    });

    it("child/candidate grain: one row per participant (participant count == row count)", () => {
        const child = workViewCountSemantics([A, B], "child");
        expect(child.participantCount).toBe(2);
        expect(child.rowCount).toBe(2);
        expect(child.countUnitLabel).toBe("children");
        const cand = workViewCountSemantics([B], "candidate");
        expect(cand.rowCount).toBe(1);
        expect(cand.countUnitLabel).toBe("candidates");
    });
});

describe("the Lyons oracle — Child A = Lead, Child B = Waitlist", () => {
    // The membership predicates (metrics) already select these sets; the projection turns them into rows.
    const newLeadsParticipants = [A]; // Child A is in Lead
    const waitlistParticipants = [B]; // Child B is in Waitlist

    it("New Leads: participant count 1, family-grain ROW count 1 (household for Child A)", () => {
        const s = workViewCountSemantics(newLeadsParticipants, "family");
        expect(s.participantCount).toBe(1);
        expect(s.rowCount).toBe(1);
        expect(s.countUnitLabel).toBe("households");
        // the one household row represents Child A
        expect(projectParticipantsToRows(newLeadsParticipants, "family")[0]!.participants[0]!.subjectId).toBe("cm-a");
    });

    it("Waitlist: participant count 1, child/candidate-grain ROW count 1 (Child B)", () => {
        const s = workViewCountSemantics(waitlistParticipants, "candidate");
        expect(s.participantCount).toBe(1);
        expect(s.rowCount).toBe(1);
        expect(projectParticipantsToRows(waitlistParticipants, "candidate")[0]!.rowKey).toBe("b");
    });

    it("the household appears in BOTH views via different children (multi-view via participants)", () => {
        expect(newLeadsParticipants[0]!.contextId).toBe(waitlistParticipants[0]!.contextId); // same household
        expect(newLeadsParticipants[0]!.subjectId).not.toBe(waitlistParticipants[0]!.subjectId); // different children
    });
});

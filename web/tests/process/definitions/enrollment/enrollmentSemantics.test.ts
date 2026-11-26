/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildProcessParticipant } from "@/lib/process/engine";
import {
    countActiveLeadParticipants,
    countActiveLeadFamilies,
    countNewLeadParticipants,
    countWaitlistedParticipants,
    isActiveLeadParticipant,
    isLiveEnrollmentParticipant,
    isNewLeadParticipant,
    isWaitlistedParticipant,
    type EnrollmentParticipant,
    type EnrollmentAttributes,
} from "@/lib/process/definitions/enrollment";

function participant(over: {
    id?: string;
    subjectId?: string;
    contextId?: string;
    stageKey?: string | null;
    contextStageKey?: string | null;
    state?: string | null;
    scopeId?: string | null;
    closeReasonKey?: string | null;
    contextStatusKey?: string | null;
    subjectActive?: boolean;
    processKey?: string;
}): EnrollmentParticipant {
    const attributes: EnrollmentAttributes = {
        contextStatusKey: over.contextStatusKey ?? "open",
        subjectActive: over.subjectActive ?? true,
        waitlistRank: null,
        contextLocationId: null,
        subjectLocationId: null,
    };
    return buildProcessParticipant<EnrollmentAttributes>(
        {
            id: over.id ?? "pi",
            org_id: "org-1",
            process_key: over.processKey ?? "enrollment",
            subject_type: "child",
            subject_id: over.subjectId ?? "cm",
            context_id: over.contextId ?? "opp-lyons",
            stage_key: over.stageKey ?? null,
            state: over.state ?? null,
            close_reason_key: over.closeReasonKey ?? null,
        },
        { contextStageKey: over.contextStageKey ?? null, scopeId: over.scopeId === undefined ? "wu-1" : over.scopeId, attributes },
    );
}

describe("Enrollment semantics — Active / New / Waitlisted (composed from engine primitives)", () => {
    it("New Lead = effective 'lead' + undispositioned (child riding the family track counts)", () => {
        const riding = participant({ stageKey: null, contextStageKey: "lead" });
        expect(isNewLeadParticipant(riding)).toBe(true);
        expect(isActiveLeadParticipant(riding)).toBe(true);
        expect(isWaitlistedParticipant(riding)).toBe(false);
    });

    it("Active Lead is stage-agnostic; Tour-stage is active but not new", () => {
        const onTour = participant({ stageKey: "tour" });
        expect(isActiveLeadParticipant(onTour)).toBe(true);
        expect(isNewLeadParticipant(onTour)).toBe(false);
    });

    it("Waitlisted (stage or state); a waitlisted participant is not New even with a lagging 'lead'", () => {
        expect(isWaitlistedParticipant(participant({ stageKey: "waitlist" }))).toBe(true);
        const byState = participant({ stageKey: null, contextStageKey: "lead", state: "waitlisted" });
        expect(isWaitlistedParticipant(byState)).toBe(true);
        expect(isNewLeadParticipant(byState)).toBe(false); // state gate keeps them mutually exclusive
    });

    it("terminal states + non-live are excluded from every predicate", () => {
        for (const state of ["enrolled", "withdrawn", "not_enrolling"]) {
            expect(isActiveLeadParticipant(participant({ stageKey: "enrollment", state }))).toBe(false);
        }
        expect(isActiveLeadParticipant(participant({ stageKey: "enrollment", state: "enrolling" }))).toBe(true);
        for (const p of [
            participant({ stageKey: "lead", closeReasonKey: "lost" }),
            participant({ stageKey: "lead", subjectActive: false }),
            participant({ stageKey: "lead", contextStatusKey: "closed" }),
            participant({ stageKey: "lead", processKey: "billing" }),
        ]) {
            expect(isLiveEnrollmentParticipant(p)).toBe(false);
            expect(isActiveLeadParticipant(p)).toBe(false);
        }
    });
});

describe("the Lyons oracle — one household, two children", () => {
    const childA = participant({ id: "a", subjectId: "cm-a", stageKey: null, contextStageKey: "lead" }); // Lead
    const childB = participant({ id: "b", subjectId: "cm-b", stageKey: "waitlist" }); //                    Waitlist
    const siblingOtherWu = participant({ id: "x", subjectId: "cm-x", stageKey: "lead", scopeId: "wu-2", contextId: "opp-other-wu" });
    const orphan = participant({ id: "o", subjectId: "cm-o", stageKey: "lead", scopeId: null, contextId: "opp-orphan" });
    const enrolled = participant({ id: "e", subjectId: "cm-e", stageKey: "enrolled", state: "enrolled" });
    const all = [childA, childB, siblingOtherWu, orphan, enrolled];
    const scope = { orgId: "org-1", scopeId: "wu-1" };

    it("Active 2 / New 1 / Waitlisted 1, scoped to the household's work unit (participants, not households)", () => {
        expect(countActiveLeadParticipants(all, scope)).toBe(2);
        expect(countActiveLeadFamilies(all, scope)).toBe(1);
        expect(countNewLeadParticipants(all, scope)).toBe(1);
        expect(countWaitlistedParticipants(all, scope)).toBe(1);
        expect(childA.contextId).toBe(childB.contextId); // same household, still counts 2
    });

    it("unscoped, sibling-WU + orphan leads join the org rollup", () => {
        expect(countActiveLeadParticipants(all, { orgId: "org-1" })).toBe(4);
        expect(countActiveLeadFamilies(all, { orgId: "org-1" })).toBe(3);
        expect(countNewLeadParticipants(all, { orgId: "org-1" })).toBe(3);
    });
});

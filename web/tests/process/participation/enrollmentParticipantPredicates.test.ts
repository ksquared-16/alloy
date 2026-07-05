/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    countActiveLeadParticipants,
    countNewLeadParticipants,
    countWaitlistedParticipants,
    enrollmentEffectiveStage,
    isActiveLeadParticipant,
    isLiveEnrollmentParticipant,
    isNewLeadParticipant,
    isWaitlistedParticipant,
} from "@/lib/process/participation/enrollmentParticipantPredicates";
import {
    projectProcessParticipant,
    type ProcessParticipant,
    type ProcessParticipantSourceRow,
} from "@/lib/process/participation/processParticipant";

function participant(over: Partial<ProcessParticipantSourceRow>): ProcessParticipant {
    return projectProcessParticipant({
        id: "pi",
        org_id: "org-1",
        process_key: "enrollment",
        subject_type: "child",
        subject_id: "cm",
        context_type: "opportunity",
        context_id: "opp-lyons",
        stage_key: null,
        state: null,
        close_reason_key: null,
        context_status_key: "open",
        context_work_unit_id: "wu-1",
        ...over,
    });
}

describe("ratified predicates — Active Lead / New Lead / Waitlisted", () => {
    it("New Lead = effective stage 'lead' (incl. a child riding the family track: PI stage null + opp 'lead')", () => {
        const ridingFamily = participant({ stage_key: null, context_stage_key: "lead" });
        expect(enrollmentEffectiveStage(ridingFamily)).toBe("lead");
        expect(isNewLeadParticipant(ridingFamily)).toBe(true);
        expect(isActiveLeadParticipant(ridingFamily)).toBe(true); // New Lead ⊂ Active Lead
        expect(isWaitlistedParticipant(ridingFamily)).toBe(false);
    });

    it("Active Lead is stage-agnostic: a Tour-stage participant is active but NOT a new lead", () => {
        const onTour = participant({ stage_key: "tour" });
        expect(isActiveLeadParticipant(onTour)).toBe(true);
        expect(isNewLeadParticipant(onTour)).toBe(false);
    });

    it("Waitlisted = waitlist stage OR waitlisted state; still an Active Lead; NOT a New Lead", () => {
        const byStage = participant({ stage_key: "waitlist" });
        // Contradictory-but-defensive: stage lags at family-track 'lead' while state says waitlisted.
        const byState = participant({ stage_key: null, context_stage_key: "lead", state: "waitlisted" });
        expect(isWaitlistedParticipant(byStage)).toBe(true);
        expect(isWaitlistedParticipant(byState)).toBe(true);
        expect(isActiveLeadParticipant(byStage)).toBe(true);
        // The state gate keeps the categories mutually exclusive: a waitlisted participant is not "new".
        expect(isNewLeadParticipant(byState)).toBe(false);
    });

    it("terminal states (enrolled/withdrawn/not_enrolling) are NOT active leads", () => {
        for (const state of ["enrolled", "withdrawn", "not_enrolling"] as const) {
            const p = participant({ stage_key: "enrollment", state });
            expect(isActiveLeadParticipant(p)).toBe(false);
        }
        // enrolling is NOT terminal → still active
        expect(isActiveLeadParticipant(participant({ stage_key: "enrollment", state: "enrolling" }))).toBe(true);
    });

    it("not live → excluded from every predicate: closed instance / inactive child / closed context / wrong process", () => {
        const closedInstance = participant({ stage_key: "lead", close_reason_key: "lost" });
        const inactiveChild = participant({ stage_key: "lead", subject_is_active: false });
        const closedContext = participant({ stage_key: "lead", context_status_key: "closed" });
        const wrongProcess = participant({ stage_key: "lead", process_key: "billing" });
        for (const p of [closedInstance, inactiveChild, closedContext, wrongProcess]) {
            expect(isLiveEnrollmentParticipant(p)).toBe(false);
            expect(isActiveLeadParticipant(p)).toBe(false);
            expect(isNewLeadParticipant(p)).toBe(false);
            expect(isWaitlistedParticipant(p)).toBe(false);
        }
    });
});

describe("the Lyons oracle — one household, two children, correct counts", () => {
    // Child A = Enrollment / Lead (rides family track). Child B = Enrollment / Waitlist. Same household + WU.
    const childA = participant({ id: "pi-a", subject_id: "cm-a", stage_key: null, context_stage_key: "lead" });
    const childB = participant({ id: "pi-b", subject_id: "cm-b", stage_key: "waitlist" });
    // Distractors that must NOT inflate this WU's counts:
    const sibutlingOtherWu = participant({ id: "pi-x", subject_id: "cm-x", stage_key: "lead", context_work_unit_id: "wu-2" });
    const orphanNoWu = participant({ id: "pi-o", subject_id: "cm-o", stage_key: "lead", context_work_unit_id: null });
    const enrolled = participant({ id: "pi-e", subject_id: "cm-e", stage_key: "enrolled", state: "enrolled" });
    const all = [childA, childB, sibutlingOtherWu, orphanNoWu, enrolled];
    const scope = { orgId: "org-1", workUnitId: "wu-1" };

    it("Active Leads = 2, New Leads = 1, Waitlisted = 1 (scoped to the household's work unit)", () => {
        expect(countActiveLeadParticipants(all, scope)).toBe(2); // A + B (sibling WU / orphan / enrolled excluded)
        expect(countNewLeadParticipants(all, scope)).toBe(1); //   A only
        expect(countWaitlistedParticipants(all, scope)).toBe(1); // B only
    });

    it("counts are participants, not households: two children in one opportunity contribute two", () => {
        expect(childA.contextId).toBe(childB.contextId); // same household/opportunity
        expect(countActiveLeadParticipants([childA, childB], scope)).toBe(2); // NOT 1
    });

    it("without work-unit scope, sibling-WU and orphan leads DO count (dept/workspace rollup)", () => {
        // 3 lead-ish actives (A, sibling other-WU, orphan) + B waitlisted = 4 active total, org-wide.
        expect(countActiveLeadParticipants(all, { orgId: "org-1" })).toBe(4);
        expect(countNewLeadParticipants(all, { orgId: "org-1" })).toBe(3); // A + sibling + orphan
    });
});

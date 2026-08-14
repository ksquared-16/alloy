/**
 * Records enrollment-state truth — the defect Direct Enroll would otherwise create.
 *
 * Records derived a child's state from `process_instances` alone. That was honest only while a
 * governed journey was the only route into care. A directly enrolled child has a durable agreement
 * and NO process instance, so the old derivation would have rendered a child who is actually in
 * care as "On record" — not missing information, but a confident wrong answer.
 *
 * Every case below is stated as the OPERATOR question it answers, because the whole point of this
 * module is that the surface stops disagreeing with the centre.
 */

import { describe, expect, it } from "vitest";

import {
    deriveChildRecordState,
    isEnrolledCohortState,
    isProcessRunningState,
    CHILD_RECORD_STATE_LABEL,
} from "@/lib/adminV2/records/childEnrollmentState";

describe("durable care truth outranks the journey", () => {
    it("a directly enrolled child is Enrolled — an active agreement with no process at all", () => {
        expect(
            deriveChildRecordState({ agreementStatuses: ["active"], processStates: [] })
        ).toBe("enrolled");
    });

    it("an agreement with a known end date is still IN care, not closed", () => {
        // `ending` is an OPERATIONAL status in the canonical vocabulary. Reading it as terminal
        // would drop a child out of Enrolled while they are still attending.
        expect(
            deriveChildRecordState({ agreementStatuses: ["ending"], processStates: [] })
        ).toBe("enrolled");
    });

    it("a committed but not-yet-started agreement is Starting, never Enrolled", () => {
        // Calling `pending_start` "enrolled" would put a child into today's rosters before their
        // first day.
        expect(
            deriveChildRecordState({ agreementStatuses: ["pending_start"], processStates: [] })
        ).toBe("starting");
    });

    it("durable truth wins over a still-running journey about the same child", () => {
        expect(
            deriveChildRecordState({
                agreementStatuses: ["active"],
                processStates: ["registration"],
            })
        ).toBe("enrolled");
    });
});

describe("the journey speaks when there is no durable relationship yet", () => {
    it("a running process with nothing materialised is In Process", () => {
        expect(
            deriveChildRecordState({ agreementStatuses: [], processStates: ["registration"] })
        ).toBe("in_process");
    });

    it("a process that reached enrolled still reads Enrolled", () => {
        // Preserves the pre-existing meaning for tenants whose children were enrolled through the
        // governed path before any agreement row existed.
        expect(deriveChildRecordState({ processStates: ["completed"] })).toBe("enrolled");
        expect(deriveChildRecordState({ processStates: ["enrolled"] })).toBe("enrolled");
    });

    it("an unknown running state is participation, not absence", () => {
        // A journey the platform has no word for is still a journey; calling it "no process" would
        // hide the child from the cohort that describes them.
        expect(isProcessRunningState("some_future_stage")).toBe(true);
        expect(deriveChildRecordState({ processStates: ["some_future_stage"] })).toBe("in_process");
    });

    it("an empty state is not a journey position", () => {
        expect(isProcessRunningState("")).toBe(false);
        expect(deriveChildRecordState({ processStates: [""] })).toBeNull();
    });
});

describe("ended and on-record", () => {
    it("a terminated agreement reads Closed", () => {
        expect(deriveChildRecordState({ agreementStatuses: ["ended"] })).toBe("closed");
        expect(deriveChildRecordState({ agreementStatuses: ["canceled"] })).toBe("closed");
    });

    it("a withdrawn journey reads Closed", () => {
        expect(deriveChildRecordState({ processStates: ["withdrawn"] })).toBe("closed");
    });

    it("a child who left and came back is Enrolled again, not Closed", () => {
        // The old agreement is history; the operational one is the answer.
        expect(
            deriveChildRecordState({ agreementStatuses: ["ended", "active"], processStates: [] })
        ).toBe("enrolled");
    });

    it("plain Add Child is On record — a complete answer, not a gap", () => {
        expect(deriveChildRecordState({})).toBeNull();
        expect(deriveChildRecordState({ agreementStatuses: [], processStates: [] })).toBeNull();
    });
});

describe("cohort membership uses the same derivation the row does", () => {
    it("Enrolled holds both the enrolled and the starting", () => {
        expect(isEnrolledCohortState("enrolled")).toBe(true);
        expect(isEnrolledCohortState("starting")).toBe(true);
    });

    it("and holds neither the in-process nor the on-record", () => {
        expect(isEnrolledCohortState("in_process")).toBe(false);
        expect(isEnrolledCohortState("closed")).toBe(false);
        expect(isEnrolledCohortState(null)).toBe(false);
    });

    it("every non-null state has an operator label", () => {
        // A missing label previously fell back to rendering the raw key at the operator.
        for (const state of ["enrolled", "starting", "in_process", "closed"] as const) {
            expect(CHILD_RECORD_STATE_LABEL[state]).toBeTruthy();
        }
        expect(CHILD_RECORD_STATE_LABEL.starting).toBe("Starting");
    });
});

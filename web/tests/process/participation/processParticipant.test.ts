/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    effectiveStage,
    isOpenInstance,
    participantInScope,
    participantMatchesProcess,
    projectProcessParticipant,
    type ProcessParticipantSourceRow,
} from "@/lib/process/participation/processParticipant";
import { ENROLLMENT_PARTICIPATION_CONTRACT } from "@/lib/process/participation/enrollmentParticipationContract";

function row(over: Partial<ProcessParticipantSourceRow>): ProcessParticipantSourceRow {
    return {
        id: "pi-1",
        org_id: "org-1",
        process_key: "enrollment",
        subject_type: "child",
        subject_id: "cm-1",
        context_type: "opportunity",
        context_id: "opp-1",
        stage_key: null,
        state: null,
        close_reason_key: null,
        ...over,
    };
}

describe("projectProcessParticipant", () => {
    it("flattens PI + joined context + subject; empty strings normalize to null; is_active defaults true", () => {
        const p = projectProcessParticipant(
            row({
                stage_key: "  waitlist ",
                state: "waitlisted",
                context_stage_key: "lead",
                context_status_key: "open",
                context_work_unit_id: "wu-1",
                subject_is_active: undefined, // not selected → treated active
                stage_entered_at: "2026-07-01T00:00:00Z",
            }),
        );
        expect(p.participantId).toBe("pi-1");
        expect(p.participantStageKey).toBe("waitlist"); // trimmed
        expect(p.contextStageKey).toBe("lead");
        expect(p.workUnitId).toBe("wu-1");
        expect(p.subjectActive).toBe(true);
        expect(p.stageEnteredAt).toBe("2026-07-01T00:00:00Z");
        // blank work unit → null (never counted as a value)
        expect(projectProcessParticipant(row({ context_work_unit_id: "  " })).workUnitId).toBeNull();
        // is_active === false is the ONLY inactive signal
        expect(projectProcessParticipant(row({ subject_is_active: false })).subjectActive).toBe(false);
    });
});

describe("effectiveStage — the contract-governed coalesce", () => {
    it("participant stage wins when present", () => {
        const p = projectProcessParticipant(row({ stage_key: "tour", context_stage_key: "lead" }));
        expect(effectiveStage(p, ENROLLMENT_PARTICIPATION_CONTRACT)).toBe("tour");
    });
    it("falls back to context stage when participant stage is null (child rides the family track)", () => {
        const p = projectProcessParticipant(row({ stage_key: null, context_stage_key: "lead" }));
        expect(effectiveStage(p, ENROLLMENT_PARTICIPATION_CONTRACT)).toBe("lead");
    });
    it("null when neither present", () => {
        const p = projectProcessParticipant(row({ stage_key: null, context_stage_key: null }));
        expect(effectiveStage(p, ENROLLMENT_PARTICIPATION_CONTRACT)).toBeNull();
    });
});

describe("scope + open helpers", () => {
    it("isOpenInstance is false once a close reason is recorded", () => {
        expect(isOpenInstance(projectProcessParticipant(row({})))).toBe(true);
        expect(isOpenInstance(projectProcessParticipant(row({ close_reason_key: "withdrawn" })))).toBe(false);
    });
    it("participantInScope gates org and (when given) work unit — NULL/sibling WU excluded", () => {
        const p = projectProcessParticipant(row({ context_work_unit_id: "wu-1" }));
        expect(participantInScope(p, { orgId: "org-1" })).toBe(true);
        expect(participantInScope(p, { orgId: "org-1", workUnitId: "wu-1" })).toBe(true);
        expect(participantInScope(p, { orgId: "org-1", workUnitId: "wu-2" })).toBe(false); // sibling
        expect(participantInScope(p, { orgId: "org-2" })).toBe(false); // other org
        const orphan = projectProcessParticipant(row({ context_work_unit_id: null }));
        expect(participantInScope(orphan, { orgId: "org-1", workUnitId: "wu-1" })).toBe(false); // NULL WU
    });
    it("participantMatchesProcess checks both process_key and subject_type", () => {
        expect(participantMatchesProcess(projectProcessParticipant(row({})), ENROLLMENT_PARTICIPATION_CONTRACT)).toBe(true);
        expect(participantMatchesProcess(projectProcessParticipant(row({ process_key: "billing" })), ENROLLMENT_PARTICIPATION_CONTRACT)).toBe(false);
        expect(participantMatchesProcess(projectProcessParticipant(row({ subject_type: "case" })), ENROLLMENT_PARTICIPATION_CONTRACT)).toBe(false);
    });
});

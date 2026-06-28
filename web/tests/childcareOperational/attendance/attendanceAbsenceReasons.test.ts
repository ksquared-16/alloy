import { describe, expect, it } from "vitest";
import {
    ABSENCE_REASONS,
    classifyAbsenceReason,
    isAbsenceReasonKey,
    isExcusedAbsence,
} from "@/lib/childcareOperational/attendance/attendanceAbsenceReasons";

describe("attendance absence reason vocabulary", () => {
    it("validates known reason keys", () => {
        expect(isAbsenceReasonKey("illness")).toBe(true);
        expect(isAbsenceReasonKey("no_show")).toBe(true);
        expect(isAbsenceReasonKey("not_a_reason")).toBe(false);
    });

    it("classifies excused / unexcused / unspecified", () => {
        expect(classifyAbsenceReason("illness")).toBe("excused");
        expect(classifyAbsenceReason("vacation")).toBe("unexcused");
        expect(classifyAbsenceReason("other")).toBe("unspecified");
        expect(classifyAbsenceReason(null)).toBe("unspecified");
        expect(classifyAbsenceReason("unknown_key")).toBe("unspecified");
    });

    it("isExcusedAbsence reflects classification", () => {
        expect(isExcusedAbsence("medical_appointment")).toBe(true);
        expect(isExcusedAbsence("no_show")).toBe(false);
        expect(isExcusedAbsence(null)).toBe(false);
    });

    it("classification carries no billing/subsidy semantics (only operational metadata)", () => {
        for (const r of ABSENCE_REASONS) {
            expect(["excused", "unexcused", "unspecified"]).toContain(r.classification);
            // No billing/subsidy fields leak into the vocabulary contract.
            expect(Object.keys(r).sort()).toEqual(["classification", "key", "label"]);
        }
    });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

const P21_SOURCES = [
    "lib/childcareOperational/attendance/actualCompliance.ts",
    "lib/childcareOperational/attendance/buildActualComplianceReadModel.ts",
    "lib/childcareOperational/attendance/fetchActualComplianceReadModel.ts",
    "lib/childcareOperational/attendance/childAttendanceReadModel.ts",
    "lib/childcareOperational/attendance/attendanceServiceDate.ts",
    "lib/childcareOperational/attendance/attendanceAbsenceReasons.ts",
    "lib/childcareOperational/config/roomConfigResolvers.ts",
    "lib/childcareOperational/expectations/loadOperationalExpectationInputs.ts",
];

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("P2.1 doctrine guardrails", () => {
    it("no job-vertical table leakage in read-model sources", () => {
        for (const rel of P21_SOURCES) {
            const src = read(rel);
            expect(src).not.toMatch(/\bjob_id\b/);
            expect(src).not.toMatch(/from\(["']jobs["']\)/);
            expect(src).not.toMatch(/from\(["']job_/);
            expect(src).not.toMatch(/from\(["']pricing/);
        }
    });

    it("read models never mutate attendance rows (no update/delete/insert on the fact table)", () => {
        for (const rel of P21_SOURCES) {
            const src = read(rel);
            // These pure/read modules must not write attendance facts.
            expect(src).not.toMatch(/child_attendance_events["']\)\s*\.\s*(update|delete|insert|upsert)/);
        }
    });

    it("actual compliance treats missing staff data as a placeholder, not a hard requirement", () => {
        const src = read("lib/childcareOperational/attendance/actualCompliance.ts");
        expect(src).toContain("staff_data_unavailable");
        expect(src).toMatch(/staffingGap/);
    });
});

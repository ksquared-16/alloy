import { describe, expect, it } from "vitest";
import {
    buildEnrollmentPlacementIntentFromRow,
    hasEnrollmentPlacementIntent,
    resolveEnrollmentPlacementIntentFromRecord,
} from "@/lib/childcareOperational/enrollmentScheduleDoctrine";

describe("enrollmentScheduleDoctrine", () => {
    it("builds proposal intent from inquiry child row", () => {
        const intent = buildEnrollmentPlacementIntentFromRow({
            id: "ocm-1",
            display_name: "Kid",
            location_label: "Main Campus",
            desired_program_label: "Infant",
            program_room_cohort_label: "Infant A",
            desired_schedule_label: "Full time",
            desired_start_date: "2026-09-01",
        });
        expect(intent.scheduleProposal).toBe("Full time");
        expect(hasEnrollmentPlacementIntent(intent)).toBe(true);
    });

    it("resolves proposal intent from child runtime record", () => {
        const intent = resolveEnrollmentPlacementIntentFromRecord({
            "child.schedule": "Tue/Thu",
            "child.program": "Preschool",
            "child.room": "Room B",
            "child.location": "West Site",
        });
        expect(intent.scheduleProposal).toBe("Tue/Thu");
        expect(intent.program).toBe("Preschool");
    });
});

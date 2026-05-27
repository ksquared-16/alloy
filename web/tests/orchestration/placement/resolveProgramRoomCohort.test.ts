import { describe, expect, it } from "vitest";
import { resolveProgramRoomCohort, slugifyProgramRoomCohortKey, UNKNOWN_PROGRAM_ROOM_COHORT_KEY } from "@/lib/orchestration/placement/resolveProgramRoomCohort";

describe("resolveProgramRoomCohort", () => {
    it("slugifies program_room_group", () => {
        expect(slugifyProgramRoomCohortKey("Toddler Room A")).toBe("toddler_room_a");
    });

    it("prefers explicit cohort key", () => {
        const r = resolveProgramRoomCohort({
            program_room_cohort_key: "infant_room_a",
            program_room_group_label: "Infant Room A",
        });
        expect(r.program_room_cohort_key).toBe("infant_room_a");
        expect(r.program_room_group_label).toBe("Infant Room A");
    });

    it("derives from placement_fact_inputs_v1.program_room_group", () => {
        const r = resolveProgramRoomCohort({
            metadata: {
                placement_fact_inputs_v1: { program_room_group: "Infant Room" },
            },
        });
        expect(r.program_room_cohort_key).toBe("infant_room");
        expect(r.program_room_group_label).toBe("Infant Room");
    });

    it("falls back to program_label", () => {
        const r = resolveProgramRoomCohort({
            metadata: { program_label: "Preschool" },
        });
        expect(r.program_room_cohort_key).toBe("preschool");
        expect(r.program_room_group_label).toBe("Preschool");
    });

    it("uses unknown_program_room when nothing set", () => {
        const r = resolveProgramRoomCohort({});
        expect(r.program_room_cohort_key).toBe(UNKNOWN_PROGRAM_ROOM_COHORT_KEY);
    });
});

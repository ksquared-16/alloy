import { describe, expect, it } from "vitest";
import {
    formatSchedulePatternSummary,
    readSchedulePatternPresentation,
    resolveSchedulePatternWeekdays,
    toSchedulePatternSchedulingContract,
    writeSchedulePatternMetadata,
} from "@/lib/locations/schedulePatternPresentation";
import {
    readRoomSchedulePatternId,
    readRoomSupportedProgramKeys,
    writeRoomProgramsAndScheduleMetadata,
} from "@/lib/locations/roomOfferingMetadata";

describe("schedulePatternPresentation", () => {
    it("round-trips hours and rotating weeks into metadata while unioning weekdays", () => {
        const metadata = writeSchedulePatternMetadata({
            operatorType: "rotating",
            hours: { opensAt: "08:00", closesAt: "17:00" },
            rotation: { week1: [1, 2, 3, 4, 5], week2: [1, 3, 5] },
        });
        const presentation = readSchedulePatternPresentation(metadata, "rotating");
        expect(presentation.operatorType).toBe("rotating");
        expect(presentation.hours).toEqual({ opensAt: "08:00", closesAt: "17:00" });
        expect(presentation.rotation).toEqual({ week1: [1, 2, 3, 4, 5], week2: [1, 3, 5] });
        expect(
            resolveSchedulePatternWeekdays({
                operatorType: "rotating",
                weekdays: [],
                rotation: presentation.rotation,
            }),
        ).toEqual([1, 2, 3, 4, 5]);
        expect(
            formatSchedulePatternSummary({
                label: "Alternate",
                scheduleTypeKey: "rotating",
                weekdays: [1, 2, 3, 4, 5],
                metadata,
            }),
        ).toContain("Rotating");
        expect(
            toSchedulePatternSchedulingContract({
                label: "Alternate",
                key: "alternate",
                scheduleTypeKey: "rotating",
                weekdays: [1, 2, 3, 4, 5],
                metadata,
            }).hours.opensAt,
        ).toBe("08:00");
    });

    it("maps full-day hours without rotation", () => {
        const metadata = writeSchedulePatternMetadata({
            operatorType: "full_day",
            hours: { opensAt: "07:30", closesAt: "18:00" },
            rotation: null,
        });
        expect(readSchedulePatternPresentation(metadata, "weekly").operatorType).toBe("full_day");
        expect(
            resolveSchedulePatternWeekdays({
                operatorType: "full_day",
                weekdays: [1, 2, 3, 4, 5],
                rotation: null,
            }),
        ).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("roomOfferingMetadata", () => {
    it("writes supported programs and schedule pattern while keeping legacy category", () => {
        const metadata = writeRoomProgramsAndScheduleMetadata({
            existing: { student_teacher_ratio: "1:4", age_range_from: "0" },
            supportedProgramKeys: ["infant", "toddler"],
            schedulePatternId: "pat-1",
            capacity: "12",
        });
        expect(metadata.supported_program_keys).toEqual(["infant", "toddler"]);
        expect(metadata.category).toBe("infant");
        expect(metadata.schedule_pattern_id).toBe("pat-1");
        expect(metadata.capacity).toBe("12");
        expect(metadata.student_teacher_ratio).toBe("1:4");
        expect(readRoomSupportedProgramKeys(metadata)).toEqual(["infant", "toddler"]);
        expect(readRoomSchedulePatternId(metadata)).toBe("pat-1");
    });

    it("falls back to legacy category when supported_program_keys is absent", () => {
        expect(readRoomSupportedProgramKeys({ category: "preschool" })).toEqual(["preschool"]);
        expect(readRoomSchedulePatternId({})).toBeNull();
    });
});

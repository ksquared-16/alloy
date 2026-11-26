import { describe, expect, it } from "vitest";
import {
    formatScheduleDefinitionSummary,
    migrateV1ScheduleMetadata,
    readScheduleDefinitionPresentation,
    resolveScheduleDefinitionWeekdays,
    toSchedulePatternSchedulingContract,
    writeScheduleDefinitionMetadata,
} from "@/lib/locations/schedulePatternPresentation";
import {
    readRoomSchedulePatternId,
    readRoomSupportedProgramKeys,
    writeRoomProgramsAndScheduleMetadata,
} from "@/lib/locations/roomOfferingMetadata";

describe("scheduleDefinitionPresentation v2", () => {
    it("keeps day type and rotating pattern as independent dimensions", () => {
        const metadata = writeScheduleDefinitionMetadata({
            dayType: "part_time",
            patternType: "rotating",
            hours: { opensAt: "08:00", closesAt: "15:00" },
            weeks: [
                { position: 1, days: [1, 3, 5], startTime: "08:00", endTime: "15:00" },
                { position: 2, days: [2, 4], startTime: "08:00", endTime: "15:00" },
                { position: 3, days: [1, 2, 4], startTime: "08:00", endTime: "15:00" },
            ],
        });
        const presentation = readScheduleDefinitionPresentation(metadata, "part_time");
        expect(presentation.dayType).toBe("part_time");
        expect(presentation.patternType).toBe("rotating");
        expect(presentation.weeks).toHaveLength(3);
        expect(presentation.needsDayTypeReview).toBe(false);
        expect(
            resolveScheduleDefinitionWeekdays({
                patternType: "rotating",
                weeks: presentation.weeks,
            }),
        ).toEqual([1, 2, 3, 4, 5]);
        expect(
            formatScheduleDefinitionSummary({
                label: "Alternating Part Time",
                scheduleTypeKey: "part_time",
                weekdays: [1, 2, 3, 4, 5],
                metadata,
            }),
        ).toContain("3-week rotation");
    });

    it("defaults new continuous definitions without inventing days", () => {
        const metadata = writeScheduleDefinitionMetadata({
            dayType: "full_time",
            patternType: "continuous",
            hours: { opensAt: null, closesAt: null },
            weeks: [{ position: 1, days: [], startTime: null, endTime: null }],
        });
        const presentation = readScheduleDefinitionPresentation(metadata, "full_time");
        expect(presentation.weeks[0]?.days).toEqual([]);
        expect(presentation.patternType).toBe("continuous");
    });

    it("maps V1 rotating rows without inventing a day type", () => {
        const migrated = migrateV1ScheduleMetadata(
            {
                version: 1,
                operator_type: "rotating",
                hours: { opens_at: "08:00", closes_at: "17:00" },
                rotation: { week1: [1, 2, 3, 4, 5], week2: [1, 3, 5] },
            },
            "rotating",
        );
        expect(migrated.patternType).toBe("rotating");
        expect(migrated.dayType).toBeNull();
        expect(migrated.needsDayTypeReview).toBe(true);
        expect(migrated.weeks).toHaveLength(2);
    });

    it("maps V1 full_day / part_time / hourly to continuous day types", () => {
        expect(migrateV1ScheduleMetadata({ operator_type: "full_day" }, "weekly").dayType).toBe("full_time");
        expect(migrateV1ScheduleMetadata({ operator_type: "part_time" }, null).dayType).toBe("part_time");
        expect(migrateV1ScheduleMetadata({ operator_type: "hourly" }, null).patternType).toBe("continuous");
    });

    it("exports a Scheduling contract with both dimensions", () => {
        const metadata = writeScheduleDefinitionMetadata({
            dayType: "full_time",
            patternType: "continuous",
            hours: { opensAt: "07:00", closesAt: "18:00" },
            weeks: [{ position: 1, days: [1, 2, 3, 4, 5], startTime: "07:00", endTime: "18:00" }],
        });
        const contract = toSchedulePatternSchedulingContract({
            label: "Full Time",
            key: "full_time",
            scheduleTypeKey: "full_time",
            weekdays: [1, 2, 3, 4, 5],
            metadata,
        });
        expect(contract.dayType).toBe("full_time");
        expect(contract.patternType).toBe("continuous");
        expect(contract.hours.opensAt).toBe("07:00");
    });
});

describe("roomOfferingMetadata", () => {
    it("writes supported programs and optional default schedule pattern", () => {
        const metadata = writeRoomProgramsAndScheduleMetadata({
            existing: { student_teacher_ratio: "1:4" },
            supportedProgramKeys: ["infant", "toddler"],
            schedulePatternId: "pat-1",
            capacity: "12",
        });
        expect(metadata.supported_program_keys).toEqual(["infant", "toddler"]);
        expect(metadata.category).toBe("infant");
        expect(metadata.schedule_pattern_id).toBe("pat-1");
        expect(readRoomSupportedProgramKeys(metadata)).toEqual(["infant", "toddler"]);
        expect(readRoomSchedulePatternId(metadata)).toBe("pat-1");
    });
});

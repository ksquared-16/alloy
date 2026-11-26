import { describe, expect, it } from "vitest";
import {
    allowedPatternWeekdays,
    createTimeWindow,
    readEligibleSchedulePatternIds,
    readLocationSchedulingConfig,
    renameScheduleTypeLabel,
    resolveEligiblePatternsForProgramRoom,
    resolveEnabledDayTypes,
    writeEligibleSchedulePatternIds,
    writeLocationSchedulingConfig,
} from "@/lib/locations/locationSchedulingConfig";
import {
    isValidRotationAnchorDate,
    resolveRotationWeekPosition,
    rotatingPatternRequiresAnchor,
    writeScheduleDefinitionMetadata,
} from "@/lib/locations/schedulePatternPresentation";
import {
    deriveLocationProgramOfferingState,
    locationProgramOfferingCheckboxSelected,
} from "@/lib/programs/locationProgramAvailability";

describe("locationProgramOfferingState", () => {
    it("treats null dates as active offering", () => {
        expect(
            deriveLocationProgramOfferingState({
                relationship: { is_active: true, available_from: null, available_through: null },
                asOfYmd: "2026-07-22",
            }),
        ).toBe("active");
    });

    it("marks future start as scheduled and keeps checkbox selected", () => {
        const state = deriveLocationProgramOfferingState({
            relationship: {
                is_active: true,
                available_from: "2027-03-01",
                available_through: null,
            },
            asOfYmd: "2026-07-22",
        });
        expect(state).toBe("scheduled");
        expect(locationProgramOfferingCheckboxSelected(state)).toBe(true);
    });

    it("marks expired end as ended and keeps checkbox selected", () => {
        const state = deriveLocationProgramOfferingState({
            relationship: {
                is_active: true,
                available_from: null,
                available_through: "2025-01-01",
            },
            asOfYmd: "2026-07-22",
        });
        expect(state).toBe("ended");
        expect(locationProgramOfferingCheckboxSelected(state)).toBe(true);
    });

    it("marks missing relationship as not offered", () => {
        expect(deriveLocationProgramOfferingState({ relationship: null })).toBe("not_offered");
        expect(locationProgramOfferingCheckboxSelected("not_offered")).toBe(false);
    });
});

describe("fetchLocationProgramCategories mapper contract", () => {
    it("preserves program_id and availability columns in client fetch mapper source", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(
            join(process.cwd(), "lib/admin/location/fetchLocationProgramCategories.ts"),
            "utf8",
        );
        expect(src).toContain("program_id: asOptionalString(r.program_id)");
        expect(src).toContain("available_from: asOptionalString(r.available_from)");
        expect(src).toContain("available_through: asOptionalString(r.available_through)");
    });
});

describe("locationSchedulingConfig", () => {
    it("round-trips operating days, schedule types, and time windows", () => {
        const written = writeLocationSchedulingConfig(null, {
            version: 1,
            operatingDays: [1, 2, 3, 4, 5],
            enabledDayTypeKeys: ["part_time"],
            scheduleTypes: [
                {
                    id: "st_continuous",
                    key: "every_week",
                    label: "Same Every Week",
                    behavior: "continuous",
                    description: null,
                    isActive: true,
                    sortOrder: 10,
                },
            ],
            timeWindows: [
                createTimeWindow({ label: "School Day", startTime: "08:00", endTime: "15:00" }),
            ],
        });
        const read = readLocationSchedulingConfig(written);
        expect(read.operatingDays).toEqual([1, 2, 3, 4, 5]);
        expect(read.enabledDayTypeKeys).toEqual(["part_time"]);
        expect(read.scheduleTypes[0]?.label).toBe("Same Every Week");
        expect(read.scheduleTypes[0]?.behavior).toBe("continuous");
        expect(read.timeWindows[0]?.label).toBe("School Day");
        expect(read.timeWindows[0]?.startTime).toBe("08:00");
    });

    it("renames schedule type label without changing behavior", () => {
        const next = renameScheduleTypeLabel(
            [
                {
                    id: "st_rotating",
                    key: "rotating_weeks",
                    label: "Rotating Weeks",
                    behavior: "rotating",
                    description: null,
                    isActive: true,
                    sortOrder: 20,
                },
            ],
            "st_rotating",
            "Alternating Weeks",
        );
        expect(next[0]?.label).toBe("Alternating Weeks");
        expect(next[0]?.behavior).toBe("rotating");
    });

    it("limits pattern days to operating days", () => {
        expect(allowedPatternWeekdays([1, 3, 5])).toEqual([1, 3, 5]);
        expect(allowedPatternWeekdays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("resolves enabled day types from org vocabulary", () => {
        const org = [
            { key: "full_time", label: "Full Time", isActive: true },
            { key: "part_time", label: "Part Time", isActive: true },
            { key: "drop_in", label: "Drop-In", isActive: false },
        ];
        expect(resolveEnabledDayTypes(org, []).map((row) => row.key)).toEqual(["full_time", "part_time"]);
        expect(resolveEnabledDayTypes(org, ["part_time"]).map((row) => row.key)).toEqual(["part_time"]);
    });

    it("resolves program/room/pattern eligibility intersection", () => {
        const result = resolveEligiblePatternsForProgramRoom({
            offeringPatternIds: ["p1", "p2"],
            locationPatternIds: ["p1", "p2", "p3"],
            roomDefaultPatternId: "p1",
            roomSupportsProgram: true,
        });
        expect(result.patternIds).toEqual(["p1", "p2"]);
        expect(result.roomDefaultIncluded).toBe(true);
        expect(
            resolveEligiblePatternsForProgramRoom({
                offeringPatternIds: ["p1"],
                locationPatternIds: ["p1"],
                roomDefaultPatternId: "p1",
                roomSupportsProgram: false,
            }).patternIds,
        ).toEqual([]);
    });

    it("writes eligible schedule pattern ids on offering metadata", () => {
        const metadata = writeEligibleSchedulePatternIds({ existing: true }, ["a", "b", "a"]);
        expect(readEligibleSchedulePatternIds(metadata)).toEqual(["a", "b"]);
    });
});

describe("rotation anchor projection", () => {
    it("requires rotation begins for rotating patterns", () => {
        expect(rotatingPatternRequiresAnchor("rotating", null)).toBe(true);
        expect(rotatingPatternRequiresAnchor("rotating", "2026-09-07")).toBe(false);
        expect(rotatingPatternRequiresAnchor("continuous", null)).toBe(false);
        expect(isValidRotationAnchorDate("2026-09-07")).toBe(true);
    });

    it("projects week position from anchor with Sunday week-start", () => {
        // Anchor Monday 2026-09-07 → Week 1 contains that Sunday-start week (2026-09-06).
        expect(
            resolveRotationWeekPosition({
                asOfYmd: "2026-09-07",
                rotationAnchorDate: "2026-09-07",
                weekCount: 3,
            }),
        ).toBe(1);
        expect(
            resolveRotationWeekPosition({
                asOfYmd: "2026-09-14",
                rotationAnchorDate: "2026-09-07",
                weekCount: 3,
            }),
        ).toBe(2);
        expect(
            resolveRotationWeekPosition({
                asOfYmd: "2026-09-21",
                rotationAnchorDate: "2026-09-07",
                weekCount: 3,
            }),
        ).toBe(3);
        expect(
            resolveRotationWeekPosition({
                asOfYmd: "2026-09-28",
                rotationAnchorDate: "2026-09-07",
                weekCount: 3,
            }),
        ).toBe(1);
    });

    it("persists rotation_anchor_date in schedule metadata", () => {
        const metadata = writeScheduleDefinitionMetadata({
            dayType: "part_time",
            patternType: "rotating",
            hours: { opensAt: "08:00", closesAt: "15:00" },
            weeks: [
                { position: 1, days: [1, 3, 5], startTime: "08:00", endTime: "15:00" },
                { position: 2, days: [2, 4], startTime: "08:00", endTime: "15:00" },
                { position: 3, days: [1, 2, 4], startTime: "08:00", endTime: "15:00" },
            ],
            rotationAnchorDate: "2026-09-07",
        });
        expect(metadata.rotation_anchor_date).toBe("2026-09-07");
        expect(metadata.pattern_type).toBe("rotating");
        expect((metadata.weeks as unknown[]).length).toBe(3);
    });
});

import { describe, expect, it } from "vitest";
import {
    aggregateExpectedOccupancyByRoomDate,
    enumerateDates,
    expandExpectedAttendance,
    weekdayOf,
    type OperationalAgreementInput,
    type OperationalAssignmentInput,
    type OperationalPlacementInput,
    type SchedulePatternInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import {
    buildScheduleExpectations,
} from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import type { ChildcareConfigRuleBundle } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import type {
    ChildcareCapacityRuleRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const SITE = "site-1";
const ROOM = "room-1";
const PROGRAM = "prog-1";
// Mon/Wed/Fri
const PATTERN: SchedulePatternInput = { id: "pat-1", weekdays: [1, 3, 5], schedule_type_key: "full_time" };
const patternsById = new Map([[PATTERN.id, PATTERN]]);

function agreement(id: string, partial: Partial<OperationalAgreementInput> = {}): OperationalAgreementInput {
    return {
        id,
        customer_member_id: `cm-${id}`,
        site_location_id: SITE,
        start_date: "2026-01-01",
        end_date: null,
        status: "active",
        ...partial,
    };
}

function placement(agreementId: string, partial: Partial<OperationalPlacementInput> = {}): OperationalPlacementInput {
    return {
        enrollment_agreement_id: agreementId,
        room_location_id: ROOM,
        program_category_id: PROGRAM,
        start_date: "2026-01-01",
        end_date: null,
        status: "active",
        ...partial,
    };
}

function assignment(agreementId: string, partial: Partial<OperationalAssignmentInput> = {}): OperationalAssignmentInput {
    return {
        enrollment_agreement_id: agreementId,
        schedule_pattern_id: PATTERN.id,
        start_date: "2026-01-01",
        end_date: null,
        status: "active",
        ...partial,
    };
}

function emptyConfig(): ChildcareConfigRuleBundle {
    return {
        capacityRules: [],
        ratioRules: [],
        ratioRuleTiers: [],
        operatingWindows: [],
        scheduleRules: [],
    };
}

describe("date primitives", () => {
    it("2026-01-01 is a Thursday (weekday 4)", () => {
        expect(weekdayOf("2026-01-01")).toBe(4);
    });
    it("enumerates an inclusive date range", () => {
        expect(enumerateDates("2026-01-01", "2026-01-03")).toEqual([
            "2026-01-01",
            "2026-01-02",
            "2026-01-03",
        ]);
        expect(enumerateDates("2026-01-03", "2026-01-01")).toEqual([]);
    });
});

describe("expandExpectedAttendance", () => {
    it("emits attendance only on pattern weekdays within the range", () => {
        const entries = expandExpectedAttendance({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
        });
        // Mon 01-05, Wed 01-07, Fri 01-02 fall in range
        expect(entries.map((e) => e.date).sort()).toEqual(["2026-01-02", "2026-01-05", "2026-01-07"]);
        expect(entries.every((e) => PATTERN.weekdays.includes(e.weekday))).toBe(true);
        expect(entries.every((e) => e.roomLocationId === ROOM)).toBe(true);
    });

    it("respects assignment effective_start", () => {
        const entries = expandExpectedAttendance({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1", { start_date: "2026-01-05" })],
            patternsById,
        });
        expect(entries.map((e) => e.date).sort()).toEqual(["2026-01-05", "2026-01-07"]);
    });

    it("attributes no room when no operational placement covers the date", () => {
        const entries = expandExpectedAttendance({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [],
            assignments: [assignment("a1")],
            patternsById,
        });
        expect(entries.length).toBe(3);
        expect(entries.every((e) => e.roomLocationId === null)).toBe(true);
    });

    it("ignores non-operational agreements/assignments", () => {
        const entries = expandExpectedAttendance({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1", { status: "ended" })],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
        });
        expect(entries).toHaveLength(0);
    });
});

describe("aggregateExpectedOccupancyByRoomDate", () => {
    it("counts children per room per date", () => {
        const entries = expandExpectedAttendance({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1"), agreement("a2")],
            placements: [placement("a1"), placement("a2")],
            assignments: [assignment("a1"), assignment("a2")],
            patternsById,
        });
        const occ = aggregateExpectedOccupancyByRoomDate(entries);
        expect(occ.every((o) => o.roomLocationId === ROOM)).toBe(true);
        expect(occ.every((o) => o.childCount === 2)).toBe(true);
        expect(occ.map((o) => o.date).sort()).toEqual(["2026-01-02", "2026-01-05", "2026-01-07"]);
    });
});

function ratioRule(): ChildcareRatioRuleRow {
    return {
        id: "ratio-1",
        org_id: "org-1",
        scope_type: "org",
        site_location_id: null,
        program_category_id: null,
        room_location_id: null,
        age_group_key: null,
        jurisdiction_key: null,
        effective_start: "2026-01-01",
        effective_end: null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

function ratioTier(max: number, staff: number): ChildcareRatioRuleTierRow {
    return {
        id: `tier-${max}`,
        org_id: "org-1",
        ratio_rule_id: "ratio-1",
        max_children: max,
        required_staff: staff,
        sort_order: 100,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

function capacityRule(kind: ChildcareCapacityRuleRow["capacity_kind"], capacity: number): ChildcareCapacityRuleRow {
    return {
        id: `cap-${kind}`,
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        capacity_kind: kind,
        capacity,
        effective_start: "2026-01-01",
        effective_end: null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("buildScheduleExpectations", () => {
    it("derives staffing from occupancy and ratio tiers", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1"), agreement("a2")],
            placements: [placement("a1"), placement("a2")],
            assignments: [assignment("a1"), assignment("a2")],
            patternsById,
            config: {
                ...emptyConfig(),
                ratioRules: [ratioRule()],
                ratioRuleTiers: [ratioTier(5, 1), ratioTier(11, 2), ratioTier(16, 3)],
            },
        });
        expect(model.expectedStaffingByRoomDate.every((s) => s.childCount === 2)).toBe(true);
        expect(model.expectedStaffingByRoomDate.every((s) => s.requiredStaff === 1)).toBe(true);
    });

    it("warns when expected occupancy exceeds binding capacity", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1"), agreement("a2")],
            placements: [placement("a1"), placement("a2")],
            assignments: [assignment("a1"), assignment("a2")],
            patternsById,
            config: { ...emptyConfig(), capacityRules: [capacityRule("operational", 1)] },
        });
        const capacityWarnings = model.warnings.filter((w) => w.code === "capacity_exceeded");
        expect(capacityWarnings.length).toBeGreaterThan(0);
        expect(capacityWarnings.every((w) => w.roomLocationId === ROOM)).toBe(true);
    });

    it("warns when an assignment has no operational placement room", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [],
            assignments: [assignment("a1")],
            patternsById,
            config: emptyConfig(),
        });
        expect(model.warnings.some((w) => w.code === "missing_placement_room")).toBe(true);
    });

    it("produces no system-of-record — only derived arrays", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
            config: emptyConfig(),
        });
        expect(Object.keys(model).sort()).toEqual([
            "expectedAttendance",
            "expectedOccupancyByRoomDate",
            "expectedStaffingByRoomDate",
            "warnings",
        ]);
    });

    it("warns (not crashes) when a placed child has no resolvable age group", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
            config: emptyConfig(),
        });
        expect(model.warnings.some((w) => w.code === "missing_age_group")).toBe(true);
        expect(model.warnings.find((w) => w.code === "missing_age_group")?.agreementId).toBe("a1");
    });

    it("does not warn missing_age_group once the program category age group resolves", () => {
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
            config: emptyConfig(),
            ageGroupByProgramCategoryId: { [PROGRAM]: "infant" },
        });
        expect(model.warnings.some((w) => w.code === "missing_age_group")).toBe(false);
    });

    it("prefers placement program category over room config for age group", () => {
        const scheduleRule = {
            id: "sr-1",
            org_id: "org-1",
            scope_type: "site" as const,
            site_location_id: SITE,
            program_category_id: null,
            room_location_id: null,
            age_group_key: null,
            eligible_schedule_type_keys: null,
            eligible_age_group_keys: ["infant"],
            min_days_per_week: null,
            max_days_per_week: null,
            effective_start: "2026-01-01",
            effective_end: null,
            source_key: "config",
            metadata: {},
            created_by: null,
            updated_by: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        };
        const model = buildScheduleExpectations({
            dateStart: "2026-01-01",
            dateEnd: "2026-01-07",
            agreements: [agreement("a1")],
            placements: [placement("a1")],
            assignments: [assignment("a1")],
            patternsById,
            config: { ...emptyConfig(), scheduleRules: [scheduleRule] },
            ageGroupByProgramCategoryId: { [PROGRAM]: "infant" },
            ageGroupByRoomLocationId: { [ROOM]: "toddler" },
        });
        // program-derived "infant" is eligible; room-derived "toddler" would be ineligible
        expect(model.warnings.some((w) => w.code === "age_group_ineligible")).toBe(false);
    });
});

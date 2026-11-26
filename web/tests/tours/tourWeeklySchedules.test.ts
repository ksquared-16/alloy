/**
 * S3 — tour schedule authoring: weekly schedules over the canonical rules, duplication,
 * weekday organization, inherited availability and 12-hour, zone-correct times.
 */
import { describe, expect, it } from "vitest";

import { computeSlotsFromRulesAndBookings } from "@/lib/tours/availability/internalCompute";
import type { TourAvailabilityRuleRow, TourBookingOverlapRow } from "@/lib/tours/availability/types";
import {
    buildTourWeekdayView,
    duplicateTourScheduleDraft,
    expandTourScheduleToRuleValues,
    findTourScheduleOverlaps,
    groupTourRulesIntoSchedules,
    planTourScheduleReconcile,
    validateTourScheduleDraft,
    type TourRuleForAuthoring,
    type TourScheduleDraft,
} from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    formatTourInstantForOperator,
    formatTourWallTime,
    formatTourWallTimeRange,
    isValidTourTimeZone,
} from "@/lib/tours/schedules/tourTimeFormat";

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const SCHEDULE = "33333333-3333-4333-8333-333333333333";

const WEEKDAY_TOURS: TourScheduleDraft = {
    name: "Weekday tours",
    days: [1, 2, 3, 4, 5],
    windows: [
        { start_time: "08:30:00", end_time: "10:30:00" },
        { start_time: "14:30:00", end_time: "15:30:00" },
    ],
    timezone: "America/Los_Angeles",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 2,
    approval_required: false,
    is_active: true,
};

let seq = 0;
function asRules(rows: ReturnType<typeof expandTourScheduleToRuleValues>): (TourAvailabilityRuleRow & TourRuleForAuthoring)[] {
    return rows.map((r) => ({ ...r, id: `rule-${++seq}`, user_id: null }));
}

/** Local wall-clock start times of a slot list, in the slot's zone, grouped by local date. */
function localStarts(slots: { startAt: string; timezone: string }[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const s of slots) {
        const d = new Date(s.startAt);
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        const t = new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, hour: "numeric", minute: "2-digit" }).format(d);
        (out[day] ??= []).push(t);
    }
    return out;
}

describe("S3-A — one weekly schedule replaces ten carveouts", () => {
    it("Mon–Fri × two windows expands to ten canonical rules, all tagged with one schedule", () => {
        const rows = expandTourScheduleToRuleValues(WEEKDAY_TOURS, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE });
        expect(rows).toHaveLength(10);
        expect(new Set(rows.map((r) => r.day_of_week))).toEqual(new Set([1, 2, 3, 4, 5]));
        for (const r of rows) {
            expect(r.metadata).toEqual({ tour_schedule: { id: SCHEDULE, name: "Weekday tours" } });
            expect(r.location_id).toBe(LOC);
        }
    });

    it("the existing slot engine generates exactly the expected times from it", () => {
        const rules = asRules(expandTourScheduleToRuleValues(WEEKDAY_TOURS, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));
        // Mon 2027-01-11 .. Sun 2027-01-17, local.
        const slots = computeSlotsFromRulesAndBookings(rules, [], {
            locationId: LOC,
            fromUtc: new Date("2027-01-11T08:00:00Z"),
            toUtc: new Date("2027-01-18T08:00:00Z"),
        });
        const byDay = localStarts(slots);
        const expected = ["8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "2:30 PM", "3:00 PM"];
        expect(Object.keys(byDay).sort()).toEqual(["2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15"]);
        for (const day of Object.keys(byDay)) expect(byDay[day]).toEqual(expected);
        expect(slots.every((s) => s.capacity === 2 && s.remainingCapacity === 2)).toBe(true);
    });

    it("nonconsecutive weekdays work (Mon, Wed, Fri)", () => {
        const rules = asRules(
            expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, days: [5, 1, 3] }, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE })
        );
        const v = validateTourScheduleDraft({ ...WEEKDAY_TOURS, days: [5, 1, 3] });
        expect(v.ok && v.draft.days).toEqual([1, 3, 5]);
        const slots = computeSlotsFromRulesAndBookings(rules, [], {
            locationId: LOC,
            fromUtc: new Date("2027-01-11T08:00:00Z"),
            toUtc: new Date("2027-01-18T08:00:00Z"),
        });
        expect(Object.keys(localStarts(slots)).sort()).toEqual(["2027-01-11", "2027-01-13", "2027-01-15"]);
    });

    it("validation refuses what would author a broken schedule", () => {
        const bad = (patch: Partial<Record<keyof TourScheduleDraft, unknown>>) => validateTourScheduleDraft({ ...WEEKDAY_TOURS, ...patch });
        expect(bad({ days: [] }).ok).toBe(false);
        expect(bad({ days: [1, 1] }).ok).toBe(false);
        expect(bad({ days: [7] }).ok).toBe(false);
        expect(bad({ windows: [{ start_time: "09:00", end_time: "10:00" }, { start_time: "09:30", end_time: "11:00" }] }).ok).toBe(false);
        expect(bad({ windows: [{ start_time: "10:00", end_time: "09:00" }] }).ok).toBe(false);
        expect(bad({ windows: [{ start_time: "09:00", end_time: "09:15" }] }).ok).toBe(false); // shorter than one tour
        expect(bad({ timezone: "PST" }).ok).toBe(false);
        expect(bad({ timezone: "Mars/Olympus" }).ok).toBe(false);
        expect(bad({ name: "  " }).ok).toBe(false);
        expect(validateTourScheduleDraft({ ...WEEKDAY_TOURS, id: "x" }).ok).toBe(false);
        expect(validateTourScheduleDraft(WEEKDAY_TOURS).ok).toBe(true);
    });
});

describe("S3-A — editing one schedule reconciles only its own rules", () => {
    const members = asRules(expandTourScheduleToRuleValues(WEEKDAY_TOURS, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));

    it("unchanged weekday × window pairs keep their rule ids; removed ones are deleted; new ones inserted", () => {
        // Drop Friday, add Saturday, move nothing else.
        const next = { ...WEEKDAY_TOURS, days: [1, 2, 3, 4, 6] };
        const plan = planTourScheduleReconcile(members, expandTourScheduleToRuleValues(next, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));
        const friday = members.filter((m) => m.day_of_week === 5).map((m) => m.id);
        expect(plan.deleteIds.sort()).toEqual(friday.sort());
        expect(plan.keepIds).toHaveLength(8);
        expect(plan.keepIds.some((id) => friday.includes(id))).toBe(false);
        expect(plan.insert.map((r) => r.day_of_week)).toEqual([6, 6]);
    });

    it("a settings-only edit inserts and deletes nothing", () => {
        const plan = planTourScheduleReconcile(
            members,
            expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, max_bookings_per_slot: 4 }, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE })
        );
        expect(plan.insert).toHaveLength(0);
        expect(plan.deleteIds).toHaveLength(0);
        expect(plan.keepIds).toHaveLength(10);
        expect(plan.sharedPatch.max_bookings_per_slot).toBe(4);
    });

    it("the plan can only name the members it was given — an unrelated rule is never in it", () => {
        const unrelated = asRules(
            expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, name: "Saturday open house", days: [6] }, { orgId: ORG, locationId: LOC, scheduleId: "other" })
        );
        const plan = planTourScheduleReconcile(members, expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, days: [1] }, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));
        const touched = new Set([...plan.keepIds, ...plan.deleteIds]);
        for (const u of unrelated) expect(touched.has(u.id)).toBe(false);
    });
});

describe("S3-B — duplicate copies configuration only", () => {
    it("the copy is a draft with no rule ids, no schedule id and nothing but configuration", () => {
        const rules = asRules(expandTourScheduleToRuleValues(WEEKDAY_TOURS, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));
        const [group] = groupTourRulesIntoSchedules(rules, LOC);
        const copy = duplicateTourScheduleDraft(group!);
        expect(copy.name).toBe("Copy of Weekday tours");
        expect(Object.keys(copy).sort()).toEqual(
            ["approval_required", "buffer_minutes", "days", "is_active", "max_bookings_per_slot", "name", "slot_duration_minutes", "timezone", "windows"].sort()
        );
        expect(JSON.stringify(copy)).not.toContain("rule-");
        expect(JSON.stringify(copy)).not.toContain(SCHEDULE);
        const { name: _n, ...configCopy } = copy;
        const { name: _o, ...configOriginal } = WEEKDAY_TOURS;
        expect(configCopy).toEqual(configOriginal);
        // Saved, it becomes rows of rule columns only — no booking, token, reminder or history field.
        const rows = expandTourScheduleToRuleValues(copy, { orgId: ORG, locationId: LOC, scheduleId: "new" });
        for (const r of rows) {
            expect(Object.keys(r).sort()).toEqual(
                ["approval_required", "buffer_minutes", "day_of_week", "end_time", "is_active", "location_id", "max_bookings_per_slot", "metadata", "org_id", "slot_duration_minutes", "start_time", "timezone"].sort()
            );
        }
    });
});

describe("S3-C / D-T6 — weekday organization and inherited availability", () => {
    const local = asRules(expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, days: [1] }, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE }));
    const orgWide = asRules(
        expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, name: "Saturday open house", days: [6], windows: [{ start_time: "10:00", end_time: "12:00" }] }, { orgId: ORG, locationId: null, scheduleId: "org-sched" })
    );
    const legacy: TourRuleForAuthoring = {
        id: "legacy-1", location_id: LOC, day_of_week: 3, start_time: "13:00:00", end_time: "14:00:00", timezone: "America/Los_Angeles",
        slot_duration_minutes: 60, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: true, is_active: true, metadata: {},
    };

    it("organization-wide rules are shown at a location, labelled inherited; local ones are not", () => {
        const groups = groupTourRulesIntoSchedules([...local, ...orgWide, legacy], LOC);
        const byName = Object.fromEntries(groups.map((g) => [g.name, g]));
        expect(byName["Saturday open house"]!.inherited).toBe(true);
        expect(byName["Weekday tours"]!.inherited).toBe(false);
        expect(byName["Wednesday window"]!.inherited).toBe(false);
        expect(byName["Wednesday window"]!.scheduleId).toBeNull();
        // At organization scope nothing is inherited.
        expect(groupTourRulesIntoSchedules(orgWide, null).every((g) => !g.inherited)).toBe(true);
    });

    it("the week reads Monday first, each day in time order, including inherited windows", () => {
        const week = buildTourWeekdayView(groupTourRulesIntoSchedules([...local, ...orgWide, legacy], LOC));
        expect(week.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(week[0]!.entries.map((e) => e.start_time)).toEqual(["08:30:00", "14:30:00"]);
        expect(week[2]!.entries.map((e) => e.scheduleName)).toEqual(["Wednesday window"]);
        expect(week[5]!.entries).toHaveLength(1);
        expect(week[5]!.entries[0]!.inherited).toBe(true);
        expect(week[6]!.entries).toHaveLength(0);
    });

    it("the inherited org-wide rules really do contribute slots at the location (why they must be shown)", () => {
        const slots = computeSlotsFromRulesAndBookings(orgWide as TourAvailabilityRuleRow[], [], {
            locationId: LOC,
            fromUtc: new Date("2027-01-16T08:00:00Z"),
            toUtc: new Date("2027-01-17T08:00:00Z"),
        });
        expect(slots.length).toBe(4);
        expect(slots.every((s) => s.locationId === LOC)).toBe(true);
    });
});

describe("Overlapping availability — offered once, never overbooked", () => {
    const rule = (id: string, patch: Partial<TourAvailabilityRuleRow> = {}): TourAvailabilityRuleRow => ({
        id, org_id: ORG, location_id: LOC, user_id: null, day_of_week: 1, start_time: "09:00:00", end_time: "10:00:00",
        timezone: "UTC", slot_duration_minutes: 60, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: false, is_active: true,
        ...patch,
    });
    const range = { locationId: LOC, fromUtc: new Date("2027-01-11T00:00:00Z"), toUtc: new Date("2027-01-12T00:00:00Z") };

    it("two rules covering the same time offer it once", () => {
        const slots = computeSlotsFromRulesAndBookings([rule("a"), rule("b", { location_id: null })], [], range);
        expect(slots).toHaveLength(1);
    });

    it("the merged time is attributed to the approval-required rule, whichever order the rules arrive in", () => {
        for (const order of [["auto", "strict"], ["strict", "auto"]]) {
            const rules = order.map((id) => rule(id, { approval_required: id === "strict" }));
            const [slot] = computeSlotsFromRulesAndBookings(rules, [], range);
            expect(slot!.ruleId).toBe("strict");
        }
    });

    it("capacity is the most generous rule's, and one booking counts against it once", () => {
        const booking: TourBookingOverlapRow = { id: "bk", location_id: LOC, start_at: "2027-01-11T09:00:00Z", end_at: "2027-01-11T10:00:00Z", status_key: "confirmed" };
        const [slot] = computeSlotsFromRulesAndBookings([rule("a", { max_bookings_per_slot: 1 }), rule("b", { max_bookings_per_slot: 3 })], [booking], range);
        expect(slot!.capacity).toBe(3);
        expect(slot!.remainingCapacity).toBe(2);
    });

    it("a partially overlapping window sees the other's booking — no overbooking across rules", () => {
        const booking: TourBookingOverlapRow = { id: "bk", location_id: LOC, start_at: "2027-01-11T09:00:00Z", end_at: "2027-01-11T10:00:00Z", status_key: "confirmed" };
        const slots = computeSlotsFromRulesAndBookings(
            [rule("a"), rule("b", { start_time: "09:30:00", end_time: "10:30:00" })],
            [booking],
            range
        );
        expect(slots).toHaveLength(0);
    });

    it("overlaps across schedules are reported to the operator", () => {
        const desired = expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, days: [1] }, { orgId: ORG, locationId: LOC, scheduleId: "x" });
        const other = { ...rule("o", { start_time: "10:00:00", end_time: "11:00:00" }), metadata: { tour_schedule: { id: "y", name: "Morning" } } };
        const overlaps = findTourScheduleOverlaps(desired, [other]);
        expect(overlaps).toHaveLength(1);
        expect(overlaps[0]!.otherName).toBe("Morning");
    });
});

describe("S3-D — 12-hour times in the site's zone", () => {
    it("wall times read on a 12-hour clock", () => {
        expect(formatTourWallTime("08:30:00")).toBe("8:30 AM");
        expect(formatTourWallTime("14:30")).toBe("2:30 PM");
        expect(formatTourWallTime("00:15:00")).toBe("12:15 AM");
        expect(formatTourWallTime("12:00:00")).toBe("12:00 PM");
        expect(formatTourWallTimeRange("08:30:00", "10:30:00")).toBe("8:30 – 10:30 AM");
        expect(formatTourWallTimeRange("11:30:00", "13:00:00")).toBe("11:30 AM – 1:00 PM");
    });

    it("the same configured time is the same local time on both sides of a DST change", () => {
        const rules = asRules(
            expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, windows: [{ start_time: "08:30", end_time: "09:00" }] }, { orgId: ORG, locationId: LOC, scheduleId: SCHEDULE })
        );
        // US DST begins Sun 2027-03-14. Fri 03-12 is PST (UTC-8), Mon 03-15 is PDT (UTC-7).
        const slots = computeSlotsFromRulesAndBookings(rules, [], {
            locationId: LOC,
            fromUtc: new Date("2027-03-12T00:00:00Z"),
            toUtc: new Date("2027-03-16T00:00:00Z"),
        });
        expect(slots.map((s) => s.startAt)).toEqual(["2027-03-12T16:30:00.000Z", "2027-03-15T15:30:00.000Z"]);
        // Operator, editor and public page all say 8:30 AM for both.
        for (const s of slots) expect(formatTourInstantForOperator(s.startAt, s.timezone)).toMatch(/· 8:30 AM P[SD]T$/);
        expect(formatTourWallTime(rules[0]!.start_time)).toBe("8:30 AM");
    });

    it("a booking is shown in its own zone regardless of the process zone, with a 12-hour clock", () => {
        expect(formatTourInstantForOperator("2027-06-30T17:00:00Z", "America/New_York")).toBe("Wed, Jun 30, 2027 · 1:00 PM EDT");
        expect(formatTourInstantForOperator("2027-06-30T17:00:00Z", "America/Los_Angeles")).toBe("Wed, Jun 30, 2027 · 10:00 AM PDT");
    });

    it("free-text zones are refused", () => {
        expect(isValidTourTimeZone("America/Chicago")).toBe(true);
        expect(isValidTourTimeZone("UTC")).toBe(true);
        expect(isValidTourTimeZone("PST")).toBe(false);
        expect(isValidTourTimeZone("")).toBe(false);
    });
});

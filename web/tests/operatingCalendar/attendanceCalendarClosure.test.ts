/**
 * Attendance reads the Operating Calendar's full-day site closures — and nothing else.
 *
 *   - a calendar closure reads exactly like an Attendance site closure (`closed`)
 *   - it creates no attendance fact and turns no silence into an absence
 *   - a child who comes anyway is `attended_despite_plan`, as before
 *   - partial closures, modified hours and overridden org closures do not close a day
 *   - Attendance's own closures stay on their existing path (not double-read)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/location/timezoneResolution", () => ({
    resolveLocationTimezone: async () => ({ timezone: "America/Los_Angeles", source: "location_metadata", status: "resolved", warnings: [] }),
}));

import {
    applyObservedPresence,
    interpretServiceDay,
    raisesMissingArrivalAttention,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { closeOperatingGrain } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { loadCalendarSiteClosureForServiceDay } from "@/lib/operatingCalendar/operatingCalendarServer";
import { createCalendarEntry } from "@/lib/operatingCalendar/operatingCalendarCommands";
import { ACTOR, ORG, SITE_A, LA, common, draft, rowFrom } from "./operatingCalendarFixtures";
import { fakeSupabase } from "./fakeSupabase";

const KIDS = ["k1", "k2", "k3"];

describe("interpretServiceDay with a calendar closure", () => {
    it("every scheduled child reads closed, attributed to the calendar entry", () => {
        const rows = interpretServiceDay({
            siteLocationId: SITE_A,
            scheduledChildIds: KIDS,
            effective: [],
            calendarSiteClosure: { expectationId: "cal-1", reasonKey: "holiday_closure" },
        });
        expect(rows.map((r) => r.interpretation)).toEqual(["closed", "closed", "closed"]);
        expect(rows[0]).toMatchObject({ closedSubjectKind: "site", closedSubjectId: SITE_A, expectationId: "cal-1", reasonKey: "holiday_closure" });
    });

    it("a closed day raises no missing-arrival attention and invents no absence", () => {
        const [row] = interpretServiceDay({ siteLocationId: SITE_A, scheduledChildIds: ["k1"], effective: [], calendarSiteClosure: { expectationId: "c", reasonKey: null } });
        const state = applyObservedPresence(row!, "no_record");
        expect(state).toBe("closed");
        expect(raisesMissingArrivalAttention(state)).toBe(false);
    });

    it("a child who comes anyway is present, and visibly not what was planned", () => {
        const [row] = interpretServiceDay({ siteLocationId: SITE_A, scheduledChildIds: ["k1"], effective: [], calendarSiteClosure: { expectationId: "c", reasonKey: null } });
        expect(applyObservedPresence(row!, "present")).toBe("attended_despite_plan");
    });

    it("without a calendar closure nothing changes (the pre-calendar answer)", () => {
        const rows = interpretServiceDay({ siteLocationId: SITE_A, scheduledChildIds: KIDS, effective: [] });
        expect(rows.map((r) => r.interpretation)).toEqual(["normal", "normal", "normal"]);
        expect(interpretServiceDay({ siteLocationId: SITE_A, scheduledChildIds: KIDS, effective: [], calendarSiteClosure: null })).toEqual(rows);
    });
});

describe("loadCalendarSiteClosureForServiceDay", () => {
    let tables: Record<string, Record<string, unknown>[]>;
    beforeEach(() => {
        tables = {
            locations: [{ id: SITE_A, org_id: ORG, location_type: "site", parent_location_id: null }],
            operational_expectations: [],
        };
    });
    const read = (date: string) => loadCalendarSiteClosureForServiceDay(fakeSupabase(tables), { orgId: ORG, siteLocationId: SITE_A, serviceDate: date });

    it("an organization holiday closure closes the site's service date", async () => {
        const row = rowFrom(createCalendarEntry(draft({ scope: "organization", locationId: null, name: "Christmas", reasonKey: "holiday_closure" }), common(LA)));
        tables.operational_expectations!.push(row as never);
        expect(await read("2026-12-25")).toEqual({ expectationId: row.id, reasonKey: "holiday_closure" });
        expect(await read("2026-12-24")).toBeNull();
    });

    it("partial closures and modified hours never close a child's day", async () => {
        tables.operational_expectations!.push(
            rowFrom(createCalendarEntry(draft({ effect: "partial_closure", startTime: "12:00", endTime: "15:00" }), common())) as never,
            rowFrom(createCalendarEntry(draft({ effect: "modified_hours", startTime: "09:00", endTime: "13:00", fromDate: "2026-12-26", toDate: "2026-12-26" }), common())) as never,
        );
        expect(await read("2026-12-25")).toBeNull();
        expect(await read("2026-12-26")).toBeNull();
    });

    it("a location exception keeps the site open on an organization closure", async () => {
        tables.operational_expectations!.push(
            rowFrom(createCalendarEntry(draft({ scope: "organization", locationId: null }), common())) as never,
            rowFrom(createCalendarEntry(draft({ effect: "open_as_usual" }), common())) as never,
        );
        expect(await read("2026-12-25")).toBeNull();
    });

    it("Attendance's own site closure is NOT returned — the roster reads it on its existing path", async () => {
        tables.operational_expectations!.push(
            rowFrom(closeOperatingGrain({ idempotencyKey: "x", actorUserId: ACTOR, reasonKey: "other", grainKind: "site", grainId: SITE_A, range: { fromDate: "2026-12-25" } })) as never,
        );
        expect(await read("2026-12-25")).toBeNull();
    });
});

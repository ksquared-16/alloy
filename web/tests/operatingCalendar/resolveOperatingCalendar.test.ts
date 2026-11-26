import { describe, expect, it } from "vitest";
import {
    createCalendarEntry,
    checkWallTimesExist,
    reviseCalendarEntry,
    withdrawCalendarEntry,
} from "@/lib/operatingCalendar/operatingCalendarCommands";
import {
    isInstantIntervalOperating,
    resolveOperatingCalendar,
} from "@/lib/operatingCalendar/resolveOperatingCalendar";
import { localDateOf } from "@/lib/operatingCalendar/operatingCalendarTime";
import { closeOperatingGrain, reopenOperatingGrain } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { ACTOR, ORG, OTHER_ORG, SITE_A, SITE_B, ROOM_A1, LA, NY, common, draft, rowFrom } from "./operatingCalendarFixtures";

function resolve(rows: ExpectationQueryRow[], from: string, to: string, opts: { site?: string; tz?: string } = {}) {
    return resolveOperatingCalendar({
        orgId: ORG,
        siteId: opts.site ?? SITE_A,
        timezone: opts.tz ?? LA,
        fromDate: from,
        toDate: to,
        rows,
    });
}

const at = (iso: string) => new Date(iso);

describe("Operating Calendar — designation is not effect", () => {
    it("a holiday that does not close the location labels the day and changes nothing", () => {
        const row = rowFrom(
            createCalendarEntry(
                draft({ scope: "organization", locationId: null, name: "Presidents' Day", designation: "holiday", effect: "none", fromDate: "2027-02-15", toDate: "2027-02-15" }),
                common(LA),
            ),
        );
        const day = resolve([row], "2027-02-15", "2027-02-15").get("2027-02-15")!;
        expect(day.status).toBe("open");
        expect(day.openIntervals).toBeNull();
        expect(day.designations.map((d) => d.name)).toEqual(["Presidents' Day"]);
        expect(day.applied).toEqual([]);
    });

    it("a holiday closure is explicit: same name, effect closed", () => {
        const row = rowFrom(createCalendarEntry(draft({ name: "Christmas", designation: "holiday", effect: "closed" }), common()));
        const day = resolve([row], "2026-12-25", "2026-12-25").get("2026-12-25")!;
        expect(day.status).toBe("closed");
        expect(day.closedAllDay).toBe(true);
        expect(day.applied[0]!.name).toBe("Christmas");
    });
});

describe("Operating Calendar — closures", () => {
    it("single-day closure closes that local date only", () => {
        const row = rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-25", toDate: "2026-12-25" }), common()));
        const days = resolve([row], "2026-12-24", "2026-12-26");
        expect(days.get("2026-12-24")!.status).toBe("open");
        expect(days.get("2026-12-25")!.status).toBe("closed");
        expect(days.get("2026-12-26")!.status).toBe("open");
    });

    it("a five-day closure is ONE row covering every date inclusive", () => {
        const input = createCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-25" }), common());
        const row = rowFrom(input);
        const days = resolve([row], "2026-12-20", "2026-12-26");
        expect([...days.values()].filter((d) => d.status === "closed").map((d) => d.date)).toEqual([
            "2026-12-21",
            "2026-12-22",
            "2026-12-23",
            "2026-12-24",
            "2026-12-25",
        ]);
        // The frame runs local midnight to local midnight after the last day (PST = UTC-8).
        expect(input.temporalFrame.validFrom).toBe("2026-12-21T08:00:00.000Z");
        expect(input.temporalFrame.validTo).toBe("2026-12-26T08:00:00.000Z");
    });

    it("a partial closure removes only the overlapping interval", () => {
        const row = rowFrom(
            createCalendarEntry(draft({ effect: "partial_closure", startTime: "12:00", endTime: "15:00", fromDate: "2027-01-12", toDate: "2027-01-12" }), common()),
        );
        const days = resolve([row], "2027-01-11", "2027-01-13");
        const day = days.get("2027-01-12")!;
        expect(day.status).toBe("modified");
        expect(day.openIntervals).toEqual([
            { start: 0, end: 720 },
            { start: 900, end: 1440 },
        ]);
        // 10:00–11:00 PST is 18:00–19:00Z; 13:00–14:00 PST is 21:00–22:00Z.
        expect(isInstantIntervalOperating(days, LA, at("2027-01-12T18:00:00Z"), at("2027-01-12T19:00:00Z"))).toBe(true);
        expect(isInstantIntervalOperating(days, LA, at("2027-01-12T21:00:00Z"), at("2027-01-12T22:00:00Z"))).toBe(false);
        // A slot straddling the closure start is removed too.
        expect(isInstantIntervalOperating(days, LA, at("2027-01-12T19:30:00Z"), at("2027-01-12T20:30:00Z"))).toBe(false);
        // Ending exactly when the closure starts is fine (half-open).
        expect(isInstantIntervalOperating(days, LA, at("2027-01-12T19:00:00Z"), at("2027-01-12T20:00:00Z"))).toBe(true);
    });

    it("modified hours keep only what lies wholly inside them", () => {
        const row = rowFrom(
            createCalendarEntry(
                draft({ effect: "modified_hours", designation: "modified_hours", startTime: "09:00", endTime: "13:00", fromDate: "2026-12-24", toDate: "2026-12-24" }),
                common(),
            ),
        );
        const days = resolve([row], "2026-12-23", "2026-12-25");
        expect(days.get("2026-12-24")!.openIntervals).toEqual([{ start: 540, end: 780 }]);
        // 09:00–10:00 PST in, 12:30–13:30 straddles the close, 14:00 is after.
        expect(isInstantIntervalOperating(days, LA, at("2026-12-24T17:00:00Z"), at("2026-12-24T18:00:00Z"))).toBe(true);
        expect(isInstantIntervalOperating(days, LA, at("2026-12-24T20:30:00Z"), at("2026-12-24T21:30:00Z"))).toBe(false);
        expect(isInstantIntervalOperating(days, LA, at("2026-12-24T22:00:00Z"), at("2026-12-24T23:00:00Z"))).toBe(false);
        // The day before is untouched.
        expect(isInstantIntervalOperating(days, LA, at("2026-12-23T22:00:00Z"), at("2026-12-23T23:00:00Z"))).toBe(true);
    });
});

describe("Operating Calendar — organization defaults and location overrides", () => {
    const orgClosure = () =>
        rowFrom(
            createCalendarEntry(
                draft({ scope: "organization", locationId: null, name: "Thanksgiving", designation: "holiday", effect: "closed", fromDate: "2026-11-26", toDate: "2026-11-27" }),
                common(LA),
            ),
        );

    it("every location inherits an organization closure", () => {
        const row = orgClosure();
        expect(resolve([row], "2026-11-26", "2026-11-26").get("2026-11-26")!.governingScope).toBe("organization");
        expect(resolve([row], "2026-11-26", "2026-11-26", { site: SITE_B, tz: NY }).get("2026-11-26")!.status).toBe("closed");
    });

    it("an explicit location exception overrides the organization default at that location only", () => {
        const org = orgClosure();
        const exception = rowFrom(
            createCalendarEntry(draft({ name: "Open Friday", designation: "other", effect: "open_as_usual", fromDate: "2026-11-27", toDate: "2026-11-27" }), common()),
        );
        const a = resolve([org, exception], "2026-11-26", "2026-11-27");
        expect(a.get("2026-11-26")!.status).toBe("closed");
        expect(a.get("2026-11-27")!.status).toBe("open");
        expect(a.get("2026-11-27")!.governingScope).toBe("location");
        expect(a.get("2026-11-27")!.overridden.map((e) => e.name)).toEqual(["Thanksgiving"]);
        // Site B never sees site A's exception.
        const b = resolve([org, exception], "2026-11-27", "2026-11-27", { site: SITE_B, tz: NY });
        expect(b.get("2026-11-27")!.status).toBe("closed");
    });

    it("a location's modified hours replace inherited organization hours, not intersect them", () => {
        const orgHours = rowFrom(
            createCalendarEntry(
                draft({ scope: "organization", locationId: null, effect: "modified_hours", startTime: "08:00", endTime: "12:00", fromDate: "2026-12-31", toDate: "2026-12-31" }),
                common(LA),
            ),
        );
        const local = rowFrom(createCalendarEntry(draft({ effect: "modified_hours", startTime: "10:00", endTime: "16:00", fromDate: "2026-12-31", toDate: "2026-12-31" }), common()));
        expect(resolve([orgHours, local], "2026-12-31", "2026-12-31").get("2026-12-31")!.openIntervals).toEqual([{ start: 600, end: 960 }]);
        expect(resolve([orgHours], "2026-12-31", "2026-12-31", { site: SITE_B, tz: NY }).get("2026-12-31")!.openIntervals).toEqual([
            { start: 480, end: 720 },
        ]);
    });

    it("precedence does not depend on authoring or query order", () => {
        const org = orgClosure();
        const exception = rowFrom(
            createCalendarEntry(draft({ effect: "open_as_usual", fromDate: "2026-11-27", toDate: "2026-11-27" }), common()),
        );
        const forward = resolve([org, exception], "2026-11-27", "2026-11-27").get("2026-11-27")!;
        const backward = resolve([exception, org], "2026-11-27", "2026-11-27").get("2026-11-27")!;
        expect(backward).toEqual(forward);
    });

    it("contradictions inside one scope resolve restrictively AND surface as conflicts", () => {
        const h1 = rowFrom(createCalendarEntry(draft({ effect: "modified_hours", startTime: "08:00", endTime: "14:00" }), common()));
        const h2 = rowFrom(createCalendarEntry(draft({ effect: "modified_hours", startTime: "10:00", endTime: "17:00" }), common()));
        const day = resolve([h1, h2], "2026-12-25", "2026-12-25").get("2026-12-25")!;
        expect(day.openIntervals).toEqual([{ start: 600, end: 840 }]);
        expect(day.conflicts.length).toBe(1);

        const closed = rowFrom(createCalendarEntry(draft({ effect: "closed" }), common()));
        const open = rowFrom(createCalendarEntry(draft({ effect: "open_as_usual" }), common()));
        const both = resolve([closed, open], "2026-12-25", "2026-12-25").get("2026-12-25")!;
        expect(both.status).toBe("closed");
        expect(both.conflicts[0]).toMatch(/closure is used/);
    });
});

describe("Operating Calendar — scope isolation", () => {
    it("another site's entry never reaches this site", () => {
        const row = rowFrom(createCalendarEntry(draft({ locationId: SITE_B }), common(NY)));
        expect(resolve([row], "2026-12-25", "2026-12-25").get("2026-12-25")!.status).toBe("open");
    });

    it("another organization's rows are ignored even when handed in", () => {
        const foreign = rowFrom(
            createCalendarEntry(draft({ scope: "organization", locationId: null }), { ...common(), orgId: OTHER_ORG }),
            { orgId: OTHER_ORG },
        );
        expect(resolve([foreign], "2026-12-25", "2026-12-25").get("2026-12-25")!.status).toBe("open");
    });

    it("a room closure recorded in Attendance closes the room, never the site", () => {
        const room = rowFrom(
            closeOperatingGrain({
                idempotencyKey: "room-1",
                actorUserId: ACTOR,
                reasonKey: "maintenance",
                grainKind: "operational_group",
                grainId: ROOM_A1,
                range: { fromDate: "2026-12-22" },
            }),
        );
        const day = resolve([room], "2026-12-22", "2026-12-22").get("2026-12-22")!;
        expect(day.status).toBe("open");
        expect(day.roomClosures.map((r) => r.roomId)).toEqual([ROOM_A1]);
    });
});

describe("Operating Calendar — Attendance's existing closures keep their meaning", () => {
    it("a site closure recorded in Attendance closes its service date (stored UTC day, read as that date)", () => {
        const legacy = rowFrom(
            closeOperatingGrain({
                idempotencyKey: "legacy-1",
                actorUserId: ACTOR,
                reasonKey: "weather_closure",
                grainKind: "site",
                grainId: SITE_A,
                range: { fromDate: "2027-01-05" },
            }),
        );
        const days = resolve([legacy], "2027-01-04", "2027-01-06");
        expect(days.get("2027-01-04")!.status).toBe("open");
        expect(days.get("2027-01-05")!.status).toBe("closed");
        expect(days.get("2027-01-05")!.applied[0]!.source).toBe("attendance");
        expect(days.get("2027-01-06")!.status).toBe("open");
    });

    it("reopening it in Attendance reopens it here", () => {
        const legacy = rowFrom(
            closeOperatingGrain({ idempotencyKey: "l2", actorUserId: ACTOR, reasonKey: "other", grainKind: "site", grainId: SITE_A, range: { fromDate: "2027-01-05" } }),
        );
        const reopen = rowFrom(
            reopenOperatingGrain({
                idempotencyKey: "l3",
                actorUserId: ACTOR,
                reasonKey: "other",
                grainKind: "site",
                grainId: SITE_A,
                range: { fromDate: "2027-01-05" },
                predecessorId: legacy.id,
            }),
            { root: legacy.id },
        );
        expect(resolve([legacy, reopen], "2027-01-05", "2027-01-05").get("2027-01-05")!.status).toBe("open");
    });
});

describe("Operating Calendar — location time", () => {
    it("local midnight is the location's, not UTC's", () => {
        const days = resolve([rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-25", toDate: "2026-12-25" }), common(LA)))], "2026-12-24", "2026-12-26");
        // 23:30 on Dec 24 in Los Angeles is 07:30Z on Dec 25 — still the 24th there.
        expect(localDateOf(at("2026-12-25T07:30:00Z"), LA)).toBe("2026-12-24");
        expect(isInstantIntervalOperating(days, LA, at("2026-12-25T07:00:00Z"), at("2026-12-25T07:59:00Z"))).toBe(true);
        // 00:30 on Dec 25 local is closed.
        expect(isInstantIntervalOperating(days, LA, at("2026-12-25T08:30:00Z"), at("2026-12-25T09:30:00Z"))).toBe(false);
        // 23:30 on Dec 25 local (07:30Z Dec 26) is still closed; 00:30 Dec 26 local is open.
        expect(isInstantIntervalOperating(days, LA, at("2026-12-26T07:30:00Z"), at("2026-12-26T07:45:00Z"))).toBe(false);
        expect(isInstantIntervalOperating(days, LA, at("2026-12-26T08:30:00Z"), at("2026-12-26T09:00:00Z"))).toBe(true);
    });

    it("an interval crossing into a closed local day is not operating", () => {
        const days = resolve([rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-25", toDate: "2026-12-25" }), common(LA)))], "2026-12-24", "2026-12-26");
        expect(isInstantIntervalOperating(days, LA, at("2026-12-25T07:30:00Z"), at("2026-12-25T08:30:00Z"))).toBe(false);
    });

    it("modified hours keep their WALL time across the spring-forward change", () => {
        // 2027-03-14 is the US spring-forward day: 09:00 PDT = 16:00Z. A week earlier, 09:00 PST = 17:00Z.
        const row = rowFrom(
            createCalendarEntry(
                draft({ effect: "modified_hours", startTime: "09:00", endTime: "12:00", fromDate: "2027-03-07", toDate: "2027-03-14" }),
                common(LA),
            ),
        );
        const days = resolve([row], "2027-03-06", "2027-03-15");
        expect(isInstantIntervalOperating(days, LA, at("2027-03-14T16:00:00Z"), at("2027-03-14T17:00:00Z"))).toBe(true);
        expect(isInstantIntervalOperating(days, LA, at("2027-03-14T15:00:00Z"), at("2027-03-14T16:00:00Z"))).toBe(false);
        expect(isInstantIntervalOperating(days, LA, at("2027-03-07T17:00:00Z"), at("2027-03-07T18:00:00Z"))).toBe(true);
        expect(isInstantIntervalOperating(days, LA, at("2027-03-07T16:00:00Z"), at("2027-03-07T17:00:00Z"))).toBe(false);
    });

    it("a closure on the fall-back day covers all 25 hours of it", () => {
        const input = createCalendarEntry(draft({ fromDate: "2026-11-01", toDate: "2026-11-01" }), common(LA));
        expect(Date.parse(input.temporalFrame.validTo!) - Date.parse(input.temporalFrame.validFrom)).toBe(25 * 3600_000);
        const days = resolve([rowFrom(input)], "2026-10-31", "2026-11-02");
        // 23:30 PST on Nov 1 is 07:30Z Nov 2.
        expect(isInstantIntervalOperating(days, LA, at("2026-11-02T07:30:00Z"), at("2026-11-02T07:45:00Z"))).toBe(false);
        expect(isInstantIntervalOperating(days, LA, at("2026-11-02T08:30:00Z"), at("2026-11-02T08:45:00Z"))).toBe(true);
    });

    it("a wall time that does not exist on a date is refused, naming the date", () => {
        const err = checkWallTimesExist(draft({ effect: "partial_closure", startTime: "02:30", endTime: "04:00", fromDate: "2027-03-13", toDate: "2027-03-15" }), LA);
        expect(err?.message).toMatch(/02:30 does not occur on 2027-03-14/);
        expect(checkWallTimesExist(draft({ effect: "partial_closure", startTime: "02:30", endTime: "04:00", fromDate: "2027-03-15", toDate: "2027-03-16" }), LA)).toBeNull();
    });

    it("an organization entry closes each location's OWN local date", () => {
        const row = rowFrom(createCalendarEntry(draft({ scope: "organization", locationId: null, fromDate: "2026-12-25", toDate: "2026-12-25" }), common(NY)));
        const la = resolve([row], "2026-12-24", "2026-12-26", { tz: LA });
        // 22:00 PST on Dec 24 is already the 25th in New York — but Los Angeles is open.
        expect(isInstantIntervalOperating(la, LA, at("2026-12-25T06:00:00Z"), at("2026-12-25T06:30:00Z"))).toBe(true);
        expect(la.get("2026-12-25")!.status).toBe("closed");
    });
});

describe("Operating Calendar — revision, withdrawal and history", () => {
    it("shortening a closure reopens the dropped days", () => {
        const c = rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-25" }), common()));
        const r = rowFrom(reviseCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-23" }), common(), { id: c.id, frameFromDate: "2026-12-21" }), { root: c.id });
        const days = resolve([c, r], "2026-12-21", "2026-12-25");
        expect([...days.values()].map((d) => d.status)).toEqual(["closed", "closed", "closed", "open", "open"]);
    });

    it("moving a closure LATER does not leave the original first days closed", () => {
        const c = rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-25" }), common()));
        const input = reviseCalendarEntry(draft({ fromDate: "2026-12-23", toDate: "2026-12-25" }), common(), { id: c.id, frameFromDate: "2026-12-21" });
        // The revision's frame starts where the original's did, so the fold leaves nothing behind.
        expect(input.temporalFrame.validFrom).toBe(c.valid_from);
        const r = rowFrom(input, { root: c.id });
        const days = resolve([c, r], "2026-12-21", "2026-12-25");
        expect([...days.values()].map((d) => d.status)).toEqual(["open", "open", "closed", "closed", "closed"]);
    });

    it("moving a closure EARLIER covers the new days", () => {
        const c = rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-23", toDate: "2026-12-25" }), common()));
        const r = rowFrom(reviseCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-22" }), common(), { id: c.id, frameFromDate: "2026-12-23" }), { root: c.id });
        const days = resolve([c, r], "2026-12-21", "2026-12-25");
        expect([...days.values()].map((d) => d.status)).toEqual(["closed", "closed", "open", "open", "open"]);
    });

    it("withdrawal reopens every date; restoring closes them again; history keeps every act", () => {
        const c = rowFrom(createCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-22" }), common()));
        const w = rowFrom(withdrawCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-22" }), common(), { id: c.id, frameFromDate: "2026-12-21" }), { root: c.id });
        expect([...resolve([c, w], "2026-12-21", "2026-12-22").values()].map((d) => d.status)).toEqual(["open", "open"]);
        const restored = rowFrom(reviseCalendarEntry(draft({ fromDate: "2026-12-21", toDate: "2026-12-22" }), common(), { id: w.id, frameFromDate: "2026-12-21" }), { root: c.id });
        expect([...resolve([c, w, restored], "2026-12-21", "2026-12-22").values()].map((d) => d.status)).toEqual(["closed", "closed"]);
        // Withdrawal is a revision, not a cancellation (which would fail closed).
        expect(w.transition_type).toBe("revision");
        expect(w.modality).toBe("intended");
    });

    it("a lineage the fold cannot resolve makes the day unresolved, and unresolved is never open", () => {
        const c = rowFrom(createCalendarEntry(draft({}), common()));
        const cancel = rowFrom({ ...createCalendarEntry(draft({}), common()), verb: "cancel", predecessorId: c.id }, { root: c.id });
        const days = resolve([c, cancel], "2026-12-25", "2026-12-25");
        expect(days.get("2026-12-25")!.status).toBe("unresolved");
        expect(isInstantIntervalOperating(days, LA, at("2026-12-25T18:00:00Z"), at("2026-12-25T19:00:00Z"))).toBe(false);
    });

    it("a date the caller did not resolve is not assumed open", () => {
        const days = resolve([], "2026-12-25", "2026-12-25");
        expect(isInstantIntervalOperating(days, LA, at("2026-12-27T18:00:00Z"), at("2026-12-27T19:00:00Z"))).toBe(false);
    });

    it("every act names its human author and lands proposed — no self-granted binding force", () => {
        const input = createCalendarEntry(draft({}), common());
        expect(input.authority).toEqual({ authorityKey: `user:${ACTOR}`, authorClass: "human" });
        expect(input.condition.typeKey).toBe("location.operating_calendar");
        expect(input.subjects).toEqual([{ kind: "site", ref: SITE_A }]);
        expect(createCalendarEntry(draft({ scope: "organization", locationId: null }), common()).subjects).toEqual([{ kind: "organization", ref: ORG }]);
    });
});

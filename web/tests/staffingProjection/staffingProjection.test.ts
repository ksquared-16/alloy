/**
 * The projection's semantics, against fixtures.
 *
 * Pure by construction, so these are the tests that can state a rule exactly:
 * a seeded database can show that a room came out short, but only a fixture can
 * show that it came out short FOR THE REASON the contract gives.
 *
 * The worked example is the anchor. It is small enough to reason about by hand
 * and it contains the failure the whole slice exists to remove — a coarse bucket
 * that reads adequate over an interval nobody was adequately staffed in.
 */
import { describe, expect, it } from "vitest";

import {
    buildStaffingProjectionDay,
    type ProjectionStaffInput,
} from "@/lib/staffingProjection/buildStaffingProjection";
import { deriveBoundaries, toInterval } from "@/lib/staffingProjection/staffingSegments";

const ORG = "org-1";
const SITE = "site-1";
const T1 = "room-toddler-1";
const T2 = "room-toddler-2";
const DATE = "2027-05-03";

function iv(start: string, end: string) {
    const v = toInterval(start, end);
    if (!v) throw new Error(`bad interval ${start}-${end}`);
    return v;
}

/** One staff member for every child and a fraction, i.e. 1:4. */
const ratio4 = () => ({ requiredStaff: 0, exceedsDefinedTiers: false });
function required4(_room: string | null, childCount: number) {
    return { requiredStaff: Math.ceil(childCount / 4), exceedsDefinedTiers: false };
}
/** A room with children but no tier that covers them. */
function requiredUnconfigured(_room: string | null, childCount: number) {
    return { requiredStaff: 0, exceedsDefinedTiers: childCount > 0 };
}

function child(id: string, room: string | null, start: string, end: string) {
    return {
        customerMemberId: id,
        agreementId: `agr-${id}`,
        assignmentId: `asg-${id}`,
        roomLocationId: room,
        intervals: [iv(start, end)],
        hoursKnown: true,
    };
}

function staff(
    name: string,
    room: string | null,
    start: string | null,
    end: string | null,
    extra: Partial<ProjectionStaffInput> = {}
): ProjectionStaffInput {
    return {
        employmentId: `emp-${name}`,
        personId: `per-${name}`,
        displayName: name,
        assignmentId: `asg-${name}`,
        baselineRoomLocationId: room,
        baselineIntervals: start && end ? [iv(start, end)] : [],
        baselineHoursKnown: Boolean(start && end),
        availability: { recorded: false, intervals: [] },
        coverage: [],
        presence: null,
        ...extra,
    };
}

function day(over: Partial<Parameters<typeof buildStaffingProjectionDay>[0]>) {
    return buildStaffingProjectionDay({
        orgId: ORG,
        siteLocationId: SITE,
        date: DATE,
        children: [],
        childActuals: [],
        staff: [],
        requiredStaffFor: required4,
        roomNameById: new Map([[T1, "Toddler 1"], [T2, "Toddler 2"]]),
        actualsObserved: true,
        ...over,
    });
}

function seg(d: ReturnType<typeof day>, room: string | null, start: string) {
    return d.segments.find((s) => s.roomLocationId === room && s.start === start);
}

// ───────────────────────────── the worked example ─────────────────────────────

const WORKED_CHILDREN = [
    ...Array.from({ length: 6 }, (_, i) => child(`morning-${i}`, T1, "08:00", "12:00")),
    ...Array.from({ length: 4 }, (_, i) => child(`fullday-${i}`, T1, "09:00", "16:00")),
];
const WORKED_STAFF = [
    staff("Alex", T1, "08:00", "10:00"),
    staff("Sam", T1, "08:30", "16:30"),
    staff("Jordan", T1, "10:00", "16:30"),
];

describe("boundary engine", () => {
    it("cuts the day exactly where the facts change", () => {
        const d = day({ children: WORKED_CHILDREN, staff: WORKED_STAFF });
        expect(d.boundaries).toEqual(["08:00", "08:30", "09:00", "10:00", "12:00", "16:00", "16:30"]);
    });

    it("is independent of the order the inputs arrive in", () => {
        const forward = deriveBoundaries([iv("08:00", "12:00"), iv("09:00", "16:00")]);
        const reverse = deriveBoundaries([iv("09:00", "16:00"), iv("08:00", "12:00")]);
        expect(forward).toEqual(reverse);
    });

    it("refuses an overnight interval rather than wrapping it", () => {
        expect(toInterval("22:00", "02:00")).toBeNull();
    });

    it("says no segments when the day has no timed facts", () => {
        expect(day({}).segments).toEqual([]);
    });
});

describe("the shortfalls a coarse bucket hides", () => {
    const d = day({ children: WORKED_CHILDREN, staff: WORKED_STAFF });

    it("08:00–08:30 is short: six children, Alex alone", () => {
        const s = seg(d, T1, "08:00")!;
        expect(s.end).toBe("08:30");
        expect(s.expectedChildCount).toBe(6);
        expect(s.requiredStaff).toBe(2);
        expect(s.plannedStaff.map((p) => p.displayName)).toEqual(["Alex"]);
        expect(s.plannedState).toBe("short");
        expect(s.shortfall).toBe(1);
    });

    it("08:30–09:00 is adequate", () => {
        const s = seg(d, T1, "08:30")!;
        expect(s.expectedChildCount).toBe(6);
        expect(s.requiredStaff).toBe(2);
        expect(s.plannedStaff).toHaveLength(2);
        expect(s.plannedState).toBe("sufficient");
    });

    it("09:00–10:00 is short: ten children need three, two are planned", () => {
        const s = seg(d, T1, "09:00")!;
        expect(s.expectedChildCount).toBe(10);
        expect(s.requiredStaff).toBe(3);
        expect(s.plannedStaff.map((p) => p.displayName)).toEqual(["Alex", "Sam"]);
        expect(s.plannedState).toBe("short");
        expect(s.shortfall).toBe(1);
    });

    it("10:00–12:00 is still short, with a different pair of staff", () => {
        const s = seg(d, T1, "10:00")!;
        expect(s.expectedChildCount).toBe(10);
        expect(s.plannedStaff.map((p) => p.displayName)).toEqual(["Jordan", "Sam"]);
        expect(s.plannedState).toBe("short");
    });

    it("never counts three staff at once, though three work that morning", () => {
        // The coarse-bucket error in one assertion: the AM window contains three
        // distinct people and a peak of ten children, which compares as adequate.
        const morning = d.segments.filter((s) => s.roomLocationId === T1 && s.start < "12:00");
        expect(Math.max(...morning.map((s) => s.plannedStaff.length))).toBe(2);
        const distinct = new Set(morning.flatMap((s) => s.plannedStaff.map((p) => p.employmentId)));
        expect(distinct.size).toBe(3);
        expect(morning.filter((s) => s.plannedState === "short")).toHaveLength(3);
    });

    it("12:00–16:00 is adequate once the morning children leave", () => {
        const s = seg(d, T1, "12:00")!;
        expect(s.expectedChildCount).toBe(4);
        expect(s.requiredStaff).toBe(1);
        expect(s.plannedState).toBe("sufficient");
    });

    it("does not double count at a handover boundary", () => {
        // Alex ends at 10:00 and Jordan starts at 10:00; half-open means the
        // 09:00 segment holds Alex and the 10:00 segment holds Jordan.
        expect(seg(d, T1, "09:00")!.plannedStaff.map((p) => p.displayName)).not.toContain("Jordan");
        expect(seg(d, T1, "10:00")!.plannedStaff.map((p) => p.displayName)).not.toContain("Alex");
    });
});

describe("planned place", () => {
    it("keeps a fixed-room person in their room", () => {
        const d = day({ children: [child("c1", T1, "08:00", "12:00")], staff: [staff("Alex", T1, "08:00", "12:00")] });
        const s = seg(d, T1, "08:00")!;
        expect(s.plannedStaff[0].source).toBe("assignment");
    });

    it("lets Coverage specialise the interval it names, and only that interval", () => {
        const d = day({
            children: [child("c1", T2, "08:00", "12:00")],
            staff: [
                staff("Alex", T1, "08:00", "12:00", {
                    coverage: [{ coverageId: "cov-T2", roomLocationId: T2, interval: iv("09:00", "10:00") }],
                }),
            ],
        });
        expect(seg(d, T1, "08:00")!.plannedStaff.map((p) => p.displayName)).toEqual(["Alex"]);
        expect(seg(d, T2, "09:00")!.plannedStaff[0].source).toBe("coverage");
        expect(seg(d, T1, "09:00")?.plannedStaff ?? []).toHaveLength(0);
        expect(seg(d, T1, "10:00")!.plannedStaff.map((p) => p.displayName)).toEqual(["Alex"]);
    });

    it("counts a site-level person with room Coverage once, in the room", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00")],
            staff: [
                staff("Float", null, "08:00", "12:00", {
                    coverage: [{ coverageId: "cov-T1", roomLocationId: T1, interval: iv("08:00", "12:00") }],
                }),
            ],
        });
        const inRoom = seg(d, T1, "08:00")!;
        expect(inRoom.plannedStaff).toHaveLength(1);
        expect(inRoom.plannedStaff[0].source).toBe("coverage");
        expect(inRoom.plannedStaff[0].baselineRoomLocationId).toBeNull();
        // And nowhere else. The site bucket holds their baseline, not a second body.
        expect(seg(d, null, "08:00")?.plannedStaff ?? []).toHaveLength(0);
        const everywhere = d.segments
            .filter((s) => s.start === "08:00")
            .flatMap((s) => s.plannedStaff.map((p) => p.employmentId));
        expect(everywhere).toEqual(["emp-Float"]);
    });

    it("leaves an uncovered float interval at the site rather than inventing a room", () => {
        const d = day({
            staff: [
                staff("Float", null, "08:00", "12:00", {
                    coverage: [{ coverageId: "cov-T1", roomLocationId: T1, interval: iv("08:00", "09:00") }],
                }),
            ],
        });
        expect(seg(d, T1, "08:00")!.plannedStaff).toHaveLength(1);
        expect(seg(d, null, "09:00")!.plannedStaff.map((p) => p.displayName)).toEqual(["Float"]);
        expect(seg(d, null, "09:00")!.plannedStaff[0].source).toBe("assignment");
    });

    it("does not plan a person whose Assignment records no hours", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00")],
            staff: [staff("Alex", T1, null, null)],
        });
        expect(seg(d, T1, "08:00")!.plannedStaff).toHaveLength(0);
        expect(d.unknowns).toContainEqual({
            code: "assignment_hours_unknown",
            assignmentId: "asg-Alex",
            personId: "per-Alex",
        });
    });
});

describe("available, and the difference it makes", () => {
    it("names someone available and planned nowhere as the way to fix a gap", () => {
        const d = day({
            children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
            staff: [
                staff("Alex", T1, "09:00", "10:00"),
                staff("Sam", T1, "09:00", "10:00"),
                staff("Jordan", T1, null, null, { availability: { recorded: true, intervals: [iv("09:00", "10:00")] } }),
            ],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.plannedState).toBe("short");
        expect(s.availableStaff.map((a) => a.displayName)).toEqual(["Jordan"]);
        expect(s.explanation.facts).toContainEqual({ code: "available_not_planned", names: ["Jordan"] });
        expect(s.explanation.lines).toContain(
            "Jordan is available but not planned anywhere during this interval"
        );
    });

    it("keeps an unavailable person out of the available pool without hiding them", () => {
        const d = day({
            children: [child("c1", T1, "09:00", "10:00")],
            staff: [staff("Alex", T1, "09:00", "10:00"), staff("Sam", null, null, null)],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.availableStaff).toHaveLength(0);
        expect(s.plannedStaff.map((p) => p.displayName)).toEqual(["Alex"]);
    });

    it("does not offer an already-planned person as free", () => {
        const d = day({
            children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
            staff: [
                staff("Alex", T1, "09:00", "10:00", { availability: { recorded: true, intervals: [iv("09:00", "10:00")] } }),
                staff("Sam", T2, "09:00", "10:00", { availability: { recorded: true, intervals: [iv("09:00", "10:00")] } }),
            ],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.plannedState).toBe("short");
        expect(s.explanation.facts.some((f) => f.code === "available_not_planned")).toBe(false);
    });
});

describe("actual is an observation, never a correction", () => {
    it("reports planned in one room and observed in another without rewriting either", () => {
        const d = day({
            staff: [
                staff("Alex", T1, "08:00", "12:00", {
                    presence: [{ roomLocationId: T2, interval: iv("08:00", "12:00") }],
                }),
            ],
        });
        expect(seg(d, T1, "08:00")!.plannedStaff.map((p) => p.displayName)).toEqual(["Alex"]);
        expect(seg(d, T1, "08:00")!.actualStaff).toHaveLength(0);
        expect(seg(d, T2, "08:00")!.actualStaff!.map((a) => a.displayName)).toEqual(["Alex"]);
        expect(seg(d, T1, "08:00")!.explanation.facts).toContainEqual({
            code: "planned_not_present",
            names: ["Alex"],
        });
        expect(seg(d, T2, "08:00")!.explanation.facts).toContainEqual({
            code: "present_not_planned",
            names: ["Alex"],
        });
    });

    it("keeps an expected child who never arrived distinct from one who did", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00"), child("c2", T1, "08:00", "12:00")],
            childActuals: [{ customerMemberId: "c2", roomLocationId: T1, interval: iv("08:00", "12:00") }],
            staff: [staff("Alex", T1, "08:00", "12:00")],
        });
        const s = seg(d, T1, "08:00")!;
        expect(s.expectedChildCount).toBe(2);
        expect(s.actualChildCount).toBe(1);
    });

    it("counts an unexpectedly present child without adding them to expected", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00")],
            childActuals: [
                { customerMemberId: "c1", roomLocationId: T1, interval: iv("08:00", "12:00") },
                { customerMemberId: "surprise", roomLocationId: T1, interval: iv("08:00", "12:00") },
            ],
            staff: [staff("Alex", T1, "08:00", "12:00")],
        });
        const s = seg(d, T1, "08:00")!;
        expect(s.expectedChildCount).toBe(1);
        expect(s.actualChildCount).toBe(2);
    });

    it("says unknown rather than idle for a day nothing has been observed about", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00")],
            staff: [staff("Alex", T1, "08:00", "12:00")],
            actualsObserved: false,
        });
        const s = seg(d, T1, "08:00")!;
        expect(s.actualState).toBe("unknown");
        expect(s.actualChildCount).toBeNull();
        expect(s.actualStaff).toBeNull();
        expect(d.unknowns).toContainEqual({ code: "actuals_not_observed", date: DATE });
    });
});

describe("states", () => {
    it("is unknown, not zero, when no ratio tier covers the occupancy", () => {
        const d = day({
            children: [child("c1", T1, "08:00", "12:00")],
            staff: [staff("Alex", T1, "08:00", "12:00")],
            requiredStaffFor: requiredUnconfigured,
        });
        const s = seg(d, T1, "08:00")!;
        expect(s.requiredStaff).toBeNull();
        expect(s.plannedState).toBe("unknown");
        expect(s.shortfall).toBeNull();
        expect(s.explanation.facts).toContainEqual({
            code: "required_unresolved",
            reason: "no_ratio_tier_covers_occupancy",
        });
    });

    it("is idle when a room has neither children nor staff planned in it", () => {
        // T2 carries an observation only, so the room exists but is not operating.
        const d = day({
            staff: [
                staff("Alex", T1, "08:00", "12:00", {
                    presence: [{ roomLocationId: T2, interval: iv("08:00", "12:00") }],
                }),
            ],
            requiredStaffFor: () => ratio4(),
        });
        const s = seg(d, T2, "08:00")!;
        expect(s.expectedChildCount).toBe(0);
        expect(s.plannedStaff).toHaveLength(0);
        expect(s.plannedState).toBe("idle");
        expect(s.explanation.facts).toContainEqual({ code: "no_demand" });
    });

    it("explains a gap deterministically, in the contract's own words", () => {
        const d = day({
            children: Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
            staff: [
                staff("Alex", T1, "09:00", "10:00"),
                staff("Sam", T1, "09:00", "10:00"),
                staff("Jordan", null, null, null, { availability: { recorded: true, intervals: [iv("09:00", "10:00")] } }),
            ],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.explanation.lines).toEqual([
            "Expected children: 10",
            "Actual children: 0",
            "Required staff: 3",
            "Baseline staff: Alex and Sam",
            "Planned staff: Alex and Sam",
            "Jordan is available but not planned anywhere during this interval",
            // Alex and Sam have nothing authored, so the projection says that
            // rather than implying the room is covered by people it cannot vouch for.
            "No availability is recorded for Alex and Sam",
            "Short 1 staff",
            "Alex and Sam are planned here but not observed present",
        ]);
    });

    it("counts a child with no recorded hours in no segment, and says so", () => {
        const d = day({
            children: [
                { ...child("c1", T1, "08:00", "12:00"), intervals: [], hoursKnown: false },
                child("c2", T1, "08:00", "12:00"),
            ],
            staff: [staff("Alex", T1, "08:00", "12:00")],
        });
        const s = seg(d, T1, "08:00")!;
        expect(s.expectedChildCount).toBe(1);
        expect(s.expectedChildrenUnknownHours).toHaveLength(1);
        expect(s.explanation.facts).toContainEqual({ code: "expected_children_unknown_hours", count: 1 });
        expect(d.unknowns).toContainEqual({
            code: "child_hours_unknown",
            assignmentId: "asg-c1",
            customerMemberId: "c1",
        });
    });
});

describe("the explanation reads as written", () => {
    it("agrees with itself about one child and about several", () => {
        const one = day({
            children: [{ ...child("c1", T1, "08:00", "12:00"), intervals: [], hoursKnown: false }],
            staff: [staff("Alex", T1, "08:00", "12:00")],
        });
        expect(seg(one, T1, "08:00")!.explanation.lines).toContain(
            "1 expected child has no recorded hours and is counted in no segment"
        );

        const several = day({
            children: [
                { ...child("c1", T1, "08:00", "12:00"), intervals: [], hoursKnown: false },
                { ...child("c2", T1, "08:00", "12:00"), intervals: [], hoursKnown: false },
            ],
            staff: [staff("Alex", T1, "08:00", "12:00")],
        });
        expect(seg(several, T1, "08:00")!.explanation.lines).toContain(
            "2 expected children have no recorded hours and are counted in no segment"
        );
    });
});

describe("a surface that shows Coverage can act on it", () => {
    it("names the allocation that placed them, so cancel and change have an id", () => {
        const d = day({
            staff: [
                staff("Alex", T1, "08:00", "12:00", {
                    coverage: [{ coverageId: "cov-abc", roomLocationId: T2, interval: iv("09:00", "10:00") }],
                }),
            ],
        });
        const moved = seg(d, T2, "09:00")!.plannedStaff[0];
        expect(moved.source).toBe("coverage");
        expect(moved.coverageId).toBe("cov-abc");
    });

    it("leaves the id off a placement the Assignment made, because there is none", () => {
        const d = day({ staff: [staff("Alex", T1, "08:00", "12:00")] });
        const planned = seg(d, T1, "08:00")!.plannedStaff[0];
        expect(planned.source).toBe("assignment");
        expect(planned.coverageId).toBeUndefined();
    });
});

describe("plan is not availability", () => {
    const tenChildren = Array.from({ length: 10 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00"));

    it("an explicitly unavailable person stays planned but stops covering", () => {
        const d = day({
            children: tenChildren,
            staff: [
                staff("Alex", T1, "09:00", "10:00", {
                    availability: { recorded: true, intervals: [], unavailableReason: "called_out" },
                }),
                staff("Sam", T1, "09:00", "10:00", {
                    availability: { recorded: true, intervals: [iv("09:00", "10:00")] },
                }),
                staff("Kit", T1, "09:00", "10:00", {
                    availability: { recorded: true, intervals: [iv("09:00", "10:00")] },
                }),
            ],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.requiredStaff).toBe(3);
        // The plan is preserved — erasing it would hide why the room is short.
        expect(s.plannedStaff.map((p) => p.displayName)).toEqual(["Alex", "Kit", "Sam"]);
        expect(s.effectivePlannedStaff.map((p) => p.displayName)).toEqual(["Kit", "Sam"]);
        expect(s.plannedState).toBe("short");
        expect(s.shortfall).toBe(1);
        expect(s.explanation.facts).toContainEqual({ code: "planned_but_unavailable", names: ["Alex"] });
        expect(s.explanation.lines).toContain(
            "Alex is planned here but unavailable during this interval"
        );
        const alex = s.plannedStaff.find((p) => p.displayName === "Alex")!;
        expect(alex.availability).toBe("unavailable");
        expect(alex.unavailableReason).toBe("called_out");
    });

    it("does not treat an unrecorded person as unavailable", () => {
        const d = day({
            children: Array.from({ length: 4 }, (_, i) => child(`c${i}`, T1, "09:00", "10:00")),
            staff: [staff("Alex", T1, "09:00", "10:00")],
        });
        const s = seg(d, T1, "09:00")!;
        expect(s.plannedStaff[0].availability).toBe("unknown");
        expect(s.effectivePlannedStaff).toHaveLength(1);
        expect(s.plannedState).toBe("sufficient");
    });

    it("never cancels or moves Coverage because someone became unavailable", () => {
        const d = day({
            children: tenChildren,
            staff: [
                staff("Alex", T1, "09:00", "10:00", {
                    coverage: [{ coverageId: "cov-1", roomLocationId: T1, interval: iv("09:00", "10:00") }],
                    availability: { recorded: true, intervals: [], unavailableReason: "called_out" },
                }),
            ],
        });
        const s = seg(d, T1, "09:00")!;
        const alex = s.plannedStaff[0];
        expect(alex.source).toBe("coverage");
        expect(alex.coverageId).toBe("cov-1");
        expect(alex.availability).toBe("unavailable");
        expect(s.effectivePlannedStaff).toHaveLength(0);
    });
});

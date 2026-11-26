/**
 * placement.room_fit — hard eligibility BEFORE ranking; age as of the proposed
 * effective date; capacity/headroom never overrides age or program; an ineligible
 * room is never rank 0 (never Recommended). Covers the required deterministic set.
 */
import { describe, expect, it } from "vitest";
import {
    ageInMonthsAsOf,
    computeRoomFit,
    DEFAULT_ROOM_FIT_POLICY,
    type RoomFitCandidate,
    type RoomFitRequest,
} from "@/lib/operationalCalculations/families/placement";

/** A fully-eligible candidate; override fields per case. */
function room(id: string, over: Partial<RoomFitCandidate> = {}): RoomFitCandidate {
    return {
        roomId: id,
        roomName: id,
        active: true,
        ageBand: null,
        programMatch: true,
        programKnown: true,
        continuity: false,
        scheduleEligible: true,
        withinOperatingWindow: true,
        capacityExceeded: false,
        occupancyAfter: 8,
        capacityHeadroom: null,
        ...over,
    };
}
function req(candidates: RoomFitCandidate[], over: Partial<RoomFitRequest> = {}): RoomFitRequest {
    return { asOf: "2026-08-24", childAgeMonths: 48, dobKnown: true, candidates, ...over };
}
const recommended = (entries: ReturnType<typeof computeRoomFit>["entries"]) => entries.find((e) => e.rank === 0) ?? null;

describe("ageInMonthsAsOf", () => {
    it("honours the day of month when computing whole months (ages in on the birthday)", () => {
        expect(ageInMonthsAsOf("2023-08-25", "2026-08-24")).toBe(35); // 1 day before the 3rd birthday
        expect(ageInMonthsAsOf("2023-08-24", "2026-08-24")).toBe(36); // exactly 3 years
        expect(ageInMonthsAsOf("2023-08-23", "2026-08-24")).toBe(36);
    });
    it("returns null for unknown/unparseable DOB (age cannot gate)", () => {
        expect(ageInMonthsAsOf(null, "2026-08-24")).toBeNull();
        expect(ageInMonthsAsOf("", "2026-08-24")).toBeNull();
    });
});

describe("computeRoomFit — hard eligibility before ranking", () => {
    it("child too young for Pre-K by the effective date is INELIGIBLE (never recommended)", () => {
        // Blake: 34 months old on Aug 24; Pre-K requires 36 months.
        const { entries } = computeRoomFit(
            req([room("prek", { ageBand: { minMonths: 36, maxMonths: 60 }, occupancyAfter: 3 })], { childAgeMonths: 34 }),
        );
        const prek = entries.find((e) => e.roomId === "prek")!;
        expect(prek.eligible).toBe(false);
        expect(prek.rank).toBeNull();
        expect(prek.ineligibleReasons.map((r) => r.ruleId)).toContain("age.min");
        expect(recommended(entries)).toBeNull();
    });

    it("child who AGES INTO Pre-K by the effective date is eligible", () => {
        // 35 months today, but turns 36 months on the Aug 24 start date.
        const { entries } = computeRoomFit(
            req([room("prek", { ageBand: { minMonths: 36, maxMonths: 60 } })], { childAgeMonths: 36 }),
        );
        const prek = entries.find((e) => e.roomId === "prek")!;
        expect(prek.eligible).toBe(true);
        expect(prek.explanation).toContain("Age eligible on Aug 24");
    });

    it("an INACTIVE room is ineligible", () => {
        const { entries } = computeRoomFit(req([room("closed", { active: false })]));
        const closed = entries.find((e) => e.roomId === "closed")!;
        expect(closed.eligible).toBe(false);
        expect(closed.ineligibleReasons.map((r) => r.ruleId)).toContain("room.active");
    });

    it("a room AT CAPACITY is ineligible", () => {
        const { entries } = computeRoomFit(req([room("full", { capacityExceeded: true })]));
        expect(entries.find((e) => e.roomId === "full")!.eligible).toBe(false);
    });

    it("a PROGRAM MISMATCH (known program) is ineligible", () => {
        const { entries } = computeRoomFit(req([room("wrong", { programMatch: false, programKnown: true })]));
        const wrong = entries.find((e) => e.roomId === "wrong")!;
        expect(wrong.eligible).toBe(false);
        expect(wrong.ineligibleReasons.map((r) => r.ruleId)).toContain("program.compatible");
    });

    it("multiple eligible rooms rank by headroom (lower resulting occupancy first)", () => {
        const { entries } = computeRoomFit(
            req([room("busy", { occupancyAfter: 11 }), room("open", { occupancyAfter: 6 }), room("mid", { occupancyAfter: 9 })]),
        );
        expect(recommended(entries)!.roomId).toBe("open");
        // recommended sorts first in display order
        expect(entries[0].roomId).toBe("open");
    });

    it("NO eligible room ⇒ nothing recommended", () => {
        const { entries, warnings } = computeRoomFit(
            req([room("a", { active: false }), room("b", { capacityExceeded: true })]),
        );
        expect(entries.every((e) => !e.eligible)).toBe(true);
        expect(recommended(entries)).toBeNull();
        expect(warnings.map((w) => w.code)).toContain("no_eligible_room");
    });

    it("capacity/headroom NEVER overrides age: an emptier but age-ineligible room loses to an eligible one", () => {
        const { entries } = computeRoomFit(
            req(
                [
                    room("prek_empty", { ageBand: { minMonths: 36, maxMonths: 60 }, occupancyAfter: 1 }),
                    room("toddler_busy", { ageBand: { minMonths: 18, maxMonths: 35 }, occupancyAfter: 10 }),
                ],
                { childAgeMonths: 30 }, // eligible for toddler, too young for Pre-K
            ),
        );
        expect(entries.find((e) => e.roomId === "prek_empty")!.eligible).toBe(false);
        expect(recommended(entries)!.roomId).toBe("toddler_busy");
    });

    it("fails OPEN on unknown DOB — age cannot gate, result is honest (incomplete + warning)", () => {
        const { entries, warnings } = computeRoomFit(
            req([room("prek", { ageBand: { minMonths: 36, maxMonths: 60 } })], { childAgeMonths: null, dobKnown: false }),
        );
        expect(entries.find((e) => e.roomId === "prek")!.eligible).toBe(true);
        expect(warnings.map((w) => w.code)).toContain("child_dob_unknown");
    });

    it("default policy leads with program, then continuity, then headroom", () => {
        expect(DEFAULT_ROOM_FIT_POLICY.factors).toEqual(["program_match", "continuity", "headroom"]);
    });

    it("prefers continuity when headroom/program do not distinguish eligible rooms", () => {
        const { entries } = computeRoomFit(
            req([room("new", { occupancyAfter: 8, continuity: false }), room("current", { occupancyAfter: 8, continuity: true })]),
        );
        expect(recommended(entries)!.roomId).toBe("current");
    });
});

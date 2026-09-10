/**
 * Assignment-scoped attendance capture.
 *
 * The narrowing exists because `attendance.record` plus site scope is the right
 * answer for a director and too much reach for a classroom educator: it
 * currently permits capturing for any child at the site, including rooms the
 * person has never worked in.
 *
 * These pin the two properties that make the narrowing safe rather than merely
 * present — that it is selected by a capability the actor HOLDS, so no roster
 * edit can silently change anyone's authority, and that every way of naming a
 * location is contained, including naming none at all.
 */
import { describe, expect, it } from "vitest";
import {
    assignedScopeCovers,
    type AssignedScopeResolution,
} from "@/lib/childcareOperational/attendance/assignedScopeCapture";

const ROOM_A = "11111111-1111-4111-8111-111111111111";
const ROOM_B = "22222222-2222-4222-8222-222222222222";
const SITE = "33333333-3333-4333-8333-333333333333";
const OTHER_SITE = "44444444-4444-4444-8444-444444444444";

const scope = (over: Partial<AssignedScopeResolution> = {}): AssignedScopeResolution => ({
    roomLocationIds: [ROOM_A],
    siteLocationIds: [],
    resolved: true,
    ...over,
});

describe("an assigned room is covered and an unassigned one is not", () => {
    it("allows capture in the assigned room", () => {
        expect(assignedScopeCovers({ scope: scope(), siteLocationId: SITE, roomLocationIds: [ROOM_A] }).ok).toBe(true);
    });

    it("denies capture in a room the person is not assigned to", () => {
        const r = assignedScopeCovers({ scope: scope(), siteLocationId: SITE, roomLocationIds: [ROOM_B] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("location_outside_assignment");
    });

    it("denies when ANY named room is outside, not merely when all are", () => {
        // A movement names a from-room and a to-room. Covering one is not
        // covering the fact — that would let a teacher move a child out of their
        // room into somewhere they hold no authority over.
        const r = assignedScopeCovers({ scope: scope(), siteLocationId: SITE, roomLocationIds: [ROOM_A, ROOM_B] });
        expect(r.ok).toBe(false);
    });
});

describe("a fact naming no room at all", () => {
    it("is denied when the person holds only room assignments", () => {
        // An absence names no room. Under the site-scoped policy the caller's
        // site scope contains it; under this one nothing would, so "name no
        // location" must not become the way past the narrowing.
        const r = assignedScopeCovers({ scope: scope(), siteLocationId: SITE, roomLocationIds: [] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("location_outside_assignment");
    });

    it("is allowed when the person is assigned to the whole site", () => {
        const r = assignedScopeCovers({
            scope: scope({ roomLocationIds: [], siteLocationIds: [SITE] }),
            siteLocationId: SITE,
            roomLocationIds: [],
        });
        expect(r.ok).toBe(true);
    });
});

describe("a site-wide staff commitment covers rooms inside it", () => {
    it("allows a room the person holds no explicit assignment to, at their assigned site", () => {
        // A floating or site-wide commitment is expressed in the same table as a
        // room one. Requiring an explicit room row would deny a genuinely
        // site-assigned staff member every room they legitimately cover.
        const r = assignedScopeCovers({
            scope: scope({ roomLocationIds: [], siteLocationIds: [SITE] }),
            siteLocationId: SITE,
            roomLocationIds: [ROOM_B],
        });
        expect(r.ok).toBe(true);
    });

    it("does not let a site assignment reach a room at another site", () => {
        const r = assignedScopeCovers({
            scope: scope({ roomLocationIds: [], siteLocationIds: [SITE] }),
            siteLocationId: OTHER_SITE,
            roomLocationIds: [ROOM_B],
        });
        expect(r.ok).toBe(false);
    });
});

describe("unknown is never permission", () => {
    it("denies when the assignment lookup failed", () => {
        // A failed read is not "assigned to nothing" and is certainly not
        // "assigned to everything". It is undecidable, and undecidable denies.
        const r = assignedScopeCovers({
            scope: { roomLocationIds: [], siteLocationIds: [], resolved: false },
            siteLocationId: SITE,
            roomLocationIds: [ROOM_A],
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("assignment_unresolved");
    });

    it("distinguishes an unresolved lookup from a genuinely empty roster", () => {
        const empty = assignedScopeCovers({
            scope: { roomLocationIds: [], siteLocationIds: [], resolved: true },
            siteLocationId: SITE,
            roomLocationIds: [ROOM_A],
        });
        expect(empty.ok).toBe(false);
        // Different causes get different codes so an operator debugging a denial
        // can tell "nobody assigned this teacher today" from "the query broke".
        if (!empty.ok) expect(empty.code).toBe("no_applicable_assignment");
    });
});

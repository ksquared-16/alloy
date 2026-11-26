/**
 * P0-7.6 PART 6 — EXACT SEMANTIC PARITY ORACLE for member-scoped expectation acquisition.
 *
 * The Attendance card asks a MEMBER-scoped question ("what is this child expected to do today?")
 * and the current acquisition answers it with SITE-scoped work: `loadOperationalExpectationInputs`
 * reads every operational agreement at the site, then every placement/assignment/pattern hanging
 * off them, and the card discards all but one row with a `.find()`. Measured on deployed: the
 * `expectations` phase is ~684-712ms across 5 queries to return 1 row.
 *
 * This oracle is written BEFORE any acquisition change, and it must keep passing after. It proves
 * the claim the repair rests on:
 *
 *   For the target member, `expandExpectedAttendance` returns BYTE-IDENTICAL entries whether it is
 *   given the whole site's rows or only that member's rows.
 *
 * Structural reason it holds: the expansion is a pure per-agreement loop keyed by
 * `agreement.id`, and `ExpectedAttendanceEntry` carries no cross-member field. Capacity, ratio and
 * occupancy ARE cross-member — and are separate outputs the Attendance card never reads.
 * This oracle pins that boundary so a future edit cannot quietly move a cross-member value into
 * the member-scoped entry.
 */
import { describe, expect, it } from "vitest";

import {
    expandExpectedAttendance,
    type OperationalAgreementInput,
    type OperationalAssignmentInput,
    type OperationalPlacementInput,
    type SchedulePatternInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";

const SITE = "site-1";
const TARGET = "member-target";
const DATE_START = "2026-09-21"; // Monday
const DATE_END = "2026-09-25";

/** Patterns are SHARED across members on purpose — narrowing must not depend on owning one. */
const PATTERNS: Array<[string, SchedulePatternInput]> = [
    ["pat-mwf", { id: "pat-mwf", weekdays: [1, 3, 5], schedule_type_key: "full_day" }],
    ["pat-all", { id: "pat-all", weekdays: [1, 2, 3, 4, 5], schedule_type_key: "full_day" }],
];

const agreement = (
    id: string,
    member: string,
    over: Partial<OperationalAgreementInput> = {},
): OperationalAgreementInput => ({
    id,
    customer_member_id: member,
    site_location_id: SITE,
    start_date: "2026-01-01",
    end_date: null,
    status: "active",
    ...over,
});

const assignment = (
    agreementId: string,
    patternId: string,
    over: Partial<OperationalAssignmentInput> = {},
): OperationalAssignmentInput => ({
    id: `asg-${agreementId}`,
    enrollment_agreement_id: agreementId,
    schedule_pattern_id: patternId,
    start_date: "2026-01-01",
    end_date: null,
    status: "active",
    ...over,
});

const placement = (
    agreementId: string,
    room: string | null,
    over: Partial<OperationalPlacementInput> = {},
): OperationalPlacementInput => ({
    enrollment_agreement_id: agreementId,
    room_location_id: room,
    program_category_id: "prog-1",
    start_date: "2026-01-01",
    end_date: null,
    status: "active",
    ...over,
});

/**
 * A site that exercises every branch the narrowing could disturb: the target sharing a room and a
 * pattern with peers, a peer with no assignment, a peer whose agreement is not operational, a
 * second agreement for the TARGET, and a peer whose assignment window excludes the range.
 */
function site() {
    const agreements = [
        agreement("agr-peer-1", "member-a"),
        agreement("agr-target-1", TARGET),
        agreement("agr-peer-2", "member-b"),
        agreement("agr-peer-noassign", "member-c"),
        agreement("agr-peer-ended", "member-d", { status: "terminated" }),
        agreement("agr-target-2", TARGET, { start_date: "2026-09-24" }),
        agreement("agr-peer-3", "member-e"),
    ];
    const assignments = [
        assignment("agr-peer-1", "pat-all"),
        assignment("agr-target-1", "pat-mwf"),
        assignment("agr-peer-2", "pat-mwf"),
        assignment("agr-peer-ended", "pat-all"),
        assignment("agr-target-2", "pat-all"),
        assignment("agr-peer-3", "pat-all", { start_date: "2030-01-01" }),
    ];
    const placements = [
        placement("agr-peer-1", "room-1"),
        placement("agr-target-1", "room-1"),
        placement("agr-peer-2", "room-1"),
        placement("agr-target-2", "room-2"),
        placement("agr-peer-3", "room-2"),
    ];
    return { agreements, assignments, placements };
}

/**
 * The narrowing the repair would perform, modelled exactly as the loader would:
 * agreements filtered to the member, then everything downstream keyed off the surviving ids.
 */
function narrowToMember(full: ReturnType<typeof site>, member: string) {
    const agreements = full.agreements.filter((a) => a.customer_member_id === member);
    const ids = new Set(agreements.map((a) => a.id));
    const assignments = full.assignments.filter((a) => ids.has(a.enrollment_agreement_id));
    const placements = full.placements.filter((p) => ids.has(p.enrollment_agreement_id));
    // The loader derives patternIds from the surviving assignments, so the narrowed map is smaller.
    const needed = new Set(assignments.map((a) => a.schedule_pattern_id));
    const patternsById = new Map(PATTERNS.filter(([id]) => needed.has(id)));
    return { agreements, assignments, placements, patternsById };
}

const run = (
    i: {
        agreements: readonly OperationalAgreementInput[];
        assignments: readonly OperationalAssignmentInput[];
        placements: readonly OperationalPlacementInput[];
        patternsById: ReadonlyMap<string, SchedulePatternInput>;
    },
) =>
    expandExpectedAttendance({
        dateStart: DATE_START,
        dateEnd: DATE_END,
        agreements: i.agreements,
        assignments: i.assignments,
        placements: i.placements,
        patternsById: i.patternsById,
    });

describe("member-scoped acquisition is byte-identical for the target member", () => {
    const full = site();
    const fullAll = run({ ...full, patternsById: new Map(PATTERNS) });
    const narrowed = run(narrowToMember(full, TARGET));

    it("the fixture actually exercises a multi-member site", () => {
        const members = new Set(fullAll.map((e) => e.customerMemberId));
        expect(members.size, "fixture must contain peers, or parity is untested").toBeGreaterThan(2);
        expect(fullAll.length).toBeGreaterThan(narrowed.length);
    });

    it("produces the SAME entries for the target — same order, same values", () => {
        const mine = fullAll.filter((e) => e.customerMemberId === TARGET);
        expect(mine.length, "the target must actually have expectations").toBeGreaterThan(0);
        expect(narrowed).toEqual(mine);
    });

    it("the card's own selection — one member, one date — is identical", () => {
        for (const date of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
            const a = fullAll.find((e) => e.customerMemberId === TARGET && e.date === date) ?? null;
            const b = narrowed.find((e) => e.customerMemberId === TARGET && e.date === date) ?? null;
            expect(b, `service day ${date} must agree`).toEqual(a);
        }
    });

    it("holds for EVERY member on the site, not just the one chosen", () => {
        for (const member of ["member-a", "member-b", "member-c", "member-d", "member-e", TARGET]) {
            const mine = fullAll.filter((e) => e.customerMemberId === member);
            expect(run(narrowToMember(full, member)), `${member} must agree`).toEqual(mine);
        }
    });

    it("a member with no operational expectation narrows to empty, not to a fabricated row", () => {
        // member-c has an agreement but no assignment; member-d's agreement is terminated.
        for (const member of ["member-c", "member-d"]) {
            expect(run(narrowToMember(full, member))).toEqual([]);
            expect(fullAll.filter((e) => e.customerMemberId === member)).toEqual([]);
        }
    });
});

describe("the entry carries no cross-member value — the boundary the repair depends on", () => {
    it("every field of a target entry is traceable to that member's own rows", () => {
        const full = site();
        const [entry] = run(narrowToMember(full, TARGET));
        expect(entry).toBeDefined();
        const mineAgreements = new Set(
            full.agreements.filter((a) => a.customer_member_id === TARGET).map((a) => a.id),
        );
        expect(mineAgreements.has(entry.agreementId)).toBe(true);
        expect(entry.customerMemberId).toBe(TARGET);
        expect(entry.siteLocationId).toBe(SITE);
        // No capacity/ratio/occupancy field may appear on the member-scoped entry: those are
        // genuinely cross-member and live on separate outputs the Attendance card never reads.
        for (const forbidden of ["capacity", "ratio", "occupancy", "childCount", "warning"]) {
            expect(Object.keys(entry), `${forbidden} must not be on a member-scoped entry`)
                .not.toContain(forbidden);
        }
    });
});

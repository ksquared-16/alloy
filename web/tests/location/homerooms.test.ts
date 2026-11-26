/**
 * V7-03 — the derived-homeroom contract. Every consumer (roster, Focus Panel via the scheduling
 * projection) calls `deriveHomerooms`, so these cases are the rule.
 */
import { describe, expect, it } from "vitest";

import { deriveHomerooms, homeroomLabel, type HomeroomAssignment, type HomeroomPlacement, type HomeroomSpace } from "@/lib/location/homerooms";
import { readAssignmentTypeBehavior, writeAssignmentTypeBehavior } from "@/lib/operationalAssignments/assignmentTypeBehavior";

const HOME = "cat-homeroom";
const PRIMARY_CLASSROOM = "cat-primary-classroom"; // not homeroom-providing unless an operator says so
const ENRICH = "cat-enrichment";
const DAY = "2026-11-10";

const space = (id: string, label: string, uses: string[] | null, unitRole: HomeroomSpace["unitRole"] = "operational_group", malformed = false): HomeroomSpace =>
    ({ id, label, unitRole, spaceUses: uses, spaceUsesMalformed: malformed });
const spaces = new Map<string, HomeroomSpace>([
    ["t2", space("t2", "Toddler 2", [HOME])],
    ["t3", space("t3", "Toddler 3", [HOME, ENRICH])],
    ["legacy", space("legacy", "Legacy Room", null)],
    ["primary-only", space("primary-only", "Primary-configured Room", [PRIMARY_CLASSROOM])],
    ["gym", space("gym", "Gym", [HOME, ENRICH], "shared_space")],
    ["bad", space("bad", "Malformed Room", [], "operational_group", true)],
]);
const homeroomCategoryIds = new Set([HOME]);

let n = 0;
const a = (over: Partial<HomeroomAssignment>): HomeroomAssignment => ({
    id: over.id ?? `a${++n}`,
    subjectType: "child",
    commitmentKind: "committed",
    status: "active",
    startDate: "2026-09-01",
    endDate: null,
    roomLocationId: null,
    categoryId: null,
    enrollmentAgreementId: "ag-1",
    ...over,
});
const derive = (assignments: HomeroomAssignment[], onDate = DAY, placements?: HomeroomPlacement[]) =>
    deriveHomerooms({
        onDate,
        assignments,
        spacesById: spaces,
        homeroomCategoryIds,
        placementsByAgreement: placements ? new Map([["ag-1", placements]]) : undefined,
    });
const labels = (r: ReturnType<typeof derive>) => r.map((h) => h.spaceLabel);

describe("zero, one, many", () => {
    it("no qualifying assignment → zero", () => {
        expect(derive([])).toEqual([]);
    });
    it("one enrollment assignment in a Homeroom classroom → that classroom, with provenance", () => {
        const r = derive([a({ id: "p", roomLocationId: "t2" })]);
        expect(r).toEqual([
            { spaceId: "t2", spaceLabel: "Toddler 2", homeroomUseIds: [HOME], sources: [{ assignmentId: "p", categoryId: null, spaceFrom: "assignment", startDate: "2026-09-01", endDate: null }] },
        ]);
    });
    it("two simultaneous classrooms → two homerooms (Toddler 2 + Toddler 3)", () => {
        expect(labels(derive([a({ roomLocationId: "t2" }), a({ roomLocationId: "t3", categoryId: HOME })]))).toEqual(["Toddler 2", "Toddler 3"]);
    });
    it("two schedules in the same homeroom → one space, both assignments as provenance", () => {
        const r = derive([a({ id: "x", roomLocationId: "t2" }), a({ id: "y", roomLocationId: "t2", categoryId: HOME })]);
        expect(r).toHaveLength(1);
        expect(r[0].sources.map((s) => s.assignmentId)).toEqual(["x", "y"]);
    });
});

describe("purpose and space", () => {
    it("homeroom plus enrichment → the homeroom only (Toddler 2 + Soccer Shots)", () => {
        expect(labels(derive([a({ roomLocationId: "t2" }), a({ roomLocationId: "t3", categoryId: ENRICH })]))).toEqual(["Toddler 2"]);
    });
    it("enrichment only → none, even in a classroom that provides Homeroom", () => {
        expect(derive([a({ roomLocationId: "t3", categoryId: ENRICH })])).toEqual([]);
    });
    it("a shared space never provides a homeroom, whatever it is configured for", () => {
        expect(derive([a({ roomLocationId: "gym", categoryId: HOME }), a({ roomLocationId: "gym" })])).toEqual([]);
    });
    it("an unconfigured legacy classroom gives none — missing Uses is not Homeroom", () => {
        expect(derive([a({ roomLocationId: "legacy" })])).toEqual([]);
    });
    it("primary_classroom is not Homeroom unless its category is flagged", () => {
        expect(derive([a({ roomLocationId: "primary-only", categoryId: PRIMARY_CLASSROOM })])).toEqual([]);
        expect(derive([a({ roomLocationId: "primary-only" })])).toEqual([]);
        const flagged = deriveHomerooms({ onDate: DAY, assignments: [a({ roomLocationId: "primary-only", categoryId: PRIMARY_CLASSROOM })], spacesById: spaces, homeroomCategoryIds: new Set([PRIMARY_CLASSROOM]) });
        expect(labels(flagged)).toEqual(["Primary-configured Room"]);
    });
    it("a malformed space never provides one", () => {
        expect(derive([a({ roomLocationId: "bad" })])).toEqual([]);
    });
    it("a categorized assignment needs ITS category to be the room's homeroom use", () => {
        const other = deriveHomerooms({ onDate: DAY, assignments: [a({ roomLocationId: "t2", categoryId: "cat-other-home" })], spacesById: spaces, homeroomCategoryIds: new Set([HOME, "cat-other-home"]) });
        expect(other).toEqual([]);
    });
    it("is_primary plays no part: a categorized non-homeroom row never qualifies, an uncategorized secondary without an agreement never qualifies", () => {
        expect(derive([a({ roomLocationId: "t2", categoryId: ENRICH })])).toEqual([]);
        expect(derive([a({ roomLocationId: "t2", enrollmentAgreementId: null })])).toEqual([]);
    });
    it("proposed planning rows and staff rows never yield a homeroom", () => {
        expect(derive([a({ roomLocationId: "t2", commitmentKind: "proposed" }), a({ roomLocationId: "t2", subjectType: "staff" })])).toEqual([]);
    });
});

describe("legacy enrollment assignment without its own room → its committed placement", () => {
    const placement = (over: Partial<HomeroomPlacement>): HomeroomPlacement => ({
        enrollmentAgreementId: "ag-1", roomLocationId: "t2", status: "active", startDate: "2026-09-01", endDate: null, ...over,
    });
    it("one placement in effect → its room, marked as coming from the placement", () => {
        const r = derive([a({ id: "p" })], DAY, [placement({})]);
        expect(r.map((h) => [h.spaceLabel, h.sources[0].spaceFrom])).toEqual([["Toddler 2", "placement"]]);
    });
    it("no resolvable placement → none (nothing fabricated)", () => {
        expect(derive([a({})], DAY, [])).toEqual([]);
        expect(derive([a({})], DAY, [placement({ status: "ended", endDate: "2026-10-31" })])).toEqual([]);
        expect(derive([a({})], DAY, [placement({ status: "canceled" })])).toEqual([]);
        expect(derive([a({})], DAY)).toEqual([]);
    });
    it("two different placement rooms in effect → ambiguous → none", () => {
        expect(derive([a({})], DAY, [placement({}), placement({ roomLocationId: "t3" })])).toEqual([]);
    });
    it("a categorized assignment never borrows the placement room", () => {
        expect(derive([a({ categoryId: HOME })], DAY, [placement({})])).toEqual([]);
    });
});

describe("dates and lifecycle", () => {
    const moveDay = "2026-12-01";
    const before = a({ id: "old", roomLocationId: "t2", status: "superseded", endDate: "2026-11-30" });
    const after = a({ id: "new", roomLocationId: "t3", categoryId: HOME, status: "planned", startDate: moveDay });
    it("historical, current and future dates resolve to their own set", () => {
        const current = a({ id: "cur", roomLocationId: "t2", endDate: "2026-11-30" });
        expect(labels(derive([current, after], "2026-10-01"))).toEqual(["Toddler 2"]);
        expect(labels(derive([current, after], "2026-11-30"))).toEqual(["Toddler 2"]); // inclusive end
        expect(labels(derive([current, after], moveDay))).toEqual(["Toddler 3"]); // inclusive start
        expect(derive([current, after], "2026-08-31")).toEqual([]);
    });
    it("a supersession: the old room until the day before the move, the new room from it — never both, never neither", () => {
        expect(labels(derive([before, after], "2026-10-01"))).toEqual(["Toddler 2"]); // history
        expect(labels(derive([before, after], "2026-11-30"))).toEqual(["Toddler 2"]); // the gap before a planned move
        expect(labels(derive([before, after], moveDay))).toEqual(["Toddler 3"]);
    });
    it("a canceled row never counts; an ended row counts only inside its window", () => {
        expect(derive([a({ roomLocationId: "t2", status: "canceled" })])).toEqual([]);
        const ended = a({ roomLocationId: "t2", status: "ended", endDate: "2026-11-05" });
        expect(labels(derive([ended], "2026-11-05"))).toEqual(["Toddler 2"]);
        expect(derive([ended], "2026-11-06")).toEqual([]);
        expect(labels(derive([a({ roomLocationId: "t2", status: "ending", endDate: "2026-11-15" })]))).toEqual(["Toddler 2"]);
    });
});

describe("determinism", () => {
    it("row order never changes the set or its order", () => {
        const rows = [a({ id: "1", roomLocationId: "t3", categoryId: HOME }), a({ id: "2", roomLocationId: "t2" }), a({ id: "3", roomLocationId: "t2", categoryId: HOME }), a({ id: "4", roomLocationId: "t3", categoryId: ENRICH })];
        const expected = derive(rows);
        for (const perm of [[...rows].reverse(), [rows[2], rows[0], rows[3], rows[1]], [rows[1], rows[3], rows[0], rows[2]]]) {
            expect(derive(perm)).toEqual(expected);
        }
        expect(homeroomLabel(expected)).toBe("Toddler 2 · Toddler 3");
        expect(homeroomLabel([])).toBeNull();
    });
});

describe("the Homeroom meaning is a category behavior property", () => {
    it("is read and written only as an explicit flag — absent means no", () => {
        expect(readAssignmentTypeBehavior({}).providesHomeroom).toBe(false);
        expect(readAssignmentTypeBehavior({ providesHomeroom: "yes" }).providesHomeroom).toBe(false);
        expect(readAssignmentTypeBehavior({ providesHomeroom: true }).providesHomeroom).toBe(true);
        expect(writeAssignmentTypeBehavior({ providesHomeroom: true }).providesHomeroom).toBe(true);
        expect(writeAssignmentTypeBehavior({}).providesHomeroom).toBe(false);
    });
});

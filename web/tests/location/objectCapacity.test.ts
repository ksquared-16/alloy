/**
 * Ordinary object capacity — the planner behind one typed number.
 *
 * These tests exist because the interesting part of "Capacity 10, Save" is
 * everything the operator did NOT say: which kind, which scope, which effective
 * date, and which lifecycle operation. Each of those is derived, so each is a
 * place a wrong derivation would be invisible in the UI and wrong in the data.
 */
import { describe, expect, it } from "vitest";
import {
    ordinaryCapacityKindForRole,
    planOrdinaryCapacityWrite,
    parseOrdinaryCapacityInput,
    readOrdinaryCapacity,
    currentOrdinaryRule,
} from "@/lib/locations/objectCapacity";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";

const ROOM = "room-1";
const TODAY = "2026-09-22";

function rule(over: Partial<ChildcareCapacityRuleRow> & { id: string }): ChildcareCapacityRuleRow {
    return {
        org_id: "org",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        capacity_kind: "operational",
        capacity: 10,
        effective_start: "2026-01-01",
        effective_end: null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...over,
    } as ChildcareCapacityRuleRow;
}

describe("which canonical kind an ordinary Capacity field means", () => {
    it("a classroom's capacity is operational", () => {
        expect(ordinaryCapacityKindForRole("operational_group")).toBe("operational");
    });

    it("a physical space's capacity is physical", () => {
        expect(ordinaryCapacityKindForRole("physical_space")).toBe("physical");
    });

    it("a stored shared space folds to physical, because the operator no longer authors that type", () => {
        expect(ordinaryCapacityKindForRole("shared_space")).toBe("physical");
    });

    it("a legacy unit with no stored role is a classroom, as it always was", () => {
        expect(ordinaryCapacityKindForRole(null)).toBe("operational");
    });

    it("never authors a licensed ceiling — that is a regulator's number, not a director's", () => {
        for (const role of ["operational_group", "physical_space", "shared_space", null] as const) {
            expect(ordinaryCapacityKindForRole(role)).not.toBe("licensed");
        }
    });
});

describe("reading the value back onto the object", () => {
    it("shows the authored value for the object's own kind", () => {
        const rules = [rule({ id: "a", capacity_kind: "operational", capacity: 10 })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBe(10);
    });

    it("does not show another room's capacity", () => {
        const rules = [rule({ id: "a", room_location_id: "other", capacity: 99 })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBeNull();
    });

    it("does not show a licensed ceiling in the ordinary field", () => {
        // The exact shape of the live Toddler 1 defect: a classroom whose only
        // canonical rule is licensed. The object field must read as unset, not
        // quietly adopt a number it cannot write back.
        const rules = [rule({ id: "a", capacity_kind: "licensed", capacity: 10 })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBeNull();
    });

    it("ignores an age-specific rule, which is a narrower claim the object does not own", () => {
        const rules = [rule({ id: "a", age_group_key: "infant", capacity: 4 })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBeNull();
    });

    it("ignores a rule that has already been closed", () => {
        const rules = [rule({ id: "a", effective_end: "2026-09-21" })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBeNull();
    });

    it("ignores a rule that has not started yet", () => {
        const rules = [rule({ id: "a", effective_start: "2026-12-01" })];
        expect(readOrdinaryCapacity(rules, ROOM, "operational_group", TODAY)).toBeNull();
    });

    it("prefers the later start, then the later authorship — the resolver's own order", () => {
        const rules = [
            rule({ id: "old", capacity: 8, effective_start: "2026-01-01" }),
            rule({ id: "new", capacity: 12, effective_start: "2026-09-01" }),
        ];
        expect(currentOrdinaryRule(rules, ROOM, "operational", TODAY)?.id).toBe("new");

        const sameDay = [
            rule({ id: "first", capacity: 8, effective_start: TODAY, created_at: "2026-09-22T09:00:00Z" }),
            rule({ id: "second", capacity: 12, effective_start: TODAY, created_at: "2026-09-22T10:00:00Z" }),
        ];
        expect(currentOrdinaryRule(sameDay, ROOM, "operational", TODAY)?.id).toBe("second");
    });
});

describe("what one Save actually does", () => {
    const plan = (rules: ChildcareCapacityRuleRow[], capacity: number | null, role = "operational_group" as const) =>
        planOrdinaryCapacityWrite({ rules, roomLocationId: ROOM, role, capacity, todayYmd: TODAY });

    it("creates a rule effective today when the room has none", () => {
        expect(plan([], 10)).toEqual({
            action: "create",
            kind: "operational",
            capacity: 10,
            effectiveStart: TODAY,
        });
    });

    it("does nothing when the number has not changed", () => {
        expect(plan([rule({ id: "a", capacity: 10 })], 10)).toEqual({ action: "noop" });
    });

    it("versions a rule from an earlier day", () => {
        expect(plan([rule({ id: "a", capacity: 10, effective_start: "2026-01-01" })], 12)).toEqual({
            action: "version",
            priorId: "a",
            kind: "operational",
            capacity: 12,
            effectiveStart: TODAY,
        });
    });

    it("replaces rather than versions a rule authored earlier today", () => {
        // A version starting on its predecessor's own start date is refused by
        // planSupersede, and a rule already in effect cannot be voided. Fixing a
        // typo a minute after saving it is ordinary, so it gets an ordinary path.
        expect(plan([rule({ id: "a", capacity: 10, effective_start: TODAY })], 12)).toEqual({
            action: "replace_same_day",
            retireId: "a",
            kind: "operational",
            capacity: 12,
            effectiveStart: TODAY,
        });
    });

    it("retires the rule when the operator clears the field", () => {
        expect(plan([rule({ id: "a", capacity: 10 })], null)).toEqual({
            action: "retire",
            id: "a",
            effectiveEnd: TODAY,
        });
    });

    it("clearing a field that was never set is not a retirement", () => {
        expect(plan([], null)).toEqual({ action: "noop" });
    });

    it("writes physical capacity from a physical space, not licensed", () => {
        const p = planOrdinaryCapacityWrite({
            rules: [],
            roomLocationId: ROOM,
            role: "physical_space",
            capacity: 24,
            todayYmd: TODAY,
        });
        expect(p).toEqual({ action: "create", kind: "physical", capacity: 24, effectiveStart: TODAY });
    });

    it("a classroom's Save never touches a licensed rule standing beside it", () => {
        // Toddler 1 today: one licensed rule, no operational one. Saving 10 on
        // the object must CREATE an operational rule and leave the ceiling alone.
        const licensed = rule({ id: "lic", capacity_kind: "licensed", capacity: 10 });
        expect(plan([licensed], 10)).toEqual({
            action: "create",
            kind: "operational",
            capacity: 10,
            effectiveStart: TODAY,
        });
    });

    it("0 is a real claim and does not read as an empty field", () => {
        expect(plan([rule({ id: "a", capacity: 10 })], 0)).toMatchObject({ action: "version", capacity: 0 });
    });
});

describe("parsing what the operator typed", () => {
    it("an empty field means not set, never zero", () => {
        expect(parseOrdinaryCapacityInput("")).toEqual({ ok: true, value: null });
        expect(parseOrdinaryCapacityInput("   ")).toEqual({ ok: true, value: null });
    });

    it("zero is accepted as a real number", () => {
        expect(parseOrdinaryCapacityInput("0")).toEqual({ ok: true, value: 0 });
    });

    it("refuses a fraction rather than rounding someone's classroom", () => {
        expect(parseOrdinaryCapacityInput("10.5").ok).toBe(false);
    });

    it("refuses text rather than coercing it to 0", () => {
        expect(parseOrdinaryCapacityInput("ten").ok).toBe(false);
        expect(parseOrdinaryCapacityInput("-4").ok).toBe(false);
    });
});

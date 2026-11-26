/**
 * Staffing ratio on the operational space.
 *
 * The grammar tests are not cosmetic. `1:5` became unsayable on the advanced
 * screen because the staff count was printed in the ratio's second position,
 * and the director concluded the numbers had been lost. A render format is the
 * whole feature here, so it is pinned like one.
 */
import { describe, expect, it } from "vitest";
import {
    formatRatioTier,
    formatRatioTiers,
    parseLegacyRatio,
    planObjectRatioWrite,
    ratioNeedsReview,
    readObjectRatioTiers,
    resolveObjectRatioStanding,
    sameTiers,
    validateRatioTiers,
} from "@/lib/locations/objectRatio";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const ROOM = "room-1";
const TODAY = "2026-09-22";

function rule(over: Partial<ChildcareRatioRuleRow> & { id: string }): ChildcareRatioRuleRow {
    return {
        org_id: "org",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
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
        ...over,
    } as ChildcareRatioRuleRow;
}

function tier(ruleId: string, requiredStaff: number, maxChildren: number, sort = maxChildren * 10): ChildcareRatioRuleTierRow {
    return {
        id: `${ruleId}-${requiredStaff}-${maxChildren}`,
        org_id: "org",
        ratio_rule_id: ruleId,
        max_children: maxChildren,
        required_staff: requiredStaff,
        sort_order: sort,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("the grammar the director actually uses", () => {
    it("renders one staff for up to five children as 1:5", () => {
        expect(formatRatioTier({ requiredStaff: 1, maxChildren: 5 })).toBe("1:5");
    });

    it("renders two staff for up to eleven children as 2:11", () => {
        expect(formatRatioTier({ requiredStaff: 2, maxChildren: 11 })).toBe("2:11");
    });

    it("never prints the old inequality form that made 1:5 unsayable", () => {
        const text = formatRatioTiers([
            { requiredStaff: 1, maxChildren: 5 },
            { requiredStaff: 2, maxChildren: 11 },
        ]);
        expect(text).toBe("1:5 · 2:11");
        expect(text).not.toContain("≤");
        // The exact defect: staff in the second position turned 1:5 into 1:1.
        expect(text).not.toContain("1:1");
        expect(text).not.toContain("1:2");
    });
});

describe("reading the legacy string", () => {
    it("parses the shapes that exist in deployed data", () => {
        expect(parseLegacyRatio("1:5")).toEqual([{ requiredStaff: 1, maxChildren: 5 }]);
        expect(parseLegacyRatio("1:5,2:11")).toEqual([
            { requiredStaff: 1, maxChildren: 5 },
            { requiredStaff: 2, maxChildren: 11 },
        ]);
        expect(parseLegacyRatio("1:7,2:15")).toEqual([
            { requiredStaff: 1, maxChildren: 7 },
            { requiredStaff: 2, maxChildren: 15 },
        ]);
    });

    it("tolerates spacing and a semicolon separator", () => {
        expect(parseLegacyRatio(" 1 : 5 ; 2 : 11 ")).toEqual([
            { requiredStaff: 1, maxChildren: 5 },
            { requiredStaff: 2, maxChildren: 11 },
        ]);
    });

    it("refuses anything it cannot read exactly, rather than guessing", () => {
        // A half-understood staffing claim is worse than an unread one.
        for (const bad of ["1 per 5", "1:5 and up", "five to one", "1:", ":5", "0:5", "1:0", "", null, 15]) {
            expect(parseLegacyRatio(bad)).toBeNull();
        }
    });
});

describe("how the two records stand to each other", () => {
    const stand = (rules: ChildcareRatioRuleRow[], tierRows: ChildcareRatioRuleTierRow[], legacyRaw: unknown) =>
        resolveObjectRatioStanding({ rules, tierRows, roomLocationId: ROOM, legacyRaw, todayYmd: TODAY });

    it("nothing recorded anywhere", () => {
        expect(stand([], [], null)).toEqual({ state: "none" });
    });

    it("canonical only", () => {
        const s = stand([rule({ id: "r" })], [tier("r", 1, 4)], null);
        expect(s.state).toBe("canonical_only");
        expect(readObjectRatioTiers(s)).toEqual([{ requiredStaff: 1, maxChildren: 4 }]);
        expect(ratioNeedsReview(s)).toBe(false);
    });

    it("legacy only — needs review, because nothing canonical governs the room yet", () => {
        const s = stand([], [], "1:5");
        expect(s.state).toBe("legacy_only");
        expect(ratioNeedsReview(s)).toBe(true);
        expect(readObjectRatioTiers(s)).toBeNull();
    });

    it("both, and they agree — settled, no review", () => {
        const s = stand([rule({ id: "r" })], [tier("r", 1, 5), tier("r", 2, 11)], "1:5,2:11");
        expect(s.state).toBe("agree");
        expect(ratioNeedsReview(s)).toBe(false);
    });

    it("INFANT A: both, and they conflict — surfaced, never resolved", () => {
        // The live case. Legacy says 1:5 · 2:11; canonical says 1:4 · 2:8 · 3:12.
        // Which is true is a staffing-law claim, so the product shows both.
        const s = stand(
            [rule({ id: "r" })],
            [tier("r", 1, 4), tier("r", 2, 8), tier("r", 3, 12)],
            "1:5,2:11",
        );
        expect(s.state).toBe("conflict");
        expect(ratioNeedsReview(s)).toBe(true);
        if (s.state !== "conflict") throw new Error("unreachable");
        expect(formatRatioTiers(s.legacy)).toBe("1:5 · 2:11");
        expect(formatRatioTiers(s.tiers)).toBe("1:4 · 2:8 · 3:12");
    });

    it("an unreadable legacy value is flagged, not discarded", () => {
        const s = stand([], [], "about one to five");
        expect(s.state).toBe("legacy_unreadable");
        expect(ratioNeedsReview(s)).toBe(true);
    });

    it("ignores another room's rule, an age-specific rule, and a closed one", () => {
        expect(stand([rule({ id: "r", room_location_id: "other" })], [tier("r", 1, 4)], null).state).toBe("none");
        expect(stand([rule({ id: "r", age_group_key: "infant" })], [tier("r", 1, 4)], null).state).toBe("none");
        expect(stand([rule({ id: "r", effective_end: "2026-09-21" })], [tier("r", 1, 4)], null).state).toBe("none");
    });
});

describe("what one ratio Save does", () => {
    const plan = (rules: ChildcareRatioRuleRow[], tierRows: ChildcareRatioRuleTierRow[], tiers: { requiredStaff: number; maxChildren: number }[]) =>
        planObjectRatioWrite({ rules, tierRows, roomLocationId: ROOM, tiers, todayYmd: TODAY });

    const T = [
        { requiredStaff: 1, maxChildren: 5 },
        { requiredStaff: 2, maxChildren: 11 },
    ];

    it("creates when the space has no ratio", () => {
        expect(plan([], [], T)).toEqual({ action: "create", tiers: T, effectiveStart: TODAY });
    });

    it("does nothing when the tiers have not changed", () => {
        expect(plan([rule({ id: "r" })], [tier("r", 1, 5), tier("r", 2, 11)], T)).toEqual({ action: "noop" });
    });

    it("versions a rule from an earlier day", () => {
        const p = plan([rule({ id: "r", effective_start: "2026-01-01" })], [tier("r", 1, 4)], T);
        expect(p).toEqual({ action: "version", priorId: "r", tiers: T, effectiveStart: TODAY });
    });

    it("replaces rather than versions a rule authored earlier today", () => {
        const p = plan([rule({ id: "r", effective_start: TODAY })], [tier("r", 1, 4)], T);
        expect(p).toEqual({ action: "replace_same_day", retireId: "r", tiers: T, effectiveStart: TODAY });
    });

    it("retires when the operator clears every tier", () => {
        expect(plan([rule({ id: "r" })], [tier("r", 1, 4)], [])).toEqual({
            action: "retire",
            id: "r",
            effectiveEnd: TODAY,
        });
    });

    it("adding a second tier is a change, not a no-op", () => {
        // Flattening tiers would make this look identical to 1:5 alone.
        const p = plan([rule({ id: "r" })], [tier("r", 1, 5)], T);
        expect(p).toMatchObject({ action: "version", priorId: "r" });
    });

    it("2:11 is never treated as the same claim as 2:10", () => {
        expect(sameTiers(T, [{ requiredStaff: 1, maxChildren: 5 }, { requiredStaff: 2, maxChildren: 10 }])).toBe(false);
    });
});

describe("validating what the operator typed", () => {
    it("accepts an ordinary two-step ratio", () => {
        const r = validateRatioTiers([
            { requiredStaff: 2, maxChildren: 11 },
            { requiredStaff: 1, maxChildren: 5 },
        ]);
        expect(r).toEqual({ ok: true, tiers: [{ requiredStaff: 1, maxChildren: 5 }, { requiredStaff: 2, maxChildren: 11 }] });
    });

    it("refuses two steps that stop at the same child count", () => {
        const r = validateRatioTiers([
            { requiredStaff: 1, maxChildren: 5 },
            { requiredStaff: 2, maxChildren: 5 },
        ]);
        expect(r.ok).toBe(false);
    });

    it("refuses a step up in children that needs no more staff", () => {
        const r = validateRatioTiers([
            { requiredStaff: 2, maxChildren: 5 },
            { requiredStaff: 1, maxChildren: 11 },
        ]);
        expect(r.ok).toBe(false);
    });

    it("refuses zero, negative and fractional values", () => {
        expect(validateRatioTiers([{ requiredStaff: 0, maxChildren: 5 }]).ok).toBe(false);
        expect(validateRatioTiers([{ requiredStaff: 1, maxChildren: 0 }]).ok).toBe(false);
        expect(validateRatioTiers([{ requiredStaff: 1.5, maxChildren: 5 }]).ok).toBe(false);
    });

    it("an empty tier set is a legal way to say there is no ratio", () => {
        expect(validateRatioTiers([])).toEqual({ ok: true, tiers: [] });
    });
});

describe("a rule that closes today cannot be versioned from today", () => {
    /*
     * THE INFANT A DEFECT, reproduced from the deployed record.
     *
     * Rule 31bc3220: effective_start 2026-01-01, effective_end 2026-09-24 — still
     * in force on the 24th, but closing that day. The planner only asked whether
     * the rule STARTED today, so it chose `version`, and the canonical store
     * refused with "New version effective_start must be after the prior version
     * start and any prior end date" — rule mechanics, shown to a director editing
     * an ordinary ratio.
     */
    const CLOSES_TODAY = rule({ id: "closes-today", effective_start: "2026-01-01", effective_end: TODAY });

    it("replaces instead of versioning", () => {
        const p = planObjectRatioWrite({
            rules: [CLOSES_TODAY],
            tierRows: [tier("closes-today", 1, 4), tier("closes-today", 2, 8), tier("closes-today", 3, 12)],
            roomLocationId: ROOM,
            tiers: [
                { requiredStaff: 1, maxChildren: 5 },
                { requiredStaff: 2, maxChildren: 11 },
            ],
            todayYmd: TODAY,
        });
        expect(p).toMatchObject({ action: "replace_same_day", retireId: "closes-today" });
    });

    it("still versions an ordinary open-ended rule from an earlier day", () => {
        const p = planObjectRatioWrite({
            rules: [rule({ id: "open", effective_start: "2026-01-01" })],
            tierRows: [tier("open", 1, 4)],
            roomLocationId: ROOM,
            tiers: [{ requiredStaff: 1, maxChildren: 5 }],
            todayYmd: TODAY,
        });
        expect(p).toMatchObject({ action: "version", priorId: "open" });
    });

    it("a rule that closed BEFORE today is not current at all, so this is a create", () => {
        const p = planObjectRatioWrite({
            rules: [rule({ id: "closed", effective_start: "2026-01-01", effective_end: "2026-09-21" })],
            tierRows: [tier("closed", 1, 4)],
            roomLocationId: ROOM,
            tiers: [{ requiredStaff: 1, maxChildren: 5 }],
            todayYmd: TODAY,
        });
        expect(p).toMatchObject({ action: "create" });
    });
});

describe("legacy evidence is migration provenance, not a permanent comparator", () => {
    /*
     * The Infant A failure: canonical 1:5 · 2:11 · 3:18, authored by hand from
     * the 1:5 · 2:11 the legacy record held, still reported as needing review
     * against the very value it was authored from. Review meant "legacy evidence
     * exists" when it should mean "a human decision is still required".
     */
    const confirmed = (over: Partial<ChildcareRatioRuleRow> = {}) =>
        rule({ id: "r", metadata: { authored_via: "object_editor" }, ...over });

    const stand = (rules: ChildcareRatioRuleRow[], tierRows: ChildcareRatioRuleTierRow[], legacyRaw: unknown) =>
        resolveObjectRatioStanding({ rules, tierRows, roomLocationId: ROOM, legacyRaw, todayYmd: TODAY });

    it("INFANT A: explicit authorship settles it, even though a tier was added", () => {
        const s = stand([confirmed()], [tier("r", 1, 5), tier("r", 2, 11), tier("r", 3, 18)], "1:5,2:11");
        expect(s.state).toBe("confirmed");
        expect(ratioNeedsReview(s)).toBe(false);
        expect(formatRatioTiers(readObjectRatioTiers(s)!)).toBe("1:5 · 2:11 · 3:18");
    });

    it("TODDLER 1: explicit authorship settles it even though it DIFFERS from legacy", () => {
        // The law is about who decided, not about whether the numbers match.
        const s = stand([confirmed()], [tier("r", 1, 5), tier("r", 2, 11)], "1:6");
        expect(s.state).toBe("confirmed");
        expect(ratioNeedsReview(s)).toBe(false);
    });

    it("PREFIX ALONE DOES NOT CONFIRM — the same tiers without provenance stay unresolved", () => {
        // Identical data to the Infant A case, minus the marker. An extra tier
        // can be a real staffing change; only a human settles that.
        const s = stand([rule({ id: "r" })], [tier("r", 1, 5), tier("r", 2, 11), tier("r", 3, 18)], "1:5,2:11");
        expect(s.state).toBe("conflict");
        expect(ratioNeedsReview(s)).toBe(true);
    });

    it("EXACT AGREEMENT ALONE DOES NOT CONFIRM — it is merely 'agree', not reviewed", () => {
        const s = stand([rule({ id: "r" })], [tier("r", 1, 5), tier("r", 2, 11)], "1:5,2:11");
        expect(s.state).toBe("agree");
    });

    it("a legacy-only space stays unresolved — nothing canonical has been authored", () => {
        expect(stand([], [], "1:6").state).toBe("legacy_only");
    });

    it("confirmation does not depend on a legacy value existing at all", () => {
        const s = stand([confirmed()], [tier("r", 1, 5)], null);
        expect(s.state).toBe("confirmed");
    });

    it("keeps the legacy string readable, so evidence is preserved rather than erased", () => {
        const s = stand([confirmed()], [tier("r", 1, 5)], "1:6");
        if (s.state !== "confirmed") throw new Error("unreachable");
        expect(s.legacyRaw).toBe("1:6");
    });

    it("survives same-day replacement and ordinary versioning, because both stamp the marker", () => {
        const sameDay = stand(
            [confirmed({ effective_start: TODAY, metadata: { authored_via: "object_editor", replaced_same_day_rule_id: "old" } })],
            [tier("r", 1, 5)],
            "1:6",
        );
        expect(sameDay.state).toBe("confirmed");
        const versioned = stand(
            [confirmed({ metadata: { authored_via: "object_editor", supersedes_id: "old", lineage_origin_id: "seed" } })],
            [tier("r", 1, 5)],
            "1:6",
        );
        expect(versioned.state).toBe("confirmed");
    });

    it("a marker the object services never write does not confirm", () => {
        const s = stand(
            [rule({ id: "r", metadata: { authored_via: "config" } })],
            [tier("r", 1, 5)],
            "1:6",
        );
        expect(s.state).toBe("conflict");
    });
});

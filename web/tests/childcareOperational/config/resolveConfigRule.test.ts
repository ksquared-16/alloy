import { describe, expect, it } from "vitest";
import {
    isRuleEffectiveOn,
    resolveConfigRule,
    ruleMatchesContext,
    scopeSpecificity,
    type ResolvableConfigRule,
} from "@/lib/childcareOperational/config/resolveConfigRule";

type TestRule = ResolvableConfigRule & { marker: string };

function rule(marker: string, partial: Partial<TestRule>): TestRule {
    return {
        marker,
        scope_type: "org",
        site_location_id: null,
        program_category_id: null,
        room_location_id: null,
        age_group_key: null,
        effective_start: "2026-01-01",
        effective_end: null,
        ...partial,
    };
}

const SITE = "site-1";
const PROGRAM = "prog-1";
const ROOM = "room-1";

const context = {
    siteLocationId: SITE,
    programCategoryId: PROGRAM,
    roomLocationId: ROOM,
    ageGroupKey: "infant",
};

describe("scopeSpecificity", () => {
    it("orders room > program > site > org", () => {
        expect(scopeSpecificity("room")).toBeGreaterThan(scopeSpecificity("program"));
        expect(scopeSpecificity("program")).toBeGreaterThan(scopeSpecificity("site"));
        expect(scopeSpecificity("site")).toBeGreaterThan(scopeSpecificity("org"));
    });
});

describe("ruleMatchesContext", () => {
    it("matches org always", () => {
        expect(ruleMatchesContext(rule("org", {}), context)).toBe(true);
    });
    it("matches site only on equal site id", () => {
        expect(ruleMatchesContext(rule("s", { scope_type: "site", site_location_id: SITE }), context)).toBe(true);
        expect(
            ruleMatchesContext(rule("s", { scope_type: "site", site_location_id: "other" }), context)
        ).toBe(false);
    });
    it("narrows by age group when set, null matches any", () => {
        expect(ruleMatchesContext(rule("a", { age_group_key: "infant" }), context)).toBe(true);
        expect(ruleMatchesContext(rule("a", { age_group_key: "toddler" }), context)).toBe(false);
        expect(ruleMatchesContext(rule("a", { age_group_key: null }), context)).toBe(true);
    });
});

describe("isRuleEffectiveOn", () => {
    it("respects effective_start/effective_end bounds", () => {
        const r = rule("e", { effective_start: "2026-02-01", effective_end: "2026-02-28" });
        expect(isRuleEffectiveOn(r, "2026-01-31")).toBe(false);
        expect(isRuleEffectiveOn(r, "2026-02-01")).toBe(true);
        expect(isRuleEffectiveOn(r, "2026-02-28")).toBe(true);
        expect(isRuleEffectiveOn(r, "2026-03-01")).toBe(false);
    });
    it("treats null effective_end as open-ended", () => {
        expect(isRuleEffectiveOn(rule("o", { effective_start: "2026-01-01" }), "2030-01-01")).toBe(true);
    });
});

describe("resolveConfigRule — inheritance resolution", () => {
    const orgRule = rule("org", { scope_type: "org" });
    const siteRule = rule("site", { scope_type: "site", site_location_id: SITE });
    const programRule = rule("program", { scope_type: "program", program_category_id: PROGRAM });
    const roomRule = rule("room", { scope_type: "room", room_location_id: ROOM });

    it("falls back to org default when no override matches", () => {
        const ctx = { siteLocationId: "x", programCategoryId: "y", roomLocationId: "z" };
        expect(resolveConfigRule([orgRule], ctx, "2026-06-01")?.marker).toBe("org");
    });

    it("site override beats org", () => {
        expect(resolveConfigRule([orgRule, siteRule], context, "2026-06-01")?.marker).toBe("site");
    });

    it("program override beats site and org", () => {
        expect(resolveConfigRule([orgRule, siteRule, programRule], context, "2026-06-01")?.marker).toBe(
            "program"
        );
    });

    it("room override beats program, site, and org (most specific wins)", () => {
        expect(
            resolveConfigRule([orgRule, siteRule, programRule, roomRule], context, "2026-06-01")?.marker
        ).toBe("room");
    });

    it("age-group-specific rule beats age-group-null at the same scope", () => {
        const siteNull = rule("site-null", { scope_type: "site", site_location_id: SITE });
        const siteInfant = rule("site-infant", {
            scope_type: "site",
            site_location_id: SITE,
            age_group_key: "infant",
        });
        expect(resolveConfigRule([siteNull, siteInfant], context, "2026-06-01")?.marker).toBe(
            "site-infant"
        );
    });

    it("latest effective_start wins among equal scope", () => {
        const older = rule("older", { scope_type: "site", site_location_id: SITE, effective_start: "2026-01-01" });
        const newer = rule("newer", { scope_type: "site", site_location_id: SITE, effective_start: "2026-05-01" });
        expect(resolveConfigRule([older, newer], context, "2026-06-01")?.marker).toBe("newer");
    });

    it("excludes rules not yet effective", () => {
        const future = rule("future", { scope_type: "site", site_location_id: SITE, effective_start: "2027-01-01" });
        expect(resolveConfigRule([future], context, "2026-06-01")).toBeNull();
    });
});

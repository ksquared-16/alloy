/**
 * Assignment UX convergence — the use is read from the space, not asked before the card.
 */
import { describe, expect, it } from "vitest";

import {
    resolveUseForSpace,
    spaceTakesAnyUse,
    usesNeedingNoSpace,
} from "@/lib/operationalAssignments/assignmentUseResolution";

const BEFORE = { id: "cat-before", label: "Before Care" };
const ENRICH = { id: "cat-enrich", label: "Enrichment" };
const BUS = { id: "cat-bus", label: "Transportation", behavior: { roomRequirement: "not_used" as const } };
const ALL = [BEFORE, ENRICH, BUS];

describe("resolveUseForSpace", () => {
    it("a space configured for exactly one use resolves it", () => {
        expect(resolveUseForSpace({ unitRole: "shared_space", spaceUses: ["cat-before"] }, ALL, "child")).toEqual({
            kind: "resolved",
            useId: "cat-before",
            legacy: false,
        });
    });

    it("several eligible uses are a choice — never the first", () => {
        const r = resolveUseForSpace({ unitRole: "operational_group", spaceUses: ["cat-enrich", "cat-before"] }, ALL, "child");
        expect(r).toEqual({ kind: "choose", useIds: ["cat-before", "cat-enrich"], legacy: false });
    });

    it("COMPAT-1: an unconfigured classroom keeps legacy eligibility — every space-using category is a candidate", () => {
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: null }, ALL, "child")).toEqual({
            kind: "choose",
            useIds: ["cat-before", "cat-enrich"],
            legacy: true,
        });
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: null }, [BEFORE, BUS], "child")).toEqual({
            kind: "resolved",
            useId: "cat-before",
            legacy: true,
        });
    });

    it("an unconfigured shared space is refused in its own words", () => {
        const r = resolveUseForSpace({ unitRole: "shared_space", spaceUses: null }, ALL, "child");
        expect(r).toMatchObject({ kind: "none", code: "space_uses_not_configured" });
    });

    it("a physical space is never schedulable", () => {
        expect(resolveUseForSpace({ unitRole: "physical_space", spaceUses: null }, ALL, "child")).toMatchObject({
            kind: "none",
            code: "physical_space_not_schedulable",
        });
    });

    it("an explicit empty list, or uses naming none of these categories, explains — and offers nothing", () => {
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: [] }, ALL, "child")).toMatchObject({
            kind: "none",
            code: "no_use_for_space",
        });
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: ["cat-staff-only"] }, ALL, "child")).toMatchObject({
            kind: "none",
            code: "no_use_for_space",
            message: expect.stringContaining("child use"),
        });
    });

    it("a malformed configuration fails closed", () => {
        expect(
            resolveUseForSpace({ unitRole: "operational_group", spaceUses: ["cat-before"], spaceUsesMalformed: true }, ALL, "child"),
        ).toMatchObject({ kind: "none", code: "space_uses_malformed" });
    });

    it("staff only in a classroom", () => {
        expect(resolveUseForSpace({ unitRole: "shared_space", spaceUses: ["cat-before"] }, ALL, "staff")).toMatchObject({
            kind: "none",
            code: "staff_room_must_be_classroom",
        });
    });

    it("a category that uses no space is never read from a room, even one configured with it", () => {
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: ["cat-bus", "cat-before"] }, ALL, "child")).toEqual({
            kind: "resolved",
            useId: "cat-before",
            legacy: false,
        });
        expect(usesNeedingNoSpace(ALL).map((c) => c.id)).toEqual(["cat-bus"]);
    });

    it("no categories at all says so", () => {
        expect(resolveUseForSpace({ unitRole: "operational_group", spaceUses: null }, [BUS], "child")).toMatchObject({
            kind: "none",
            code: "no_categories",
        });
    });

    it("never reads a room's name or is_primary — the input has neither", () => {
        // A room literally called "Before Care" configured for Enrichment resolves Enrichment.
        const named = { unitRole: "shared_space" as const, spaceUses: ["cat-enrich"], roomName: "Before Care", isPrimary: true };
        expect(resolveUseForSpace(named, ALL, "child")).toMatchObject({ kind: "resolved", useId: "cat-enrich" });
    });
});

describe("spaceTakesAnyUse — the picker's scope when the use is read from the room", () => {
    it("keeps spaces with at least one eligible use and drops the rest", () => {
        expect(spaceTakesAnyUse({ unitRole: "shared_space", spaceUses: ["cat-before"] }, ALL, "child")).toBe(true);
        expect(spaceTakesAnyUse({ unitRole: "shared_space", spaceUses: [] }, ALL, "child")).toBe(false);
        expect(spaceTakesAnyUse({ unitRole: "physical_space", spaceUses: null }, ALL, "child")).toBe(false);
    });
});

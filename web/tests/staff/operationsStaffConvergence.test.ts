/**
 * OPERATIONS KNOWS THREE DIFFERENT THINGS ABOUT A STAFF MEMBER.
 *
 * ASSIGNED is the durable plan. PRESENT is what actually happened. READINESS is
 * whether the paperwork behind the person is in order. A staff member can be any
 * combination of the three, and the failure this slice must avoid is collapsing
 * them into one status — a present, assigned teacher with a lapsed CPR is all
 * three at once, and one verdict standing in for three would hide two of them.
 *
 * These lock the convergence itself, not the presentation: Operations consumes
 * the certified authorities rather than copying them, and the shape most easily
 * forgotten — staff with no room — keeps every fact the roomed ones get.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");

function statements(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
}

const ROSTER = "lib/roster/buildCombinedRoster.ts";

describe("Operations consumes the certified authorities, never a copy", () => {
    it("reads readiness through the Slice 6 batch composer, not a second evaluation", () => {
        const src = statements(code(ROSTER));
        expect(src).toMatch(/composeStaffReadinessSignals/);
        // A second evaluator would mean Operations and the Focus Panel could disagree
        // about the same person on the same morning.
        expect(src).not.toMatch(/evaluateStaffReadiness|resolveRequirementSatisfaction/);
    });

    it("reads presence through the canonical staff presence service", () => {
        const src = statements(code(ROSTER));
        expect(src).toMatch(/listStaffPresenceForSiteDate/);
        expect(src, "presence has one authority").not.toMatch(/from\(\s*["']staff_presence_events["']\s*\)/);
    });

    it("evaluates the whole site-day once rather than once per staff row", () => {
        const src = statements(code(ROSTER));
        // The composer is called with a LIST. A per-row call inside a map would be
        // six queries per person on a surface reloaded all morning.
        expect(src).toMatch(/composeStaffReadinessSignals\(\s*supabase,\s*orgId,\s*rosterEmploymentIds/);
    });
});

describe("assigned, present and readiness stay three separate facts", () => {
    it("the staff row carries all three and collapses none of them", () => {
        const src = statements(code(ROSTER));
        // `actual` is presence, `readiness` is the advisory signal, and the row is a
        // scheduled assignment. Three fields, three questions.
        expect(src).toMatch(/actual:\s*SubjectActualState/);
        expect(src).toMatch(/readiness:\s*StaffReadinessSignal \| null/);
    });

    it("readiness is not folded into the staffing verdict", () => {
        const src = statements(code(ROSTER));
        // Supply counting must not consult readiness: an unready staff member is
        // still rostered, and removing them from supply would be blocking by arithmetic.
        const supplyLines = src.split("\n").filter((l) => /scheduledStaffCount|actualStaffPresent|staffingSufficiency/.test(l));
        expect(supplyLines.join("\n")).not.toMatch(/readiness/);
    });
});

describe("staff with no room keep every fact the roomed ones get", () => {
    it("unroomed staff carry the advisory signal too", () => {
        const src = statements(code(ROSTER));
        // lastIndexOf, not indexOf: the first hit is the TYPE declaration, and a lock
        // that reads a type signature proves nothing about what the builder emits.
        const i = src.lastIndexOf("unroomedStaff:");
        expect(i, "unroomedStaff must still be emitted").toBeGreaterThan(-1);
        const segment = src.slice(i, i + 600);
        expect(segment).toMatch(/readiness: readinessFor\(/);
        expect(segment).toMatch(/actual: staffActualFromDayState/);
    });

    it("no placeholder room is invented for them", () => {
        const src = statements(code(ROSTER));
        expect(src).not.toMatch(/Admin Room|Float Room|Director Room|Unassigned Room/i);
        // The filter is on a NULL room, which is what makes the shape legitimate
        // rather than an error state.
        expect(src).toMatch(/roomLocationId == null/);
    });
});

describe("the ratio authority is not invented and not overstated", () => {
    it("required staff stays null when no configuration resolves", () => {
        const src = statements(code("lib/scheduling/supply/staffingSufficiency.ts"));
        expect(src).toMatch(/if \(requiredStaff == null\) return null;/);
        expect(src).toMatch(/return "unknown"/);
    });

    it("Operations does not fabricate a required-staff number", () => {
        const src = statements(code(ROSTER));
        // The roll-up refuses to sum when any room is unknown, rather than treating
        // an unconfigured room as requiring zero.
        expect(src).toMatch(/anyUnknownDemand[\s\S]{0,120}\? null/);
    });
});

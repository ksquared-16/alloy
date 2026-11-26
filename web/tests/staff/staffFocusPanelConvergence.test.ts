/**
 * THE STAFF SUBJECT, AS ONE EXPERIENCE.
 *
 * Slice 7 measured the panel before changing it, and most of the convergence turned
 * out to be built already: the Assignments card declares the person grain, the staff
 * scheduling bag is composed on the durable-record route, and the `schedule` context
 * is offered and renders. What was NOT settled was the noun — the chip said
 * "Schedule" and opened a card titled "Assignments" — and nothing held any of it in
 * place.
 *
 * So these are mostly locks over facts that were already true. That is deliberate:
 * an invariant nobody asserts is one edit away from being false, and the expensive
 * failure here is not a missing card but a SECOND assignment authority growing
 * quietly beside the first.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSubjectScheduleContext } from "@/lib/context/buildSubjectContexts";
import {
    cardAppliesToGrain,
    cardKeysForGrain,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { resolveStaffAssignmentShapeFixture } from "./staffAssignmentShapeFixture";

const code = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");

function statements(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
}

describe("the final Staff card family", () => {
    it("is exactly these five cards, in this reading order", () => {
        // Employment (who), Qualifications (what they hold), Availability (when they
        // CAN work), Readiness (the verdict over those three), Assignments (the
        // commitment made from them). An accidental sixth is only visible against an
        // exact list.
        expect(cardKeysForGrain("person")).toEqual([
            "staff",
            "staff_qualifications",
            "staff_availability",
            "staff_readiness",
            // Slice 9. The only RESTRICTED member of the family: the context layer
            // withholds it from a caller without `staff.compensation.read`.
            "staff_compensation",
            "scheduling",
        ]);
    });

    it("every card in the family declares the person grain", () => {
        for (const key of ["staff", "staff_qualifications", "staff_availability", "staff_readiness", "staff_compensation", "scheduling"] as const) {
            expect(cardAppliesToGrain(key, "person"), `${key} must reach the person grain`).toBe(true);
        }
    });
});

describe("Assignment is the operator's noun", () => {
    it("the context chip says Assignment, not Schedule", () => {
        // The card it opens is titled "Assignments". Two names for one thing is how a
        // second durable noun gets in, and Staff V2 settles it as Assignment.
        const ctx = buildSubjectScheduleContext(
            {
                id: "a1", pattern_label: "Primary Day", site_location_id: "site-1",
            } as never,
            "North Campus",
        );
        expect(ctx?.label).toBe("Assignment");
        expect(ctx?.label).not.toMatch(/schedule/i);
    });

    it("no operator-facing copy introduces a Staff Schedule", () => {
        const offenders: string[] = [];
        const walk = (dir: string): string[] => {
            const out: string[] = [];
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) out.push(...walk(full));
                else if (/\.tsx?$/.test(entry)) out.push(full);
            }
            return out;
        };
        for (const root of ["lib/staffReadiness", "lib/staffQualifications", "lib/staffAvailability"]) {
            for (const file of walk(join(__dirname, "../../", root))) {
                if (/["'`][^"'`]*Staff Schedule[^"'`]*["'`]/.test(statements(readFileSync(file, "utf8")))) {
                    offenders.push(file.split("/web/")[1]!);
                }
            }
        }
        expect(offenders, "Assignment is the durable noun; Schedule is a later, different idea").toEqual([]);
    });
});

describe("the three Staff assignment shapes are all legitimate", () => {
    // Proven mechanically against the deployed authority on 2026-09-21: all three
    // created through `assignment.create` and accepted. These lock the SHAPE rule the
    // product depends on — that a classroom is optional — so nobody reintroduces a
    // required room and forces "Admin Room" into existence to satisfy it.
    it("a fixed-classroom assignment carries a room", () => {
        expect(resolveStaffAssignmentShapeFixture({ roomLocationId: "room-1", schedulePatternId: "p1" }))
            .toBe("classroom");
    });

    it("a site-level assignment has NO room and is still a complete assignment", () => {
        expect(resolveStaffAssignmentShapeFixture({ roomLocationId: null, schedulePatternId: "p1" }))
            .toBe("site_only");
    });

    it("a float assignment has no durable room either", () => {
        expect(resolveStaffAssignmentShapeFixture({ roomLocationId: null, schedulePatternId: "p1" }))
            .toBe("site_only");
    });

    it("no module invents a placeholder room to represent site-level staff", () => {
        const offenders: string[] = [];
        for (const rel of [
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts",
            "lib/scheduling/projection/buildSchedulingProjection.ts",
        ]) {
            if (/["'`][^"'`]*(Admin Room|Float Room|Director Room)[^"'`]*["'`]/i.test(statements(code(rel)))) {
                offenders.push(rel);
            }
        }
        expect(offenders, "a fake room is a lie that ratios and rosters then read").toEqual([]);
    });
});

describe("one assignment authority, not two", () => {
    it("exactly one card key answers the assignment question", () => {
        const assignmentCards = cardKeysForGrain("person").filter((k) => /assign|schedul/i.test(k));
        expect(assignmentCards).toEqual(["scheduling"]);
    });

    it("the staff path composes the SAME projection the child path does", () => {
        // `composeDurableStaffScheduling` exists to build the same bag for one subject
        // over. If it ever stopped calling the shared loader, the two hosts would have
        // begun assembling the operating day from two definitions.
        const src = statements(code("lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts"));
        expect(src).toMatch(/loadSchedulingProjectionForStaff/);
        expect(src).not.toMatch(/from\(\s*["']schedule_assignments["']\s*\)\s*\.\s*insert/);
    });
});

describe("Job Title is not Assignment Type, and neither is RBAC", () => {
    it("no staff module derives an assignment type from a position", () => {
        const offenders: string[] = [];
        for (const rel of [
            "lib/staffReadiness/staffReadinessService.ts",
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts",
        ]) {
            const src = statements(code(rel));
            if (/position[A-Za-z]*\s*(\?\?|\|\|)?\s*.{0,40}assignment_type|assignmentType.{0,30}position/i.test(src)) {
                offenders.push(rel);
            }
        }
        expect(offenders, "a Lead Teacher may hold a Float Coverage assignment").toEqual([]);
    });

    it("employment confers no access — nothing reads a position to decide permission", () => {
        const src = statements(code("lib/employment/employmentTypes.ts"));
        expect(src).not.toMatch(/role|permission|capability|rbac/i);
    });
});

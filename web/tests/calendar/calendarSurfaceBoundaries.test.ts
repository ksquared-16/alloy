/**
 * The two lines the Calendar must not cross.
 *
 * It must not decide staffing, and it must not write except through the
 * registered Coverage commands. Both are architecture rather than behaviour, so
 * a source guard is the honest test: it cannot prove the surface renders
 * correctly, and it can prove that a later edit did not quietly put a second
 * staffing engine or a private mutation path into the UI layer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SURFACE = resolve(__dirname, "../../components/adminV2/calendar/OperationsCalendarSurface.tsx");
const COMMANDS = resolve(__dirname, "../../components/adminV2/calendar/coverageCommands.ts");

function code(path: string): string {
    return readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("the Calendar decides pixels, not staffing", () => {
    const surface = code(SURFACE);

    it("never calls the sufficiency resolvers itself", () => {
        expect(surface).not.toContain("resolveStaffingSufficiency");
        expect(surface).not.toContain("resolveRequiredStaffDemand");
        expect(surface).not.toContain("requiredStaffForChildren");
    });

    it("never re-derives a verdict from counts", () => {
        /*
         * The shape that matters is COMPARING the two: planned against required,
         * in either direction, is the UI deciding whether a room is staffed.
         *
         * `plannedStaff.length > 0` is deliberately not caught. It asks whether
         * there is a list to render, which is a rendering question — a guard that
         * failed on it would be teaching the next author to work around the test
         * rather than to keep the arithmetic out of the surface.
         */
        expect(surface).not.toMatch(/requiredStaff[^\n]*[<>]=?[^\n]*planned/);
        expect(surface).not.toMatch(/planned[^\n]*[<>]=?[^\n]*requiredStaff/);
        expect(surface).not.toMatch(/requiredStaff\s*-\s*/);
        expect(surface).not.toMatch(/Math\.max\(0,\s*[^)]*required/);
    });

    it("reads its words from the projection's explanation, not from its own copy", () => {
        expect(surface).toContain("segment.explanation.lines");
    });
});

describe("the Calendar writes only through registered commands", () => {
    const surface = code(SURFACE);
    const commands = code(COMMANDS);

    it("posts no fetch of its own", () => {
        // One read is allowed and named; every mutation goes through the command
        // module, so the surface itself must contain no POST.
        expect(surface).toContain("/api/admin/scheduling/staffing-projection");
        expect(surface).not.toContain('method: "POST"');
    });

    it("touches no Coverage table or RPC directly", () => {
        for (const forbidden of [
            "staff_coverage_allocations",
            "staff_coverage_plan",
            "staff_coverage_supersede",
            "staff_coverage_cancel",
            ".from(",
            ".rpc(",
        ]) {
            expect(surface, `surface must not contain ${forbidden}`).not.toContain(forbidden);
            expect(commands, `commands must not contain ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("sends every mutation to the one action runtime endpoint", () => {
        const posts = commands.match(/fetch\(/g) ?? [];
        expect(posts).toHaveLength(1);
        expect(commands).toContain('"/api/admin/actions/execute"');
        for (const key of [
            "staff_coverage.plan",
            "staff_coverage.change",
            "staff_coverage.correct",
            "staff_coverage.cancel",
            "staff_availability.add_exception",
        ]) {
            expect(commands).toContain(key);
        }
    });

    it("does not cancel anyone's Coverage as a side effect of a call-out", () => {
        // The call-out records the availability fact and stops there; cancelling a
        // plan has consequences for the rooms it covered and is the operator's call.
        const callOut = commands.slice(commands.indexOf("export function callOutCommand"));
        expect(callOut).toContain("staff_availability.add_exception");
        expect(callOut).not.toContain("staff_coverage.cancel");
    });
});

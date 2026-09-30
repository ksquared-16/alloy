/**
 * NO SECOND PATH TO EFFECTIVE-DATED TRUTH.
 *
 * The behavioural matrices prove the canonical path is correct. This proves it is the ONLY path — the
 * question a behavioural test structurally cannot answer, because a bypass passes every test of the
 * path it bypasses.
 *
 * Every production writer of `child_placements` and `schedule_assignments` is classified here. A new
 * writer fails this test until someone classifies it, which is the point: the last bypass
 * (`applyChildParticipationEdit`) existed for months behind a canonical service that looked correct,
 * and a public contract that claimed in-place mutation "is refused for every caller" while nothing
 * enforced it.
 *
 * CLASSES
 *   CANONICAL_TEMPORAL  supersession/cancellation inside a canonical service, or the one gateway
 *   INITIALIZATION      creates the first operational row; no prior interval to close
 *   PROPOSED_LIFECYCLE  operates on proposed/non-operational rows, outside the temporal invariant
 *   MAINTENANCE         status/date maintenance that does not redefine a fact
 *   SCRIPT              seed or verification scripts, not reachable from the application
 *   UNEXPLAINED         nothing may be here
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const ROOTS = ["lib", "app", "scripts"];
const TABLES = ["child_placements", "schedule_assignments"];

type Site = { file: string; table: string; op: string; line: number };

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

/** Strips comments so a table name inside prose cannot be mistaken for a writer. */
function codeOnly(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

function mutationSites(): Site[] {
    const sites: Site[] = [];
    for (const root of ROOTS) {
        const dir = join(WEB, root);
        let files: string[] = [];
        try {
            files = walk(dir);
        } catch {
            continue;
        }
        for (const file of files) {
            const code = codeOnly(readFileSync(file, "utf8"));
            for (const table of TABLES) {
                // `.from("<table>")` followed by a mutating call, allowing the chain to wrap lines.
                const re = new RegExp(
                    `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
                    "g",
                );
                let m: RegExpExecArray | null;
                while ((m = re.exec(code))) {
                    sites.push({
                        file: relative(WEB, file),
                        table,
                        op: m[1],
                        line: code.slice(0, m.index).split("\n").length,
                    });
                }
            }
        }
    }
    return sites;
}

/**
 * The classified register. Keyed by file, because the classification is a property of what the file is
 * for, not of an individual line — line numbers move and would make this a maintenance tax that
 * teaches nothing.
 */
const REGISTER: Record<string, { class: string; why: string }> = {
    "lib/childcareOperational/childPlacementService.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "The canonical Placement service. Its remaining writes are the INITIAL placement insert and"
            + " cancellation; supersession delegates to the transactional primitive.",
    },
    "lib/childcareOperational/scheduleAssignmentService.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "The canonical child Scheduling service, same shape: initial insert and cancellation only;"
            + " supersession delegates to the transactional primitive.",
    },
    "lib/operationalAssignments/operationalAssignmentService.ts": {
        class: "PROPOSED_LIFECYCLE",
        why: "Creates, promotes and deletes PROPOSED assignments. A proposed row is not operational"
            + " truth, so it is outside the supersession invariant; promotion is where it enters it.",
    },
    "lib/operationalAssignments/setPrimaryOperationalAssignment.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "Owns the primary-assignment switch for both child and staff subjects, including the staff"
            + " overlap rules the child-only combined primitive deliberately does not serve.",
    },
    "lib/operationalAssignments/archiveOperationalAssignment.ts": {
        class: "MAINTENANCE",
        why: "Archives an assignment. It closes a row rather than redefining a fact, so it asserts no"
            + " new truth interval.",
    },
    "scripts/verifyBosCreateLeadEnrollment.ts": {
        class: "SCRIPT",
        why: "Verification script teardown. Not reachable from the application.",
    },
    "scripts/seedAssignmentPlatformQaDensity.ts": {
        class: "SCRIPT",
        why: "QA density seed. Not reachable from the application.",
    },
};

describe("temporal writer census — one path to effective-dated truth", () => {
    const sites = mutationSites();

    it("finds writers at all, so a silent parser failure cannot report a clean census", () => {
        // A census that finds nothing proves nothing. This floor is deliberately relational: the
        // canonical services must be among what it found.
        expect(sites.length).toBeGreaterThan(4);
        const files = new Set(sites.map((s) => s.file));
        expect(files).toContain("lib/childcareOperational/childPlacementService.ts");
        expect(files).toContain("lib/childcareOperational/scheduleAssignmentService.ts");
    });

    it("has ZERO unexplained in-place operational writers", () => {
        const unexplained = sites
            .filter((s) => !REGISTER[s.file])
            .map((s) => `${s.file}:${s.line} ${s.op} ${s.table}`);
        expect(
            unexplained,
            "a new writer of effective-dated operational truth appeared. Classify it in REGISTER, and if"
                + " it changes a defining fact in place, route it through the canonical service instead:"
                + " an in-place write emits no change event, and a partner that already synchronised the"
                + " row learns of the change through that event and nothing else.",
        ).toEqual([]);
    });

    it("no writer is classified UNEXPLAINED", () => {
        const bad = Object.entries(REGISTER)
            .filter(([, v]) => v.class === "UNEXPLAINED")
            .map(([k]) => k);
        expect(bad).toEqual([]);
    });

    it("applyChildParticipationEdit no longer writes operational truth directly", () => {
        const file = "lib/childcareOperational/applyChildParticipationEdit.ts";
        const own = sites.filter((s) => s.file === file);
        expect(
            own.map((s) => `${s.op}@${s.line}`),
            "this is the measured bypass. It updated child_placements and schedule_assignments in place"
                + " and emitted no change event; it must route through the canonical command instead.",
        ).toEqual([]);
    });

    it("the mounted participation surfaces never write effective-dated truth themselves", () => {
        // Source-level, and deliberately so: this is the question behaviour cannot answer. A route that
        // grew its own UPDATE would pass every behavioural test of the path it bypassed.
        const routes = [
            "app/api/admin/child-participation",
            "app/api/admin/scheduling",
            "app/api/admin/child-placements",
            "app/api/v1/placements/move",
        ];
        const offenders: string[] = [];
        for (const route of routes) {
            const dir = join(WEB, route);
            let files: string[] = [];
            try {
                files = statSync(dir).isDirectory() ? walk(dir) : [dir];
            } catch {
                continue;
            }
            for (const file of files) {
                const code = codeOnly(readFileSync(file, "utf8"));
                for (const table of TABLES) {
                    // Reads are fine and several routes legitimately need them (the scheduling route
                    // resolves a child's current program category from their placement). The invariant
                    // is about WRITES: a route must not author effective-dated truth itself.
                    const re = new RegExp(
                        `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
                    );
                    if (re.test(code)) {
                        offenders.push(`${relative(WEB, file)} writes ${table} directly`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

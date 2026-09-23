/**
 * Tests must not assume they can clean up after writing to an append-only ledger.
 *
 * ── THE INCIDENT THIS EXISTS FOR ──
 *
 * A certification suite seeded attendance facts at exact timestamps to prove boundary behaviour,
 * and intended to delete them in `afterAll`. It could not: `child_attendance_events` refuses DELETE
 * at the database — *"append-only: record a correction or reversal event instead"* — which is
 * precisely the property the public contract advertises. Thirty-six rows are now a permanent part
 * of the certification tenant, and they later confused a different test, because they are recorded
 * at year-2030 instants and therefore sort after everything real.
 *
 * The lesson is not "write fewer tests". It is that a table whose whole design is that nothing is
 * ever removed will not make an exception for a test, and the time to notice is before the insert.
 *
 * ── WHAT THIS GUARD DOES ──
 *
 * It fails if any test file deletes from an append-only canonical table. It is deliberately narrow:
 * a lint rule for one class of mistake, not a test-platform. Writing to these tables stays allowed —
 * certifying a write means writing — but the cleanup that cannot work is caught at the point
 * someone writes it, rather than at the point the rows become permanent.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../../..");
const TEST_ROOTS = ["tests", "playwright/tests"];

/**
 * Canonical tables that refuse DELETE.
 *
 * `child_attendance_events` states it in the refusal itself. Add a table here when its migration
 * establishes the same rule — the cost of being wrong in this direction is a test that fails
 * honestly, and of being wrong in the other is data nobody can remove.
 */
const APPEND_ONLY_TABLES = ["child_attendance_events"];

function testFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
        }
    };
    for (const root of TEST_ROOTS) walk(resolve(WEB, root));
    return out;
}

describe("no test assumes destructive cleanup of an append-only ledger", () => {
    it("finds the test corpus it is guarding", () => {
        expect(testFiles().length).toBeGreaterThan(50);
    });

    for (const table of APPEND_ONLY_TABLES) {
        it(`no test deletes from ${table}`, () => {
            const offenders: string[] = [];
            for (const file of testFiles()) {
                const source = readFileSync(file, "utf8");
                if (!source.includes(table)) continue;
                /*
                 * The shape that cannot work: a supabase-js delete aimed at this table. Matched
                 * across the whitespace a formatter may introduce between the chained calls.
                 */
                const pattern = new RegExp(
                    `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,200}?\\.delete\\(`,
                );
                if (pattern.test(source)) offenders.push(relative(WEB, file));
            }
            expect(
                offenders,
                `${table} refuses DELETE. Facts written by a test are permanent — mark them, keep them few, `
                + "and read them rather than planning to remove them.",
            ).toEqual([]);
        });
    }

    it("the rule is recorded where a test author will meet it", () => {
        // A guard nobody can find the reason for gets deleted the first time it is inconvenient.
        const source = readFileSync(resolve(WEB, "tests/platform/external/appendOnlyFixtureSafety.test.ts"), "utf8");
        expect(source).toContain("append-only: record a correction or reversal event instead");
    });
});

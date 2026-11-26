/**
 * THE ATTENDANCE DOC SAYS WHAT THE SCHEMA SAYS.
 *
 * The canonical owner previously described attendance corrections as effective-dated supersession —
 * "prior row closed the day before, successor links via `supersedes_*`, following `effectiveDating.ts`".
 * That was the Placement/Scheduling model read onto a domain that does not use it: attendance tables
 * carry no `supersedes_*` and no `end_date`, because an attendance fact is a point-in-time observation
 * rather than a bounded interval of asserted truth.
 *
 * A wrong model in a canonical doc is expensive in a way a wrong detail is not — a reader plans around
 * it, and a benchmark consumer infers from it. So the corrected claims are bound to the migrations here
 * rather than left as prose that nothing checks.
 *
 * Deliberately filesystem-only: it must run in CI with no database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const DOC = join(ROOT, "docs/platform/modules/attendance-system.md");
const EVENT_TABLES = ["child_attendance_events", "staff_presence_events"];

function migrationSql(): Array<{ file: string; sql: string }> {
    return readdirSync(MIGRATIONS)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }));
}

/** Statements that create or alter one of the attendance event tables. */
function statementsTouching(table: string): string[] {
    const out: string[] = [];
    for (const { sql } of migrationSql()) {
        for (const stmt of sql.split(";")) {
            if (new RegExp(`(CREATE TABLE[^;]*|ALTER TABLE[^;]*)\\b${table}\\b`, "i").test(stmt)) {
                out.push(stmt);
            }
        }
    }
    return out;
}

const doc = readFileSync(DOC, "utf8");

describe("Attendance certification claims are bound to the schema", () => {
    it("finds the attendance migrations at all, so a parser failure cannot report a clean pass", () => {
        for (const t of EVENT_TABLES) {
            expect(statementsTouching(t).length, `no migration statement touches ${t}`).toBeGreaterThan(0);
        }
        expect(doc.length).toBeGreaterThan(2000);
    });

    it("the event tables carry a correction LINK, not a truth interval", () => {
        for (const table of EVENT_TABLES) {
            const stmts = statementsTouching(table).join("\n");
            expect(stmts, `${table} should define entry_type`).toMatch(/entry_type/);
            expect(stmts, `${table} should define corrects_event_id`).toMatch(/corrects_event_id/);
        }
    });

    it("no attendance event table ever grows a supersedes_* or end_date column", () => {
        // The absence IS the invariant: adding either would mean someone had started modelling
        // attendance as an interval, which is the confusion this test exists to catch.
        const offenders: string[] = [];
        for (const table of EVENT_TABLES) {
            for (const stmt of statementsTouching(table)) {
                if (/\bsupersedes_[a-z_]*\b/i.test(stmt)) offenders.push(`${table}: supersedes_* column`);
                if (/\bend_date\b/i.test(stmt)) offenders.push(`${table}: end_date column`);
            }
        }
        expect(
            [...new Set(offenders)],
            "an attendance event table gained an interval column. Attendance records point-in-time "
                + "observations and corrects them by link; if it genuinely needs truth intervals that is a "
                + "product decision, and the canonical doc's rule 3 must change with it.",
        ).toEqual([]);
    });

    it("immutability is enforced by a database trigger, not by convention alone", () => {
        const all = migrationSql().map((m) => m.sql).join("\n");
        for (const fn of [
            "prevent_child_attendance_events_mutation",
            "prevent_staff_presence_events_mutation",
        ]) {
            expect(all, `${fn} should exist in the migrations`).toContain(fn);
        }
    });

    it("`excused` is not a fact kind anywhere, and the doc no longer claims it is", () => {
        const kindChecks = migrationSql()
            .map((m) => m.sql)
            .join("\n")
            .match(/event_kind[^;]*CHECK[^;]*/gi) ?? [];
        expect(kindChecks.join("\n").toLowerCase()).not.toContain("excused");
        // The doc may DISCUSS its absence; it must not list it as a fact kind.
        expect(doc).not.toMatch(/present \/ absent \/ excused/);
    });

    it("the doc does not describe attendance corrections as effective-dated supersession", () => {
        const rule = doc.slice(doc.indexOf("## Canonical model rules"));
        // Blockquote lines are stripped: rule 3 QUOTES the wrong phrasing in order to explain what was
        // corrected, and a doc must be able to quote what it fixed. Only the assertion counts, not the
        // quotation of the retracted one. (My first version of this test failed on its own quote.)
        const claim = rule
            .slice(0, rule.indexOf("\n4."))
            .split("\n")
            .filter((l) => !/^\s*>/.test(l))
            .join("\n");
        expect(
            /prior row closed the day before/i.test(claim)
                || /successor links via a `supersedes_\*` reference/i.test(claim),
            "rule 3 is describing the Placement/Scheduling interval model again. Attendance has no "
                + "supersedes_* and no end_date; a correction is a new event linked by corrects_event_id.",
        ).toBe(false);
        expect(claim).toMatch(/entry_type/);
        expect(claim).toMatch(/corrects_event_id/);
    });
});

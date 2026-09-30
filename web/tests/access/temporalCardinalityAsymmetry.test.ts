import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * THE CARDINALITY ASYMMETRY IS REAL, AND FLATTENING IT IS A REGRESSION.
 *
 * `docs/platform/core/effective-dated-assignment-doctrine.md` first claimed that every governed
 * effective-dated table enforces "at most one operational row per subject". That was wrong, and wrong
 * in a way that mattered: it is true of placements and of child PRIMARY schedule assignments, and false
 * of staff. Staff primary assignments are governed only by the overlap trigger, so a staff member may
 * hold a current primary assignment and a future-dated one at the same time — legal because the
 * intervals are disjoint. A child may not: the partial unique index forbids a second operational row
 * per agreement whether or not the dates overlap.
 *
 * That asymmetry is a product difference, not an accident of migration order. The 2026-07 assignment
 * foundation dropped the operational-status uniqueness deliberately, arguing it "would block
 * non-overlapping history or future primary changes"; 2026-10 then added the stricter child index; and
 * 2026-10-23 narrowed the overlap trigger to closed rows so both halves use ONE definition of "in
 * effect". Three migrations, one settled shape.
 *
 * This lock exists because the doctrine is the thing an agent reads to decide what is safe to infer,
 * and the tempting simplification — "one operational row, everywhere" — is exactly what I wrote first.
 * If someone adds a staff single-operational index, or removes a child one, the doctrine silently stops
 * describing the database. These assertions fail in that case, by name.
 *
 * Source-level on purpose: the invariants ARE migration statements, and the behavioural half belongs in
 * the live matrix that exercises the transactional primitive against a real database.
 */

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "supabase", "migrations");

/** Comments explain; they do not execute. */
const executable = (sql: string) =>
    sql
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");

const allSql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, code: executable(readFileSync(join(MIGRATIONS, f), "utf8")) }));

const corpus = allSql.map((m) => m.code).join("\n");

/**
 * The live shape of an index, after every CREATE and DROP in version order. A migration that drops an
 * index and a later one that recreates it must resolve to "present" — reading only the first CREATE
 * would have made this lock assert a world three migrations out of date.
 */
function indexIsLive(name: string): boolean {
    let live = false;
    for (const m of allSql) {
        if (new RegExp(`DROP\\s+INDEX[^;]*\\b${name}\\b`, "i").test(m.code)) live = false;
        if (new RegExp(`CREATE\\s+UNIQUE\\s+INDEX[^;]*\\b${name}\\b`, "i").test(m.code)) live = true;
    }
    return live;
}

describe("effective-dated cardinality is not uniform, and the difference is load-bearing", () => {
    it("is not vacuous: the migration corpus parses and contains the temporal tables", () => {
        expect(allSql.length).toBeGreaterThan(400);
        expect(corpus).toContain("child_placements");
        expect(corpus).toContain("schedule_assignments");
    });

    it("a placement allows at most ONE operational row per agreement", () => {
        expect(
            indexIsLive("ux_child_placements_one_operational_per_agreement"),
            "the placement single-operational index is gone. The doctrine says a future-dated placement "
                + "change REPLACES the current one rather than coexisting with it, and that claim rests on "
                + "this index.",
        ).toBe(true);
    });

    it("a child primary assignment allows at most ONE operational row per agreement", () => {
        expect(
            indexIsLive("ux_schedule_assignments_one_operational_primary_child"),
            "the child-primary single-operational index is gone. Children and staff would then share one "
                + "cardinality rule, which is not what the product does.",
        ).toBe(true);
    });

    it("staff primary assignments are governed by overlap ONLY — no single-operational index", () => {
        /*
         * The absence is the invariant here, so it is asserted directly. A staff single-operational
         * index would forbid a staff member holding a current and a future-dated primary assignment,
         * which the overlap rule deliberately permits because the intervals are disjoint.
         */
        const staffUnique = allSql.filter((m) =>
            /CREATE\s+UNIQUE\s+INDEX[^;]*schedule_assignments[^;]*subject_type\s*=\s*'staff'/i.test(m.code),
        );
        expect(
            staffUnique.map((m) => m.file),
            "a UNIQUE index now constrains staff assignments by subject_type = 'staff'. If that is "
                + "intended, the doctrine's cardinality table must change with it — staff can currently "
                + "hold a current and a future-dated primary assignment.",
        ).toEqual([]);
    });

    it("the overlap trigger exists and is the staff mechanism", () => {
        expect(corpus).toMatch(/validate_schedule_assignments_primary_overlap/);
        expect(
            /CREATE\s+TRIGGER[^;]*trg_validate_schedule_assignments_primary_overlap/i.test(corpus),
            "the overlap trigger is not installed, so nothing stops two operational primary assignments "
                + "overlapping for the same subject",
        ).toBe(true);
    });

    it("one definition of 'in effect' — every mechanism names the same operational statuses", () => {
        /*
         * 2026-10-23's whole point: the trigger ignored status and blocked a cancelled row's own
         * replacement, so cancellation freed the uniqueness index but not the calendar. The fix was to
         * make the trigger name the same statuses the index and every reader already used. If these
         * drift apart again, "in effect" means two things and the doctrine describes neither.
         */
        const operational = /'planned'[\s\S]{0,40}'active'[\s\S]{0,40}'ending'/;
        for (const name of [
            "ux_child_placements_one_operational_per_agreement",
            "ux_schedule_assignments_one_operational_primary_child",
        ]) {
            const decl = allSql
                .map((m) => new RegExp(`CREATE\\s+UNIQUE\\s+INDEX[^;]*${name}[^;]*;`, "is").exec(m.code)?.[0])
                .filter(Boolean)
                .pop();
            expect(decl, `${name} has no CREATE statement to read`).toBeTruthy();
            expect(
                operational.test(decl ?? ""),
                `${name} no longer filters on planned/active/ending, so it and the overlap trigger would "
                    + "disagree about what is in effect`,
            ).toBe(true);
        }
    });

    it("the doctrine document states the asymmetry rather than a single uniform rule", () => {
        const doctrine = readFileSync(
            resolve(__dirname, "..", "..", "..", "docs", "platform", "core", "effective-dated-assignment-doctrine.md"),
            "utf8",
        );
        expect(doctrine, "the doctrine no longer mentions the overlap mechanism").toMatch(
            /validate_schedule_assignments_primary_overlap/,
        );
        expect(
            /staff[\s\S]{0,200}future-dated/i.test(doctrine),
            "the doctrine no longer says a staff member may hold a current and a future-dated primary "
                + "assignment. That sentence is the correction; without it the document reads as though one "
                + "cardinality rule covers every table, which is how it was first written and wrong.",
        ).toBe(true);
    });
});

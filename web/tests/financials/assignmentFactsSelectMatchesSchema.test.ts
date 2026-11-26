/**
 * THE SELECT MAY NOT ASK FOR A COLUMN THE SCHEMA RENAMED AWAY.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `readAssignmentPricingFacts` selected `desired_start_date` from
 * `opportunity_customer_members`. `20260711000000_enrollment_participation_canonical_fields`
 * RENAMED that column to `start_date` in July — and the select asked for BOTH, so PostgREST
 * answered `42703 column opportunity_customer_members.desired_start_date does not exist` and EVERY
 * assignment pricing read failed, on every tenant, from that migration onward.
 *
 * Nothing said so. The error became `{ ok: false, code: "db_error" }`, which became a `null` view,
 * which became a dropped row, which became `assignments: []` and the sentence "No assignment on
 * this record to price." Two children whose assignment rows demonstrably existed read as a family
 * with nobody enrolled.
 *
 * ── WHY THIS LOCK IS SHAPED AGAINST THE MIGRATIONS ────────────────────────────────────────────
 *
 * This module's own sibling route carried the identical defect once before — a select left pointing
 * at `commercial_tuition_rates` columns a July migration had dropped — and its unit tests stayed
 * green because they built their own rows in the dropped shape. A fixture can agree with a stale
 * select forever. The migrations cannot: they are where the rename actually happened.
 *
 * So the retired names are DERIVED from the migration history rather than listed here, and a
 * rename made next year is covered without touching this file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");
const TABLE = "opportunity_customer_members";

/**
 * Replay the migrations IN ORDER and keep the live column set, because the last statement about a
 * column is the one that decides. A first draft scanned for renames and drops and then "undid" them
 * wherever an ADD mentioned the same name — which is not how time works: `desired_start_date` was
 * added in May and renamed away in July, and order is the only thing that tells those apart.
 */
function columnHistory(): { live: Set<string>; retired: Set<string> } {
    const live = new Set<string>();
    const everNamed = new Set<string>();
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const stmt = new RegExp(
        `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${TABLE}\\s+([\\s\\S]*?);`,
        "gi",
    );
    for (const file of files) {
        const sql = readFileSync(join(MIGRATIONS, file), "utf8");

        // The CREATE TABLE seeds the set.
        const create = new RegExp(`CREATE\\s+TABLE[^;]*?(?:public\\.)?${TABLE}\\s*\\(([\\s\\S]*?)\\n\\);`, "i").exec(sql);
        if (create) {
            for (const line of create[1]!.split("\n")) {
                const m = /^\s{4}([a-z0-9_]+)\s+/i.exec(line);
                if (m) { live.add(m[1]!.toLowerCase()); everNamed.add(m[1]!.toLowerCase()); }
            }
        }

        for (const [, body] of sql.matchAll(stmt)) {
            for (const [, col] of body.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/gi)) {
                live.add(col.toLowerCase());
                everNamed.add(col.toLowerCase());
            }
            for (const [, from_, to] of body.matchAll(/RENAME\s+COLUMN\s+([a-z0-9_]+)\s+TO\s+([a-z0-9_]+)/gi)) {
                live.delete(from_.toLowerCase());
                live.add(to.toLowerCase());
                everNamed.add(from_.toLowerCase());
                everNamed.add(to.toLowerCase());
            }
            for (const [, col] of body.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z0-9_]+)/gi)) {
                live.delete(col.toLowerCase());
                everNamed.add(col.toLowerCase());
            }
        }
    }
    const retired = new Set([...everNamed].filter((c) => !live.has(c)));
    return { live, retired };
}

/** The select call in the facts reader, and nothing else in the file. */
function factsSelect(): string {
    const src = readFileSync(join(process.cwd(), "lib/enrollment/pricing/assignmentPricingFacts.ts"), "utf8");
    const from = src.indexOf(`.from("${TABLE}")`);
    expect(from, "the assignment read is findable").toBeGreaterThan(0);
    const select = src.indexOf(".select(", from);
    const end = src.indexOf(")", select);
    return src.slice(select, end + 1);
}

describe("THE GATE — the migrations decide which columns exist", () => {
    it("knows the rename actually happened", () => {
        const { retired } = columnHistory();
        expect(retired, "20260711000000 renamed desired_start_date to start_date").toContain("desired_start_date");
        expect(retired, "and renamed desired_schedule_type").toContain("desired_schedule_type");
        expect(retired, "start_date is the surviving name").not.toContain("start_date");
    });

    it("does not ask opportunity_customer_members for a column it no longer has", () => {
        const call = factsSelect();
        expect(call.length, "the select call is findable").toBeGreaterThan(20);
        for (const col of columnHistory().retired) {
            expect(call, `the SELECT must not ask for retired column ${col}`).not.toMatch(
                new RegExp(`\\b${col}\\b`),
            );
        }
    });

    /* The canonical name IS read — removing the stale one must not remove the fact. */
    it("still reads the assignment's canonical start date", () => {
        expect(factsSelect()).toMatch(/\bstart_date\b/);
    });
});

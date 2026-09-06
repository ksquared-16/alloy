/**
 * THE DROPPED COLUMNS MUST NOT COME BACK.
 *
 * `20260702000002_commercial_tuition_rates_v2` dropped `program_key`, `schedule_key` and
 * `billing_period` from `commercial_tuition_rates` in favour of `variant_id`, `cadence_key` and
 * `payer_type`. Two readers kept selecting them for two months. Every request they served answered
 * `42703 column commercial_tuition_rates.program_key does not exist`, and nobody noticed, because
 * both readers were covered by unit tests that built their own rows in the dropped shape. Green
 * tests over an invented shape are worse than no tests: they report that a broken path works.
 *
 * So this test does not exercise a function. It reads the source and refuses the shape — the only
 * kind of test that could have caught the original defect, because the defect was that the code and
 * the database disagreed about what one table has.
 *
 * It is deliberately narrow. `program_key` is a real column on `program_offerings`,
 * `commercial_products` and `commercial_policies`, and this rule has nothing to say about those:
 * only a query ON `commercial_tuition_rates`, and only a row type OF that table, is in scope.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const SCANNED = ["app", "lib", "components", "tests"];
const DROPPED = ["program_key", "schedule_key", "billing_period"];
const TABLE = "commercial_tuition_rates";

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

/**
 * The `.select(...)` that belongs to a `.from("commercial_tuition_rates")` chain.
 *
 * Deliberately literal: it matches the shape the broken readers actually had — a `from` naming the
 * table, then a `select` within the same chain — rather than trying to understand the code.
 */
function tuitionRateSelects(source: string): string[] {
    const out: string[] = [];
    const re = new RegExp(
        `\\.from\\(\\s*["'\`]${TABLE}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.select\\(\\s*(["'\`])([\\s\\S]*?)\\1`,
        "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[2]!);
    return out;
}

describe("commercial_tuition_rates — the V2-dropped columns cannot be read again", () => {
    const files = SCANNED.flatMap((d) => {
        try {
            return walk(join(ROOT, d));
        } catch {
            return [];
        }
    });

    it("scans a real body of source (the guard is not vacuously passing)", () => {
        expect(files.length).toBeGreaterThan(500);
        const withTable = files.filter((f) => readFileSync(f, "utf8").includes(TABLE));
        expect(withTable.length).toBeGreaterThan(0);
    });

    it("finds the queries it is meant to police", () => {
        // If the `from(...).select(...)` shape ever stops matching, this rule would pass by finding
        // nothing at all — so it has to prove it still finds the real ones.
        const found = files.flatMap((f) => tuitionRateSelects(readFileSync(f, "utf8")));
        expect(found.length).toBeGreaterThan(0);
    });

    it("no query on the tuition rates table selects a dropped column", () => {
        const offenders: string[] = [];
        for (const file of files) {
            const source = readFileSync(file, "utf8");
            if (!source.includes(TABLE)) continue;
            for (const arg of tuitionRateSelects(source)) {
                for (const column of DROPPED) {
                    if (new RegExp(`\\b${column}\\b`).test(arg)) {
                        offenders.push(`${file.slice(ROOT.length + 1)} → select("${arg}")`);
                    }
                }
            }
        }
        expect(offenders, "these selects would answer 42703 against the real database").toEqual([]);
    });

    /*
     * The narrower half of the same rule. A row type declared in the dropped shape is what let the
     * original readers typecheck while the database refused them.
     */
    it("the tuition rate row types declare the V3 shape, not the dropped one", () => {
        const declarations = [
            { file: "lib/commercial/tuitionRates.ts", type: "TuitionRateRow" },
            { file: "lib/commercial/execution/commercialExport.ts", type: "TuitionRateDef" },
        ];
        for (const { file, type } of declarations) {
            const source = readFileSync(join(ROOT, file), "utf8");
            const start = source.indexOf(`export type ${type} = {`);
            expect(start, `${type} should be declared in ${file}`).toBeGreaterThan(-1);
            const block = source.slice(start, source.indexOf("\n};", start));
            for (const column of DROPPED) {
                expect(
                    new RegExp(`^\\s+${column}\\??:`, "m").test(block),
                    `${type} must not declare ${column}`,
                ).toBe(false);
            }
            // And it must carry what actually replaced them.
            expect(/variant_?[Ii]d/.test(block), `${type} must carry the variant`).toBe(true);
            expect(/cadence_?[Kk]ey/.test(block), `${type} must carry the cadence`).toBe(true);
        }
    });
});

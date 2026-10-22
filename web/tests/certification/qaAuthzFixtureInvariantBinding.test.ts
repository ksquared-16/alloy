/**
 * Documents Q1 G1/G2 — the isolated rollback tests exercise the EXACT registered fixture and census bytes.
 *
 * `database.run_rollback_invariant_test` refuses psql meta-commands, so the hosted fixtures (which use
 * `\if` / `\gset` / `\set` guards) cannot be run there byte-for-byte. The invariant tests therefore carry
 * each fixture statement with its psql variables substituted. This test is what makes that a proof
 * rather than a resemblance: every DELETE / INSERT and every guard predicate in the four fixture files,
 * after substitution for the org branch it runs in, must appear verbatim (whitespace-normalised) in the
 * G1 invariant test; and the census statement must appear byte-for-byte in the G2 invariant test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6";
const RUN = "qar_invariant0001";

const norm = (s: string) => s.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** `\set name 'value'` lines → substitution map. */
function setVars(sql: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of sql.matchAll(/^\\set\s+(\w+)\s+'([^']*)'\s*$/gm)) out[m[1]] = m[2];
    return out;
}

function substitute(stmt: string, org: string, vars: Record<string, string>): string {
    let s = stmt.replace(/:'org'/g, `'${org}'`).replace(/:'qa_run_id'/g, `'${RUN}'`);
    for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`:'${k}'`, "g"), `'${v}'`);
    if (/:'\w+'/.test(s)) throw new Error(`unsubstituted psql variable in: ${s.slice(0, 120)}`);
    return s;
}

/** DML statements of a fixture region (meta-command lines and DO bodies removed). */
function dml(region: string): string[] {
    const cleaned = region
        .split("\n")
        .filter((l) => !/^\s*\\/.test(l))
        .join("\n")
        .replace(/do \$\$[\s\S]*?\$\$;/gi, " ");
    return [...cleaned.matchAll(/\b(delete\s+from|insert\s+into)\b[\s\S]*?;/gi)].map((m) => m[0].replace(/;\s*$/, ""));
}

/** Inner predicates of `select exists ( … ) as x \gset` guards. */
function guards(sql: string): string[] {
    return [...sql.matchAll(/select exists \(([\s\S]*?)\)\s+as\s+\w+\s+\\gset/gi)].map((m) => m[1]);
}

/** Split a fixture at `\if :is_qa_shared` into [common, sharedBranch, secondaryBranch]. */
function branches(sql: string): { common: string; shared: string; secondary: string } {
    const i = sql.indexOf("\\if :is_qa_shared");
    if (i < 0) return { common: sql, shared: "", secondary: "" };
    const rest = sql.slice(i);
    const e = rest.indexOf("\n\\else");
    const end = rest.indexOf("\n\\endif", e);
    return { common: sql.slice(0, i), shared: rest.slice(0, e), secondary: rest.slice(e, end) };
}

const G1 = norm(read("certification/invariants/documents-q1-g1-subject-fixtures.sql"));

describe("G1 invariant test carries every fixture statement, substituted", () => {
    const cases: Array<{ file: string; orgsForCommon: string[] }> = [
        { file: "certification/fixtures/qa-authz-subjects-ensure.sql", orgsForCommon: [QA_SHARED, QA_SECONDARY] },
        { file: "certification/fixtures/qa-authz-subjects-reset.sql", orgsForCommon: [QA_SHARED, QA_SECONDARY] },
        { file: "certification/fixtures/qa-authz-vendors-ensure.sql", orgsForCommon: [QA_SHARED] },
        { file: "certification/fixtures/qa-authz-vendors-reset.sql", orgsForCommon: [QA_SHARED] },
    ];
    for (const { file, orgsForCommon } of cases) {
        it(`${file}: every DELETE/INSERT and guard predicate is exercised`, () => {
            const sql = read(file);
            const vars = setVars(sql);
            const b = branches(sql);
            const expected: string[] = [];
            for (const org of orgsForCommon) for (const st of dml(b.common)) expected.push(substitute(st, org, vars));
            for (const st of dml(b.shared)) expected.push(substitute(st, QA_SHARED, vars));
            for (const st of dml(b.secondary)) expected.push(substitute(st, QA_SECONDARY, vars));
            for (const g of guards(sql)) expected.push(substitute(g, QA_SHARED, vars));
            expect(expected.length).toBeGreaterThan(0);
            const missing = expected.filter((st) => !G1.includes(norm(st)));
            expect(missing, missing.join("\n---\n")).toEqual([]);
        });
    }

    it("the QA-org whitelist is never inside a dollar-quoted body (psql would not interpolate it)", () => {
        for (const f of [
            "certification/fixtures/qa-authz-subjects-ensure.sql",
            "certification/fixtures/qa-authz-subjects-reset.sql",
            "certification/fixtures/qa-authz-vendors-ensure.sql",
            "certification/fixtures/qa-authz-vendors-reset.sql",
        ]) {
            const bodies = [...read(f).matchAll(/do \$\$([\s\S]*?)\$\$;/gi)].map((m) => m[1]);
            expect(bodies.some((b) => /:'\w+'/.test(b)), f).toBe(false);
        }
    });
});

describe("G2 invariant test embeds the census verbatim", () => {
    it("the census statement appears byte-for-byte as the temp view", () => {
        const census = read("certification/qa-shared/documents-zero-residue-census.sql").trimEnd();
        const body = census.endsWith(";") ? census.slice(0, -1) : census;
        expect(read("certification/invariants/documents-q1-g2-residue-census.sql")).toContain(`CREATE TEMP VIEW v_doc_census AS\n${body}\n;`);
    });
});

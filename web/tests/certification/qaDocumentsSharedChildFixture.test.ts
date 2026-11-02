/**
 * Documents R5 — the shared-child subject fixture (qa-documents-shared-child-ensure.sql / -reset.sql, runner
 * scripts/qaDocumentsSharedChildFixture.mjs). No database: the fixture's protections are properties of its bytes and of
 * the runner's gates, and the rollback invariant that exercises it on an isolated environment must carry its exact
 * statements.
 *
 *   - Binding: every DELETE / INSERT and every refusal guard, with its psql variables substituted, appears verbatim
 *     (whitespace-normalised) in certification/invariants/documents-r5-shared-child-fixture.sql.
 *   - Ownership: every DELETE names the organization AND this fixture's exact ids — never a prefix, never the org alone —
 *     and none reaches documents, Forms, health facts, audit, journeys or QA structure.
 *   - Namespace: the ac000000- ids are disjoint from the authz_q1 (aa000000-) and D4 household (ab000000-) fixtures,
 *     whose prefix deletes therefore cannot reach them.
 *   - Runner: each gate refuses before any database connection.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const ENSURE = "certification/fixtures/qa-documents-shared-child-ensure.sql";
const RESET = "certification/fixtures/qa-documents-shared-child-reset.sql";
const INVARIANT = "certification/invariants/documents-r5-shared-child-fixture.sql";
const CENSUS = "certification/qa-shared/documents-r5-shared-child-residue-census.sql";
const RUNNER = resolve(ROOT, "web/scripts/qaDocumentsSharedChildFixture.mjs");

const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const RUN = "qar_00000000c5e0";
const OTHER_RUN = "qar_00000000c5e1";
const ID_KEYS = ["household", "child_shared", "child_only_a", "wu_d1", "lead_a", "lead_b", "ocm_a_shared", "ocm_a_only", "ocm_b_shared"];

const norm = (s: string) => s.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function setVars(sql: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of sql.matchAll(/^\\set\s+(\w+)\s+'([^']*)'\s*$/gm)) out[m[1]] = m[2];
    return out;
}

function substitute(stmt: string, vars: Record<string, string>, run = RUN): string {
    let s = stmt.replace(/:'org'/g, `'${QA_SHARED}'`).replace(/:'qa_run_id'/g, `'${run}'`);
    for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`:'${k}'`, "g"), `'${v}'`);
    if (/:'\w+'/.test(s)) throw new Error(`unsubstituted psql variable in: ${s.slice(0, 120)}`);
    return s;
}

/** Code with meta-command lines and DO bodies removed. */
function code(sql: string): string {
    return sql
        .split("\n")
        .filter((l) => !/^\s*\\/.test(l))
        .join("\n")
        .replace(/do \$\$[\s\S]*?\$\$;/gi, " ");
}

const dml = (sql: string) => [...code(sql).matchAll(/\b(delete\s+from|insert\s+into)\b[\s\S]*?;/gi)].map((m) => m[0].replace(/;\s*$/, ""));
const deletes = (sql: string) => dml(sql).filter((s) => /^delete/i.test(s));

/** `select [not] exists … as <name> \gset` refusal guards → [name, predicate]. */
const guards = (sql: string) =>
    [...sql.matchAll(/^select ((?:not )?exists [\s\S]*?)\s+as (\w+) \\gset/gm)].map((m) => [m[2], m[1]] as const);

const ensure = read(ENSURE);
const reset = read(RESET);

describe("the rollback invariant carries every fixture statement, substituted", () => {
    const inv = norm(read(INVARIANT));
    for (const file of [ENSURE, RESET]) {
        it(`${file}: every DELETE / INSERT and refusal guard is exercised`, () => {
            const sql = read(file);
            const vars = setVars(sql);
            const expected = [...dml(sql).map((s) => substitute(s, vars)), ...guards(sql).map(([, p]) => substitute(p, vars))];
            expect(expected.length).toBeGreaterThan(5);
            const missing = expected.filter((s) => !inv.includes(norm(s)));
            expect(missing, missing.join("\n---\n")).toEqual([]);
        });
    }

    it("the other-run guard is exercised with a DIFFERENT run id (the state it refuses)", () => {
        const pred = guards(ensure).find(([n]) => n === "shared_child_other_run")?.[1];
        expect(pred).toBeTruthy();
        expect(inv).toContain(norm(`IF NOT (${substitute(pred!, setVars(ensure), OTHER_RUN)})`));
    });

    it("the invariant asserts zero residue after a partial teardown, and unrelated rows untouched", () => {
        expect(inv).toContain(norm("CASE 4 FAILED: residue after reset"));
        expect(inv).toContain(norm("an unrelated row was touched"));
        expect(inv).toContain(norm("CASE 5 FAILED: the reset reached another organization"));
    });
});

describe("ownership: every DELETE is this fixture's own rows, by exact id", () => {
    const PRESERVED = [
        "documents", "storage", "form_", "person_health_facts", "mutation_events", "workflow_events", "process_instances", "departments", "orgs",
    ];
    for (const [file, sql] of [[ENSURE, ensure], [RESET, reset]] as const) {
        it(`${file}: org AND exact \\set ids; no prefix, no preserved table`, () => {
            const vars = setVars(sql);
            const ds = deletes(sql);
            expect(ds.length).toBe(5);
            for (const d of ds) {
                expect(d, d).toMatch(/where org_id = :'org'::uuid/);
                const ids = [...d.matchAll(/:'(\w+)'::uuid/g)].map((m) => m[1]).filter((v) => v !== "org");
                expect(ids.length, d).toBeGreaterThan(0);
                for (const v of ids) expect(ID_KEYS, `${v} in ${d}`).toContain(v);
                for (const v of ids) expect(vars[v], v).toMatch(/^ac000000-0000-4000-8000-/);
                expect(d.toLowerCase(), d).not.toContain(" like ");
                const table = /delete\s+from\s+public\.(\w+)/i.exec(d)?.[1] ?? "";
                expect(PRESERVED.some((p) => table.startsWith(p)), table).toBe(false);
            }
        });

        it(`${file}: one transaction, every write inside it, after every guard`, () => {
            const c = code(sql);
            expect(c.match(/^begin;$/gim)?.length).toBe(1);
            expect(c.match(/^commit;$/gim)?.length).toBe(1);
            const begin = c.search(/^begin;$/im);
            const commit = c.search(/^commit;$/im);
            for (const m of c.matchAll(/\b(delete\s+from|insert\s+into|update\s+public)\b/gi)) {
                expect(m.index! > begin && m.index! < commit, m[0]).toBe(true);
            }
            const lastGuard = Math.max(...[...sql.matchAll(/\\gset/g)].map((m) => m.index!).filter((i) => i < sql.indexOf("\nbegin;")));
            expect(lastGuard).toBeLessThan(sql.indexOf("\nbegin;"));
        });

        it(`${file}: QA Shared and the run id are guarded outside dollar quotes; no psql escape hatch`, () => {
            expect(sql).toContain(`select (:'org' = '${QA_SHARED}') as is_qa_shared \\gset`);
            expect(sql).toContain(`select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \\gset`);
            const bodies = [...sql.matchAll(/do \$\$([\s\S]*?)\$\$;/gi)].map((m) => m[1]);
            expect(bodies.some((b) => /:'\w+'/.test(b))).toBe(false);
            expect(sql).not.toMatch(/^[ \t]*\\(!|c\b|connect\b|o\b|out\b|i\b|ir\b|include|copy\b|setenv\b|w\b|write\b|lo_)/im);
            expect(sql.toLowerCase()).not.toContain("session_replication_role");
        });
    }

    it("both files refuse the same states, and each adds its own", () => {
        const names = (sql: string) => guards(sql).map(([n]) => n);
        const shared = ["shared_child_foreign_org", "shared_child_foreign_rows", "shared_child_documents_remaining",
            "shared_child_submissions_remaining", "shared_child_journey_remaining"];
        for (const n of shared) {
            expect(names(ensure)).toContain(n);
            expect(names(reset)).toContain(n);
            const pe = guards(ensure).find(([x]) => x === n)![1];
            const pr = guards(reset).find(([x]) => x === n)![1];
            expect(norm(pe), n).toBe(norm(pr));
        }
        expect(names(ensure)).toEqual(expect.arrayContaining(["permanent_d1_missing", "shared_child_other_run"]));
        expect(reset).toMatch(/select \(:shared_child_residue = 0\) as shared_child_zero \\gset\n\\if :shared_child_zero\n\\else[\s\S]*?raise exception/);
    });
});

describe("namespace", () => {
    it("ensure and reset name the same ids, all in ac000000-, none another fixture's", () => {
        const e = setVars(ensure);
        const r = setVars(reset);
        for (const k of ID_KEYS) {
            expect(e[k], k).toMatch(/^ac000000-0000-4000-8000-0000000005\d\d$/);
            expect(r[k], k).toBe(e[k]);
        }
        expect(new Set(ID_KEYS.map((k) => e[k])).size).toBe(ID_KEYS.length);
    });

    it("the other QA subject fixtures' prefix deletes cannot match an ac000000- id", () => {
        for (const f of ["certification/fixtures/qa-authz-subjects-ensure.sql", "certification/fixtures/qa-authz-subjects-reset.sql",
            "certification/fixtures/qa-documents-household-ensure.sql", "certification/fixtures/qa-documents-household-reset.sql"]) {
            const prefixes = [...read(f).matchAll(/like '([0-9a-f]{8}-)%'/g)].map((m) => m[1]);
            expect(prefixes.length, f).toBeGreaterThan(0);
            for (const p of prefixes) expect(p, f).not.toBe("ac000000-");
        }
    });
});

describe("supplementary residue census", () => {
    const census = read(CENSUS);
    it("is read-only and answers question_id | kind | payload", () => {
        expect(code(census)).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
        expect(census).toMatch(/^select question_id, kind, payload$/m);
    });
    it("measures every fixture table and the subjects' submissions and documents", () => {
        for (const id of ["r5sc_households", "r5sc_children", "r5sc_participations", "r5sc_leads_work_units",
            "r5sc_submissions_on_fixture_subjects", "r5sc_documents_on_fixture_subjects"]) {
            expect(census).toContain(`'${id}', 'check'`);
        }
        for (const t of ["customers", "customer_members", "opportunity_customer_members", "opportunities", "work_units", "form_submissions", "documents"]) {
            expect(census).toContain(`public.${t} `);
        }
    });
});

describe("runner gates refuse before any database connection", () => {
    const cwd = mkdtempSync(join(tmpdir(), "r5-shared-child-runner-")); // no .env / .env.local here
    afterAll(() => rmSync(cwd, { recursive: true, force: true }));
    const ARMED = { CERT_FIXTURE_APPLY: "1", DRY_RUN: "0", SYNTHETIC_ONLY: "1", ORG_ID: QA_SHARED, QA_RUN_ID: RUN, ALLOY_CANONICAL_ROOT: ROOT };

    function run(mode: string | null, env: Record<string, string>): { code: string; ok: boolean } {
        let out = "";
        try {
            out = execFileSync(process.execPath, [RUNNER, ...(mode ? [mode] : [])], {
                // Only PATH and the case's variables: nothing inherited can supply a database URL or a project ref.
                cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"],
            });
        } catch (e) {
            out = String((e as { stdout?: string }).stdout ?? "");
        }
        const parsed = JSON.parse(out.trim().split("\n").pop() || "{}");
        return { code: parsed.code, ok: parsed.ok };
    }

    const cases: Array<[string, string | null, Record<string, string>, string]> = [
        ["no mode", null, ARMED, "mode_required"],
        ["an unknown mode", "drop", ARMED, "mode_required"],
        ["not armed", "ensure", { ...ARMED, CERT_FIXTURE_APPLY: "0" }, "apply_not_armed"],
        ["dry run", "reset", { ...ARMED, DRY_RUN: "1" }, "apply_not_armed"],
        ["not synthetic-only", "ensure", { ...ARMED, SYNTHETIC_ONLY: "0" }, "synthetic_only_required"],
        ["production project", "reset", { ...ARMED, SUPABASE_PROJECT_REF: "vslwnntzzgpnmrpjipat" }, "production_refused"],
        ["another project", "ensure", { ...ARMED, SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" }, "wrong_staging_project"],
        ["pinned bytes differ", "ensure", { ...ARMED, FIXTURE_SHA256: "0".repeat(64) }, "fixture_content_mismatch"],
        ["malformed org", "ensure", { ...ARMED, ORG_ID: "qa" }, "organization_malformed"],
        ["Firefly", "reset", { ...ARMED, ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19" }, "firefly_refused"],
        ["QA Secondary (unregistered for this fixture)", "ensure", { ...ARMED, ORG_ID: "ad53fee2-2570-460f-9300-f0e106c473b6" }, "unregistered_organization"],
        ["malformed run id", "reset", { ...ARMED, QA_RUN_ID: "qar_invariant0001" }, "qa_run_id_required"],
        ["every gate passes, no trusted connectivity", "ensure", ARMED, "database_unreachable"],
        ["every gate passes (reset), no trusted connectivity", "reset", ARMED, "database_unreachable"],
    ];
    for (const [why, mode, env, code] of cases) {
        it(`${why} → ${code}`, () => {
            const r = run(mode, env);
            expect(r.ok).toBe(false);
            expect(r.code).toBe(code);
        });
    }

    it("the npm scripts name the runner and its mode", () => {
        const pkg = JSON.parse(read("web/package.json")) as { scripts: Record<string, string> };
        expect(pkg.scripts["dev:qa:documents-shared-child-ensure"]).toBe("node scripts/qaDocumentsSharedChildFixture.mjs ensure");
        expect(pkg.scripts["dev:qa:documents-shared-child-reset"]).toBe("node scripts/qaDocumentsSharedChildFixture.mjs reset");
    });
});

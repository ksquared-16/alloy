/**
 * Documents D9 hosted proof — the people / enrollment fixture (certification/documents-v1/d9-hosted/
 * qa_d9_external_fixture_ensure.sql / _reset.sql) and its residue census. No database: the fixture's protections are
 * properties of its bytes, and the rollback invariant that exercises it on an isolated environment must carry its
 * exact statements.
 *
 *   - Binding: every DELETE / INSERT and every refusal guard, with its psql variables substituted, appears verbatim
 *     (whitespace-normalised) in certification/invariants/documents-d9-hosted-fixture.sql.
 *   - Ownership: every DELETE names QA Shared or the FIXED QA Secondary AND this fixture's exact ids — never a prefix,
 *     never the org alone — and none reaches documents, storage, Forms, journeys, audit, installations or QA structure.
 *   - Namespace: the d9000000- ids are disjoint from the other QA subject fixtures' prefix deletes.
 *   - Census: one read-only statement in the question_id | kind | payload contract, over tables that predate D9.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { QA_ORGS, QA_STRUCTURE } from "../../lib/qa/sharedQaRegistry";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DIR = "certification/documents-v1/d9-hosted";
const ENSURE = `${DIR}/qa_d9_external_fixture_ensure.sql`;
const RESET = `${DIR}/qa_d9_external_fixture_reset.sql`;
const CENSUS = `${DIR}/d9-residue-census.sql`;
const INVARIANT = "certification/invariants/documents-d9-hosted-fixture.sql";

const QA_SHARED = QA_ORGS.qa_shared.id;
const QA_SECONDARY = QA_ORGS.qa_secondary.id;
const RUN = "qar_00000000d9e0";
const OTHER_RUN = "qar_00000000d9e1";
const ID_KEYS = ["h1", "g1", "e1", "c1", "c2", "rel_g1", "rel_e1", "enr_c1", "enr_c2", "hb", "cb", "enr_cb"];
const FIXTURE_TABLES = ["customers", "customer_members", "persons", "person_child_relationships", "child_enrollment_agreements"];

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
const inserts = (sql: string) => dml(sql).filter((s) => /^insert/i.test(s));

/** `select [not] exists … as <name> \gset` refusal guards → [name, predicate]. */
const guards = (sql: string) =>
    [...sql.matchAll(/^select ((?:not )?exists [\s\S]*?)\s+as (\w+) \\gset/gm)].map((m) => [m[2], m[1]] as const);

const ensure = read(ENSURE);
const reset = read(RESET);
const invariant = read(INVARIANT);

describe("the rollback invariant carries every fixture statement, substituted", () => {
    const inv = norm(invariant);
    for (const file of [ENSURE, RESET]) {
        it(`${file}: every DELETE / INSERT and refusal guard is exercised`, () => {
            const sql = read(file);
            const vars = setVars(sql);
            const expected = [...dml(sql).map((s) => substitute(s, vars)), ...guards(sql).map(([, p]) => substitute(p, vars))];
            expect(expected.length).toBeGreaterThan(10);
            const missing = expected.filter((s) => !inv.includes(norm(s)));
            expect(missing, missing.join("\n---\n")).toEqual([]);
        });
    }

    it("the other-run guard is exercised with a DIFFERENT run id (the state it refuses)", () => {
        const pred = guards(ensure).find(([n]) => n === "d9_other_run")?.[1];
        expect(pred).toBeTruthy();
        expect(inv).toContain(norm(`IF NOT (${substitute(pred!, setVars(ensure), OTHER_RUN)})`));
    });

    it("every guard is asserted false on clean state, and the refusing ones true on the state they refuse", () => {
        for (const [name, pred] of guards(ensure)) {
            expect(inv, name).toContain(norm(`IF (${substitute(pred, setVars(ensure))}) THEN RAISE EXCEPTION 'CASE 1 FAILED: guard ${name} should be false'`));
        }
        for (const name of ["d9_documents_remaining", "d9_submissions_remaining", "d9_foreign_rows"]) {
            const pred = guards(ensure).find(([n]) => n === name)![1];
            expect(inv, name).toContain(norm(`IF NOT (${substitute(pred, setVars(ensure))})`));
        }
        const foreignOrg = guards(reset).find(([n]) => n === "d9_foreign_org")![1];
        expect(inv).toContain(norm(`IF NOT (${substitute(foreignOrg, setVars(reset))}) THEN RAISE EXCEPTION 'CASE 5 FAILED`));
    });

    it("the invariant proves idempotence, the D9.1 visibility shape, zero residue after a partial teardown, unrelated rows untouched", () => {
        expect(invariant).toMatch(/FOR i IN 1\.\.2 LOOP[\s\S]*?insert into public\.child_enrollment_agreements[\s\S]*?END LOOP;/);
        expect(inv).toContain(norm("CASE 2 FAILED: a qa_north boundary does not see exactly C1"));
        expect(inv).toContain(norm("CASE 2 FAILED: G1 is not the active parent of C1, or E1 is more than an emergency contact"));
        expect(inv).toContain(norm("CASE 4 FAILED: residue after reset"));
        expect(inv).toContain(norm("an unrelated row was touched"));
        expect(inv).toContain(norm("CASE 5 FAILED: the reset reached another organization"));
        expect(invariant.trimEnd()).toMatch(/RAISE NOTICE 'tests passed=% failed=0', 5;\nEND \$\$;$/);
    });

    it("the invariant has no psql meta-command, no transaction control and no privilege change", () => {
        const c = invariant.replace(/--[^\n]*/g, "");
        expect(c).not.toMatch(/^\s*\\/m);
        expect(c).not.toMatch(/\b(begin|commit|rollback|savepoint)\s*;/i);
        expect(c).not.toMatch(/\b(grant|revoke)\b|alter\s+function|on\s+conflict[^;]*do\s+update|truncate/i);
    });
});

describe("ownership: every DELETE is this fixture's own rows, by organization and exact id", () => {
    const PRESERVED = [
        "documents", "document_", "storage", "form_", "process_instances", "processing_", "mutation_events", "workflow_events",
        "app_", "developer_applications", "locations", "departments", "orgs",
    ];
    for (const [file, sql] of [[ENSURE, ensure], [RESET, reset]] as const) {
        it(`${file}: QA Shared or the fixed QA Secondary AND exact \\set ids; no prefix, no preserved table`, () => {
            const vars = setVars(sql);
            const ds = deletes(sql);
            expect(ds.length).toBe(8);
            for (const d of ds) {
                expect(d, d).toMatch(/where org_id = :'(org|org_b)'::uuid\s+and id in \(/);
                const ids = [...d.matchAll(/:'(\w+)'::uuid/g)].map((m) => m[1]).filter((v) => v !== "org" && v !== "org_b");
                expect(ids.length, d).toBeGreaterThan(0);
                for (const v of ids) expect(ID_KEYS, `${v} in ${d}`).toContain(v);
                for (const v of ids) expect(vars[v], v).toMatch(/^d9000000-0000-4000-8000-/);
                expect(d.toLowerCase(), d).not.toContain(" like ");
                const table = /delete\s+from\s+public\.(\w+)/i.exec(d)?.[1] ?? "";
                expect(FIXTURE_TABLES, table).toContain(table);
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

        it(`${file}: QA Shared and the run id are guarded outside dollar quotes; QA Secondary is fixed; no psql escape hatch`, () => {
            expect(sql).toContain(`select (:'org' = '${QA_SHARED}') as is_qa_shared \\gset`);
            expect(sql).toContain(`select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \\gset`);
            expect(sql).toContain(`\\set org_b '${QA_SECONDARY}'`);
            expect(sql).not.toMatch(/\\if :\{\?org_b\}/);
            const bodies = [...sql.matchAll(/do \$\$([\s\S]*?)\$\$;/gi)].map((m) => m[1]);
            expect(bodies.some((b) => /:'\w+'/.test(b))).toBe(false);
            expect(sql).not.toMatch(/^[ \t]*\\(!|c\b|connect\b|o\b|out\b|i\b|ir\b|include|copy\b|setenv\b|w\b|write\b|lo_)/im);
            expect(sql.toLowerCase()).not.toContain("session_replication_role");
            expect(code(sql)).not.toMatch(/\bupdate\s+public\./i);
        });
    }

    it("the ensure writes only fixture tables, and every row carries the run id and the fixture marker", () => {
        const ins = inserts(ensure);
        expect(ins.map((s) => /insert\s+into\s+public\.(\w+)/i.exec(s)![1]).sort()).toEqual([...FIXTURE_TABLES].sort());
        expect(ensure.match(/jsonb_build_object\('qa_run_id', :'qa_run_id', 'fixture_family', :'family'/g)?.length).toBe(12);
        expect(inserts(reset)).toEqual([]);
    });

    it("the ensure seeds the plan's visibility shape: C1 at QA North, C2 at QA South, G1 parent, E1 emergency contact only", () => {
        const vars = setVars(ensure);
        expect(vars.qa_north).toBe(QA_STRUCTURE.sites.qa_north.id);
        expect(vars.qa_south).toBe(QA_STRUCTURE.sites.qa_south.id);
        expect(norm(ensure)).toContain(norm(`(:'enr_c1'::uuid, :'org'::uuid, :'c1'::uuid, :'h1'::uuid, :'qa_north'::uuid, 'active'`));
        expect(norm(ensure)).toContain(norm(`(:'enr_c2'::uuid, :'org'::uuid, :'c2'::uuid, :'h1'::uuid, :'qa_south'::uuid, 'active'`));
        expect(norm(ensure)).toContain(norm(`(:'rel_g1'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'g1'::uuid, 'parent', 'active'`));
        expect(norm(ensure)).toContain(norm(`(:'rel_e1'::uuid, :'org'::uuid, :'h1'::uuid, :'c1'::uuid, :'e1'::uuid, 'emergency_contact', 'active'`));
        expect(norm(ensure)).toContain(norm(`(:'enr_cb'::uuid, :'org_b'::uuid, :'cb'::uuid, :'hb'::uuid,`));
        // The dropped legacy status column is never written (customers.status / persons.status: 20260625140100).
        expect(ensure).not.toMatch(/insert into public\.customers \([^)]*\bstatus\b(?!_key)/);
        expect(ensure).not.toMatch(/insert into public\.persons \([^)]*\bstatus\b(?!_key)/);
    });

    it("both files refuse the same states, and each adds its own", () => {
        const names = (sql: string) => guards(sql).map(([n]) => n);
        const shared = ["d9_foreign_org", "d9_foreign_rows", "d9_documents_remaining", "d9_submissions_remaining", "d9_journey_remaining"];
        for (const n of shared) {
            expect(names(ensure)).toContain(n);
            expect(names(reset)).toContain(n);
            const pe = guards(ensure).find(([x]) => x === n)![1];
            const pr = guards(reset).find(([x]) => x === n)![1];
            expect(norm(pe), n).toBe(norm(pr));
        }
        expect(names(ensure)).toEqual(expect.arrayContaining(["d9_permanent_sites_missing", "d9_secondary_site_missing", "d9_other_run"]));
        expect(names(reset)).not.toContain("d9_other_run");
        expect(reset).toMatch(/select \(:d9_fixture_residue = 0\) as d9_fixture_zero \\gset\n\\if :d9_fixture_zero\n\\else[\s\S]*?raise exception/);
    });

    it("documents are reset elsewhere: neither file writes a document, version, link or object", () => {
        for (const sql of [ensure, reset]) {
            expect(code(sql)).not.toMatch(/\b(insert\s+into|delete\s+from|update)\s+(public\.document|storage\.)/i);
        }
        expect(reset).toContain("DOCUMENTS ARE RESET ELSEWHERE, BY DESIGN");
    });
});

describe("namespace", () => {
    it("ensure and reset name the same ids, all in d9000000-, all distinct", () => {
        const e = setVars(ensure);
        const r = setVars(reset);
        for (const k of ID_KEYS) {
            expect(e[k], k).toMatch(/^d9000000-0000-4000-8000-000000000\d{3}$/);
            expect(r[k], k).toBe(e[k]);
        }
        expect(new Set(ID_KEYS.map((k) => e[k])).size).toBe(ID_KEYS.length);
        expect(r.org_b).toBe(e.org_b);
        expect(r.family).toBe(e.family);
    });

    it("the other QA subject fixtures' prefix deletes cannot match a d9000000- id", () => {
        for (const f of ["certification/fixtures/qa-authz-subjects-ensure.sql", "certification/fixtures/qa-authz-subjects-reset.sql",
            "certification/fixtures/qa-documents-household-ensure.sql", "certification/fixtures/qa-documents-household-reset.sql"]) {
            const prefixes = [...read(f).matchAll(/like '([0-9a-f]{8}-)%'/g)].map((m) => m[1]);
            expect(prefixes.length, f).toBeGreaterThan(0);
            for (const p of prefixes) expect(p, f).not.toBe("d9000000-");
        }
    });

    it("the invariant's unrelated rows are outside the fixture namespace", () => {
        expect(invariant).toContain("e9000000-0000-4000-8000-0000000000c2");
        for (const k of ID_KEYS) expect(setVars(ensure)[k].startsWith("e9000000-")).toBe(false);
    });
});

describe("residue census", () => {
    const census = read(CENSUS);
    const body = census.replace(/--[^\n]*/g, "");

    it("is ONE read-only statement answering question_id | kind | payload, with no psql variable", () => {
        expect(body).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke)\b/i);
        expect(census).toMatch(/^select question_id, kind, payload$/m);
        expect(body.trim().endsWith("order by sort_key;")).toBe(true);
        expect(body.split(";").filter((s) => s.trim()).length).toBe(1);
        expect(body).not.toMatch(/:'\w+'|:\w+\b(?<!::\w+)|\\/);
    });

    it("answers every D9.1 and D9.2/D9.3 residue question the plans list, as a check", () => {
        for (const id of ["d9_zr_tagged_documents", "d9_zr_tagged_objects", "d9_zr_active_installations", "d9_zr_active_credentials",
            "d9_zr_fixture_people", "d9w_zr_tagged_documents", "d9w_zr_tagged_objects", "d9w_zr_active_installations",
            "d9w_zr_active_credentials", "d9w_zr_escalation_cases", "d9_zr_qa_orgs_resolve", "d9_xo_tagged_documents_outside_qa",
            "d9_xo_link_audit_untagged", "d9_xo_events_outside_qa", "d9_xo_security_audit_outside_qa"]) {
            expect(census).toContain(`'${id}', 'check'`);
        }
        const checks = [...census.matchAll(/'(\w+)', 'check',\s*\n\s*'([^']*)'/g)];
        expect(checks.length).toBe(15);
        for (const [, id, prefix] of checks) expect(prefix, id).toMatch(/^[a-z_]+ ~ [a-z0-9_]+ ~ [a-z_]+ ~ $/);
        expect(census).toContain("'d9_zr_retained_catalog_and_audit', 'data'");
    });

    it("reads only tables that exist on staging before any D9 write (never a table a pending migration adds)", () => {
        const ALLOWED = new Set(["public.orgs", "public.documents", "storage.objects", "public.app_installations", "public.developer_applications",
            "public.app_credentials", "public.customers", "public.customer_members", "public.persons", "public.person_child_relationships",
            "public.child_enrollment_agreements", "public.processing_cases", "public.workflow_events", "public.app_security_audit"]);
        const tables = [...body.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => m[1].toLowerCase());
        expect(tables.length).toBeGreaterThan(10);
        for (const t of tables) expect(ALLOWED.has(t), t).toBe(true);
    });

    it("selects by tag, namespace, QA org or D9 application only — never a PII column", () => {
        expect(body).toContain("'4acc9386-c485-486f-aa1f-05d83499d142'");
        expect(body).toContain("'ad53fee2-2570-460f-9300-f0e106c473b6'");
        expect(body).not.toMatch(/\b(first_name|last_name|display_name|full_name|email|phone|date_of_birth|dob)\b/i);
    });
});

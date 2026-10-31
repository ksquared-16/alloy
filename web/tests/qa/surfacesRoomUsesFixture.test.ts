/**
 * SURFACES c4 — RUN-OWNED ROOM-USES FIXTURE CONTRACT (QA Shared only). No database is touched here.
 *
 * The deployed c4 observation needs a room whose configured `space_uses` names a use DISTINCT from the
 * org's default, and QA Shared has neither today (one category; Room N/S 584637 unconfigured and
 * unmarked). Firefly was proposed and withdrawn — it is a forbidden QA target. These pin the contract
 * that a later, separately approved hosted run executes: exactly two `ac000000-` rows, owned by one QA
 * run, reset by exact id only, never touching unmarked rooms, refusing a saved assignment.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_QA_ORG_IDS,
  QA_HOSTED_PROJECT_REF,
  QA_ORGS,
  QA_PRODUCTION_PROJECT_REF,
  QA_STRUCTURE,
  QA_SURFACES_FIXTURE_UUID_PREFIX,
  QA_SURFACES_ROOM_USES_FIXTURE as FX,
} from "@/lib/qa/sharedQaRegistry";
import { auditQaAuthzFixtureSql } from "@/lib/qa/sharedQaSafety";

const ROOT = join(__dirname, "../../..");
const WEB = join(ROOT, "web");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const sha = (rel: string) => createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex");
const executable = (sql: string) => sql.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");

const ENSURE = read(FX.paths.ensure);
const RESET = read(FX.paths.reset);
const CENSUS = read(FX.paths.census);
const FIXTURE_CENSUS = read(FX.paths.fixture_census);
/** The existing, UNMARKED QA Shared rooms (census gar_0cf3a246e1346b). The fixture must never name them. */
const UNMARKED_ROOMS = ["81a903e6-00fe-429b-bd2f-3314ae0aa2dc", "1aa06a04-088f-4dd7-be7c-0d023b134166"];
const FIREFLY = FORBIDDEN_QA_ORG_IDS[0];

describe("the contract's identity", () => {
    it("is QA Shared, under the permanent QA North site, in its own ac000000- namespace", () => {
        expect(FX.org).toBe("qa_shared");
        expect(FX.site_id).toBe(QA_STRUCTURE.sites.qa_north.id);
        expect(FX.category_id.startsWith(QA_SURFACES_FIXTURE_UUID_PREFIX)).toBe(true);
        expect(FX.room_id.startsWith(QA_SURFACES_FIXTURE_UUID_PREFIX)).toBe(true);
        expect(QA_SURFACES_FIXTURE_UUID_PREFIX).not.toBe("aa000000-");
        expect(QA_SURFACES_FIXTURE_UUID_PREFIX).not.toBe("ab000000-");
    });

    it("pins the exact fixture bytes a hosted run may execute", () => {
        expect(sha(FX.paths.ensure)).toBe(FX.sha256.ensure);
        expect(sha(FX.paths.reset)).toBe(FX.sha256.reset);
        expect(sha(FX.paths.fixture_census)).toBe(FX.sha256.census);
    });
});

describe("the fixture SQL passes the shared QA safety audit", () => {
    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s: runner-owned org, no Firefly, every delete fixture-scoped", (_l, sql) => {
        expect(auditQaAuthzFixtureSql(sql)).toEqual({ ok: true, failures: [] });
    });

    it("the audit still refuses an org-wide delete on the same tables (the guard is real)", () => {
        const broken = `${RESET}\ndelete from public.locations where org_id = :'org'::uuid;\n`;
        const audit = auditQaAuthzFixtureSql(broken);
        expect(audit.ok).toBe(false);
        expect(audit.failures.join(" ")).toMatch(/unscoped delete on public/);
    });
});

describe("scope: two owned rows, nothing else", () => {
    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s deletes ONLY the two fixture ids, each by exact id", (_l, sql) => {
        const deletes = [...executable(sql).matchAll(/delete\s+from\s+public\.(\w+)([\s\S]*?);/gi)];
        expect(deletes.map((d) => d[1]).sort()).toEqual(["locations", "operational_assignment_types"]);
        for (const [, table, rest] of deletes) {
            const id = table === "locations" ? FX.room_id : FX.category_id;
            expect(rest).toContain(`id = '${id}'::uuid`);
            expect(rest).toContain("org_id = :'org'::uuid");
            expect(rest).not.toMatch(/like/i);
        }
    });

    it("never names an existing unmarked room, Firefly, or the production project", () => {
        for (const sql of [ENSURE, RESET, CENSUS, FIXTURE_CENSUS]) {
            for (const id of UNMARKED_ROOMS) expect(executable(sql)).not.toContain(id);
            expect(executable(sql)).not.toContain(FIREFLY);
            expect(sql).not.toContain(QA_PRODUCTION_PROJECT_REF);
        }
    });

    it("ensure inserts exactly the category and the room; reset inserts nothing; neither updates", () => {
        expect([...executable(ENSURE).matchAll(/insert\s+into\s+public\.(\w+)/gi)].map((m) => m[1])).toEqual([
            "operational_assignment_types",
            "locations",
        ]);
        expect(executable(RESET)).not.toMatch(/insert\s+into/i);
        for (const sql of [ENSURE, RESET]) expect(executable(sql)).not.toMatch(/\bupdate\s+public\./i);
    });

    it("the room declares its use, its owner run and its fixture marker; the category is child-only", () => {
        expect(ENSURE).toMatch(/'space_uses', jsonb_build_array\(:'fx_category'\)/);
        expect(ENSURE).toMatch(/'qa_run_id', :'qa_run_id'/);
        expect(ENSURE).toContain(`'qa_fixture', '${FX.marker}'`);
        expect(ENSURE).toMatch(/'unit', 'operational_group', :'qa_north'::uuid/);
        expect(ENSURE).toMatch(new RegExp(`'${FX.category_key}', 'QA Room Use \\(fixture\\)', array\\['child'\\]`));
    });
});

describe("refusals written into the SQL", () => {
    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s refuses outside QA Shared and without a run id", (_l, sql) => {
        expect(sql).toMatch(/\\if :\{\?org\}/);
        expect(sql).toMatch(/\\if :\{\?qa_run_id\}/);
        expect(sql).toContain(`(:'org' = '${QA_ORGS.qa_shared.id}') as is_qa_shared`);
    });

    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s refuses while ANY assignment references the fixture (an observation must not save)", (_l, sql) => {
        expect(sql).toMatch(/fixture_assignments_present/);
        expect(sql).toMatch(/sa\.room_location_id = :'fx_room'::uuid or sa\.operational_assignment_type_id = :'fx_category'::uuid/);
    });

    it("reset refuses a fixture owned by ANOTHER run — it cannot delete someone else's live fixture", () => {
        expect(RESET).toMatch(/coalesce\(l\.metadata ->> 'qa_run_id', ''\) <> :'qa_run_id'/);
        expect(RESET).toMatch(/owned_by_another_run/);
    });

    it("ensure honours the LEASE too: it never re-ensures (deletes and recreates) another run's fixture", () => {
        expect(ENSURE).toMatch(/coalesce\(l\.metadata ->> 'qa_run_id', ''\) <> :'qa_run_id'/);
        const lease = executable(ENSURE).indexOf("owned_by_another_run");
        expect(lease).toBeGreaterThan(-1);
        expect(lease).toBeLessThan(executable(ENSURE).search(/delete\s+from/i));
    });

    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s: RESET CAP — any row referencing either fixture row, by any catalog foreign key, refuses before the first delete", (_l, sql) => {
        const code = executable(sql);
        const cap = code.indexOf("reset cap:");
        expect(cap).toBeGreaterThan(-1);
        expect(cap).toBeLessThan(code.search(/delete\s+from/i));
        expect(code).toMatch(/from pg_constraint c/);
        expect(code).toMatch(/c\.contype = 'f'/);
        expect(code).toMatch(/c\.confrelid in \('public\.locations'::regclass, 'public\.operational_assignment_types'::regclass\)/);
        // bound through transaction-local settings: psql does not interpolate :'vars' inside dollar quotes
        expect(code).toMatch(/set_config\('qa_surfaces_c4\.fx_room', :'fx_room', true\)/);
        expect(code).toMatch(/set_config\('qa_surfaces_c4\.fx_category', :'fx_category', true\)/);
    });

    it.each([["ensure", ENSURE], ["reset", RESET]] as const)("%s deletes exactly two rows: one statement per fixture row, each by org AND its exact id", (_l, sql) => {
        const deletes = [...executable(sql).matchAll(/delete\s+from\s+([a-z_.]+)\s+where\s+([^;]+);/gi)].map((m) => [m[1], m[2].replace(/\s+/g, " ").trim()]);
        expect(deletes).toEqual([
            ["public.locations", `org_id = :'org'::uuid and id = '${FX.room_id}'::uuid`],
            ["public.operational_assignment_types", `org_id = :'org'::uuid and id = '${FX.category_id}'::uuid`],
        ]);
    });

    it("ensure never creates structure: QA North must already exist", () => {
        expect(ENSURE).toMatch(/qa_north_present/);
        expect(executable(ENSURE)).not.toMatch(/insert\s+into\s+public\.locations[\s\S]*'site'/i);
    });
});

describe("the verification census is read-only and proves the untouched rest", () => {
    it("is ONE statement with no write", () => {
        expect((executable(CENSUS).match(/;/g) ?? []).length).toBe(1);
        expect(executable(CENSUS)).not.toMatch(/\b(insert|update|delete|truncate|alter|drop)\b/i);
    });

    it("reports fixture presence/owner, saved-assignment count, stray namespace rows and unmarked-room hashes", () => {
        for (const key of ["fixture_rows", "unmarked_rooms_untouched", "org_categories", "assignments_referencing_fixture", "stray_namespace_rows", "metadata_sha256"]) {
            expect(CENSUS).toContain(key);
        }
    });
});

describe("the executor census program is read-only and bounded to the fixture's residue", () => {
    it("opens a READ ONLY transaction before anything else and writes nothing", () => {
        expect(executable(FIXTURE_CENSUS).trim().startsWith("set transaction read only;")).toBe(true);
        expect(executable(FIXTURE_CENSUS)).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|create|grant)\b/i);
    });

    it("refuses outside QA Shared and without an org; counts only the ac000000- namespace and assignments on the two fixture rows", () => {
        expect(FIXTURE_CENSUS).toMatch(/\\if :\{\?org\}/);
        expect(FIXTURE_CENSUS).toContain(`(:'org' = '${QA_ORGS.qa_shared.id}') as is_qa_shared`);
        expect(FIXTURE_CENSUS).toContain("'census count=' ||");
        expect((executable(FIXTURE_CENSUS).match(/like 'ac000000-%'/g) ?? []).length).toBe(2);
        expect(FIXTURE_CENSUS).toContain(`'${FX.room_id}'::uuid`);
        expect(FIXTURE_CENSUS).toContain(`'${FX.category_id}'::uuid`);
        expect(executable(FIXTURE_CENSUS)).not.toMatch(/'aa000000-|'ab000000-/);
    });
});

describe("the registered runners", () => {
    const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as { scripts: Record<string, string> };
    it.each([["ensure", "scripts/qaSurfacesRoomUsesFixtureEnsure.mjs"], ["reset", "scripts/qaSurfacesRoomUsesFixtureReset.mjs"], ["census", "scripts/qaSurfacesRoomUsesFixtureCensus.mjs"]] as const)(
        "%s is an npm script (the reconciliation executor runs `npm run <runner>`) that applies in ONE transaction",
        (kind, script) => {
            expect(pkg.scripts[FX.runners[kind]]).toBe(`node ${script}`);
            expect(readFileSync(join(WEB, script), "utf8")).toContain(`main("${kind}")`);
            expect(readFileSync(join(WEB, "scripts/qa/surfacesRoomUsesFixtureRunner.mjs"), "utf8")).toContain(`"--single-transaction"`);
        },
    );
});

describe("runners refuse before any database is reachable", () => {
    /*
     * The real entry points, spawned from a scratch cwd with every legacy gate satisfied and a database URL
     * that resolves nowhere: with no executor-issued authority they refuse FIRST — the older env-only gates
     * (armed, project, org, run id, pin) are no longer what stands between a caller and a connection.
     * Forged, replayed and mismatched authority are proven in-process with a synthetic store
     * (surfacesFixtureAuthority.test.ts); nothing here reads the executor's real store.
     */
    const run = (script: string, env: Record<string, string | undefined>) => {
        const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: "test" };
        for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
        const out = spawnSync(process.execPath, [join(WEB, script)], { cwd: tmpdir(), env: childEnv, encoding: "utf8", timeout: 30_000 });
        let json: Record<string, unknown> | null = null;
        try { json = JSON.parse((out.stdout || "").trim().split("\n").pop() || ""); } catch { json = null; }
        return { status: out.status, json };
    };
    const legacyArmed = {
        CERT_FIXTURE_APPLY: "1", DRY_RUN: "0", SUPABASE_PROJECT_REF: QA_HOSTED_PROJECT_REF,
        ORG_ID: QA_ORGS.qa_shared.id, QA_RUN_ID: "qar_surfacesc4test", ALLOY_CANONICAL_ROOT: ROOT,
        DATABASE_URL: "postgres://synthetic.invalid:5432/none",
    };
    it.each([
        ["ensure", "scripts/qaSurfacesRoomUsesFixtureEnsure.mjs"],
        ["reset", "scripts/qaSurfacesRoomUsesFixtureReset.mjs"],
        ["census", "scripts/qaSurfacesRoomUsesFixtureCensus.mjs"],
    ] as const)("%s: caller env alone (armed, org, qar_ id, database URL) is not authority", (_l, s) => {
        const out = run(s, legacyArmed);
        expect(out.status).toBe(1);
        expect(out.json?.code).toBe("fixture_authority_absent");
        expect(String(JSON.stringify(out.json))).not.toContain("synthetic.invalid");
    });
});

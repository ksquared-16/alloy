/**
 * Documents D9 hosted proof — the fixture RUNNER (scripts/qaDocumentsD9ExternalFixture.mjs) that the registered
 * reconciliations qa_d9_external_fixture_ensure / _reset (QA plan documents_d9_read_v1) invoke as
 * `npm run dev:qa:documents-d9-external-fixture-ensure|reset`. The SQL's own protections are proven in
 * qaD9ExternalFixture.test.ts and by the isolated rollback invariant; this file proves the runner around them.
 *
 *   - Gates: each refuses before any database connection, including a missing or wrong registry pin.
 *   - Apply: with a planted psql (PSQL_BIN), the runner passes exactly org, qa_run_id and the pinned file, reads the
 *     fixture's own result line, and refuses a result from another run or a reset that reports residue.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const RUNNER = resolve(ROOT, "web/scripts/qaDocumentsD9ExternalFixture.mjs");
const DIR = "certification/documents-v1/d9-hosted";
const ENSURE = `${DIR}/qa_d9_external_fixture_ensure.sql`;
const RESET = `${DIR}/qa_d9_external_fixture_reset.sql`;
const sha = (p: string) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

/* The registry pins (Host Capacity bf44bdc4, reconciliation-registry.mjs) — the bytes served at staging 244c660426f9. */
const PIN_ENSURE = "bcfa19c351cdf053b8e448b16ed7d22f237f2a730243a789d4db8c043e0732ac";
const PIN_RESET = "87909bad22c0e375a374cba94b362851bd9a6424048db6031171c3eda5213655";
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const RUN = "qar_00000000d9f0";

const work = mkdtempSync(join(tmpdir(), "d9-external-runner-")); // no .env / .env.local here
afterAll(() => rmSync(work, { recursive: true, force: true }));

const BASE = { CERT_FIXTURE_APPLY: "1", DRY_RUN: "0", SYNTHETIC_ONLY: "1", ORG_ID: QA_SHARED, QA_RUN_ID: RUN, ALLOY_CANONICAL_ROOT: ROOT };
const ensureEnv = { ...BASE, FIXTURE_SHA256: PIN_ENSURE };
const resetEnv = { ...BASE, FIXTURE_SHA256: PIN_RESET };

function run(mode: string | null, env: Record<string, string>): Record<string, unknown> {
    let out = "";
    try {
        out = execFileSync(process.execPath, [RUNNER, ...(mode ? [mode] : [])], {
            // Only PATH and the case's variables: nothing inherited can supply a database URL or a project ref.
            cwd: work, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (e) {
        out = String((e as { stdout?: string }).stdout ?? "");
    }
    return JSON.parse(out.trim().split("\n").pop() || "{}");
}

/** A psql stand-in: records its argv, then prints `line` the way `-A -t` prints the fixture's final select. */
function fakePsql(name: string, line: string): { bin: string; argsFile: string } {
    const bin = join(work, `${name}.sh`);
    const argsFile = join(work, `${name}.args`);
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\ncat <<'JSON'\n${line}\nJSON\n`);
    chmodSync(bin, 0o755);
    return { bin, argsFile };
}

describe("the pins match the files this runner applies", () => {
    it("ensure and reset bytes are the ones the registry pins", () => {
        expect(sha(ENSURE)).toBe(PIN_ENSURE);
        expect(sha(RESET)).toBe(PIN_RESET);
    });

    it("the npm scripts are the registry's runner names, each naming its mode", () => {
        const pkg = JSON.parse(readFileSync(resolve(ROOT, "web/package.json"), "utf8")) as { scripts: Record<string, string> };
        expect(pkg.scripts["dev:qa:documents-d9-external-fixture-ensure"]).toBe("node scripts/qaDocumentsD9ExternalFixture.mjs ensure");
        expect(pkg.scripts["dev:qa:documents-d9-external-fixture-reset"]).toBe("node scripts/qaDocumentsD9ExternalFixture.mjs reset");
    });
});

describe("runner gates refuse before any database connection", () => {
    const cases: Array<[string, string | null, Record<string, string>, string]> = [
        ["no mode", null, ensureEnv, "mode_required"],
        ["an unknown mode", "drop", ensureEnv, "mode_required"],
        ["not armed", "ensure", { ...ensureEnv, CERT_FIXTURE_APPLY: "0" }, "apply_not_armed"],
        ["dry run", "reset", { ...resetEnv, DRY_RUN: "1" }, "apply_not_armed"],
        ["not synthetic-only", "ensure", { ...ensureEnv, SYNTHETIC_ONLY: "0" }, "synthetic_only_required"],
        ["production project", "reset", { ...resetEnv, SUPABASE_PROJECT_REF: "vslwnntzzgpnmrpjipat" }, "production_refused"],
        ["another project", "ensure", { ...ensureEnv, SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" }, "wrong_staging_project"],
        ["no registry pin", "ensure", BASE, "fixture_pin_required"],
        ["pinned bytes differ", "ensure", { ...BASE, FIXTURE_SHA256: "0".repeat(64) }, "fixture_content_mismatch"],
        ["the other mode's pin", "reset", { ...BASE, FIXTURE_SHA256: PIN_ENSURE }, "fixture_content_mismatch"],
        ["malformed org", "ensure", { ...ensureEnv, ORG_ID: "qa" }, "organization_malformed"],
        ["Firefly", "reset", { ...resetEnv, ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19" }, "firefly_refused"],
        ["QA Secondary (fixed by the SQL, never a caller's org)", "ensure", { ...ensureEnv, ORG_ID: "ad53fee2-2570-460f-9300-f0e106c473b6" }, "unregistered_organization"],
        ["malformed run id", "reset", { ...resetEnv, QA_RUN_ID: "qar_D9" }, "qa_run_id_required"],
        ["every gate passes, no trusted connectivity", "ensure", ensureEnv, "database_unreachable"],
        ["every gate passes (reset), no trusted connectivity", "reset", resetEnv, "database_unreachable"],
    ];
    for (const [why, mode, env, code] of cases) {
        it(`${why} → ${code}`, () => {
            const r = run(mode, env);
            expect(r.ok).toBe(false);
            expect(r.code).toBe(code);
        });
    }
});

describe("apply, through a planted psql", () => {
    const DB = { DATABASE_URL: "postgresql://u:p@127.0.0.1:6543/postgres?pgbouncer=true" };
    const ensureLine = JSON.stringify({ d9_external_fixture_ensure: { qa_run_id: RUN, document_tag_read: `qa-d9r-${RUN}`, enrollments: 3, relationships: 2 } });
    const resetLine = (residue: number, qaRunId = RUN) =>
        JSON.stringify({ d9_external_fixture_reset_counts: { qa_run_id: qaRunId, customers: 2, residue, documents: 0 } });

    it("ensure: passes org, qa_run_id and the pinned file, direct port, and reports seeded", () => {
        const p = fakePsql("ensure-ok", ensureLine);
        const r = run("ensure", { ...ensureEnv, ...DB, PSQL_BIN: p.bin });
        expect(r).toMatchObject({ ok: true, seeded: 1, reconciliation_key: "qa_d9_external_fixture_ensure", fixture_path: ENSURE,
            fixture_hash: `sha256:${PIN_ENSURE}`, organization_id: QA_SHARED, qa_run_id: RUN });
        expect((r.result as { enrollments: number }).enrollments).toBe(3);
        const argv = readFileSync(p.argsFile, "utf8").trim().split("\n");
        expect(argv[0]).toBe("postgres://u:p@127.0.0.1:5432/postgres");
        expect(argv).toEqual(expect.arrayContaining(["ON_ERROR_STOP=1", `org=${QA_SHARED}`, `qa_run_id=${RUN}`, resolve(ROOT, ENSURE)]));
        expect(argv.filter((a) => a.startsWith("org_b") || a.startsWith("qa_secondary"))).toEqual([]);
    });

    it("reset: zero residue reports reset", () => {
        const p = fakePsql("reset-ok", resetLine(0));
        const r = run("reset", { ...resetEnv, ...DB, PSQL_BIN: p.bin });
        expect(r).toMatchObject({ ok: true, reset: 1, reconciliation_key: "qa_d9_external_fixture_reset", fixture_hash: `sha256:${PIN_RESET}` });
        expect(readFileSync(p.argsFile, "utf8")).toContain(resolve(ROOT, RESET));
    });

    it("reset: any residue is a failure, never a pass", () => {
        const r = run("reset", { ...resetEnv, ...DB, PSQL_BIN: fakePsql("reset-residue", resetLine(1)).bin });
        expect(r).toMatchObject({ ok: false, code: "residue_remaining" });
    });

    it("a result naming another run is unreadable", () => {
        const r = run("reset", { ...resetEnv, ...DB, PSQL_BIN: fakePsql("reset-other-run", resetLine(0, "qar_00000000d9f1")).bin });
        expect(r).toMatchObject({ ok: false, code: "result_unreadable" });
    });

    it("the other mode's result line is unreadable", () => {
        const r = run("ensure", { ...ensureEnv, ...DB, PSQL_BIN: fakePsql("ensure-wrong-field", resetLine(0)).bin });
        expect(r).toMatchObject({ ok: false, code: "result_unreadable" });
    });
});

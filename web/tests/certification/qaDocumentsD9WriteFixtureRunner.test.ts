/**
 * Documents D9-H2 hosted proof — the write fixture RUNNER (scripts/qaDocumentsD9WriteFixture.mjs) that the proposed
 * registered reconciliations qa_d9_aged_upload_ensure / qa_d9_write_fixture_reset (QA plan documents_d9_write_v1) invoke
 * as `npm run dev:qa:documents-d9-aged-upload-ensure|write-fixture-reset`. Mirrors qaDocumentsD9ExternalFixtureRunner.
 *
 *   - Gates: each refuses before any database connection, including a missing or wrong pin and a Storage endpoint that
 *     is not the staging project.
 *   - Apply: with a planted psql (PSQL_BIN), the runner passes exactly org, qa_run_id and the pinned file and reads the
 *     fixture's own result line.
 *   - write-reset bytes: listed objects are removed through the Storage API (a local stand-in) only when every one is in
 *     org_documents under a QA org prefix, and storage.objects is re-read; a remaining object, a failed removal or no
 *     Storage credential is a failure, never a pass.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileP = promisify(execFile);
const ROOT = resolve(__dirname, "../../..");
const RUNNER = resolve(ROOT, "web/scripts/qaDocumentsD9WriteFixture.mjs");
const PINNED_SIBLING = resolve(ROOT, "web/scripts/qaDocumentsD9ExternalFixture.mjs");
const DIR = "certification/documents-v1/d9-hosted";
const ENSURE = `${DIR}/qa_d9_aged_upload_ensure.sql`;
const RESET = `${DIR}/qa_d9_write_fixture_reset.sql`;
const sha = (p: string) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

/* The PROPOSED registry pins (not yet registered): a change to either file must change these, deliberately. */
const PIN_ENSURE = "e3f3ee30e3eaeba2c956471a27a44150fc122df28ec7665731bf90fad71a1c3b";
const PIN_RESET = "48845473fde8593206e4dac1c81dbabb0f08187cdfd67b5e346475d99ec17d94";
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6";
const RUN = "qar_00000000d9f2";

const work = mkdtempSync(join(tmpdir(), "d9-write-runner-")); // no .env / .env.local here
afterAll(() => rmSync(work, { recursive: true, force: true }));

const BASE = { CERT_FIXTURE_APPLY: "1", DRY_RUN: "0", SYNTHETIC_ONLY: "1", ORG_ID: QA_SHARED, QA_RUN_ID: RUN, ALLOY_CANONICAL_ROOT: ROOT };
const ensureEnv = { ...BASE, FIXTURE_SHA256: PIN_ENSURE };
const resetEnv = { ...BASE, FIXTURE_SHA256: PIN_RESET };
const DB = { DATABASE_URL: "postgresql://u:p@127.0.0.1:6543/postgres?pgbouncer=true" };

async function run(mode: string | null, env: Record<string, string>): Promise<Record<string, unknown>> {
    let out = "";
    try {
        const r = await execFileP(process.execPath, [RUNNER, ...(mode ? [mode] : [])], {
            // Only PATH and the case's variables: nothing inherited can supply a database URL, a key or a project ref.
            cwd: work, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
        });
        out = r.stdout;
    } catch (e) {
        out = String((e as { stdout?: string }).stdout ?? "");
    }
    return JSON.parse(out.trim().split("\n").pop() || "{}");
}

/**
 * A psql stand-in. For `-f <fixture>` it prints `line` (the fixture's final select under -A -t); for `-c <query>` (the
 * runner's storage.objects re-read) it prints `left`. Every call's argv is appended to the args file, one call per block.
 */
function fakePsql(name: string, line: string, left = 0): { bin: string; argsFile: string } {
    const bin = join(work, `${name}.sh`);
    const argsFile = join(work, `${name}.args`);
    writeFileSync(bin, `#!/bin/sh
printf '%s\\n' "$@" >> '${argsFile}'
printf '%s\\n' '----' >> '${argsFile}'
for a in "$@"; do if [ "$a" = "-c" ]; then echo ${left}; exit 0; fi; done
cat <<'JSON'
${line}
JSON
`);
    chmodSync(bin, 0o755);
    return { bin, argsFile };
}
const calls = (argsFile: string) => existsSync(argsFile) ? readFileSync(argsFile, "utf8").split("----\n").filter((c) => c.trim()).map((c) => c.trim().split("\n")) : [];

/* A Storage API stand-in recording each bulk remove. */
let server: Server;
let storageUrl = "";
const removals: Array<{ method: string; url: string; auth: string; prefixes: string[] }> = [];
let storageStatus = 200;
beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
            removals.push({ method: req.method ?? "", url: req.url ?? "", auth: String(req.headers.authorization ?? ""),
                prefixes: (JSON.parse(body || "{}") as { prefixes?: string[] }).prefixes ?? [] });
            res.writeHead(storageStatus, { "Content-Type": "application/json" });
            res.end("[]");
        });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    storageUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("the pins match the files this runner applies", () => {
    it("ensure and reset bytes are the proposed pins", () => {
        expect(sha(ENSURE)).toBe(PIN_ENSURE);
        expect(sha(RESET)).toBe(PIN_RESET);
    });

    it("the npm scripts name this runner and its modes; the pinned read runner is untouched", () => {
        const pkg = JSON.parse(readFileSync(resolve(ROOT, "web/package.json"), "utf8")) as { scripts: Record<string, string> };
        expect(pkg.scripts["dev:qa:documents-d9-aged-upload-ensure"]).toBe("node scripts/qaDocumentsD9WriteFixture.mjs aged-ensure");
        expect(pkg.scripts["dev:qa:documents-d9-write-fixture-reset"]).toBe("node scripts/qaDocumentsD9WriteFixture.mjs write-reset");
        expect(pkg.scripts["dev:qa:documents-d9-external-fixture-reset"]).toBe("node scripts/qaDocumentsD9ExternalFixture.mjs reset");
        expect(createHash("sha256").update(readFileSync(PINNED_SIBLING)).digest("hex"))
            .toBe("5af9cd7ad9d48ff67c92c19a8362a222718a26c0a047445691c1de489fb6369d");
    });
});

describe("runner gates refuse before any database connection", () => {
    const cases: Array<[string, string | null, Record<string, string>, string]> = [
        ["no mode", null, ensureEnv, "mode_required"],
        ["the read runner's mode", "reset", resetEnv, "mode_required"],
        ["not armed", "aged-ensure", { ...ensureEnv, CERT_FIXTURE_APPLY: "0" }, "apply_not_armed"],
        ["dry run", "write-reset", { ...resetEnv, DRY_RUN: "1" }, "apply_not_armed"],
        ["not synthetic-only", "aged-ensure", { ...ensureEnv, SYNTHETIC_ONLY: "0" }, "synthetic_only_required"],
        ["production project", "write-reset", { ...resetEnv, SUPABASE_PROJECT_REF: "vslwnntzzgpnmrpjipat" }, "production_refused"],
        ["another project", "aged-ensure", { ...ensureEnv, SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" }, "wrong_staging_project"],
        ["no registry pin", "aged-ensure", BASE, "fixture_pin_required"],
        ["pinned bytes differ", "write-reset", { ...BASE, FIXTURE_SHA256: "0".repeat(64) }, "fixture_content_mismatch"],
        ["the other mode's pin", "write-reset", { ...BASE, FIXTURE_SHA256: PIN_ENSURE }, "fixture_content_mismatch"],
        ["malformed org", "aged-ensure", { ...ensureEnv, ORG_ID: "qa" }, "organization_malformed"],
        ["Firefly", "write-reset", { ...resetEnv, ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19" }, "firefly_refused"],
        ["QA Secondary (fixed by the SQL)", "aged-ensure", { ...ensureEnv, ORG_ID: QA_SECONDARY }, "unregistered_organization"],
        ["malformed run id", "write-reset", { ...resetEnv, QA_RUN_ID: "qar_D9" }, "qa_run_id_required"],
        ["production storage", "write-reset", { ...resetEnv, SUPABASE_URL: "https://vslwnntzzgpnmrpjipat.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, "production_refused"],
        ["another project's storage", "write-reset", { ...resetEnv, SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, "wrong_staging_project"],
        ["every gate passes, no trusted connectivity", "aged-ensure", ensureEnv, "database_unreachable"],
        ["every gate passes (reset), no trusted connectivity", "write-reset", resetEnv, "database_unreachable"],
    ];
    for (const [why, mode, env, code] of cases) {
        it(`${why} → ${code}`, async () => {
            const r = await run(mode, env);
            expect(r.ok).toBe(false);
            expect(r.code).toBe(code);
        });
    }
});

describe("aged-ensure through a planted psql", () => {
    const line = JSON.stringify({ d9_aged_upload_ensure: { qa_run_id: RUN, document_id: "d9000000-0000-4000-8000-000000000301", inserted: 1, storage_object: false } });

    it("passes org, qa_run_id and the pinned file, direct port, and reports seeded", async () => {
        const p = fakePsql("ensure-ok", line);
        const r = await run("aged-ensure", { ...ensureEnv, ...DB, PSQL_BIN: p.bin });
        expect(r).toMatchObject({ ok: true, seeded: 1, reconciliation_key: "qa_d9_aged_upload_ensure", fixture_path: ENSURE,
            fixture_hash: `sha256:${PIN_ENSURE}`, organization_id: QA_SHARED, qa_run_id: RUN });
        const [argv] = calls(p.argsFile);
        expect(argv[0]).toBe("postgres://u:p@127.0.0.1:5432/postgres");
        expect(argv).toEqual(expect.arrayContaining(["ON_ERROR_STOP=1", `org=${QA_SHARED}`, `qa_run_id=${RUN}`, resolve(ROOT, ENSURE)]));
        expect(calls(p.argsFile)).toHaveLength(1);
    });

    it("a result naming another run is unreadable", async () => {
        const other = JSON.stringify({ d9_aged_upload_ensure: { qa_run_id: "qar_00000000d9f3", inserted: 1 } });
        const r = await run("aged-ensure", { ...ensureEnv, ...DB, PSQL_BIN: fakePsql("ensure-other", other).bin });
        expect(r).toMatchObject({ ok: false, code: "result_unreadable" });
    });
});

describe("write-reset: rows by SQL, bytes by the Storage API", () => {
    const obj = (path: string, bucket = "org_documents") => ({ bucket, path });
    const resetLine = (objects: unknown[], residue = 0, qaRunId = RUN) => JSON.stringify({ d9_write_fixture_reset_counts: {
        qa_run_id: qaRunId, removed_run_ids: RUN, documents: objects.length, document_versions: objects.length, processing_cases: 1, residue,
        objects_to_remove: objects, audit_rows: 0 } });
    const OBJS = [obj(`${QA_SHARED}/api_uploads/a/sha1`), obj(`${QA_SHARED}/filed/d9000000-x/v2`), obj(`${QA_SECONDARY}/api_uploads/b/sha2`)];
    const STORAGE = () => ({ SUPABASE_URL: storageUrl, SUPABASE_SERVICE_ROLE_KEY: "service-key" });

    it("removes exactly the listed objects through the Storage API, then re-reads storage.objects", async () => {
        removals.length = 0; storageStatus = 200;
        const p = fakePsql("reset-ok", resetLine(OBJS), 0);
        const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: p.bin });
        expect(r).toMatchObject({ ok: true, reset: 1, reconciliation_key: "qa_d9_write_fixture_reset", fixture_hash: `sha256:${PIN_RESET}` });
        expect(r.result).toMatchObject({ residue: 0, storage_objects_removed: 3, storage_objects_remaining: 0 });
        expect((r.result as Record<string, unknown>).objects_to_remove).toBeUndefined();
        expect(removals).toEqual([{ method: "DELETE", url: "/storage/v1/object/org_documents", auth: "Bearer service-key", prefixes: OBJS.map((o) => o.path) }]);
        const c = calls(p.argsFile);
        expect(c).toHaveLength(2);
        expect(c[0]).toEqual(expect.arrayContaining([`org=${QA_SHARED}`, `qa_run_id=${RUN}`, resolve(ROOT, RESET)]));
        expect(c[1].join(" ")).toContain("from storage.objects where bucket_id = 'org_documents'");
        for (const o of OBJS) expect(c[1].join(" ")).toContain(`'${o.path}'`);
    });

    it("nothing to remove: no Storage call and no credential needed", async () => {
        removals.length = 0;
        const p = fakePsql("reset-empty", resetLine([]), 0);
        const r = await run("write-reset", { ...resetEnv, ...DB, PSQL_BIN: p.bin });
        expect(r).toMatchObject({ ok: true, reset: 1 });
        expect(r.result).toMatchObject({ storage_objects_removed: 0 });
        expect(removals).toHaveLength(0);
        expect(calls(p.argsFile)).toHaveLength(1);
    });

    it("an object still present after removal is a failure", async () => {
        removals.length = 0; storageStatus = 200;
        const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: fakePsql("reset-left", resetLine(OBJS), 1).bin });
        expect(r).toMatchObject({ ok: false, code: "object_residue_remaining" });
    });

    it("a failed Storage removal is a failure", async () => {
        removals.length = 0; storageStatus = 500;
        const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: fakePsql("reset-500", resetLine(OBJS)).bin });
        storageStatus = 200;
        expect(r).toMatchObject({ ok: false, code: "storage_remove_failed" });
    });

    it("objects to remove but no Storage credential: a failure that says the bytes remain", async () => {
        const r = await run("write-reset", { ...resetEnv, ...DB, PSQL_BIN: fakePsql("reset-nokey", resetLine(OBJS)).bin });
        expect(r).toMatchObject({ ok: false, code: "storage_unreachable" });
        expect(String(r.detail)).toContain("bytes remain");
    });

    const outside: Array<[string, unknown]> = [
        ["another organization's prefix", obj("11111111-1111-4111-8111-111111111111/api_uploads/a/sha")],
        ["another bucket", obj(`${QA_SHARED}/api_uploads/a/sha`, "avatars")],
        ["a path climbing out", obj(`${QA_SHARED}/../11111111-1111-4111-8111-111111111111/x`)],
        ["no path", { bucket: "org_documents" }],
    ];
    for (const [why, bad] of outside) {
        it(`${why}: nothing is removed`, async () => {
            removals.length = 0;
            const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: fakePsql(`reset-out-${why.length}`, resetLine([...OBJS, bad])).bin });
            expect(r).toMatchObject({ ok: false, code: "object_outside_qa_orgs" });
            expect(removals).toHaveLength(0);
        });
    }

    it("row residue is a failure before any byte is touched", async () => {
        removals.length = 0;
        const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: fakePsql("reset-residue", resetLine(OBJS, 1)).bin });
        expect(r).toMatchObject({ ok: false, code: "residue_remaining" });
        expect(removals).toHaveLength(0);
    });

    it("a result naming another run is unreadable, and nothing is removed", async () => {
        removals.length = 0;
        const r = await run("write-reset", { ...resetEnv, ...DB, ...STORAGE(), PSQL_BIN: fakePsql("reset-other", resetLine(OBJS, 0, "qar_00000000d9f3")).bin });
        expect(r).toMatchObject({ ok: false, code: "result_unreadable" });
        expect(removals).toHaveLength(0);
    });
});

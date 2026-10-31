/**
 * The Surfaces c4 room-Uses fixture runner core (ensure | reset | census), shared by the npm-script entry points.
 *
 * ORDER IS THE CONTRACT. The executor-issued operation authority v2 (`surfacesFixtureAuthority.mjs`) is verified
 * FIRST. Until it passes, nothing else happens: no env file is loaded (this runner loads none), no Postgres client
 * is resolved, no connection is attempted. The QA run id and the organization then come from the verified
 * authority, never from the environment.
 *
 * THE CONNECTION IS THE ONE ATTESTED. `DATABASE_URL` is handed to psql byte-for-byte — never rewritten (no pooler
 * port mapping, no dropped parameter) — with a client environment built here (no PG* variable, no inherited host
 * environment) and `-X` (no psqlrc). `runAttested` re-verifies the whole authority and the hold on that frozen
 * configuration and passes exactly that copy to psql.
 *
 * BOUNDED OUTPUT, in the isolated executor's line contract (`parseIsolatedFixtureOutput`): reset prints
 * `reset namespace=surfaces-cert.alloy.invalid removed=<n>` (n ≤ 2, from psql's own DELETE command tags), census
 * prints `census count=<n>`, and each prints `✓`/`✗` check lines. The last line is one JSON result.
 *
 * Every collaborator is injectable so the refusals are proven with synthetic stores and fake clients only.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "../lib/resolvePostgresClient.mjs";
import { SURFACES_ROOM_USES_PROGRAMS, runAttested, verifySurfacesFixtureAuthority } from "./surfacesFixtureAuthority.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PROD = "vslwnntzzgpnmrpjipat";
const STAGING = "ikaxilmwmrmbagoidedu";

/** The registry entries' `reserved_namespace`, and the most rows a reset may remove (the two fixture rows). */
export const SURFACES_FIXTURE_NAMESPACE = "surfaces-cert.alloy.invalid";
export const SURFACES_RESET_LIMIT = 2;
const ENSURE_INSERTS = 2;

/** psql's command tags for writes, summed by kind. Anything not a tag is ignored. */
export function commandTags(stdout) {
    const tags = { insert: 0, delete: 0, update: 0, deleteStatements: 0 };
    for (const line of String(stdout || "").split("\n")) {
        let m;
        if ((m = /^INSERT \d+ (\d+)$/.exec(line.trim()))) tags.insert += Number(m[1]);
        else if ((m = /^DELETE (\d+)$/.exec(line.trim()))) { tags.delete += Number(m[1]); tags.deleteStatements += 1; }
        else if ((m = /^UPDATE (\d+)$/.exec(line.trim()))) tags.update += Number(m[1]);
    }
    return tags;
}

/** The structured lines and outcome for one operation's psql output. */
export function measure(operation, stdout) {
    const t = commandTags(stdout);
    if (operation === "census") {
        const counts = String(stdout || "").split("\n").map((l) => /^census count=(\d{1,9})$/.exec(l.trim())).filter(Boolean);
        if (counts.length !== 1) return { ok: false, code: "census_not_measured", lines: ["✗ census: one `census count=` line"] };
        if (t.insert || t.delete || t.update) return { ok: false, code: "census_wrote", lines: ["✗ census: read only"] };
        const n = Number(counts[0][1]);
        return { ok: true, census: n, lines: [`census count=${n}`, "✓ census: read only, one measurement"] };
    }
    if (operation === "reset") {
        if (t.deleteStatements !== 2) return { ok: false, code: "reset_unreported", lines: ["✗ reset: two exact-id delete statements reported"] };
        const removed = t.delete;
        const lines = [`reset namespace=${SURFACES_FIXTURE_NAMESPACE} removed=${removed}`];
        if (removed > SURFACES_RESET_LIMIT || t.insert || t.update) return { ok: false, code: "reset_unbounded", removed, lines: [...lines, `✗ reset: at most ${SURFACES_RESET_LIMIT} fixture rows, no insert or update`] };
        return { ok: true, removed, lines: [...lines, `✓ reset: ${removed} of at most ${SURFACES_RESET_LIMIT} fixture rows removed in one transaction`] };
    }
    if (t.insert !== ENSURE_INSERTS || t.deleteStatements !== 2 || t.delete > SURFACES_RESET_LIMIT || t.update) {
        return { ok: false, code: "ensure_unbounded", lines: [`✗ ensure: exactly ${ENSURE_INSERTS} fixture rows inserted, at most ${SURFACES_RESET_LIMIT} replaced, no update`] };
    }
    return { ok: true, seeded: t.insert, replaced: t.delete, lines: [`✓ ensure: ${t.insert} fixture rows in one transaction (${t.delete} of this run's replaced)`] };
}

/**
 * @param {string} operation fixed by the entry point, never by the caller
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   authority?: Record<string, unknown>,
 *   resolveClient?: (env: Record<string, string | undefined>) => { path: string, source?: string } | null,
 *   exec?: (bin: string, args: string[], opts: { env: Readonly<Record<string, string>> }) => string,
 *   readFixture?: (rel: string) => Buffer,
 * }} [deps] `authority` holds the verifier's test seams (store root, clock, file reads); production passes none.
 * @returns {{ ok: boolean, code?: string, fields?: string[], detail?: string, lines?: string[], [k: string]: unknown }}
 */
export function runSurfacesRoomUsesFixture(operation, {
    env = process.env,
    authority = {},
    resolveClient = (e) => resolvePostgresClient({ env: e }),
    exec = (bin, args, opts) => execFileSync(bin, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: opts.env }),
    readFixture = (rel) => readFileSync(join(ROOT, rel)),
} = {}) {
    const program = Object.prototype.hasOwnProperty.call(SURFACES_ROOM_USES_PROGRAMS, operation) ? SURFACES_ROOM_USES_PROGRAMS[operation] : null;
    if (!program) return { ok: false, code: "operation_unregistered" };

    const verdict = verifySurfacesFixtureAuthority(env, { ...authority, program });
    if (!verdict.ok) return { ok: false, code: verdict.code, ...(verdict.fields ? { fields: verdict.fields } : {}) };
    const a = verdict.authority;

    const projectRef = String(env.SUPABASE_PROJECT_REF || env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "").trim();
    if (projectRef === PROD) return { ok: false, code: "production_refused" };
    if (projectRef && projectRef !== STAGING) return { ok: false, code: "wrong_staging_project" };

    const bytes = readFixture(program.sql_path);
    const fixtureHash = createHash("sha256").update(bytes).digest("hex");
    if (fixtureHash !== program.sql_sha256) return { ok: false, code: "fixture_content_mismatch" };

    const client = resolveClient(env);
    if (!client) return { ok: false, code: "postgres_client_missing", detail: POSTGRES_CLIENT_MISSING_DETAIL };

    const clientEnv = { PATH: String(env.PATH || "/usr/bin:/bin"), LANG: "C.UTF-8" };
    const tail = ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", ...(operation === "census" ? ["-A", "-t"] : []),
        "-v", `org=${a.org_id}`, "-v", `qa_run_id=${a.qa_run_id}`, "-f", join(ROOT, program.sql_path)];
    let out;
    try {
        out = runAttested(env, {
            ...authority, program, url: env.DATABASE_URL, clientEnv,
            connect: (c) => exec(client.path, [c.url, ...tail], { env: c.clientEnv }),
        });
    } catch (e) {
        return { ok: false, code: "fixture_apply_failed", detail: String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 240) };
    }
    if (!out.ok) return { ok: false, code: out.code, ...(out.fields ? { fields: out.fields } : {}) };

    const m = measure(operation, out.result);
    const { lines, ...outcome } = m;
    return {
        ...outcome,
        lines,
        operation,
        fixture_path: program.sql_path,
        fixture_hash: `sha256:${fixtureHash}`,
        organization_id: a.org_id,
        organization_source: "executor_authority",
        qa_run_id: a.qa_run_id,
        request_id: a.request_id,
        candidate_sha: a.candidate_sha,
        environment_id: a.environment_id,
        database_identity_digest: out.target_digest,
        hold_revision: a.hold_revision,
    };
}

/** Entry-point helper: the structured lines, then one JSON line; exit 0 only on success. */
export function main(operation) {
    const started = new Date().toISOString();
    const { lines = [], ...result } = runSurfacesRoomUsesFixture(operation);
    for (const line of lines) process.stdout.write(`${line}\n`);
    process.stdout.write(`${JSON.stringify({ ...result, started_at: started, finished_at: new Date().toISOString() })}\n`);
    process.exit(result.ok ? 0 : 1);
}

/**
 * D10-A2 — the two-session race proof of `open_processing_case_with_primary_source` (pending migration
 * 20261215093000), for ONE QA-bound isolated fixture: `processing_atomic_open_race` (requested from Host Capacity; not
 * yet registered). Documents owns and pins this program; the toolkit's executor owns the certenv, the QA run and the
 * authority record. It never runs against the shared `alloy-cert` stack: the authority's database identity and the
 * connection gate refuse anything but the leased certenv's loopback database.
 *
 * WHAT IT PROVES. Real concurrency, real Postgres: for each round, a gate session takes an exclusive advisory lock;
 * N caller sessions (separate psql processes) queue on a shared lock of the same key, so all of them are released at
 * once into the function on ONE source. Each round must end with:
 *   exactly one `processing_cases` row whose primary source is that source; exactly one primary source row; exactly
 *   one caller reporting `created = true`; every caller holding the same case id; no case in the org created during the
 *   run left without a source (the orphan the savepoint exists to prevent).
 * Rounds: 20 × 2 callers, 5 × 5 callers. Output: `tests passed=<n> failed=<n>` then one JSON line. Exit 0 only when
 * failed = 0. Source ids are derived from (qa_run_id, round), so `reset` removes exactly what `run` wrote:
 * `reset namespace=processing-atomic-open-race removed=<n>`.
 *
 * ORDER: authority verified (v2: request, run, environment, candidate, script body, fixture org, database identity,
 * target hold) → connection attested on the exact URL and client environment → psql. Nothing connects before that.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "../lib/resolvePostgresClient.mjs";
import { DATABASE_IDENTITY_SCHEMA, verifyConnectionTarget, verifyIsolatedFixtureAuthorityV2 } from "./isolatedFixtureAuthorityV2.mjs";

export const RACE_NAMESPACE = "processing-atomic-open-race";
export const RACE_PLAN = Object.freeze([...Array(20).fill(2), ...Array(5).fill(5)]);
export const RESET_LIMIT = RACE_PLAN.length * 2; // one case + one source per round

/** Registry bindings this program expects (the Host Capacity entry must match; an expectation, never a fallback). */
export const RACE_PROGRAMS = Object.freeze({
    run: Object.freeze({ fixture: "processing_atomic_open_race", operation: "run", suite: "processing", npm_script: "test:qa:processing-atomic-open-race", script_body: "node scripts/qaProcessingAtomicOpenRace.mjs run" }),
    reset: Object.freeze({ fixture: "processing_atomic_open_race", operation: "reset", suite: "processing", npm_script: "dev:qa:processing-atomic-open-race-reset", script_body: "node scripts/qaProcessingAtomicOpenRace.mjs reset" }),
});
/** The certification seed org (seed_manifest), as the Enrollment isolated program declares it. */
export const RACE_FIXTURE_ORG = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", key: "certification_seed", source: "seed_manifest" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function raceSourceId(qaRunId, round) {
    const h = createHash("sha256").update(`alloy:${RACE_NAMESPACE}:v1\u0000${qaRunId}\u0000${round}`).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString("hex");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
/** A positive bigint advisory key per round, inside this namespace. */
export function raceLockKey(qaRunId, round) {
    return BigInt(`0x${createHash("sha256").update(`${RACE_NAMESPACE}:lock:${qaRunId}:${round}`).digest("hex").slice(0, 15)}`).toString();
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

export const sql = {
    gate: (key, holdMs) => `SELECT pg_advisory_lock(${key}); SELECT pg_sleep(${(holdMs / 1000).toFixed(3)}); SELECT pg_advisory_unlock(${key});`,
    caller: (key, org, src) =>
        `SELECT pg_advisory_lock_shared(${key}); SELECT pg_advisory_unlock_shared(${key});\n` +
        `SELECT 'RESULT|' || processing_case_id::text || '|' || created::text FROM public.open_processing_case_with_primary_source(${lit(org)}::uuid, 'upload', ${lit(src)}::uuid, NULL);`,
    check: (org, src, since) =>
        `SELECT 'CHECK|' ||\n` +
        ` (SELECT count(*) FROM public.processing_case_sources s WHERE s.org_id = ${lit(org)}::uuid AND s.source_kind = 'upload' AND s.source_id = ${lit(src)}::uuid AND s.role = 'primary') || '|' ||\n` +
        ` (SELECT count(DISTINCT s.processing_case_id) FROM public.processing_case_sources s WHERE s.org_id = ${lit(org)}::uuid AND s.source_kind = 'upload' AND s.source_id = ${lit(src)}::uuid) || '|' ||\n` +
        ` (SELECT count(*) FROM public.processing_cases c WHERE c.org_id = ${lit(org)}::uuid AND c.created_at >= ${lit(since)}::timestamptz\n` +
        `    AND NOT EXISTS (SELECT 1 FROM public.processing_case_sources s WHERE s.processing_case_id = c.id));`,
    reset: (org, srcs) =>
        `WITH s AS (DELETE FROM public.processing_case_sources WHERE org_id = ${lit(org)}::uuid AND source_kind = 'upload' AND source_id IN (${srcs.map((x) => `${lit(x)}::uuid`).join(", ")}) RETURNING processing_case_id),\n` +
        ` c AS (DELETE FROM public.processing_cases WHERE org_id = ${lit(org)}::uuid AND id IN (SELECT processing_case_id FROM s)\n` +
        `       AND NOT EXISTS (SELECT 1 FROM public.processing_case_sources x WHERE x.processing_case_id = processing_cases.id AND x.source_id NOT IN (${srcs.map((x) => `${lit(x)}::uuid`).join(", ")})) RETURNING id)\n` +
        `SELECT 'RESET|' || (SELECT count(*) FROM s) || '|' || (SELECT count(*) FROM c);`,
};

export function parseResult(stdout) {
    const m = /RESULT\|([0-9a-f-]{36})\|(true|false)/.exec(String(stdout));
    return m ? { caseId: m[1], created: m[2] === "true" } : null;
}
export function parseCheck(stdout) {
    const m = /CHECK\|(\d+)\|(\d+)\|(\d+)/.exec(String(stdout));
    return m ? { primarySources: Number(m[1]), cases: Number(m[2]), orphans: Number(m[3]) } : null;
}

/** Judges one round. Pure. */
export function judgeRound(results, check) {
    const failures = [];
    if (results.some((r) => r === null)) failures.push("caller_failed");
    const ok = results.filter(Boolean);
    if (new Set(ok.map((r) => r.caseId)).size !== 1) failures.push("different_case_ids");
    if (ok.filter((r) => r.created).length !== 1) failures.push("created_count");
    if (!check) failures.push("check_failed");
    else {
        if (check.primarySources !== 1) failures.push("primary_source_count");
        if (check.cases !== 1) failures.push("case_count");
        if (check.orphans !== 0) failures.push("orphan_case");
    }
    return failures;
}

/**
 * The race itself, over an injected session runner: `session(sqlText) => Promise<stdout>` opens ONE new database
 * session per call (production: one psql process). Tests inject a simulated database.
 */
export async function runRace({ org, qaRunId, session, now = () => new Date(), plan = RACE_PLAN, gateHoldMs = 400, stagger = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    const since = now().toISOString();
    const rounds = [];
    for (let i = 0; i < plan.length; i++) {
        const key = raceLockKey(qaRunId, i);
        const src = raceSourceId(qaRunId, i);
        const gate = session(sql.gate(key, gateHoldMs)).catch(() => null);
        await stagger(100); // the gate holds the exclusive lock before any caller queues
        const callers = Array.from({ length: plan[i] }, () => session(sql.caller(key, org, src)).then(parseResult, () => null));
        const results = await Promise.all(callers);
        await gate;
        const check = await session(sql.check(org, src, since)).then(parseCheck, () => null);
        rounds.push({ round: i, callers: plan[i], failures: judgeRound(results, check) });
    }
    const failed = rounds.filter((r) => r.failures.length > 0);
    return { passed: rounds.length - failed.length, failed: failed.length, failures: failed.map((r) => ({ round: r.round, callers: r.callers, failures: r.failures })) };
}

export async function resetRace({ org, qaRunId, session, plan = RACE_PLAN }) {
    const srcs = plan.map((_, i) => raceSourceId(qaRunId, i));
    const m = /RESET\|(\d+)\|(\d+)/.exec(String(await session(sql.reset(org, srcs))));
    if (!m) return { ok: false, code: "reset_unparseable" };
    const removed = Number(m[1]) + Number(m[2]);
    if (removed > RESET_LIMIT) return { ok: false, code: "reset_limit_exceeded", removed };
    return { ok: true, removed };
}

/** psql as a session: the attested URL byte-for-byte, a scrubbed client environment, no psqlrc. */
export function psqlSession(clientPath, frozen) {
    return (text) =>
        new Promise((resolve, reject) => {
            const p = spawn(clientPath, [frozen.url, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", text], { env: frozen.clientEnv, stdio: ["ignore", "pipe", "pipe"] });
            let out = "";
            p.stdout.on("data", (b) => { out += b; });
            p.on("error", reject);
            p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`psql_exit_${code}`))));
        });
}

export async function runProcessingAtomicOpenRace(operation, {
    env = process.env,
    authority = {},
    resolveClient = (e) => resolvePostgresClient({ env: e }),
    makeSession = psqlSession,
    raceOpts = {},
} = {}) {
    const program = Object.prototype.hasOwnProperty.call(RACE_PROGRAMS, operation) ? RACE_PROGRAMS[operation] : null;
    if (!program) return { ok: false, code: "operation_unregistered" };
    const verdict = verifyIsolatedFixtureAuthorityV2(env, { ...authority, program, org: RACE_FIXTURE_ORG });
    if (!verdict.ok) return { ok: false, code: verdict.code, ...(verdict.fields ? { fields: verdict.fields } : {}) };
    const a = verdict.authority;
    if (!UUID.test(String(a.org_id)) || !a.qa_run_id) return { ok: false, code: "authority_incomplete" };

    const client = resolveClient(env);
    if (!client) return { ok: false, code: "postgres_client_missing", detail: POSTGRES_CLIENT_MISSING_DETAIL };
    const frozen = Object.freeze({ url: String(env.DATABASE_URL ?? ""), clientEnv: Object.freeze({ PATH: String(env.PATH || "/usr/bin:/bin"), LANG: "C.UTF-8" }) });
    // The connection gate: re-verify, then require the exact target to be the database the authority names.
    const again = verifyIsolatedFixtureAuthorityV2(env, { ...authority, program, org: RACE_FIXTURE_ORG });
    if (!again.ok) return { ok: false, code: again.code };
    const target = verifyConnectionTarget({ schema: DATABASE_IDENTITY_SCHEMA, environment_id: a.environment_id, digest: a.database_identity_digest }, { url: frozen.url, clientEnv: frozen.clientEnv });
    if (!target.ok) return { ok: false, code: target.code, ...(target.fields ? { fields: target.fields } : {}) };

    const session = makeSession(client.path, frozen);
    const base = { operation, organization_id: a.org_id, qa_run_id: a.qa_run_id, request_id: a.request_id, candidate_sha: a.candidate_sha, environment_id: a.environment_id, database_identity_digest: target.identity.digest };
    if (operation === "reset") {
        const r = await resetRace({ org: a.org_id, qaRunId: a.qa_run_id, session, ...raceOpts });
        return r.ok ? { ok: true, ...base, removed: r.removed, lines: [`reset namespace=${RACE_NAMESPACE} removed=${r.removed}`] } : { ok: false, ...base, code: r.code };
    }
    const r = await runRace({ org: a.org_id, qaRunId: a.qa_run_id, session, ...raceOpts });
    return { ok: r.failed === 0, ...base, ...r, lines: [`tests passed=${r.passed} failed=${r.failed}`] };
}

export async function main(operation) {
    const started = new Date().toISOString();
    let result;
    try {
        result = await runProcessingAtomicOpenRace(operation);
    } catch (e) {
        result = { ok: false, code: "race_program_failed", detail: String(e?.message || e).split("\n")[0].slice(0, 200) };
    }
    const { lines = [], ...rest } = result;
    for (const line of lines) process.stdout.write(`${line}\n`);
    process.stdout.write(`${JSON.stringify({ ...rest, started_at: started, finished_at: new Date().toISOString() })}\n`);
    process.exit(result.ok ? 0 : 1);
}

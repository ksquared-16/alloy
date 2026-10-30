#!/usr/bin/env node
/**
 * `test:qa:financials-isolated` — the Financials pinned isolated tests, run by Vacilando's isolated
 * executor against ONE leased certenv (registry entry `financials_isolated_tests`, operation `run`).
 *
 * It is not a new suite. It runs the existing live suites listed in FINANCIALS_ISOLATED_SUITE, which
 * already refuse every shared or hosted target, and only hands them the binding the executor built:
 *
 *   1. judge the binding (financialsIsolatedBinding.mjs) and the executor's operation authority
 *      (financialsFixtureAuthority.mjs: the live in-flight request in the trusted Gateway store names
 *      this exact record, request, operation, candidate and pinned script) — refused before any
 *      process starts, exit 2;
 *   2. run exactly the pinned files with the bound target mapped onto the suite's own isolated-env
 *      contract (`CATALOG_LIVE_ISOLATED=1`, `CERT_SUPABASE_URL`, `CERT_SERVICE_ROLE_KEY`, and the bound
 *      seed organization as `CERT_FIXTURE_ORG_ID`) — in the
 *      child's environment only, never on a command line, never printed;
 *   3. read vitest's JSON report and decide proof here, not by exit code alone: a skipped, pending or
 *      todo test, a pinned file that reported nothing, or zero passes is NOT a pass. The suites
 *      `describe.skip` themselves when their target is missing, so a silent skip is exactly the
 *      failure this has to catch.
 *
 * Output follows the executor's line contract: `✓ <id> passed` / `✗ <id> failed|not_run` and one
 * `tests passed=<n> failed=<n>`, where `<id>` is an approved identifier (`<file stem>#<ordinal>`),
 * plus stable problem codes. No test title, suite message, child stdout/stderr or exception text is
 * ever printed — any of those can carry a row value or a credential. The report file lives in the
 * OS temp dir, never in the worktree, and is removed afterwards.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FINANCIALS_ISOLATED_PROGRAM, verifyFinancialsFixtureAuthority } from "./financialsFixtureAuthority.mjs";
import { describeBinding, readIsolatedBinding } from "./financialsIsolatedBinding.mjs";

const WEB = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The pinned suite. Changing it changes this script's body digest only through this file's review. */
export const FINANCIALS_ISOLATED_SUITE = Object.freeze(["tests/financials/live/catalogAddCharge.live.test.ts"]);

/** A pinned file's stable identifier: its basename without `.test.ts`. */
export function suiteStem(file) {
    return String(file).split("/").pop().replace(/\.test\.[cm]?[jt]sx?$/, "");
}

/** Stable problem codes — the only words besides counts and approved identifiers this ever prints. */
export const ISOLATED_PROBLEMS = Object.freeze({
    NO_REPORT: "vitest_report_absent",
    UNPINNED: "unpinned_file_ran",
    FILE_SILENT: "pinned_file_reported_nothing",
    FILE_EMPTY: "pinned_file_reported_no_tests",
    FILE_FAILED: "suite_failed_outside_tests",
    SKIPPED: "tests_not_run",
    FAILED: "tests_failed",
    NONE_PASSED: "no_test_passed",
    EXIT: "vitest_exit_nonzero",
    RUNNER: "runner_error",
});

/**
 * Proof from a vitest JSON report. Pure: the same report always yields the same verdict.
 *
 * NOTHING FROM THE REPORT IS PRINTED BUT COUNTS. Test titles and suite messages are written by the
 * suite and by whatever it caught — row values, a backend error, a connection string — so a test is
 * named by an APPROVED identifier instead: `<pinned file stem>#<ordinal>` in the file's own order,
 * stable for a pinned candidate. An unpinned file is counted, never named.
 */
export function summarizeVitestReport(report, files = FINANCIALS_ISOLATED_SUITE, webDir = WEB) {
    const X = ISOLATED_PROBLEMS;
    const problems = [];
    const checks = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    if (!report || !Array.isArray(report.testResults)) {
        return { ok: false, passed: 0, failed: 0, skipped: 0, checks, problems: [X.NO_REPORT] };
    }
    const seen = new Map();
    let unpinned = 0;
    for (const file of report.testResults) {
        const rel = relative(webDir, resolve(webDir, String(file?.name || ""))).split("\\").join("/");
        const results = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
        const pinned = files.includes(rel);
        if (!pinned) unpinned += 1;
        else seen.set(rel, results.length);
        const stem = pinned ? suiteStem(rel) : null;
        if (file?.status === "failed" && results.every((r) => r?.status !== "failed")) {
            /* A file that failed to load or whose hooks threw has no failed assertion to count. */
            failed += 1;
            if (stem) checks.push({ ok: false, check: `${stem} ${X.FILE_FAILED}` });
        }
        results.forEach((r, i) => {
            const id = stem ? `${stem}#${i + 1}` : null;
            if (r?.status === "passed") {
                passed += 1;
                if (id) checks.push({ ok: true, check: `${id} passed` });
            } else if (r?.status === "failed") {
                failed += 1;
                if (id) checks.push({ ok: false, check: `${id} failed` });
            } else {
                skipped += 1;
                if (id) checks.push({ ok: false, check: `${id} not_run` });
            }
        });
    }
    if (unpinned) problems.push(`${X.UNPINNED} count=${unpinned}`);
    for (const f of files) {
        if (!seen.has(f)) problems.push(`${X.FILE_SILENT} file=${suiteStem(f)}`);
        else if (seen.get(f) === 0) problems.push(`${X.FILE_EMPTY} file=${suiteStem(f)}`);
    }
    /* A skipped test is not proof: the pinned suites describe.skip themselves when no target reaches them. */
    if (skipped > 0) problems.push(`${X.SKIPPED} count=${skipped}`);
    if (failed > 0) problems.push(`${X.FAILED} count=${failed}`);
    if (passed === 0) problems.push(X.NONE_PASSED);
    return { ok: problems.length === 0, passed, failed, skipped, checks, problems };
}

/**
 * The suite child's environment: the executor's own, plus the suite's isolated-env names. The fixture
 * organization is the executor's bound one (verified to be the certification seed org), never a constant
 * of the suite's.
 */
export function suiteChildEnv(env) {
    return {
        ...env,
        CATALOG_LIVE_ISOLATED: "1",
        CERT_SUPABASE_URL: env.SUPABASE_URL,
        CERT_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        CERT_FIXTURE_ORG_ID: env.ALLOY_CERT_FIXTURE_ORG_ID,
    };
}

/** The child's output is never read: stdout and stderr go nowhere. Only the JSON report and exit code count. */
function runVitest(files, env, reportPath) {
    return new Promise((done) => {
        const bin = join(WEB, "node_modules", ".bin", "vitest");
        const child = spawn(bin, ["run", ...files, "--reporter=json", `--outputFile=${reportPath}`], {
            cwd: WEB,
            env,
            stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("error", () => done({ code: null }));
        child.on("close", (code) => done({ code }));
    });
}

/**
 * `authority` is the verifier's options (tests pass a synthetic store root); it is never read from `env`.
 *
 * @param {{ env?: Record<string, string | undefined>, argv?: string[], out?: (line: string) => void, run?: typeof runVitest, authority?: Parameters<typeof verifyFinancialsFixtureAuthority>[1] }} [io]
 * @returns {Promise<number>}
 */
export async function main({ env = process.env, argv = process.argv.slice(2), out = console.log, run = runVitest, authority = undefined } = {}) {
    const judged = readIsolatedBinding({ env, fixture: "financials_isolated_tests", operation: "run", argv });
    if (!judged.ok) {
        out(`✗ refused before any IO: ${judged.code} — ${judged.detail}`);
        out("tests passed=0 failed=0");
        return 2;
    }
    const auth = verifyFinancialsFixtureAuthority(env, { ...authority, program: FINANCIALS_ISOLATED_PROGRAM, operation: "run" });
    if (!auth.ok) {
        out(`✗ refused before any process: ${auth.code}${auth.fields ? ` fields=${auth.fields.join(",")}` : ""}`);
        out("tests passed=0 failed=0");
        return 2;
    }
    out(`authority request=${auth.authority.request_id} candidate=${auth.authority.candidate_sha.slice(0, 12)}`);
    out(`binding ${describeBinding(judged.binding)}`);
    let dir = null;
    try {
        dir = mkdtempSync(join(tmpdir(), "fin-isolated-"));
        const reportPath = join(dir, "report.json");
        const result = await run([...FINANCIALS_ISOLATED_SUITE], suiteChildEnv(env), reportPath);
        let report = null;
        try {
            report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
            report = null;
        }
        const s = summarizeVitestReport(report);
        for (const c of s.checks) out(`${c.ok ? "✓" : "✗"} ${c.check}`);
        for (const p of s.problems) out(`✗ ${p}`);
        const exit = Number.isInteger(result?.code) ? result.code : null;
        if (exit !== 0) out(`✗ ${ISOLATED_PROBLEMS.EXIT} code=${exit ?? "none"}`);
        out(`tests passed=${s.passed} failed=${s.failed}`);
        return s.ok && exit === 0 ? 0 : 1;
    } catch {
        out(`✗ ${ISOLATED_PROBLEMS.RUNNER}`);
        out("tests passed=0 failed=0");
        return 1;
    } finally {
        if (dir) rmSync(dir, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().then((code) => process.exit(code), () => {
        console.log(`✗ ${ISOLATED_PROBLEMS.RUNNER}`);
        console.log("tests passed=0 failed=0");
        process.exit(1);
    });
}

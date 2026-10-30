#!/usr/bin/env node
/**
 * `test:qa:financials-isolated` — the Financials pinned isolated tests, run by Vacilando's isolated
 * executor against ONE leased certenv (registry entry `financials_isolated_tests`, operation `run`).
 *
 * It is not a new suite. It runs the existing live suites listed in FINANCIALS_ISOLATED_SUITE, which
 * already refuse every shared or hosted target, and only hands them the binding the executor built:
 *
 *   1. judge the binding (financialsIsolatedBinding.mjs) — refused before any IO, exit 2;
 *   2. run exactly the pinned files with the bound target mapped onto the suite's own isolated-env
 *      contract (`CATALOG_LIVE_ISOLATED=1`, `CERT_SUPABASE_URL`, `CERT_SERVICE_ROLE_KEY`) — in the
 *      child's environment only, never on a command line, never printed;
 *   3. read vitest's JSON report and decide proof here, not by exit code alone: a skipped, pending or
 *      todo test, a pinned file that reported nothing, or zero passes is NOT a pass. The suites
 *      `describe.skip` themselves when their target is missing, so a silent skip is exactly the
 *      failure this has to catch.
 *
 * Output follows the executor's line contract: `✓ <test>` / `✗ <test>` and one
 * `tests passed=<n> failed=<n>`. The report file lives in the OS temp dir, never in the worktree.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describeBinding, readIsolatedBinding } from "./financialsIsolatedBinding.mjs";

const WEB = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The pinned suite. Changing it changes this script's body digest only through this file's review. */
export const FINANCIALS_ISOLATED_SUITE = Object.freeze(["tests/financials/live/catalogAddCharge.live.test.ts"]);

/**
 * Proof from a vitest JSON report. Pure: the same report always yields the same verdict.
 * `files` are the pinned paths relative to web/.
 */
export function summarizeVitestReport(report, files = FINANCIALS_ISOLATED_SUITE, webDir = WEB) {
    const problems = [];
    const checks = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    if (!report || !Array.isArray(report.testResults)) {
        return { ok: false, passed: 0, failed: 0, skipped: 0, checks, problems: ["vitest produced no readable report"] };
    }
    const seen = new Map();
    for (const file of report.testResults) {
        const rel = relative(webDir, resolve(webDir, String(file.name || ""))).split("\\").join("/");
        const results = Array.isArray(file.assertionResults) ? file.assertionResults : [];
        seen.set(rel, results.length);
        if (!files.includes(rel)) problems.push(`${rel} ran but is not pinned`);
        if (file.status === "failed" && results.every((r) => r.status !== "failed")) {
            /* A file that failed to load or whose hooks threw has no failed assertion to count. */
            failed += 1;
            checks.push({ ok: false, check: `${rel}: ${String(file.message || "suite failed").split("\n")[0].slice(0, 160)}` });
        }
        for (const r of results) {
            const title = String(r.fullName || r.title || "(untitled)").slice(0, 180);
            if (r.status === "passed") {
                passed += 1;
                checks.push({ ok: true, check: title });
            } else if (r.status === "failed") {
                failed += 1;
                checks.push({ ok: false, check: title });
            } else {
                skipped += 1;
                checks.push({ ok: false, check: `${title} — ${r.status}, not run` });
            }
        }
    }
    for (const f of files) {
        if (!seen.has(f)) problems.push(`${f} reported nothing`);
        else if (seen.get(f) === 0) problems.push(`${f} reported no tests`);
    }
    if (skipped > 0) problems.push(`${skipped} test(s) skipped/pending/todo — a skipped test is not proof`);
    if (failed > 0) problems.push(`${failed} test(s) failed`);
    if (passed === 0) problems.push("no test passed");
    return { ok: problems.length === 0, passed, failed, skipped, checks, problems };
}

/** The suite child's environment: the executor's own, plus the suite's isolated-env names. */
export function suiteChildEnv(env) {
    return {
        ...env,
        CATALOG_LIVE_ISOLATED: "1",
        CERT_SUPABASE_URL: env.SUPABASE_URL,
        CERT_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    };
}

function runVitest(files, env, reportPath) {
    return new Promise((done) => {
        const bin = join(WEB, "node_modules", ".bin", "vitest");
        const child = spawn(bin, ["run", ...files, "--reporter=json", `--outputFile=${reportPath}`], {
            cwd: WEB,
            env,
            stdio: ["ignore", "ignore", "pipe"],
        });
        let err = "";
        child.stderr.on("data", (c) => {
            if (err.length < 8000) err += c.toString("utf8");
        });
        child.on("error", (e) => done({ code: null, err: String(e?.message || e) }));
        child.on("close", (code) => done({ code, err }));
    });
}

/**
 * @param {{ env?: Record<string, string | undefined>, argv?: string[], out?: (line: string) => void }} [io]
 * @returns {Promise<number>}
 */
export async function main({ env = process.env, argv = process.argv.slice(2), out = console.log } = {}) {
    const judged = readIsolatedBinding({ env, fixture: "financials_isolated_tests", operation: "run", argv });
    if (!judged.ok) {
        out(`✗ refused before any IO: ${judged.code} — ${judged.detail}`);
        out("tests passed=0 failed=0");
        return 2;
    }
    out(`binding ${describeBinding(judged.binding)}`);
    const dir = mkdtempSync(join(tmpdir(), "fin-isolated-"));
    const reportPath = join(dir, "report.json");
    try {
        const run = await runVitest([...FINANCIALS_ISOLATED_SUITE], suiteChildEnv(env), reportPath);
        let report = null;
        try {
            report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
            report = null;
        }
        const s = summarizeVitestReport(report);
        for (const c of s.checks) out(`${c.ok ? "✓" : "✗"} ${c.check}`);
        for (const p of s.problems) out(`✗ ${p}`);
        if (!report && run.err) out(`vitest: ${run.err.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400)}`);
        out(`tests passed=${s.passed} failed=${s.failed}`);
        return s.ok && run.code === 0 ? 0 : 1;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().then((code) => process.exit(code), (e) => {
        console.log(`✗ runner error: ${String(e?.message || e).split("\n")[0].slice(0, 200)}`);
        console.log("tests passed=0 failed=0");
        process.exit(1);
    });
}

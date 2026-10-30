/**
 * LIVE-SUITE AUTHORITY — the runner refuses to IMPORT a live suite unless an operation authority holds.
 *
 * Measured 2026-10-30 (Financials lane, req_1793375528498836_49075): a grep-built `vac run test` file
 * list included `tests/financials/live/*.live.test.ts`. Those suites read `web/.env.certification.local`
 * at import, build a service-role client, and seed / post / refund / delete in `beforeAll`/`afterAll`
 * against the SHARED `alloy-cert` stack — `tuitionGeneration.live` deletes org-wide in both hooks. A
 * `describe.skip` cannot protect against that: the module, its env read and its client run before any
 * `describe` decides anything, and with the env file present nothing skips at all.
 *
 * So the guard is at the only point that precedes import: vitest's `exclude`. Every live suite is
 * excluded — by DEFAULT selection and by EXPLICIT filename alike (vitest matches CLI filters inside the
 * included set; an excluded file is "No test files found", exit 1). An excluded suite is never imported,
 * so no env file is read, no client is built, no hook runs. It is reported as EXCLUDED — not skipped,
 * not passed.
 *
 * NO SHARED-STACK LIVE SUITE IS EVER ADMITTED HERE. A shared-stack resource lease (`alloy-stack use`)
 * is permission to share a stack, not to run an operation on it, and it cannot override a live hold on
 * `alloy-cert`. There is no existing, verifiable operation authority a test runner could check for a
 * shared-stack live run, so this default-denies; that missing authority is a toolkit dependency.
 *
 * THE ONE ADMISSION: the isolated executor's governed binding, for its exact pinned suite only. Vacilando's
 * isolated executor (`lib/isolated-fixture-execution.mjs`) runs the registered `financials_isolated_tests`
 * fixture with an environment it builds from scratch, after re-measuring the open QA run, the leased
 * certenv, its identity and the persona. That environment is judged by
 * `scripts/qa/financialsIsolatedBinding.mjs` (exact fixture, operation and namespace; run / environment /
 * persona ids; loopback certenv port band; credential present; no disagreeing target). It admits EXACTLY
 * `FINANCIALS_ISOLATED_SUITE` — never any other live suite, never a shared-stack one.
 *
 * The binding alone is NOT the admission. The executor's operation authority must also hold
 * (`scripts/qa/financialsFixtureAuthority.mjs`): a record directly inside the trusted Gateway store's
 * isolated-fixture authority directory (root resolved from the OS account, never the environment), named
 * by the executor's live `in_flight` request with the same binding digest and the exact bytes, unexpired,
 * for this request / operation / suite / candidate / pinned script, with the bound seed organization. A
 * forged record plus a matching environment, a completed request, altered bytes, or a record outside the
 * store all admit nothing. A same-user rewrite of the executor's own store is outside what this can detect.
 *
 * `CATALOG_LIVE_ISOLATED=1`, `ALLOY_CERTIFICATION=1`, `CERT_SEED_DEMO=1`, `CERT_KEEP`, `CI`, a lease
 * file, a running process, a present env file or a present key are each refused: none is authority.
 * With no binding this module reads no file and starts no process; only a complete binding is checked
 * against the executor's store (and `git rev-parse HEAD` for the exact candidate).
 */
import { FINANCIALS_ISOLATED_PROGRAM, verifyFinancialsFixtureAuthority } from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { readIsolatedBinding } from "../../scripts/qa/financialsIsolatedBinding.mjs";
import { FINANCIALS_ISOLATED_SUITE } from "../../scripts/qa/financialsIsolatedTests.mjs";

/** Is `rel` (relative to web/) a live suite by the repository's conventions? The patterns below say the same in glob. */
export function isLiveSuitePath(rel) {
    const p = String(rel).split("\\").join("/");
    return /\.test\.(ts|tsx|mts|mjs|js)$/.test(p) && (/\.live\.test\.[a-z]+$/.test(p) || /^tests\/(.+\/)?live\//.test(p));
}

/** Every live suite, by the two conventions the repository uses. Matched against paths relative to web/. */
export const LIVE_SUITE_PATTERNS = Object.freeze([
    "**/*.live.test.{ts,tsx,mts,mjs,js}",
    "tests/**/live/**/*.test.{ts,tsx,mts,mjs,js}",
]);

export const LIVE_AUTHORITY_REFUSALS = Object.freeze({
    NONE: "live_suite_operation_authority_absent",
});

/**
 * Which live suites this process may import, and why. `authority` is the verifier's options (tests pass a
 * synthetic store root); it is never read from `env`.
 *
 * @param {{ env?: Record<string, string | undefined>, authority?: Parameters<typeof verifyFinancialsFixtureAuthority>[1] }} [input]
 * @returns {{ admit: "none", code: string, detail: string } | { admit: "pinned", files: string[], authority: string, detail: string }}
 */
export function judgeLiveSuiteAuthority({ env = process.env, authority = undefined } = {}) {
    const isolated = readIsolatedBinding({ env, fixture: "financials_isolated_tests", operation: "run", argv: [] });
    if (!isolated.ok) {
        return {
            admit: "none",
            code: LIVE_AUTHORITY_REFUSALS.NONE,
            detail: `no governed isolated binding (${isolated.code}); shared-stack live suites are never admitted by the runner`,
        };
    }
    /* The program is the isolated tests, always: a caller option cannot name another. */
    const op = verifyFinancialsFixtureAuthority(env, { ...authority, program: FINANCIALS_ISOLATED_PROGRAM, operation: "run" });
    if (!op.ok) {
        return {
            admit: "none",
            code: LIVE_AUTHORITY_REFUSALS.NONE,
            detail: `no live executor authority (${op.code}); shared-stack live suites are never admitted by the runner`,
        };
    }
    return {
        admit: "pinned",
        files: [...FINANCIALS_ISOLATED_SUITE],
        authority: "isolated_qa_authority",
        detail: `request=${op.authority.request_id} qa_run=${isolated.binding.qaRunId} environment=${isolated.binding.environmentId} operation=${isolated.binding.operation}`,
    };
}

/**
 * The vitest `include` / `exclude` for a judgement. `baseInclude` / `baseExclude` are the config's own.
 * `pinned` narrows the run to exactly the admitted files; `none` adds every live pattern to `exclude`.
 */
export function liveSuiteSelection(judgement, { baseInclude, baseExclude }) {
    if (judgement.admit === "pinned") return { include: [...judgement.files], exclude: [...baseExclude] };
    return { include: [...baseInclude], exclude: [...baseExclude, ...LIVE_SUITE_PATTERNS] };
}

/** The one line the runner prints, so an excluded suite is never mistaken for a skipped or passed one. */
export function liveSuiteNotice(judgement) {
    if (judgement.admit === "pinned") {
        return `[live-suite-guard] only ${judgement.files.length} pinned isolated suite(s) ADMITTED by ${judgement.authority} (${judgement.detail}); every other live suite EXCLUDED`;
    }
    return `[live-suite-guard] live suites EXCLUDED (not run, not passed): ${judgement.code}`;
}

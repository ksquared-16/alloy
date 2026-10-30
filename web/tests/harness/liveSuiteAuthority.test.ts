/**
 * THE LIVE-SUITE GUARD — synthetic proof that accidental selection cannot import a live suite.
 *
 * Unit half: `judgeLiveSuiteAuthority` over synthetic environments — the one admission (the governed
 * isolated binding, exact pinned suite only), every absent / wrong / partial binding, and everything
 * that is NOT operation authority (flags, keys, env files, a valid shared-stack lease).
 *
 * Integration half: vitest itself, spawned with an environment built from scratch (no host
 * credential, an empty HOME, a temp lease directory), run ONLY on the harmless canaries under
 * tests/harness/liveGuardCanary and on `vitest list --filesOnly` (which globs, never imports). No real
 * live suite is ever executed here — if the guard regressed, a test that ran one would itself be the
 * incident. Real live files are only listed. Every credential below is a synthetic string.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { FINANCIALS_ISOLATED_SUITE } from "../../scripts/qa/financialsIsolatedTests.mjs";
import {
    isLiveSuitePath,
    judgeLiveSuiteAuthority,
    LIVE_AUTHORITY_REFUSALS as R,
    LIVE_SUITE_PATTERNS,
    liveSuiteNotice,
    liveSuiteSelection,
} from "./liveSuiteAuthority.mjs";

const WEB = resolve(__dirname, "../..");
const REPO = resolve(WEB, "..");
const SECRET = "sk_synthetic_live_guard_never_print_0123456789";

function isolatedEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
        NODE_ENV: "test",
        SUPABASE_URL: "http://127.0.0.1:56102",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        ALLOY_QA_RUN_ID: "qar_0123456789ab",
        ALLOY_QA_ENVIRONMENT_ID: "certenv-0123456789",
        ALLOY_QA_PERSONA: "admin",
        ALLOY_CERT_NAMESPACE: "financials-cert.alloy.invalid",
        ALLOY_CERT_FIXTURE: "financials_isolated_tests",
        ALLOY_CERT_OPERATION: "run",
        ...over,
    };
}

const judge = (env: Record<string, string | undefined>) => judgeLiveSuiteAuthority({ env });

describe("live-suite authority — default deny; the governed isolated binding admits only its pinned suite", () => {
    it("with nothing, live suites are refused", () => {
        expect(judge({})).toMatchObject({ admit: "none", code: R.NONE });
    });

    it.each([
        ["CATALOG_LIVE_ISOLATED=1", { CATALOG_LIVE_ISOLATED: "1" }],
        ["ALLOY_CERTIFICATION=1", { ALLOY_CERTIFICATION: "1" }],
        ["CERT_SEED_DEMO=1", { CERT_SEED_DEMO: "1" }],
        ["CERT_KEEP=1", { CERT_KEEP: "1" }],
        ["CI=true", { CI: "true" }],
        ["the shared stack's target and a key", { CERT_SUPABASE_URL: "http://127.0.0.1:54421", CERT_SERVICE_ROLE_KEY: SECRET }],
        ["a lease state directory", { ALLOY_STACK_STATE_DIR: "/state", ALLOY_STACK_LEASE_TTL_HOURS: "12" }],
        ["a certenv target and key without the binding", { SUPABASE_URL: "http://127.0.0.1:56102", SUPABASE_SERVICE_ROLE_KEY: SECRET }],
    ])("not operation authority: %s", (_l, env) => {
        const j = judge(env);
        expect(j).toMatchObject({ admit: "none", code: R.NONE });
        expect(JSON.stringify(j)).not.toContain(SECRET);
    });

    it("the governed isolated binding admits EXACTLY the pinned isolated suite — and names its operation", () => {
        const j = judge(isolatedEnv());
        expect(j).toMatchObject({ admit: "pinned", authority: "isolated_qa_binding", files: [...FINANCIALS_ISOLATED_SUITE] });
        expect(j.admit === "pinned" && j.detail).toBe("qa_run=qar_0123456789ab environment=certenv-0123456789 operation=run");
        expect(FINANCIALS_ISOLATED_SUITE).toEqual(["tests/financials/live/catalogAddCharge.live.test.ts"]);
        expect(JSON.stringify(j)).not.toContain(SECRET);
    });

    it.each([
        ["absent run", { ALLOY_QA_RUN_ID: undefined }],
        ["malformed run", { ALLOY_QA_RUN_ID: "qar_x" }],
        ["absent environment", { ALLOY_QA_ENVIRONMENT_ID: undefined }],
        ["the shared stack named as environment", { ALLOY_QA_ENVIRONMENT_ID: "alloy-cert" }],
        ["absent persona", { ALLOY_QA_PERSONA: undefined }],
        ["another fixture's binding", { ALLOY_CERT_FIXTURE: "financials_historical_draft" }],
        ["another operation", { ALLOY_CERT_OPERATION: "reset" }],
        ["another namespace", { ALLOY_CERT_NAMESPACE: "tours-cert.alloy.invalid" }],
        ["the shared alloy-cert API as target", { SUPABASE_URL: "http://127.0.0.1:54421" }],
        ["the shared alloy-cert database", { DATABASE_URL: `postgresql://postgres:${SECRET}@127.0.0.1:54422/postgres` }],
        ["a hosted target", { SUPABASE_URL: "https://abcdefgh.supabase.co" }],
        ["a suite target that disagrees with the binding", { CERT_SUPABASE_URL: "http://127.0.0.1:54421" }],
        ["no credential", { SUPABASE_SERVICE_ROLE_KEY: "" }],
        ["a production runtime", { NODE_ENV: "production" }],
    ])("a wrong or partial binding (%s) is refused", (_l, over) => {
        const j = judge(isolatedEnv(over));
        expect(j).toMatchObject({ admit: "none", code: R.NONE });
        expect(JSON.stringify(j)).not.toContain(SECRET);
    });

    it("a STALE binding cannot be detected from inside the run — so even a valid one reaches only the pinned isolated suite", () => {
        /* The env carries no expiry and no executor proof (toolkit dependency, see the module header).
           What the runner CAN guarantee: whatever binding is present, no shared-stack suite is admitted. */
        const j = judge(isolatedEnv());
        expect(j.admit).toBe("pinned");
        const files = j.admit === "pinned" ? j.files : [];
        expect(files.filter((f) => f !== "tests/financials/live/catalogAddCharge.live.test.ts")).toEqual([]);
    });
});

describe("the selection the runner applies", () => {
    const base = { baseInclude: ["tests/**/*.test.ts"], baseExclude: ["**/node_modules/**"] };
    it("refused → every live pattern is excluded; pinned → exactly the pinned files", () => {
        expect(liveSuiteSelection({ admit: "none", code: R.NONE, detail: "" }, base)).toEqual({ include: base.baseInclude, exclude: [...base.baseExclude, ...LIVE_SUITE_PATTERNS] });
        expect(liveSuiteSelection({ admit: "pinned", files: ["a.live.test.ts"], authority: "x", detail: "" }, base)).toEqual({ include: ["a.live.test.ts"], exclude: base.baseExclude });
    });

    it("there is no 'admit all' outcome at all", () => {
        for (const env of [{}, isolatedEnv(), { CERT_SUPABASE_URL: "http://127.0.0.1:54421" }]) {
            expect(["none", "pinned"]).toContain(judge(env).admit);
        }
    });

    it("an excluded suite is reported as EXCLUDED — never as skipped or passed", () => {
        expect(liveSuiteNotice({ admit: "none", code: R.NONE, detail: "" })).toBe(`[live-suite-guard] live suites EXCLUDED (not run, not passed): ${R.NONE}`);
    });
});

/* ── the real runner, on canaries only ─────────────────────────────────────────────────────────── */

const CANARIES = [
    "tests/harness/liveGuardCanary/accidental.live.test.ts",
    "tests/harness/liveGuardCanary/live/accidentalUnderLiveDir.test.ts",
];
const scratch = mkdtempSync(join(tmpdir(), "live-guard-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** vitest in a child whose environment is built from scratch: no host credential, an empty HOME. */
function vitest(args: string[], extra: Record<string, string | undefined> = {}) {
    const dir = join(scratch, `run-${++n}`);
    mkdirSync(join(dir, "home"), { recursive: true });
    const marker = join(dir, "canary.log");
    const env: Record<string, string | undefined> = {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: join(dir, "home"),
        TMPDIR: tmpdir(),
        NODE_ENV: "test",
        NO_COLOR: "1",
        ALLOY_STACK_STATE_DIR: join(dir, "stack"),
        LIVE_GUARD_CANARY_FILE: marker,
        ...extra,
    };
    const r = spawnSync(join(WEB, "node_modules", ".bin", "vitest"), args, { cwd: WEB, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 120_000 });
    return {
        code: r.status,
        out: `${r.stdout}\n${r.stderr}`,
        markers: existsSync(marker) ? readFileSync(marker, "utf8").split("\n").filter(Boolean) : [],
    };
}

const listed = (out: string) => out.split("\n").map((l) => l.trim()).filter((l) => /\.test\.(ts|tsx|mts|mjs|js)$/.test(l));

/** A genuine alloy-stack lease record for THIS worktree, held by a running process, in a temp state dir. */
function validLeaseStateDir(name: string) {
    const stateDir = join(scratch, name);
    mkdirSync(join(stateDir, "leases"), { recursive: true });
    const pidStart = execFileSync("ps", ["-o", "lstart=", "-p", String(process.pid)], { encoding: "utf8" }).replace(/\s+/g, " ").trim();
    writeFileSync(join(stateDir, "leases", "guard-test.lease"), [
        "HOLDER=guard-test", `WORKTREE=${REPO}`, `PID=${process.pid}`, `PID_START=${pidStart}`, `CREATED=${new Date().toISOString()}`,
    ].join("\n"));
    return stateDir;
}

describe("accidental selection cannot import a live suite — the real runner", () => {
    it.each(CANARIES)("explicitly naming %s, with no authority: excluded, exit ≠ 0, module/hooks/test never ran", (file) => {
        const r = vitest(["run", file]);
        expect(r.code).not.toBe(0);
        expect(r.out).toMatch(/No test files found/);
        expect(r.out).toContain(`[live-suite-guard] live suites EXCLUDED (not run, not passed): ${R.NONE}`);
        expect(r.markers).toEqual([]);
    }, 120_000);

    it("a VALID shared-stack lease + the sanctioned target + a key is still no operation authority: canary never ran", () => {
        const r = vitest(["run", CANARIES[0]], {
            ALLOY_STACK_STATE_DIR: validLeaseStateDir("lease-state"),
            CERT_SUPABASE_URL: "http://127.0.0.1:54421",
            CERT_SERVICE_ROLE_KEY: SECRET,
        });
        expect(r.code).not.toBe(0);
        expect(r.out).toContain(`EXCLUDED (not run, not passed): ${R.NONE}`);
        expect(r.markers).toEqual([]);
        expect(r.out).not.toContain(SECRET);
    }, 120_000);

    it("a magic flag does not open the gate either", () => {
        const r = vitest(["run", CANARIES[0]], { CATALOG_LIVE_ISOLATED: "1", ALLOY_CERTIFICATION: "1", CERT_KEEP: "1", CERT_SEED_DEMO: "1" });
        expect(r.code).not.toBe(0);
        expect(r.markers).toEqual([]);
    }, 120_000);

    it.each([
        ["a wrong-fixture binding", { ALLOY_CERT_FIXTURE: "financials_historical_draft" }],
        ["a binding aimed at the shared stack", { SUPABASE_URL: "http://127.0.0.1:54421" }],
        ["a binding with no run", { ALLOY_QA_RUN_ID: undefined }],
    ])("%s admits nothing: canary never ran", (_l, over) => {
        const r = vitest(["run", CANARIES[0]], isolatedEnv(over));
        expect(r.code).not.toBe(0);
        expect(r.out).toContain(`EXCLUDED (not run, not passed): ${R.NONE}`);
        expect(r.markers).toEqual([]);
        expect(r.out).not.toContain(SECRET);
    }, 120_000);

    it("a valid binding admits only the pinned suite: the canary and the incident's suites stay excluded (listed, not imported)", () => {
        const env = isolatedEnv();
        const all = vitest(["list", "--filesOnly"], env);
        expect(all.out).toContain("[live-suite-guard] only 1 pinned isolated suite(s) ADMITTED by isolated_qa_binding");
        expect(listed(all.out)).toEqual([...FINANCIALS_ISOLATED_SUITE]);
        const named = vitest(["list", "--filesOnly",
            "tests/financials/live/tuitionGeneration.live.test.ts",
            "tests/financials/live/paymentApplication.live.test.ts",
            "tests/financials/live/chargeCorrectionLineage.live.test.ts",
            ...CANARIES,
        ], env);
        expect(listed(named.out)).toEqual([]);
        const canary = vitest(["run", CANARIES[0]], env);
        expect(canary.code).not.toBe(0);
        expect(canary.markers).toEqual([]);
        expect(`${all.out}${named.out}${canary.out}`).not.toContain(SECRET);
    }, 180_000);

    it("explicitly naming the incident's suites and a live directory, with no authority: nothing is selected", () => {
        const r = vitest(["list", "--filesOnly",
            "tests/financials/live/tuitionGeneration.live.test.ts",
            "tests/financials/live/paymentApplication.live.test.ts",
            "tests/financials/live/chargeCorrectionLineage.live.test.ts",
            "tests/financials/live/financialsCardPayments.live.test.ts",
            "tests/businessProcesses/billingDueParity.live.test.ts",
            "tests/financials/live",
            ...CANARIES,
        ]);
        expect(listed(r.out)).toEqual([]);
        expect(r.markers).toEqual([]);
    }, 120_000);

    it("DEFAULT selection, with no authority, is exactly every test file minus the live set (globbed, not imported)", () => {
        const all: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) {
                    if (name !== "node_modules") walk(p);
                } else if (/\.test\.(ts|tsx)$/.test(name)) all.push(relative(WEB, p));
            }
        };
        walk(join(WEB, "tests"));
        const live = all.filter(isLiveSuitePath);
        expect(live).toEqual(expect.arrayContaining([
            "tests/financials/live/tuitionGeneration.live.test.ts",
            "tests/financials/live/paymentApplication.live.test.ts",
            "tests/financials/live/chargeCorrectionLineage.live.test.ts",
            "tests/financials/live/financialsCardPayments.live.test.ts",
            "tests/financials/live/demoTenantMoney.seed.test.ts",
            "tests/businessProcesses/billingDueParity.live.test.ts",
            ...CANARIES,
        ]));
        expect(live.length).toBeGreaterThan(100);
        const r = vitest(["list", "--filesOnly"]);
        expect(listed(r.out).sort()).toEqual(all.filter((f) => !isLiveSuitePath(f)).sort());
        expect(r.markers).toEqual([]);
    }, 180_000);
});

describe("the lane's explicit focused test list", () => {
    const LIST = join(REPO, "certification/financials/qa-bound-fixtures/FOCUSED-SAFE-TEST-LIST.txt");
    const entries = readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

    it("holds no live suite, no glob and no duplicate — and every entry exists", () => {
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.filter((f) => isLiveSuitePath(f) || /\.live\.|\/live\//.test(f))).toEqual([]);
        expect(entries.filter((f) => /[*?{}[\]]/.test(f))).toEqual([]);
        expect(new Set(entries).size).toBe(entries.length);
        expect(entries.filter((f) => !existsSync(join(WEB, f)))).toEqual([]);
        expect(entries).toContain("tests/harness/liveSuiteAuthority.test.ts");
    });
});

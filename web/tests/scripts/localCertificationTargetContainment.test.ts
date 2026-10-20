/**
 * Q1.0 — local-only certification fixtures refuse a remote database, whatever the environment says.
 *
 * The decisive cases RUN each fixture entry point as its own process (exactly as `vac certify-fixture`
 * does: `tsx --tsconfig tsconfig.json scripts/<entry>.ts [args]`) with a hosted Supabase URL and
 * `ALLOY_BLOCK_REMOTE_SUPABASE=0` — the setting that disables the toolkit's broader remote guard on
 * this host. A preload replaces `fetch` and records any call to a file, so "refused before any
 * request left the process" is observed, not inferred. The loopback cases show the guard admits a
 * local stack: the same script proceeds far enough to issue its first request.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
    NON_LOCAL_TARGET_EXIT_CODE,
    certificationTargetVerdict,
    isLoopbackDatabaseUrl,
} from "@/scripts/lib/localCertificationTarget";

const WEB = resolve(__dirname, "../..");
const TSX = join(WEB, "node_modules", "tsx", "dist", "cli.mjs");
const work = mkdtempSync(join(tmpdir(), "q1-0-containment-"));
const PRELOAD = join(work, "record-fetch.mjs");
writeFileSync(
    PRELOAD,
    [
        'import { appendFileSync } from "node:fs";',
        "const marker = process.env.Q10_FETCH_MARKER;",
        "globalThis.fetch = async (input) => {",
        "  if (marker) appendFileSync(marker, String(input instanceof Request ? input.url : input) + '\\n');",
        "  throw new Error('q1-0 test: network disabled');",
        "};",
    ].join("\n"),
);

afterAll(() => rmSync(work, { recursive: true, force: true }));

const ENTRIES = [
    { fixture: "operational_cards_certification", script: "scripts/seedOperationalCardsCertification.ts" },
    { fixture: "enrollment_certification", script: "scripts/seedEnrollmentCertification.ts" },
    { fixture: "enrollment_e2e_certification", script: "scripts/certifyEnrollmentE2E.ts" },
] as const;

const HOSTED = "https://q10containment.supabase.co";
const LOCAL = "http://127.0.0.1:54421";

function runEntry(script: string, args: string[], env: Record<string, string | undefined>) {
    const marker = join(work, `fetch-${Math.random().toString(36).slice(2)}.log`);
    const childEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        ALLOY_BLOCK_REMOTE_SUPABASE: "0",
        SUPABASE_SERVICE_ROLE_KEY: "q10-not-a-real-key",
        Q10_FETCH_MARKER: marker,
        NODE_OPTIONS: `--import ${PRELOAD}`,
    };
    for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete childEnv[k];
        else childEnv[k] = v;
    }
    const out = spawnSync(process.execPath, [TSX, "--tsconfig", "tsconfig.json", script, ...args], {
        cwd: WEB,
        env: childEnv,
        encoding: "utf8",
        timeout: 120_000,
    });
    const requests = existsSync(marker) ? readFileSync(marker, "utf8").split("\n").filter(Boolean) : [];
    return { status: out.status, stderr: out.stderr ?? "", stdout: out.stdout ?? "", requests };
}

describe("isLoopbackDatabaseUrl — parsed, not pattern-matched", () => {
    it.each([
        ["http://127.0.0.1:54421", true],
        ["http://localhost:54321", true],
        ["http://[::1]:54421", true],
        ["HTTP://LOCALHOST:54421/", true],
        ["https://ikaxilmwmrmbagoidedu.supabase.co", false],
        ["https://example.supabase.in", false],
        ["http://127.0.0.1.attacker.example", false],
        ["http://localhost.attacker.example:54421", false],
        ["http://127.0.0.1@attacker.supabase.co", false],
        ["http://user:pw@127.0.0.1:54421", false],
        ["http://10.0.0.5:54421", false],
        ["http://0.0.0.0:54421", false],
        ["postgres://127.0.0.1:54422/postgres", false],
        ["not a url", false],
        ["", false],
    ])("%s → %s", (url, expected) => {
        expect(isLoopbackDatabaseUrl(url)).toBe(expected);
    });
});

describe("certificationTargetVerdict — every URL the admin client can use", () => {
    it("refuses when nothing names a database", () => {
        expect(certificationTargetVerdict({})).toMatchObject({ ok: false, reason: "certification_target_unknown" });
    });
    it("refuses when EITHER client URL is remote, in either position", () => {
        expect(certificationTargetVerdict({ SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: HOSTED })).toMatchObject({
            ok: false,
            reason: "certification_target_not_local",
            host: "q10containment.supabase.co",
        });
        expect(certificationTargetVerdict({ SUPABASE_URL: HOSTED, NEXT_PUBLIC_SUPABASE_URL: LOCAL }).ok).toBe(false);
    });
    it("ignores ALLOY_BLOCK_REMOTE_SUPABASE entirely — there is no override", () => {
        for (const flag of ["0", "1", undefined]) {
            expect(certificationTargetVerdict({ SUPABASE_URL: HOSTED, ALLOY_BLOCK_REMOTE_SUPABASE: flag }).ok).toBe(false);
            expect(certificationTargetVerdict({ SUPABASE_URL: LOCAL, ALLOY_BLOCK_REMOTE_SUPABASE: flag }).ok).toBe(true);
        }
    });
});

describe("each certify-fixture entry point refuses a hosted database before any request", () => {
    for (const { fixture, script } of ENTRIES) {
        for (const args of [[], ["--remove"], ["--verify"]]) {
            it(`${fixture} ${args.join(" ") || "(ensure/run)"} → exit ${NON_LOCAL_TARGET_EXIT_CODE}, zero requests`, () => {
                const r = runEntry(script, args, { SUPABASE_URL: HOSTED, NEXT_PUBLIC_SUPABASE_URL: HOSTED, ALLOY_CERT_ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19" });
                expect(r.status, r.stderr).toBe(NON_LOCAL_TARGET_EXIT_CODE);
                expect(r.stderr).toContain('"code":"certification_target_not_local"');
                expect(r.stderr).toContain(fixture);
                expect(r.stderr).not.toContain("q10-not-a-real-key");
                expect(r.requests).toEqual([]);
            }, 130_000);
        }
    }

    it("refuses a hosted NEXT_PUBLIC fallback even when SUPABASE_URL is unset", () => {
        const r = runEntry(ENTRIES[1].script, ["--verify"], { SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: HOSTED });
        expect(r.status).toBe(NON_LOCAL_TARGET_EXIT_CODE);
        expect(r.requests).toEqual([]);
    }, 130_000);
});

describe("a local stack is still admitted", () => {
    for (const { fixture, script } of ENTRIES) {
        it(`${fixture} against ${LOCAL} passes the guard and issues its first request`, () => {
            const r = runEntry(script, ["--verify"], { SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: LOCAL, ALLOY_CERT_ORG_ID: "00000000-0000-4000-8000-000000000001" });
            expect(r.stderr).not.toContain("certification_target_not_local");
            expect(r.status).not.toBe(NON_LOCAL_TARGET_EXIT_CODE);
            expect(r.requests.length).toBeGreaterThan(0);
            expect(r.requests.every((u) => u.startsWith(`${LOCAL}/`))).toBe(true);
        }, 130_000);
    }
});

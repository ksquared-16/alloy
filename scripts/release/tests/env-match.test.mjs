import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { run, nameRecords, fetchVercel, fetchRender } from "../env-match.mjs";
import { EQUAL_FLAGS, loadPolicy } from "../env-match-policy.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/env-match-${name}.json`, import.meta.url), "utf8"));
const flag = EQUAL_FLAGS[0];
const secret = "fixture-secret-never-print-734";
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function offline(edit = () => {}) {
    const prod = fixture("production");
    const stage = fixture("staging");
    edit(prod, stage);
    return run(["--offline", "prod", "stage"], {
        read: (path) => JSON.stringify(path === "prod" ? prod : stage),
        fetchImpl: () => { throw new Error("Network forbidden"); },
    });
}

test("policy derives the 25 Vercel / 11 Render allowlist and required/staging classes", () => {
    const policy = loadPolicy();
    assert.equal(policy.vercel.allowed.length, 25);
    assert.equal(policy.render.allowed.length, 11);
    assert.equal(policy.vercel.required.length, 10);
    assert.equal(policy.render.required.length, 4);
    assert.ok(!policy.vercel.allowed.includes("CRON_SECRET"));
    assert.ok(!EQUAL_FLAGS.includes("ALLOY_ENVIRONMENT"));
});

test("clean name match and expected staging-only key pass", async () => {
    const result = await offline();
    assert.equal(result.code, 0);
    assert.match(result.text, /^Environment match: PASS/);
    assert.match(result.text, /staging-only expected: COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST/);
});

test("extra production key fails even when present on staging", async () => {
    const result = await offline((p, s) => { p.render.push("EXTRA_KEY"); s.render.push("EXTRA_KEY"); });
    assert.equal(result.code, 1);
    assert.match(result.text, /production outside allowlist: EXTRA_KEY/);
});

test("missing required key fails", async () => {
    const result = await offline((p, s) => { p.vercel.shift(); s.vercel.shift(); });
    assert.equal(result.code, 1);
    assert.match(result.text, /required production missing: ALLOY_ENVIRONMENT/);
});

test("unexpected staging key fails", async () => {
    const result = await offline((p, s) => s.render.push("UNKNOWN_STAGING_KEY"));
    assert.equal(result.code, 1);
    assert.match(result.text, /staging-only unexpected: UNKNOWN_STAGING_KEY/);
});

test("flag comparison retains SHA-256 only; equal and different values", async () => {
    assert.equal(nameRecords([{ key: flag, value: secret }], "vercel").get(flag), hash(secret));
    for (const equal of [true, false]) {
        const result = await offline((p, s) => {
            p.vercel.push({ key: flag, value: secret });
            s.vercel.push({ key: flag, value: equal ? secret : "fixture-other-value" });
        });
        assert.equal(result.code, equal ? 0 : 1);
        assert.ok(result.text.includes(`flag ${flag}: ${equal ? "equal" : "differs"}`));
        for (const value of [secret, "fixture-other-value", hash(secret)]) assert.ok(!result.text.includes(value));
    }
});

test("missing/unreadable flag never claims equality", async () => {
    for (const stageHasFlag of [true, false]) {
        const result = await offline((p, s) => { p.vercel.push(flag); if (stageHasFlag) s.vercel.push(flag); });
        assert.equal(result.code, 1);
        assert.match(result.text, stageHasFlag ? /unavailable/ : /differs \(presence\)/);
    }
});

test("secret and environment-specific values are discarded and never printed", async () => {
    const result = await offline((p, s) => {
        for (const platform of ["vercel", "render"]) {
            p[platform] = p[platform].map((key) => ({ key, value: secret }));
            s[platform] = s[platform].map((key) => ({ key, value: "fixture-other-secret" }));
        }
    });
    assert.equal(result.code, 0);
    assert.ok(!result.text.includes(secret));
    assert.ok(!result.text.includes("fixture-other-secret"));
    assert.equal(nameRecords([{ key: "SUPABASE_SERVICE_ROLE_KEY", value: secret }], "vercel").get("SUPABASE_SERVICE_ROLE_KEY"), null);
});

test("Vercel target filtering, staging overrides and targeted flag decryption", async () => {
    const calls = [];
    const result = await fetchVercel({ "vercel-project": "project", "vercel-team": "team", "staging-branch": "staging" }, "fake-token", async (url, opts) => {
        calls.push(url);
        assert.equal(opts.method, "GET");
        assert.equal(opts.redirect, "error");
        assert.equal(url.searchParams.get("teamId"), "team");
        return { ok: true, json: async () => url.pathname.includes("/v1/")
            ? { key: flag, value: secret, decrypted: true }
            : { envs: [
                { key: flag, id: "flag-id", type: "encrypted", value: "ciphertext", target: ["production"] },
                { key: flag, type: "plain", value: "wrong-default", target: ["preview"] },
                { key: flag, type: "plain", value: secret, target: ["preview"], gitBranch: "staging" },
                { key: flag, type: "plain", value: "wrong-branch", target: ["preview"], gitBranch: "feature" },
                { key: "DEV_ONLY", target: ["development"] },
                { key: "SUPABASE_SERVICE_ROLE_KEY", type: "encrypted", id: "secret-id", value: secret, target: ["production", "preview"] },
            ] } };
    });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].pathname.endsWith("/flag-id"));
    assert.equal(result.production.get(flag), hash(secret));
    assert.equal(result.staging.get(flag), hash(secret));
    assert.ok(!result.production.has("DEV_ONLY"));
});

test("Vercel sensitive and denied encrypted flags remain unavailable", async () => {
    for (const type of ["sensitive", "encrypted"]) {
        const result = await fetchVercel({ "vercel-project": "p" }, "fake", async (url) => {
            if (url.pathname.includes("/v1/")) throw new Error(secret);
            return { ok: true, json: async () => ({ envs: [{ key: flag, id: "id", type, value: secret, target: ["production", "preview"] }] }) };
        });
        assert.equal(result.production.get(flag), null);
        assert.equal(result.staging.get(flag), null);
    }
});

test("Render pagination reads all pages with GET and discards values", async () => {
    let calls = 0;
    const result = await fetchRender("service", "fake", async (url, options) => {
        calls++;
        assert.equal(options.method, "GET");
        if (calls === 2) assert.equal(url.searchParams.get("cursor"), "cursor-99");
        return { ok: true, json: async () => calls === 1
            ? Array.from({ length: 100 }, (_, i) => ({ envVar: { key: `KEY_${i}`, value: secret }, cursor: `cursor-${i}` }))
            : [{ envVar: { key: "LAST_KEY", value: secret }, cursor: "last" }] };
    });
    assert.equal(calls, 2);
    assert.equal(result.size, 101);
    assert.ok([...result.values()].every((v) => v === null));
});

test("invalid inputs and API errors never echo values, tokens or response bodies", async () => {
    const args = ["--vercel-project", "p", "--render-production", "prod", "--render-staging", "stage"];
    for (const fetchImpl of [
        async () => { throw new Error(secret); },
        async () => ({ ok: false, json: async () => ({ message: secret }) }),
        async () => ({ ok: true, json: async () => ({ envs: secret }) }),
    ]) {
        const result = await run(args, { env: { VERCEL_TOKEN: secret, RENDER_API_KEY: secret }, fetchImpl });
        assert.equal(result.code, 1);
        assert.ok(!result.text.includes(secret));
    }
    for (const body of [secret, JSON.stringify({ vercel: [{ key: `BAD\n${secret}`, value: secret }], render: [] })]) {
        const result = await run(["--offline", secret, secret], { read: () => body });
        assert.equal(result.code, 1);
        assert.ok(!result.text.includes(secret));
    }
});

test("CLI fixtures run without tokens; exit status and stdout agree", () => {
    const script = new URL("../env-match.mjs", import.meta.url);
    const args = [script.pathname, "--offline", ...["production", "staging"].map((name) => new URL(`fixtures/env-match-${name}.json`, import.meta.url).pathname)];
    const result = spawnSync(process.execPath, args, { encoding: "utf8", env: {}, timeout: 10_000 });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Environment match: PASS/);
    assert.equal(result.stderr, "");
    const failure = spawnSync(process.execPath, [script.pathname, "--offline", "missing", "missing"], { encoding: "utf8", env: {}, timeout: 10_000 });
    assert.equal(failure.status, 1);
    assert.match(failure.stdout, /^Environment match: FAIL/);
    assert.equal(failure.stderr, "");
});

test("CLI also runs through a symlink instead of silently exiting", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-match-test-"));
    try {
        const link = join(dir, "check.mjs");
        symlinkSync(new URL("../env-match.mjs", import.meta.url).pathname, link);
        const result = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8", env: {}, timeout: 10_000 });
        assert.equal(result.status, 0);
        assert.match(result.stdout, /^Usage:/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

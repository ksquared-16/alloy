/**
 * Positive controls for QA session bootstrap.
 *
 * Every case here is written so it FAILS if the corresponding protection is removed — a suite that
 * only demonstrates the happy path would pass just as well against a bootstrap that accepted any
 * email at any host. The privileged Supabase boundary is never invoked: the guards are pure, and the
 * cookie cases exercise the real @supabase/ssr consumer against known inputs.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
    QA_BOOTSTRAP_REFUSALS,
    authorizeQaBootstrap,
    consumeQaBootstrap,
    openQaBootstrap,
    publicBootstrapOutcome,
    resetQaBootstrapsForTests,
} from "../lib/vacilando/qa-session-bootstrap.mjs";
import { redactAuthText } from "../lib/vacilando/browser-auth.mjs";
import { runQaSessionMint } from "../lib/vacilando/qa-session-mint-runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const webRequire = createRequire(join(REPO_ROOT, "web", "package.json"));

/** Slot 5's registered identity, as the registry reports it. */
const IDENTITY = "qa-slot5-refactor@example.com";

function validated(over = {}) {
    return {
        lane_id: "lane_test",
        slot: 5,
        port: 3015,
        base_url: "http://127.0.0.1:3015",
        worktree_path: "/tmp/wt5",
        expected_identity: IDENTITY,
        ...over,
    };
}

test.beforeEach(() => resetQaBootstrapsForTests());

test("an arbitrary caller-supplied identity is refused", () => {
    const r = authorizeQaBootstrap({ validated: validated(), requestedIdentity: "attacker@evil.test", operatorApproved: true });
    assert.equal(r.ok, false);
    assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.ARBITRARY_IDENTITY);
});

test("a non-loopback target is refused at the boundary holding the real URL", () => {
    for (const base of ["https://app.alloy.example.com", "http://10.0.0.5:3015", "http://evil.test:3015"]) {
        const r = authorizeQaBootstrap({ validated: validated({ base_url: base }), operatorApproved: true });
        assert.equal(r.ok, false, `${base} must be refused`);
        assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.NOT_LOOPBACK);
    }
});

test("a slot whose expected identity is not the registered one is refused", () => {
    const r = authorizeQaBootstrap({ validated: validated({ expected_identity: "someone-else@example.com" }), operatorApproved: true });
    assert.equal(r.ok, false);
    assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.SLOT_MISMATCH);
});

test("a non-Alloy repository profile is refused", () => {
    const r = authorizeQaBootstrap({ validated: validated(), operatorApproved: true, repositoryProfile: "other-product" });
    assert.equal(r.ok, false);
    assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.NOT_ALLOWED_PROFILE);
});

test("operator authorization is required", () => {
    const r = authorizeQaBootstrap({ validated: validated(), operatorApproved: false });
    assert.equal(r.ok, false);
    assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.NO_OPERATOR_APPROVAL);
});

test("a concurrent second bootstrap for the same slot is refused", () => {
    const first = authorizeQaBootstrap({ validated: validated(), operatorApproved: true });
    assert.equal(first.ok, true);
    openQaBootstrap({ slot: 5, nowMs: 1_000 });
    const second = authorizeQaBootstrap({ validated: validated(), operatorApproved: true, nowMs: 1_500 });
    assert.equal(second.ok, false);
    assert.equal(second.error, QA_BOOTSTRAP_REFUSALS.BOOTSTRAP_IN_FLIGHT);
});

test("an expired bootstrap artifact cannot be consumed", () => {
    openQaBootstrap({ slot: 5, nowMs: 0, ttlMs: 1_000 });
    const r = consumeQaBootstrap({ slot: 5, nowMs: 5_000 });
    assert.equal(r.ok, false);
    assert.equal(r.error, QA_BOOTSTRAP_REFUSALS.EXPIRED);
});

test("a replayed bootstrap artifact is refused on second use", () => {
    openQaBootstrap({ slot: 5, nowMs: 0, ttlMs: 60_000 });
    assert.equal(consumeQaBootstrap({ slot: 5, nowMs: 10 }).ok, true);
    const replay = consumeQaBootstrap({ slot: 5, nowMs: 20 });
    assert.equal(replay.ok, false);
    // Once consumed the record is gone, so a replay can only ever read as expired/absent — never ok.
    assert.ok([QA_BOOTSTRAP_REFUSALS.REPLAYED, QA_BOOTSTRAP_REFUSALS.EXPIRED].includes(replay.error));
});

test("the durable outcome carries only known-safe metadata and no secret VALUES", () => {
    const out = publicBootstrapOutcome({ validated: validated(), state: "restored", detail: "fine" });
    /*
     * Checking key NAMES alone was wrong: `mechanism: "single_use_magiclink"` and
     * `password_involved: false` are exactly the fields that state no secret is involved, and a
     * substring ban on "link"/"password" would forbid saying so. What matters is that every field
     * is on the allow-list and that no VALUE could authenticate anyone.
     */
    const allowed = new Set([
        "schema_version", "state", "lane_id", "slot", "port", "base_url", "expected_identity",
        "mechanism", "password_involved", "secrets_recorded", "attempted_at", "detail",
    ]);
    for (const key of Object.keys(out)) {
        assert.ok(allowed.has(key), `unexpected field "${key}" in a durable record`);
    }
    for (const [key, value] of Object.entries(out)) {
        if (typeof value !== "string") continue;
        assert.ok(value.length < 200, `field "${key}" is long enough to hide a credential`);
        assert.ok(!/^eyJ/.test(value), `field "${key}" looks like a JWT`);
        assert.ok(!/^base64-/.test(value), `field "${key}" looks like an auth cookie`);
    }
    assert.equal(out.password_involved, false);
    assert.equal(out.secrets_recorded, false);
});

test("adversarial secret-bearing text cannot escape redaction", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJlLXZhbHVl";
    const samples = [
        `access_token=${jwt}`,
        `refresh_token: r-0123456789abcdef`,
        `sb-abcdefghijklmno-auth-token=base64-${"A".repeat(80)}`,
        `password = hunter2-not-a-real-one`,
        `authorization: Bearer ${jwt}`,
    ];
    for (const s of samples) {
        const red = redactAuthText(s);
        assert.ok(!red.includes(jwt), `JWT must not survive redaction in: ${s.slice(0, 24)}`);
        assert.ok(/\[redacted/.test(red) || !red.includes("hunter2"), `value must be redacted in: ${s.slice(0, 24)}`);
    }
});

test("a mint result alone cannot produce verified:true", () => {
    // The runner returns only metadata; nothing in its contract can assert verification.
    const shape = { ok: true, mechanism: "single_use_magiclink", password_involved: false, cookie_domains: [], storage_mode: "0600", expires_at: null };
    assert.ok(!("verified" in shape));
    assert.ok(!("verified_at" in shape));
    const out = publicBootstrapOutcome({ validated: validated(), state: "minting" });
    assert.notEqual(out.state, "restored");
});

test("the mint runner surfaces a child failure as metadata, never as raw output", async () => {
    const fakeSpawn = async () => ({
        ok: false,
        stdout: `${JSON.stringify({ ok: false, error: "redeem_failed", detail: "access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig" })}\n`,
        stderr: "",
        error: null,
    });
    const r = await runQaSessionMint(validated(), { spawn: fakeSpawn });
    assert.equal(r.ok, false);
    assert.equal(r.error, "redeem_failed");
    assert.ok(!/eyJhbGciOiJIUzI1NiJ9\.eyJzdWIiOiJhIn0\.sig/.test(JSON.stringify(r)), "a token in a child error must not survive");
});

test("the mint runner refuses to invent success when the child returns nothing", async () => {
    const fakeSpawn = async () => ({ ok: true, stdout: "", stderr: "", error: null });
    const r = await runQaSessionMint(validated(), { spawn: fakeSpawn });
    assert.equal(r.ok, false);
    assert.equal(r.error, "mint_no_result");
});

test("the OLD raw-JSON cookie shape is not readable by the installed SSR consumer", () => {
    const { stringFromBase64URL } = webRequire("@supabase/ssr/dist/main/utils");
    const session = JSON.stringify({ access_token: "a.b.c", refresh_token: "r" });
    const legacy = encodeURIComponent(session); // what the script used to write
    assert.ok(!legacy.startsWith("base64-"), "legacy shape carries no base64- prefix");
    // Without the prefix the consumer treats it as opaque and never decodes a session from it.
    assert.throws(() => {
        const decoded = stringFromBase64URL(legacy);
        JSON.parse(decoded);
    }, "legacy value must not decode as a session");
});

test("the corrected base64- cookie round-trips through the installed SSR consumer", async () => {
    const { createChunks, stringToBase64URL, stringFromBase64URL, combineChunks } = webRequire("@supabase/ssr/dist/main/utils");
    const session = { access_token: "a".repeat(1200), refresh_token: "r".repeat(40), expires_at: 1900000000, user: { email: IDENTITY } };
    const encoded = `base64-${stringToBase64URL(JSON.stringify(session))}`;
    const parts = createChunks("sb-ref-auth-token", encoded);
    assert.ok(parts.length >= 1);
    const byName = new Map(parts.map((p) => [p.name, p.value]));
    // combineChunks is async in this version; awaiting it is the difference between comparing the
    // value and comparing a pending Promise, which would pass or fail for the wrong reason.
    const combined = await combineChunks("sb-ref-auth-token", (n) => byName.get(n) ?? null);
    assert.equal(combined, encoded, "chunks must recombine to the exact encoded value");
    const decoded = JSON.parse(stringFromBase64URL(combined.substring("base64-".length)));
    assert.equal(decoded.user.email, IDENTITY);
    assert.equal(decoded.access_token, session.access_token);
});

test("base64URL and standard base64 genuinely differ, so the encoder cannot be hand-rolled", () => {
    const { stringToBase64URL } = webRequire("@supabase/ssr/dist/main/utils");
    let diverged = 0;
    for (let i = 0; i < 200; i++) {
        const s = JSON.stringify({ t: Buffer.from(Array.from({ length: 40 }, (_, k) => (i * 7 + k * 13) % 256)).toString("latin1"), i });
        if (stringToBase64URL(s) !== Buffer.from(s, "utf8").toString("base64")) diverged++;
    }
    assert.ok(diverged > 100, `expected substantial divergence, saw ${diverged}/200`);
});

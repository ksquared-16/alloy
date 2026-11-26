#!/usr/bin/env node
/**
 * Where a slot's QA session is minted from.
 *
 * THE DEFECT THIS CLOSES, MEASURED ON THE LIVE HOST (2026-09-12). Slot 8 was
 * deliberately retargeted to the local alloy-cert stack: its worktree carries
 * only `web/.env.certification.local`, which points at Supabase on
 * 127.0.0.1:54421, and that stack answers. But `trustedEnvSource()` returned one
 * value for the whole host — the canonical checkout's `web/.env.local`, which
 * points at a hosted `*.supabase.co` project — and the QA session restore never
 * passed an env source, so the mint always used it.
 *
 * The result was a session minted for the hosted project handed to a server that
 * validates certification-project cookies. Authentication failed before any
 * product path could run, and Gate 2 mounted certification stalled against a
 * candidate nobody had shown to be defective. An infrastructure mismatch wearing
 * the costume of a product auth bug.
 *
 * Isolated runtime only. Reads no host config: every case writes its own.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "vac-qaenv-"));
const CONFIG = join(DIR, "config");
const CERT_ENV = join(DIR, ".env.certification.local");
writeFileSync(CERT_ENV, "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421\n");

// The reader consults ALLOY_CONFIG_FILE, so the test owns the config it reads.
process.env.ALLOY_CONFIG_FILE = CONFIG;

const BA = await import("../lib/vacilando/browser-auth.mjs");
const MINT = await import("../lib/vacilando/qa-session-mint-runner.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  BA.resetQaEnvSourceCacheForTests();
  for (const k of Object.keys(process.env)) {
    if (/^ALLOY_SLOT_\d+_QA_ENV_SOURCE$/.test(k)) delete process.env[k];
  }
  writeFileSync(CONFIG, "");
  try {
    fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

const validated = (slot) => ({
  slot,
  expected_identity: `qa-slot${slot}@example.com`,
  base_url: `http://localhost:30${10 + slot}`,
});

// ── Resolution ───────────────────────────────────────────────────────────────

test("a slot that declares nothing keeps the host default, unchanged", () => {
  // THE PROPERTY THAT MAKES THIS SAFE TO SHIP. Every hosted slot must behave
  // byte-for-byte as before, or a fix for slot 8 becomes an outage for the rest.
  assert.equal(BA.qaEnvSourceForSlot(3), null);
  const out = MINT.resolveMintEnvSource(3);
  assert.equal(out.ok, true);
  assert.equal(out.declared, false);
  assert.equal(out.envSource, MINT.trustedEnvSource());
});

test("a slot declares its certification source in the config file", () => {
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${CERT_ENV}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  assert.equal(BA.qaEnvSourceForSlot(8), CERT_ENV);
  const out = MINT.resolveMintEnvSource(8);
  assert.equal(out.ok, true);
  assert.equal(out.declared, true);
  assert.equal(out.envSource, CERT_ENV);
  assert.notEqual(out.envSource, MINT.trustedEnvSource(), "the whole point is that it differs");
});

test("the environment variable outranks the config file", () => {
  // Matches how ALLOY_SLOT_<N>_QA_IDENTITY already resolves, so there is one rule
  // for per-slot settings rather than two that disagree under pressure.
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${join(DIR, "from-config")}"\n`);
  process.env.ALLOY_SLOT_8_QA_ENV_SOURCE = CERT_ENV;
  BA.resetQaEnvSourceCacheForTests();
  assert.equal(BA.qaEnvSourceForSlot(8), CERT_ENV);
});

test("one slot's declaration never leaks to another", () => {
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${CERT_ENV}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  assert.equal(BA.qaEnvSourceForSlot(8), CERT_ENV);
  assert.equal(BA.qaEnvSourceForSlot(7), null, "slot 7 is hosted and must stay hosted");
  assert.equal(MINT.resolveMintEnvSource(7).envSource, MINT.trustedEnvSource());
});

// ── Fail closed ──────────────────────────────────────────────────────────────

test("a declared source that does not exist REFUSES, it does not fall back", () => {
  // THE RULE THAT KEEPS THE DEFECT FROM RETURNING INVISIBLY. Falling back to the
  // host default here would silently mint a hosted cookie for a certification
  // slot again, and the only symptom would be an auth failure three layers away.
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${join(DIR, "gone.env")}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  const out = MINT.resolveMintEnvSource(8);
  assert.equal(out.ok, false);
  assert.equal(out.error, MINT.QA_ENV_SOURCE_MISSING);
  assert.match(out.detail, /ALLOY_SLOT_8_QA_ENV_SOURCE/);
  assert.notEqual(out.envSource, MINT.trustedEnvSource(), "it must never resolve to the host default");
});

test("a refused slot never spawns the mint child", () => {
  // Refusal has to happen BEFORE the privileged child exists. A slot that cannot
  // say where it authenticates must not reach Supabase at all, let alone the
  // wrong one.
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${join(DIR, "gone.env")}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  let spawned = 0;
  const out = MINT.runQaSessionMintSync(validated(8), {
    spawnSyncImpl: () => { spawned += 1; return { stdout: "{}", stderr: "", status: 0 }; },
  });
  assert.equal(spawned, 0, "nothing privileged may run for a slot that cannot resolve its source");
  assert.equal(out.ok, false);
  assert.equal(out.error, MINT.QA_ENV_SOURCE_MISSING);
});

// ── What the child is actually told ──────────────────────────────────────────

test("the mint child is invoked with the slot's own env source", () => {
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${CERT_ENV}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  let argv = null;
  MINT.runQaSessionMintSync(validated(8), {
    spawnSyncImpl: (_cmd, a) => { argv = a; return { stdout: "{}", stderr: "", status: 0 }; },
  });
  assert.ok(argv, "the child must have been invoked");
  const i = argv.indexOf("--env-source");
  assert.ok(i >= 0, "--env-source must be passed");
  assert.equal(argv[i + 1], CERT_ENV);
});

test("a hosted slot's child is invoked exactly as it was before", () => {
  let argv = null;
  MINT.runQaSessionMintSync(validated(3), {
    spawnSyncImpl: (_cmd, a) => { argv = a; return { stdout: "{}", stderr: "", status: 0 }; },
  });
  const i = argv.indexOf("--env-source");
  assert.equal(argv[i + 1], MINT.trustedEnvSource());
});

test("an explicit caller-supplied source still wins", () => {
  // The test seam and the escape hatch. It must outrank the slot declaration, or
  // every existing caller that passes one would silently stop being obeyed.
  writeFileSync(CONFIG, `ALLOY_SLOT_8_QA_ENV_SOURCE="${CERT_ENV}"\n`);
  BA.resetQaEnvSourceCacheForTests();
  const explicit = join(DIR, "explicit.env");
  writeFileSync(explicit, "X=1\n");
  let argv = null;
  MINT.runQaSessionMintSync(validated(8), {
    envSource: explicit,
    spawnSyncImpl: (_cmd, a) => { argv = a; return { stdout: "{}", stderr: "", status: 0 }; },
  });
  const i = argv.indexOf("--env-source");
  assert.equal(argv[i + 1], explicit);
});

test("the per-slot QA identity still resolves — the shared parser did not break it", () => {
  // qaIdentityForSlot was refactored onto the same parser this adds. It is the
  // one thing in this file that was already working and must not have moved.
  writeFileSync(CONFIG, 'ALLOY_SLOT_8_QA_IDENTITY="qa-slot8-product@example.com"\n');
  BA.resetQaIdentityCacheForTests();
  assert.equal(BA.qaIdentityForSlot(8), "qa-slot8-product@example.com");
  assert.equal(BA.qaIdentityForSlot(99), null);
});

try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temp */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

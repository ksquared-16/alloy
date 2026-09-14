/**
 * The one registered reconciliation could not succeed for anyone.
 *
 * The governed contract was complete and live-proven — registration, mode,
 * approval, dispatch, authorization, executor, registry lookup, environment
 * validation, frozen runner, DRY_RUN=1. Then the script exited
 * "ORG_ID is required." because nothing could supply ORG_ID: the frozen table
 * offered only DRY_RUN, and the action schema accepts only a key, an
 * environment and a boolean.
 *
 * A stale canonical checkout hid this for two missions, and a generic failure
 * string hid it again once the checkout was current.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const R = await import("../lib/vacilando/trusted-host-reconciliation.mjs");
const REG = await import("../lib/vacilando/reconciliation-registry.mjs");

const ORG = "93667019-0000-4000-8000-000000000001";
const KEY = "converge_placement_waitlisted_children";
const BASE = { reconciliation_key: KEY, target_environment: "staging", dry_run: true };
const NL = String.fromCharCode(10);

/** Records what the child was actually given, and answers however the test wants. */
function spawnStub(result = { status: 0, stdout: "", stderr: "" }) {
  const seen = {};
  const spawn = (cmd, args, opts) => { seen.cmd = cmd; seen.args = args; seen.opts = opts; return result; };
  return { spawn, seen };
}
const TRUSTED = { DEV_QUEUE_ORG_ID: ORG };

await test("RC1 — the registration declares where its required context comes from", () => {
  const entry = REG.REGISTERED_RECONCILIATIONS[KEY];
  assert.deepEqual(entry.required_context, { ORG_ID: "DEV_QUEUE_ORG_ID" });
});

await test("RC2 — ORG_ID reaches the runner, resolved by the registry", () => {
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(seen.opts.env.ORG_ID, ORG);
  assert.equal(seen.opts.env.DRY_RUN, "1");
});

await test("RC3 — a caller cannot supply or override ORG_ID", () => {
  /*
   * THE CONTRACT GOT STRONGER, AND THIS CASE RECORDS WHICH.
   *
   * It used to assert that a caller-supplied ORG_ID was IGNORED and the registry
   * value won. That was safe and dishonest: a caller who sends ORG_ID believes
   * something will use it, and silence lets them keep believing. The resolver now
   * REFUSES the request outright, which is strictly stronger — the run does not
   * happen at all rather than happening differently than the caller thought.
   */
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(
    { ...BASE, ORG_ID: "11111111-1111-4111-8111-111111111111", org_id: "nope", env: { ORG_ID: "nope" } },
    { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, false, "an override attempt must refuse, not be quietly dropped");
  assert.equal(out.error, "caller_field_not_permitted");
  assert.equal(seen.cmd, undefined, "and nothing may be spawned");
});

await test("RC3a — with no override offered, the registry value is what reaches the runner", () => {
  // The property RC3 used to prove, kept: the registry supplies the context.
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, true);
  assert.equal(seen.opts.env.ORG_ID, ORG);
});

await test("RC4 — unresolved context refuses BEFORE the spawn", () => {
  let spawned = false;
  const spawn = () => { spawned = true; return { status: 0, stdout: "", stderr: "" }; };
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: {} });
  assert.equal(out.ok, false);
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.CONTEXT_UNRESOLVED);
  assert.equal(spawned, false, "nothing may run when the org is unknown");
  assert.match(out.detail, /DEV_QUEUE_ORG_ID/);
});

await test("RC5 — a malformed org is refused, not guessed", () => {
  const { spawn } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: { DEV_QUEUE_ORG_ID: "the-qa-org" } });
  assert.equal(out.ok, false);
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.CONTEXT_INVALID);
});

await test("RC6 — production is still absent from the vocabulary", () => {
  assert.deepEqual([...REG.RECONCILIATION_ENVIRONMENTS], ["staging"]);
  const { spawn } = spawnStub();
  const out = R.runRegisteredReconciliation({ ...BASE, target_environment: "production" }, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, false);
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.ENVIRONMENT_NOT_PERMITTED);
});

await test("RC7 — apply carries its own opt-in, and only when asked", () => {
  const { spawn, seen } = spawnStub();
  R.runRegisteredReconciliation({ ...BASE, dry_run: false }, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(seen.opts.env.DRY_RUN, "0");
  assert.equal(seen.opts.env.QA_CONVERGE_APPLY, "1");
  assert.equal(seen.opts.env.ORG_ID, ORG);
});

await test("RC8 — the runner stays frozen; a caller naming one is refused", () => {
  // Also strengthened from "ignored" to "refused", for the same reason as RC3.
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation({ ...BASE, runner: "rm -rf /" }, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, false);
  assert.equal(out.error, "caller_field_not_permitted");
  assert.equal(seen.cmd, undefined, "nothing spawned");
});

await test("RC8a — and the frozen runner is the one actually spawned", () => {
  const { spawn, seen } = spawnStub();
  R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(seen.cmd, "npm");
  assert.deepEqual(seen.args, ["run", "--silent", "dev:qa:converge-placement-waitlisted"]);
});

// ── diagnostics: the failure that told nobody anything ─────────────────────

await test("RC9 — a script that refuses on STDOUT is reported, not swallowed", () => {
  // The real shape: dotenv writes a banner, the script writes its reason, and
  // `stderr || stdout` picked the banner and threw the reason away.
  const { spawn } = spawnStub({ status: 1, stdout: "ORG_ID is required." + NL, stderr: "[dotenv] injecting env (24)" + NL });
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, false);
  assert.equal(out.exit_code, 1);
  assert.match(out.detail, /ORG_ID is required/, "the actual reason must survive");
});

await test("RC10 — a spawn that never started says so, distinctly", () => {
  const spawn = () => ({ error: Object.assign(new Error("spawnSync npm ENOENT"), { code: "ENOENT" }), status: null, stdout: null, stderr: null });
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/nope", trustedEnv: TRUSTED });
  assert.equal(out.ok, false);
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.RUNNER_NOT_STARTED,
    "never started and ran-then-failed are different problems for different people");
  assert.match(out.detail, /could not be started/);
  assert.equal(out.provenance.working_directory, "/nope/web");
});

await test("RC11 — a silent nonzero exit still yields provenance, not a bare sentence", () => {
  const { spawn } = spawnStub({ status: 3, stdout: "", stderr: "" });
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.exit_code, 3);
  assert.match(out.detail, /exited 3 without output/);
  assert.ok(out.provenance.runner);
});

await test("RC12 — every result carries the checkout it ran from", () => {
  // Both recent failures would have been self-diagnosing with this: a stale
  // root shows its HEAD, and a missing ORG_ID shows a current one.
  const { spawn } = spawnStub({ status: 0, stdout: "considered=0" + NL, stderr: "" });
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  for (const field of ["repo_root", "working_directory", "runner", "target_environment", "dry_run", "resolved_context"]) {
    assert.ok(field in out.provenance, field + " must be in provenance");
  }
  assert.deepEqual(out.provenance.resolved_context, ["ORG_ID"], "names the context, not its value");
});

await test("RC13 — provenance names the context without printing secrets", () => {
  const { spawn } = spawnStub({ status: 1, stdout: "boom", stderr: "" });
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: { ...TRUSTED, SUPABASE_SERVICE_ROLE_KEY: "super-secret" } });
  const blob = JSON.stringify(out);
  assert.ok(!blob.includes("super-secret"), "no credential material in a failure result");
});


/*
 * ── AND THEN IT STILL REFUSED ON THE REAL HOST ──
 *
 * Resolving only from the trusted env the fulfil handler passes, or from the
 * Gateway's own process env, refuses in exactly the configuration the platform
 * ships: DEV_QUEUE_ORG_ID lives in the file named by ALLOY_SERVER_ENV_SOURCE,
 * which is why nothing in memory ever had it. `vac-qa-access-assign` reads the
 * same name out of the same file.
 */
await test("RC14 — required context resolves from the trusted env SOURCE FILE", () => {
  const dir = mkdtempSync(join(tmpdir(), "alloy-recon-env-"));
  const envFile = join(dir, ".env.local");
  writeFileSync(envFile, [
    "# a real one has a great deal more in it than this",
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421",
    'DEV_QUEUE_ORG_ID="' + ORG + '"',
    "SUPABASE_SERVICE_ROLE_KEY=sb-secret-do-not-leak",
  ].join(NL) + NL);

  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: {}, trustedEnvSource: envFile });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(seen.opts.env.ORG_ID, ORG);
  assert.equal(out.provenance.context_sources.ORG_ID, "trusted_env_source");

  // Only the declared names are read. Nothing else in that file reaches the child
  // through this path, and no value of any kind reaches the result.
  assert.equal(seen.opts.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.ok(!JSON.stringify(out).includes("sb-secret-do-not-leak"));
  assert.ok(!JSON.stringify(out).includes(ORG));
  rmSync(dir, { recursive: true, force: true });
});

await test("RC15 — the trusted env passed in still wins over the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "alloy-recon-env-"));
  const envFile = join(dir, ".env.local");
  writeFileSync(envFile, "DEV_QUEUE_ORG_ID=22222222-2222-4222-8222-222222222222" + NL);
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED, trustedEnvSource: envFile });
  assert.equal(seen.opts.env.ORG_ID, ORG);
  assert.equal(out.provenance.context_sources.ORG_ID, "trusted_env");
  rmSync(dir, { recursive: true, force: true });
});

await test("RC16 — a missing or unreadable env source refuses rather than throwing", () => {
  const { spawn } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, {
    spawn, repoRoot: "/tmp", trustedEnv: {}, trustedEnvSource: "/nowhere/at/all/.env.local",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.CONTEXT_UNRESOLVED);
  // The refusal names the file an operator has to go and fix.
  assert.match(out.detail, /\/nowhere\/at\/all\/\.env\.local/);
  assert.equal(out.provenance.trusted_env_source, "/nowhere/at/all/.env.local");
});

await test("RC17 — a commented-out org is not a configured org", () => {
  const dir = mkdtempSync(join(tmpdir(), "alloy-recon-env-"));
  const envFile = join(dir, ".env.local");
  writeFileSync(envFile, "# DEV_QUEUE_ORG_ID=" + ORG + NL + "DEV_QUEUE_ORG_IDENTIFIER=" + ORG + NL);
  const { spawn } = spawnStub();
  const out = R.runRegisteredReconciliation(BASE, { spawn, repoRoot: "/tmp", trustedEnv: {}, trustedEnvSource: envFile });
  assert.equal(out.ok, false, "neither a comment nor a longer name is DEV_QUEUE_ORG_ID");
  assert.equal(out.error, REG.RECONCILIATION_REFUSALS.CONTEXT_UNRESOLVED);
  rmSync(dir, { recursive: true, force: true });
});

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
  const { spawn, seen } = spawnStub();
  const out = R.runRegisteredReconciliation(
    { ...BASE, ORG_ID: "11111111-1111-4111-8111-111111111111", org_id: "nope", env: { ORG_ID: "nope" } },
    { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
  assert.equal(out.ok, true);
  assert.equal(seen.opts.env.ORG_ID, ORG, "the registry value wins, always");
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

await test("RC8 — the runner stays frozen; the caller never names it", () => {
  const { spawn, seen } = spawnStub();
  R.runRegisteredReconciliation({ ...BASE, runner: "rm -rf /" }, { spawn, repoRoot: "/tmp", trustedEnv: TRUSTED });
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


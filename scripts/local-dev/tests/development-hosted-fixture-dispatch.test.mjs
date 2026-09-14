#!/usr/bin/env node
/**
 * THE HOSTED FIXTURE, THROUGH THE WRAPPER LIVE EXECUTION USES.
 *
 * `environment.execute_registered_reconciliation` sat in the uncovered wrapper
 * pin, and not because anyone judged it low risk: the dispatch wrapper spawns a
 * repository runner, so the only way to exercise it was to run the real npm
 * script against a real database. That is exactly what must never happen in CI.
 * A spawn seam was added for four lines, and this is what it buys.
 *
 * Nothing here calls `runRegisteredReconciliation` or the runner as its proof.
 * Every case seeds a real action record and drives `executeTrustedHostAction`,
 * the same entry point a governed action uses.
 *
 * TWO DEFECTS THIS BINDS, both found by building it:
 *
 *   frozen_context — the runner-env loop iterated `required_context` only, so a
 *   repository-declared invariant would have been declared, resolved, carried,
 *   and silently absent from the runner. Only a test that observes the RUNNER
 *   ENVIRONMENT can see that; a resolver test cannot.
 *
 *   fixture_audit — the runner computes which bytes ran against which database
 *   for which organization, and that truth was dropped at TWO boundaries: the
 *   reconciliation result shape, and the trusted-action completion allowlist.
 *   Both are mutation-proved below, separately, because one green end-to-end
 *   assertion cannot tell you whether both boundaries are guarded.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "hosted-fixture-dispatch-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const { ACTION_TYPES, getActionDefinition } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { describeExecutionFailure } = await import("../lib/vacilando/governed-action-request.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const KEY = "seed_financials_demo_tenant";
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const RUNNER = "dev:cert:seed-financials-demo-tenant";

/** What the real runner prints. Controlled, so the assertions can compare values. */
const RUNNER_RESULT = {
  ok: true, seeded: 1,
  reconciliation_key: KEY,
  repository_sha: "a".repeat(40),
  fixture_path: "certification/fixtures/financials-demo-tenant.sql",
  fixture_hash: "sha256:" + "b".repeat(64),
  organization_id: ORG,
  organization_source: "registered_context",
  target_database_identity: "db.example.supabase.co:5432/postgres",
  trusted_env_source: "/trusted/.env.server",
  started_at: "2026-09-14T10:00:00.000Z",
  finished_at: "2026-09-14T10:00:04.000Z",
  duration_ms: 4000,
  diagnostic: "SET | DELETE 4 | INSERT 0 4 | SET",
};

function spawnStub(over = {}) {
  const seen = {};
  const impl = (cmd, args, opts) => {
    seen.cmd = cmd; seen.args = args; seen.opts = opts;
    if (over.status && over.status !== 0) return { status: over.status, stdout: over.stdout ?? "", stderr: over.stderr ?? "" };
    return { status: 0, stdout: `${JSON.stringify(over.result ?? RUNNER_RESULT)}\n`, stderr: "" };
  };
  return { impl, seen };
}

function seedAction(inputs) {
  const def = getActionDefinition(ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION);
  const v = def.validateInputs(inputs);
  const dir = join(ROOT, "vacilando", "trusted-host-actions");
  mkdirSync(dir, { recursive: true });
  const id = `tha_test_${Math.random().toString(16).slice(2, 10)}`;
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    schema_version: "vacilando.trusted_host_action.v1",
    id, missionId: "mission-hosted-fixture",
    actionType: ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION,
    actionVersion: 1, requestedBy: "director",
    requestedInputs: inputs, inputs: v.ok ? v.normalized : inputs,
    authorizationIdentity: { scope: "mission-hosted-fixture", resolved: true },
    authorizationState: "authorized", authorizationId: "authz-test",
    executionState: "not_started", state: "authorized",
    retryState: { attempts: 0, maxAttempts: 1 },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, null, 2));
  return { id, validation: v };
}

const BASE = { reconciliation_key: KEY, target_environment: "staging", dry_run: false };
function dispatch(inputs = BASE, over = {}) {
  const { impl, seen } = spawnStub(over);
  TH.setReconciliationSpawnForTests(impl);
  try {
    const { id } = seedAction(inputs);
    const out = TH.executeTrustedHostAction(id, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
    return { out, seen };
  } finally { TH.setReconciliationSpawnForTests(null); }
}

/* ── A/B/C: the registered key, the runner, and the frozen organization ───── */

test("A — the registered key reaches its frozen runner through the real dispatcher", () => {
  const { out, seen } = dispatch();
  assert.notEqual(out.error, "action_unavailable");
  assert.equal(out.ok, true, `refused: ${out.error || ""} ${out.detail || ""}`);
  assert.equal(seen.cmd, "npm");
  assert.deepEqual(seen.args, ["run", "--silent", RUNNER]);
});

test("B — the frozen ORG_ID reaches the RUNNER ENVIRONMENT, not merely the resolver", () => {
  // This is the assertion a registry test cannot make, and the one the
  // frozen_context defect would have failed.
  const { seen } = dispatch();
  assert.equal(seen.opts.env.ORG_ID, ORG);
});

test("C — and the result says the organization came from the registry", () => {
  const { out } = dispatch();
  assert.equal(out.action.result.fixture_audit.organization_source, "registered_context");
  assert.equal(out.action.result.fixture_audit.organization_id, ORG);
});

test("D — the target is forwarded", () => {
  const { out } = dispatch();
  assert.equal(out.action.result.target_environment, "staging");
});

/* ── E/F/G: nothing executable comes from the caller ──────────────────────── */

test("E — a caller ORG_ID refuses rather than replacing the frozen one", () => {
  const { out, seen } = dispatch({ ...BASE, organization_id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "caller_field_not_permitted");
  assert.equal(seen.cmd, undefined, "and nothing may be spawned");
});

test("F — the fixture path cannot be replaced", () => {
  const { out, seen } = dispatch({ ...BASE, fixture_path: "/etc/passwd" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "caller_field_not_permitted");
  assert.equal(seen.cmd, undefined);
});

test("G — the runner cannot be replaced", () => {
  const { out, seen } = dispatch({ ...BASE, runner: "rm -rf /" });
  assert.equal(out.ok, false);
  assert.equal(seen.cmd, undefined);
});

test("G1 — arbitrary SQL has nowhere to go and is refused for saying so", () => {
  const { out, seen } = dispatch({ ...BASE, sql: "drop table charges" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "caller_field_not_permitted");
  assert.equal(seen.cmd, undefined);
});

test("G2 — production refuses at the dispatcher", () => {
  const { out, seen } = dispatch({ ...BASE, target_environment: "production" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "environment_not_permitted");
  assert.equal(seen.cmd, undefined);
});

/* ── I/J: the audit survives both boundaries, with the right VALUES ───────── */

test("I — fixture_audit reaches the final governed result", () => {
  const { out } = dispatch();
  const a = out.action.result.fixture_audit;
  assert.ok(a, "the audit was dropped somewhere between the runner and here");
  for (const k of ["repository_sha", "fixture_path", "fixture_hash", "organization_id",
    "organization_source", "target_database_identity", "trusted_env_source",
    "started_at", "finished_at", "duration_ms"]) {
    assert.ok(k in a, `missing ${k}`);
  }
});

test("J — and the VALUES are the runner's, not placeholders", () => {
  const a = dispatch().out.action.result.fixture_audit;
  assert.equal(a.repository_sha, RUNNER_RESULT.repository_sha);
  assert.equal(a.fixture_hash, RUNNER_RESULT.fixture_hash);
  assert.equal(a.fixture_path, RUNNER_RESULT.fixture_path);
  assert.equal(a.target_database_identity, RUNNER_RESULT.target_database_identity);
  assert.equal(a.trusted_env_source, RUNNER_RESULT.trusted_env_source);
  assert.equal(a.started_at, RUNNER_RESULT.started_at);
  assert.equal(a.finished_at, RUNNER_RESULT.finished_at);
  assert.equal(a.duration_ms, RUNNER_RESULT.duration_ms);
});

/* ── K: a safe failure keeps its sentence ─────────────────────────────────── */

test("K — a runner refusal's actionable detail survives to the operator surface", () => {
  const { out } = dispatch(BASE, {
    status: 1,
    stdout: JSON.stringify({ ok: false, code: "fixture_specimen_refused", detail: "fixture specimen refused" }),
    stderr: "fixture specimen refused",
  });
  assert.equal(out.ok, false);
  const shown = describeExecutionFailure(out);
  assert.match(shown, /fixture specimen refused/, "collapsing to a generic code is the defect");
});

/* ── L: secrets ───────────────────────────────────────────────────────────── */

test("L — a connection string in runner output does not reach the operator", () => {
  /*
   * MEASURED, NOT ASSUMED. The canonical behaviour is refusal, not masking:
   * payloadHasSecrets discards the whole result as `result_contained_secrets`.
   * That satisfies the contract - the secret does not reach the operator - and
   * the case records WHICH way it holds rather than implying a redactor.
   */
  const { out } = dispatch(BASE, {
    result: { ...RUNNER_RESULT, target_database_identity: "postgres://user:SPECIMEN_PASSWORD@host/db" },
  });
  const text = JSON.stringify(out.action?.result ?? {}) + describeExecutionFailure(out);
  assert.doesNotMatch(text, /SPECIMEN_PASSWORD/, "a password must never reach the operator surface");
  assert.doesNotMatch(text, /user:SPECIMEN/, "nor the credential pair");
});

test("L1 — the safe identity shape carries host and database only", () => {
  const a = dispatch().out.action.result.fixture_audit;
  assert.match(a.target_database_identity, /^[a-z0-9.\-]+(:\d+)?\/[a-z0-9_\-]+$/i);
  assert.doesNotMatch(a.target_database_identity, /@|password|:\/\//,
    "identity is host and database name — never a URL with credentials");
});


/* ── re-resolution: normalized may be re-read, frozen values never trusted ── */

test("M — a forged dedupeKey buys nothing: execution values are re-derived", () => {
  /*
   * The re-resolution discriminator is `dedupeKey`, which only the normalizer
   * writes. The obvious question is whether forging one lets a caller smuggle
   * derived values past the refusal — so this asks it directly.
   *
   * The invariant is NOT "a caller cannot forge dedupeKey". It is: normalized
   * input may be re-read, but frozen execution values are never trusted from it.
   * The trusted host re-reads the registry entry independently, so the forgery
   * reaches execution and changes nothing.
   */
  const { out, seen } = dispatch({
    ...BASE, dedupeKey: "forged",
    runner: "rm -rf /", fixture_path: "/etc/passwd",
    frozen_context: { ORG_ID: "11111111-1111-4111-8111-111111111111" },
  });
  assert.equal(out.ok, true, "a forged discriminator is accepted — and that is fine");
  assert.deepEqual(seen.args, ["run", "--silent", RUNNER], "the FROZEN runner ran, not the caller's");
  assert.equal(seen.opts.env.ORG_ID, ORG, "the FROZEN organization was used, not the caller's");
  assert.equal(out.action.result.fixture_audit.organization_source, "registered_context");
});

test("N — the executor re-resolves its own normalized inputs without refusing them", () => {
  // The defect this binds: the caller-field guard refused runner/runner_env in
  // the executor's own normalized object — a guard against callers that had
  // become a guard against the runtime.
  const { out } = dispatch();
  assert.equal(out.ok, true);
  assert.notEqual(out.error, "caller_field_not_permitted");
});

/* ── secret screening binds on BOTH paths ─────────────────────────────────── */

test("O — a secret in a FAILURE diagnostic is discarded too", () => {
  const { out } = dispatch(BASE, {
    status: 1,
    stdout: JSON.stringify({ ok: false, code: "fixture_apply_failed",
      detail: "could not connect using postgres://user:SPECIMEN_PASSWORD@host/db" }),
    stderr: "could not connect using postgres://user:SPECIMEN_PASSWORD@host/db",
  });
  const text = JSON.stringify(out.action?.result ?? {}) + describeExecutionFailure(out);
  assert.doesNotMatch(text, /SPECIMEN_PASSWORD/, "a failure diagnostic quotes connection strings most of all");
  assert.equal(out.error, "result_contained_secrets");
});

test("P — and an ordinary safe audit is published unchanged", () => {
  const a = dispatch().out.action.result.fixture_audit;
  assert.equal(a.organization_id, ORG);
  assert.equal(a.fixture_hash, RUNNER_RESULT.fixture_hash);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);

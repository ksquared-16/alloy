#!/usr/bin/env node
/**
 * Staging application certification — discovery, policy, evidence, resume.
 * Isolated runtime only.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cert-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  CANONICAL_STAGING_APP_URL,
  CERTIFICATION_SUITES,
  validateCertifyStagingInputs,
  resolveStagingDeployment,
  resolveCertificationPrincipal,
  resolveSuiteFromGit,
  enforceWritePolicy,
  classifyCertificationStatus,
  publicCertificationResult,
  requireCertificationEvidence,
  applyCertifyStaging,
  payloadContainsSecrets,
  runDefaultBrowser,
  captureDefaultReview,
  defaultRuntimeChecks,
  READ_ONLY_MUTATION_GREP_INVERT,
} = await import("../lib/vacilando/trusted-host-certify-app.mjs");
const { ACTION_TYPES, listRegisteredActions, getActionDefinition } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  requestTrustedHostAction,
  getTrustedHostAction,
  setTrustedHostCertifyRunnersForTests,
  fulfillApplicationCertifyStagingForMission,
} = await import("../lib/vacilando/trusted-host-actions.mjs");
const {
  requestGovernedAction,
  processGovernedAction,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
  continuationTextForGovernedAction,
  pendingGovernedActionForLane,
} = await import("../lib/vacilando/governed-action-request.mjs");
const { grantMissionAuthorization } = await import("../lib/vacilando/trusted-host-authz.mjs");
const { listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`FAIL - ${name} :: ${err.message}\n`);
  }
}

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BASE = {
  environment: "staging",
  expected_sha: SHA,
  suite_key: "access_identity_v2",
  write_policy: "read_only",
  repository: "ksquared-16/alloy",
};

function normalized() {
  const v = validateCertifyStagingInputs(BASE);
  assert.equal(v.ok, true, v.detail || v.code);
  return v.normalized;
}

function fakeSuite() {
  return {
    ok: true,
    files: CERTIFICATION_SUITES.access_identity_v2.paths.map((relative) => ({ relative, sha256: "x", bytes: 10 })),
    suite_hash: "suitehash",
    gitCwd: "/tmp/git-objects",
    dirtyCheckoutIrrelevant: true,
  };
}

function fakeDeployment() {
  return {
    ok: true,
    url: CANONICAL_STAGING_APP_URL,
    url_identity: "staging.workwithalloy.com",
    http_status: 200,
    source: "canonical_config",
  };
}

function fakePrincipal() {
  return {
    ok: true,
    principal_id: "certop_abc123def456",
    principal_label: "seeded_certification_operator",
    principal_email_domain: "example.test",
  };
}

function readOnlyBrowser() {
  return { ok: true, passed: 12, failed: 0, skipped: 1, tests: [{ title: "write role", status: "skipped" }] };
}

test("action is registered as privileged read", () => {
  const registered = listRegisteredActions().map((a) => a.actionType);
  assert.equal(registered.includes(ACTION_TYPES.APPLICATION_CERTIFY_STAGING), true);
  assert.equal(getActionDefinition(ACTION_TYPES.APPLICATION_CERTIFY_STAGING).riskClass, "privileged_read");
  assert.equal(registered.includes(ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL), true);
  assert.equal(getActionDefinition(ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL).riskClass, "privileged_write");
});

test("staging deployment discovery uses configured URL", () => {
  const out = resolveStagingDeployment({
    env: { ALLOY_STAGING_APP_URL: "https://staging.workwithalloy.com" },
    probe: () => ({ ok: true, status: 200 }),
  });
  assert.equal(out.ok, true);
  assert.equal(out.url_identity, "staging.workwithalloy.com");
  assert.equal(out.source, "trusted_env");
});

test("unavailable deployment is explicit", () => {
  const out = resolveStagingDeployment({
    env: {},
    probe: () => ({ ok: false, detail: "connection refused" }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "staging_deployment_unavailable");
});

test("dashboard URLs are rejected", () => {
  const out = resolveStagingDeployment({
    env: { ALLOY_STAGING_APP_URL: "https://vercel.com/acme/alloy/dashboard" },
    probe: () => ({ ok: true, status: 200 }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "staging_deployment_unavailable");
});

test("secure principal is hashed and omits password", () => {
  const out = resolveCertificationPrincipal({
    env: { CERT_OPERATOR_EMAIL: "qa.operator@northwind.invalid", CERT_OPERATOR_PASSWORD: "super-secret" },
  });
  assert.equal(out.ok, true);
  assert.equal(out.principal_label, "seeded_certification_operator");
  assert.equal(JSON.stringify(out).includes("super-secret"), false);
  assert.equal("password" in out, false);
});

test("missing principal is explicit", () => {
  const out = resolveCertificationPrincipal({ env: {} });
  assert.equal(out.ok, false);
  assert.equal(out.code, "staging_certification_principal_unavailable");
});

test("suite resolves from git objects, not a dirty checkout", () => {
  const shown = [];
  const out = resolveSuiteFromGit(normalized(), {
    gitShow: ({ sha, relative }) => {
      shown.push(`${sha}:${relative}`);
      return { ok: true, text: `committed ${relative}` };
    },
    root: "/tmp/does-not-matter-dirty",
  });
  assert.equal(out.ok, true);
  assert.equal(out.dirtyCheckoutIrrelevant, true);
  assert.equal(shown.length, CERTIFICATION_SUITES.access_identity_v2.paths.length);
  assert.match(shown[0], new RegExp(`^${SHA}:`));
});

test("read-only is the default write policy", () => {
  const v = validateCertifyStagingInputs({ environment: "staging", expected_sha: SHA });
  assert.equal(v.ok, true);
  assert.equal(v.normalized.writePolicy, "read_only");
  const policy = enforceWritePolicy(v.normalized.writePolicy, { env: { CERT_ALLOW_WRITES: "1" } });
  assert.equal(policy.ok, true);
  assert.equal(policy.writes_enabled, false);
  assert.equal(policy.skipped_write_tests, true);
});

test("write tests stay skipped even if the suite can write", () => {
  const policy = enforceWritePolicy("read_only", { env: { CERT_ALLOW_WRITES: "1" } });
  assert.equal(policy.writes_enabled, false);
});

test("explicit mutation is not silently enabled", () => {
  const denied = enforceWritePolicy("mutate", { env: {} });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "mutation_not_authorized");
  const allowed = enforceWritePolicy("mutate", { env: { CERT_ALLOW_WRITES: "1" } });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.writes_enabled, true);
});

test("12 pass / 1 skip classifies as certified_read_only", () => {
  const status = classifyCertificationStatus({
    deploymentOk: true,
    principalOk: true,
    tests: { passed: 12, failed: 0, skipped: 1 },
    runtime: [{ id: "membership_missing_fails_closed", status: "not_run_read_only" }],
  });
  assert.equal(status, "certified_read_only");
});

test("department restriction can remain unproven without manufacturing a fixture", () => {
  const runtime = defaultRuntimeChecks({ writePolicy: "read_only" });
  const dept = runtime.find((r) => r.id === "location_department_restriction");
  assert.equal(dept.status, "unproven");
  assert.equal(dept.status === "passed", false);
  const status = classifyCertificationStatus({
    deploymentOk: true,
    principalOk: true,
    tests: { passed: 16, failed: 0, skipped: 1 },
    runtime,
  });
  assert.equal(status, "certified_read_only");
});

test("product review does not treat Access Scopes as a current chapter", () => {
  const ids = CERTIFICATION_SUITES.access_identity_v2.productReview.map((p) => p.id);
  assert.equal(ids.includes("scope"), false);
  assert.equal(ids.includes("users"), true);
  assert.equal(ids.includes("security"), true);
  assert.equal(ids.includes("location_access"), true);
});

test("browser failure still persists evidence", () => {
  const out = applyCertifyStaging(normalized(), {
    resolveDeployment: fakeDeployment,
    resolvePrincipal: fakePrincipal,
    resolveSuite: fakeSuite,
    runBrowser: () => ({ ok: false, passed: 3, failed: 2, skipped: 1, tests: [{ title: "Users", status: "failed" }] }),
    evidenceRoot: join(ROOT, "ev-browser-fail"),
    env: {},
  });
  assert.equal(out.status, "failed");
  assert.equal(existsSync(out.evidence_path), true);
  assert.equal(requireCertificationEvidence(out).ok, true);
});

test("runtime/browser failure still persists evidence", () => {
  const out = applyCertifyStaging(normalized(), {
    resolveDeployment: fakeDeployment,
    resolvePrincipal: fakePrincipal,
    resolveSuite: fakeSuite,
    runBrowser: () => ({ ok: false, passed: 0, failed: 1, skipped: 0, tests: [] }),
    evidenceRoot: join(ROOT, "ev-runtime-fail"),
    env: {},
  });
  assert.equal(out.status, "failed");
  assert.equal(out.runtime.some((r) => r.status === "failed"), true);
  assert.equal(existsSync(out.evidence_path), true);
});

test("credentials are redacted from the public result", () => {
  const out = applyCertifyStaging(normalized(), {
    resolveDeployment: fakeDeployment,
    resolvePrincipal: fakePrincipal,
    resolveSuite: fakeSuite,
    runBrowser: readOnlyBrowser,
    evidenceRoot: join(ROOT, "ev-redact"),
    env: { CERT_OPERATOR_PASSWORD: "do-not-leak" },
  });
  const pub = publicCertificationResult(out);
  const blob = JSON.stringify(pub);
  assert.equal(blob.includes("do-not-leak"), false);
  assert.equal(blob.includes("CERT_OPERATOR_PASSWORD"), false);
  assert.equal(payloadContainsSecrets(pub), false);
});

test("unavailable principal persists evidence", () => {
  const out = applyCertifyStaging(normalized(), {
    resolveDeployment: fakeDeployment,
    resolvePrincipal: () => ({ ok: false, code: "staging_certification_principal_unavailable", detail: "missing" }),
    resolveSuite: fakeSuite,
    evidenceRoot: join(ROOT, "ev-no-principal"),
    env: {},
  });
  assert.equal(out.status, "principal_unavailable");
  assert.equal(existsSync(out.evidence_path), true);
  assert.equal(out.principal, null);
});

test("unavailable deployment persists evidence", () => {
  const out = applyCertifyStaging(normalized(), {
    resolveDeployment: () => ({ ok: false, code: "staging_deployment_unavailable", detail: "down", url_identity: "staging.workwithalloy.com" }),
    resolveSuite: fakeSuite,
    evidenceRoot: join(ROOT, "ev-no-deploy"),
    env: {},
  });
  assert.equal(out.status, "environment_unavailable");
  assert.equal(existsSync(out.evidence_path), true);
});

test("production targets are rejected", () => {
  const v = validateCertifyStagingInputs({ ...BASE, environment: "production" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "production_target_rejected");
});

test("arbitrary commands are rejected", () => {
  const v = validateCertifyStagingInputs({ ...BASE, command: "bash -lc id" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "arbitrary_command_rejected");
});

const mission = createMission({
  slot: 5,
  worktree: ROOT,
  provider: "cursor",
  title: "Access & Identity",
  objective: "Staging application certification",
});
const missionId = mission.mission_id;
const laneId = "lane_identity_test";

setTrustedHostCertifyRunnersForTests({
  resolveDeployment: fakeDeployment,
  resolvePrincipal: fakePrincipal,
  resolveSuite: fakeSuite,
  runBrowser: readOnlyBrowser,
  captureReview: () => ([{
    id: "users",
    title: "Users",
    path: "/organization/access?section=users",
    artifact: join(ROOT, "users.png"),
    status: "captured",
  }]),
  env: {},
});

test("trusted-host certify result survives Director restart", () => {
  const first = fulfillApplicationCertifyStagingForMission(missionId, { inputs: BASE, actor: "director" });
  assert.equal(first.ok, true, first.error || first.detail);
  assert.equal(first.action.result.status, "certified_read_only");
  const again = getTrustedHostAction(first.action.id);
  assert.equal(again.id, first.action.id);
  assert.equal(again.result.status, "certified_read_only");
  assert.equal(existsSync(again.result.evidence_path), true);
});

test("duplicate certification request dedupes", () => {
  const a = requestTrustedHostAction({
    missionId,
    actionType: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    inputs: BASE,
  });
  const b = requestTrustedHostAction({
    missionId,
    actionType: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    inputs: BASE,
  });
  assert.equal(a.ok, true, a.error);
  assert.equal(b.ok, true, b.error);
  assert.equal(Boolean(b.deduped || b.already), true);
  assert.equal(a.action.id, b.action.id);
});

test("read-only certify auto-executes without operator approval and resumes the same lane", () => {
  resetGovernedActionsForTests(ROOT);
  const resumes = [];
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async (lane, text) => {
      resumes.push({ lane, text });
      return { ok: true };
    },
    startLaneAgentSession: async () => ({ ok: true }),
  });
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: {
      id: "tha_cert_auto",
      state: "completed",
      result: {
        status: "certified_read_only",
        evidencePath: join(ROOT, "certification.json"),
        tests: { passed: 12, failed: 0, skipped: 1 },
      },
    },
  }));
  const req = requestGovernedAction({
    mission_id: missionId,
    lane_id: laneId,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify the promoted staging application",
    reason_worker_cannot_execute: "Lane has no staging URL, operator session, or privileged environment discovery.",
    inputs: BASE,
  }, { root: ROOT, processNow: true });
  assert.equal(req.ok, true, req.error);
  const rec = req.request;
  assert.notEqual(rec.status, "awaiting_operator");
  if (rec.status !== "complete") {
    processGovernedAction(rec.request_id, { root: ROOT });
  }
  const pending = pendingGovernedActionForLane(laneId, ROOT);
  assert.equal(pending == null || pending.status === "complete", true);
});

test("certification evidence attaches once", () => {
  const onceMission = createMission({
    slot: 5,
    worktree: ROOT,
    provider: "cursor",
    title: "Access & Identity evidence-once",
    objective: "Evidence attachment",
  });
  resetGovernedActionsForTests(ROOT);
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async () => ({ ok: true }),
    startLaneAgentSession: async () => ({ ok: true }),
  });
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: {
      id: "tha_cert_once",
      state: "completed",
      result: {
        status: "certified_read_only",
        evidencePath: join(ROOT, "certification.json"),
        tests: { passed: 12, failed: 0, skipped: 1 },
      },
    },
  }));
  const req = requestGovernedAction({
    mission_id: onceMission.mission_id,
    lane_id: `${laneId}_once`,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify staging",
    reason_worker_cannot_execute: "Lane cannot reach staging credentials or URL.",
    inputs: BASE,
  }, { root: ROOT, processNow: true });
  assert.equal(req.ok, true, req.error);
  processGovernedAction(req.request.request_id, { root: ROOT });
  processGovernedAction(req.request.request_id, { root: ROOT });
  const ev = listEvidence(onceMission.mission_id);
  assert.equal(ev.length <= 1, true);
});

test("continuation does not leak credentials and points the same lane at evidence", () => {
  const text = continuationTextForGovernedAction({
    request_id: "gar_test",
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    lane_id: "lane_identity_test",
    result_ref: "/tmp/certification.json",
    result: { status: "certified_read_only", tests: { passed: 12, skipped: 1, failed: 0 } },
  }, { id: "tha_test", result: { status: "certified_read_only", evidencePath: "/tmp/certification.json" } });
  assert.match(text, /same Access & Identity lane|lane_identity_test/i);
  assert.equal(/super-secret|service_role|postgresql:\/\//i.test(text), false);
});

test("certify automatically retries after the principal is ensured", () => {
  resetGovernedActionsForTests(ROOT);
  const resumes = [];
  let ensured = 0;
  let certifyCalls = 0;
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async (lane, text) => {
      resumes.push({ lane, text });
      return { ok: true };
    },
    startLaneAgentSession: async () => ({ ok: true }),
  });
  setGovernedActionExecuteImplForTests((rec) => {
    if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
      ensured += 1;
      return {
        ok: true,
        action: {
          id: "tha_ensure_retry",
          state: "completed",
          result: { ok: true, operation: "created", principal_label: "staging_certification_operator" },
        },
      };
    }
    certifyCalls += 1;
    if (ensured === 0) {
      return {
        ok: false,
        error: "principal_unavailable",
        action: {
          state: "failed",
          failureReason: "principal_unavailable",
          result: { status: "principal_unavailable" },
        },
      };
    }
    return {
      ok: true,
      action: {
        id: "tha_cert_retry",
        state: "completed",
        result: { status: "certified_read_only", evidencePath: join(ROOT, "certification.json") },
      },
    };
  });
  grantMissionAuthorization({
    missionId,
    actionType: ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL,
    databaseTarget: "staging",
    queryHash: "staging:access_identity_v2:ensure",
    actor: "operator",
    note: "test_ensure_principal",
  });
  const req = requestGovernedAction({
    mission_id: missionId,
    lane_id: laneId,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify staging after principal bind",
    reason_worker_cannot_execute: "Lane has no staging URL or operator credentials.",
    inputs: BASE,
  }, { root: ROOT, processNow: true });
  assert.equal(req.ok, true, req.error);
  assert.equal(ensured, 1);
  assert.equal(certifyCalls >= 2, true);
  const pending = pendingGovernedActionForLane(laneId, ROOT);
  assert.equal(pending == null || pending.status === "complete", true);
});

test("duplicate certification does not duplicate the principal", () => {
  resetGovernedActionsForTests(ROOT);
  let ensured = 0;
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async () => ({ ok: true }),
    startLaneAgentSession: async () => ({ ok: true }),
  });
  setGovernedActionExecuteImplForTests((rec) => {
    if (rec.action_key === ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL) {
      ensured += 1;
      return { ok: true, action: { id: "tha_ensure_once", state: "completed", result: { ok: true, operation: "unchanged", principal_label: "staging_certification_operator" } } };
    }
    return { ok: true, action: { id: "tha_cert_once2", state: "completed", result: { status: "certified_read_only", evidencePath: join(ROOT, "certification.json") } } };
  });
  grantMissionAuthorization({
    missionId,
    actionType: ACTION_TYPES.APPLICATION_ENSURE_CERTIFICATION_PRINCIPAL,
    databaseTarget: "staging",
    queryHash: "staging:access_identity_v2:ensure",
    actor: "operator",
    note: "test_ensure_once",
  });
  const a = requestGovernedAction({
    mission_id: missionId,
    lane_id: `${laneId}_dup`,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify staging",
    reason_worker_cannot_execute: "Lane cannot reach staging credentials.",
    inputs: BASE,
  }, { root: ROOT, processNow: true });
  const b = requestGovernedAction({
    mission_id: missionId,
    lane_id: `${laneId}_dup`,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify staging",
    reason_worker_cannot_execute: "Lane cannot reach staging credentials.",
    inputs: BASE,
  }, { root: ROOT, processNow: true });
  assert.equal(a.ok && b.ok, true);
  assert.equal(ensured <= 1, true);
});

test("default browser runner invokes the host shell without leaking the password", () => {
  const evidenceDir = join(ROOT, "ev-default-browser");
  mkdirSync(evidenceDir, { recursive: true });
  const calls = [];
  const spawn = (cmd, args, opts = {}) => {
    calls.push({ cmd, args, env: opts.env || {} });
    if (cmd === "bash") {
      writeFileSync(args[2], JSON.stringify({
        stats: { expected: 8, unexpected: 0, skipped: 0 },
        suites: [{ specs: [{ title: "Users", ok: true, tests: [{ results: [{ status: "passed" }] }] }] }],
      }));
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
  };
  const out = runDefaultBrowser({
    normalized: normalized(),
    deployment: fakeDeployment(),
    writes: { writes_enabled: false },
    suite: { gitCwd: ROOT },
    evidenceDir,
    env: {
      CERT_OPERATOR_EMAIL: "cert.operator@northwind.invalid",
      CERT_OPERATOR_PASSWORD: "secret-pw",
    },
    spawn,
    materialize: () => ({ ok: true, suiteDir: join(evidenceDir, "suite") }),
  });
  assert.equal(out.failed, 0);
  assert.equal(out.skipped >= 1, true);
  assert.equal(JSON.stringify(out).includes("secret-pw"), false);
  const bash = calls.find((c) => c.cmd === "bash");
  assert.equal(Boolean(bash), true);
  assert.equal(bash.args.includes("--grep-invert"), true);
  assert.equal(bash.args.includes(READ_ONLY_MUTATION_GREP_INVERT), true);
  assert.equal(bash.env.CERT_OPERATOR_PASSWORD, "secret-pw");
});

test("default product-review capture does not pass the password to the child", () => {
  const evidenceDir = join(ROOT, "ev-default-review");
  mkdirSync(join(evidenceDir, "product-review"), { recursive: true });
  let childEnv = null;
  const spawn = (cmd, args, opts = {}) => {
    childEnv = opts.env || {};
    writeFileSync(join(evidenceDir, "product-review", "capture.json"), JSON.stringify([
      { id: "users", title: "Users", path: "/organization/access?section=users", artifact: join(evidenceDir, "users.png"), status: "captured" },
    ]));
    return { status: 0, stdout: "", stderr: "" };
  };
  const out = captureDefaultReview({
    deployment: fakeDeployment(),
    evidenceDir,
    routes: CERTIFICATION_SUITES.access_identity_v2.productReview,
    env: { CERT_OPERATOR_PASSWORD: "secret-pw" },
    spawn,
  });
  assert.equal(out[0].status, "captured");
  assert.equal(childEnv.CERT_OPERATOR_PASSWORD, undefined);
  assert.equal(JSON.stringify(out).includes("secret-pw"), false);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);

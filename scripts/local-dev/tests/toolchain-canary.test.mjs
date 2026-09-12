/**
 * DevOps 9 — Toolchain Canary, Update and Rollback V1.
 *
 * The property under test is that an update behaves like a candidate: it is
 * classified by whether it can be undone, proven before it is trusted, and
 * returned from when it is not.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as T from "../lib/vacilando/toolchain-canary.mjs";
import { UPDATE_CLASS } from "../lib/vacilando/host-maintenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const HOOKS = join(HERE, "..", "hooks");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const good = () => T.knownGoodSnapshot({
  toolkit: "14b0e01dcd06", claudeCode: "2.1.269", model: "default", effort: "medium",
  subagents: "none", node: "v22.23.2", instructionBaseline: "ib_x",
});
const allProofs = (v = true) => Object.fromEntries([
  "tool_versions_expected", "instruction_baseline_expected", "model_effort_expected",
  "gateway_toolkit_identity", "host_health", "lane_bootstrap_consistent",
  "critical_invariants", "configuration_audit", "canary_smoke", "no_stale_ownership",
].map((k) => [k, v]));

/* ── A · the inventory, and no second installer ──────────────────────────── */
test("every toolchain component names an external owner and a rollback mechanism", () => {
  assert.ok(T.TOOLCHAIN.length >= 10);
  for (const c of T.TOOLCHAIN) {
    assert.ok(c.owner && !c.owner.includes("toolchain-canary"), `${c.id} must delegate installation`);
    assert.ok(Object.values(T.ROLLBACK).includes(c.rollback), `${c.id} must declare a rollback mechanism`);
    assert.ok(c.rollback_detail, `${c.id} must say how rollback actually works`);
    if (c.restart_required) assert.ok(c.restart_owner, `${c.id} requires a restart and must name whose`);
  }
});

test("no installer, no restart path and no execution is introduced", () => {
  const code = codeOf("toolchain-canary.mjs");
  // Asserted on INVOCATION, not on vocabulary: the module names homebrew and npm
  // as the owners it delegates to, and a control that banned the words would
  // forbid it from saying who installs what.
  for (const f of ["child_process", "spawnSync", "execFileSync", "execSync"]) {
    assert.ok(!code.includes(f), `the canary module must not use ${f}`);
  }
  for (const call of [/`\s*(npm|brew|claude|launchctl)\s/, /exec\w*\(/, /\bspawn\w*\(/]) {
    assert.ok(!call.test(code), `the canary module must not invoke a command (${call})`);
  }
  // Restarts are named, never performed.
  assert.ok(code.includes("restart_owner"), "restarts are delegated by name");
});

test("the measured rollback asymmetry is recorded, not flattened", () => {
  // Toolkit: 44 versions retained behind a symlink. Claude Code: one npm-global
  // directory that an install replaces. These are not the same risk.
  assert.equal(T.componentById("vacilando_toolkit").rollback, T.ROLLBACK.POINTER_SWAP);
  assert.equal(T.componentById("claude_code").rollback, T.ROLLBACK.REINSTALL);
  assert.equal(T.componentById("macos").rollback, T.ROLLBACK.NONE);
  assert.match(T.componentById("node").rollback_detail, /plist hard-codes/);
});

/* ── B · classification derived from reversibility ───────────────────────── */
test("a component with no rollback is MANUAL_DEFERRED by construction", () => {
  for (const id of ["macos", "git"]) {
    const r = T.classifyComponentUpdate(id);
    assert.equal(r.class, UPDATE_CLASS.MANUAL_DEFERRED, `${id} must never be automatic`);
    assert.match(r.why, /no rollback|severe/);
  }
});

test("Claude Code, the model, and toolkit movement all require a canary", () => {
  for (const id of ["claude_code", "claude_model", "vacilando_toolkit", "instruction_baseline"]) {
    assert.equal(T.classifyComponentUpdate(id).class, UPDATE_CLASS.CANARY_REQUIRED, `${id} must be canaried`);
  }
});

test("node is MANUAL_DEFERRED because the Gateway silently inherits it", () => {
  const r = T.classifyComponentUpdate("node");
  assert.equal(r.class, UPDATE_CLASS.MANUAL_DEFERRED);
  assert.match(r.why, /severe/);
});

test("a major version is MANUAL_DEFERRED whatever the component", () => {
  assert.equal(T.classifyComponentUpdate("supabase_cli", { major: true }).class, UPDATE_CLASS.MANUAL_DEFERRED);
});

test("an unknown component defaults to MANUAL_DEFERRED", () => {
  const r = T.classifyComponentUpdate("some_new_tool");
  assert.equal(r.class, UPDATE_CLASS.MANUAL_DEFERRED);
  assert.match(r.why, /unrecognised/);
});

test("a low-risk reversible single-environment tool can be auto-safe", () => {
  assert.equal(T.classifyComponentUpdate("stripe_cli").class, UPDATE_CLASS.AUTO_SAFE);
});

/* ── C · the canary is a normal lane ─────────────────────────────────────── */
test("a canary is an ordinary lane with a candidate configuration, not a new agent kind", () => {
  const c = T.canaryLaneContract({ laneId: "lane_x", component: "claude_code", candidate: "2.2.0", baseline: "2.1.269", instructionBaseline: "ib_x" });
  assert.equal(c.same_bootstrap_contract, true);
  assert.equal(c.authority_expansion, false);
  assert.equal(c.mutates_production, false);
  assert.equal(c.instruction_baseline, "ib_x", "instructions are held constant unless they are what is under test");
});

/* ── D · the eval pack ───────────────────────────────────────────────────── */
test("the eval pack covers the eight categories and reuses existing evidence", () => {
  assert.equal(T.EVAL_PACK.length, 8);
  for (const e of T.EVAL_PACK) {
    assert.ok(e.proves, `${e.id} must say what it proves`);
    assert.ok(e.existing_evidence, `${e.id} must point at evidence that already exists`);
  }
  const ids = T.EVAL_PACK.map((e) => e.id);
  assert.equal(new Set(ids).size, 8, "stable unique ids");
});

/* ── E · measurement, and what it refuses to invent ─────────────────────── */
test("token and cost metrics are declared unavailable rather than omitted", () => {
  for (const id of ["tokens", "cost"]) {
    const m = T.CANARY_METRICS.find((x) => x.id === id);
    assert.equal(m.available, false, `${id} must be marked unavailable`);
    assert.ok(m.why, `${id} must say why`);
  }
});

test("an unavailable metric is skipped and never treated as a missing requirement", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 100, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1 };
  const r = T.compareCanary({ baseline: base, candidate: { ...base } });
  assert.equal(r.verdict, "SAME");
  assert.deepEqual(r.missing, []);
});

test("a missing required metric makes the comparison UNMEASURED, which blocks", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 100, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1 };
  const r = T.compareCanary({ baseline: base, candidate: { ...base, tests_passed: undefined } });
  assert.equal(r.verdict, "UNMEASURED");
  assert.equal(r.promote, false);
  assert.ok(r.missing.includes("tests_passed"));
});

test("speed cannot buy correctness: a faster candidate that violates an instruction is WORSE", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 10_000, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1 };
  const cand = { ...base, duration_ms: 1_000, instruction_violations: 1 };
  const r = T.compareCanary({ baseline: base, candidate: cand });
  assert.equal(r.verdict, "WORSE");
  assert.equal(r.promote, false);
  assert.ok(r.regressions.includes("instruction_violations"));
  assert.match(r.reason, /faster candidate that is less correct/);
});

test("an invariant violation is a regression however much else improved", () => {
  const base = { completed: 1, corrections: 5, duration_ms: 10_000, tests_passed: 8, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 2, evidence_complete: 1 };
  const cand = { ...base, corrections: 0, duration_ms: 500, human_interventions: 0, invariant_violations: 1 };
  assert.equal(T.compareCanary({ baseline: base, candidate: cand }).verdict, "WORSE");
});

test("a genuine improvement reads as BETTER", () => {
  const base = { completed: 1, corrections: 3, duration_ms: 10_000, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 1, evidence_complete: 1 };
  const cand = { ...base, corrections: 1, duration_ms: 6_000, human_interventions: 0 };
  const r = T.compareCanary({ baseline: base, candidate: cand });
  assert.equal(r.verdict, "BETTER");
  assert.equal(r.promote, true);
});

/* ── G · more subagents is not success ───────────────────────────────────── */
test("spawning more subagents does not make a candidate better", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 5_000, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1, subagents: 1 };
  const cand = { ...base, subagents: 9 };
  const r = T.compareCanary({ baseline: base, candidate: cand });
  assert.equal(r.verdict, "SAME", "fan-out alone must not read as an improvement");
  const row = r.rows.find((x) => x.metric === "subagents");
  assert.equal(row.direction, "neutral");
  assert.equal(T.subagentCanaryPlan({}).success_is_not, "more subagents");
});

/* ── F · effort canary against real capability ──────────────────────────── */
test("the effort canary compares the four work classes at supported levels only", () => {
  const plan = T.effortCanaryPlan({});
  assert.equal(plan.valid, true);
  assert.equal(plan.arms.length, 4);
  assert.deepEqual(plan.levels, ["low", "medium", "high", "xhigh", "max"]);
});

test("an effort level this build does not support invalidates the plan", () => {
  const plan = T.effortCanaryPlan({ levels: ["medium", "extreme"] });
  assert.equal(plan.valid, false);
  assert.deepEqual(plan.unsupported, ["extreme"]);
});

/* ── H · the known-good snapshot ─────────────────────────────────────────── */
test("a snapshot records exact identities and no secrets", () => {
  const s = good();
  assert.equal(s.toolkit, "14b0e01dcd06");
  assert.equal(s.claude_code, "2.1.269");
  assert.equal(T.snapshotIsClean(s).clean, true);
});

test("a snapshot carrying a secret-shaped field is rejected, not quietly sanitised", () => {
  const bad = { ...good(), tools: { api_token: "sk-live-xyz" } };
  const r = T.snapshotIsClean(bad);
  assert.equal(r.clean, false);
  assert.ok(r.offenders.some((o) => o.includes("api_token")));
  // References are the sanctioned way to name a secret.
  assert.equal(T.snapshotIsClean(T.knownGoodSnapshot({ secretRefs: ["gateway_api_token"] })).clean, true);
});

test("a snapshot that cannot describe the component is not a rollback target", () => {
  const partial = T.knownGoodSnapshot({ toolkit: "abc" });
  assert.equal(T.snapshotSufficientFor(partial, "vacilando_toolkit").sufficient, true);
  const r = T.snapshotSufficientFor(partial, "claude_code");
  assert.equal(r.sufficient, false);
  assert.deepEqual(r.missing, ["claude_code"]);
});

/* ── J · post-activation certification ───────────────────────────────────── */
test("activation certifies only when every required proof passes", () => {
  const c = T.certifyActivation({ proofs: allProofs(true) });
  assert.equal(c.healthy, true);
  assert.equal(c.requires_rollback, false);
});

test("an unmeasured proof blocks exactly as a failed one does", () => {
  const proofs = allProofs(true); delete proofs.critical_invariants;
  const c = T.certifyActivation({ proofs });
  assert.equal(c.healthy, false);
  assert.equal(c.requires_rollback, true);
  assert.deepEqual(c.unmeasured, ["critical_invariants"]);
  assert.match(c.reason, /unproven/);
});

test("a failed proof is reported apart from an unmeasured one", () => {
  const proofs = allProofs(true); proofs.host_health = false;
  const c = T.certifyActivation({ proofs });
  assert.deepEqual(c.failed, ["host_health"]);
  assert.deepEqual(c.unmeasured, []);
});

/* ── K · automatic rollback ──────────────────────────────────────────────── */
test("a failed certification triggers rollback to the recorded known good", () => {
  const cert = T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } });
  const r = T.rollbackDecision({ certification: cert, component: "vacilando_toolkit", snapshot: good() });
  assert.equal(r.rollback, true);
  assert.equal(r.state, T.ACTIVATION_STATE.ROLLBACK_IN_PROGRESS);
  assert.equal(r.mechanism, T.ROLLBACK.POINTER_SWAP);
  assert.equal(r.restart_owner, "control-plane-recovery.restartGatewayForConvergence");
  assert.equal(r.attempt, 1);
});

test("a healthy certification rolls back nothing", () => {
  const r = T.rollbackDecision({ certification: T.certifyActivation({ proofs: allProofs(true) }), component: "vacilando_toolkit", snapshot: good() });
  assert.equal(r.rollback, false);
  assert.equal(r.state, T.ACTIVATION_STATE.ACTIVE_CERTIFIED);
});

test("no snapshot means no rollback target, and the host constrains", () => {
  const cert = T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } });
  const r = T.rollbackDecision({ certification: cert, component: "claude_code", snapshot: null });
  assert.equal(r.rollback, false);
  assert.equal(r.state, T.ACTIVATION_STATE.CONSTRAINED);
  assert.equal(r.operator_attention, true);
});

test("an incomplete snapshot is refused as a rollback target", () => {
  const cert = T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } });
  const r = T.rollbackDecision({ certification: cert, component: "claude_code", snapshot: T.knownGoodSnapshot({ toolkit: "abc" }) });
  assert.equal(r.rollback, false);
  assert.match(r.reason, /does not record claude_code/);
});

test("rollback never oscillates: after the attempt ceiling the host stays constrained", () => {
  const cert = T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } });
  const r = T.rollbackDecision({ certification: cert, component: "vacilando_toolkit", snapshot: good(), attempts: T.MAX_ROLLBACK_ATTEMPTS });
  assert.equal(r.rollback, false);
  assert.equal(r.state, T.ACTIVATION_STATE.CONSTRAINED);
  assert.equal(r.operator_attention, true);
  assert.match(r.reason, /rather than oscillating/);
});

test("a component with no rollback mechanism can never reach automatic rollback", () => {
  const cert = T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } });
  const r = T.rollbackDecision({ certification: cert, component: "macos", snapshot: good() });
  assert.equal(r.rollback, false);
  assert.equal(r.state, T.ACTIVATION_STATE.CONSTRAINED);
  assert.match(r.reason, /MANUAL_DEFERRED/);
});

test("the rollback target must itself certify before admission returns", () => {
  const ok = T.completeRollback({ certification: T.certifyActivation({ proofs: allProofs(true) }) });
  assert.equal(ok.state, T.ACTIVATION_STATE.ROLLED_BACK);
  assert.equal(ok.admission, "restored");

  const bad = T.completeRollback({ certification: T.certifyActivation({ proofs: { ...allProofs(true), host_health: false } }) });
  assert.equal(bad.state, T.ACTIVATION_STATE.CONSTRAINED);
  assert.equal(bad.admission, "constrained");
  assert.equal(bad.operator_attention, true);
  assert.match(bad.reason, /rollback target itself did not certify/);
});

/* ── L · half-applied activation ─────────────────────────────────────────── */
test("every half-applied activation state has a named recovery", () => {
  assert.equal(T.recoverInterruptedActivation(T.ACTIVATION_STATE.CANDIDATE_STAGED).action, "discard_candidate");
  const r = T.recoverInterruptedActivation(T.ACTIVATION_STATE.ACTIVATED_NOT_RESTARTED);
  assert.equal(r.action, "restart_through_canonical_owner");
  assert.match(r.reason, /version probes and behaviour disagree/);
  assert.equal(T.recoverInterruptedActivation(T.ACTIVATION_STATE.ACTIVE_UNCERTIFIED, { snapshot: good() }).action, "certify_or_rollback");
  assert.equal(T.recoverInterruptedActivation(T.ACTIVATION_STATE.ROLLBACK_IN_PROGRESS, { snapshot: good() }).action, "resume_rollback");
});

test("an interrupted state with no snapshot constrains rather than guessing", () => {
  assert.equal(T.recoverInterruptedActivation(T.ACTIVATION_STATE.ACTIVE_UNCERTIFIED, { snapshot: null }).action, "constrain");
  assert.equal(T.recoverInterruptedActivation(T.ACTIVATION_STATE.ROLLBACK_IN_PROGRESS, { snapshot: null }).action, "constrain");
});

test("an unrecognised activation state is not a safe state", () => {
  const r = T.recoverInterruptedActivation("SOMETHING_NEW");
  assert.equal(r.safe, false);
  assert.equal(r.action, "constrain");
});

/* ── M · maintenance carries out a decision it did not make ─────────────── */
test("maintenance applies AUTO_SAFE, reports MANUAL_DEFERRED, and needs a canary otherwise", () => {
  assert.equal(T.maintenanceUpdateDecision({ component: "stripe_cli" }).apply, true);
  const deferred = T.maintenanceUpdateDecision({ component: "macos" });
  assert.equal(deferred.apply, false);
  assert.equal(deferred.report_only, true);
});

test("a CANARY_REQUIRED update without a certified canary is not applied", () => {
  const r = T.maintenanceUpdateDecision({ component: "claude_code", candidateIdentity: "2.2.0", certifiedCanaries: [] });
  assert.equal(r.apply, false);
  assert.equal(r.report_only, true);
});

test("a canary for a DIFFERENT version proves nothing about this one", () => {
  const r = T.maintenanceUpdateDecision({
    component: "claude_code", candidateIdentity: "2.2.0",
    certifiedCanaries: [{ component: "claude_code", candidate_identity: "2.1.900", certified: true, canary_id: "c1" }],
  });
  assert.equal(r.apply, false);
  assert.match(r.reason, /proves nothing about this one/);
});

test("a certified canary for this exact candidate permits activation", () => {
  const r = T.maintenanceUpdateDecision({
    component: "claude_code", candidateIdentity: "2.2.0",
    certifiedCanaries: [{ component: "claude_code", candidate_identity: "2.2.0", certified: true, canary_id: "c9" }],
  });
  assert.equal(r.apply, true);
  assert.equal(r.canary, "c9");
});

test("maintenance never judges tool quality itself", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  const code = readFileSync(join(LIB, "host-maintenance.mjs"), "utf8");
  assert.ok(!code.includes("compareCanary"), "maintenance must not evaluate a canary");
  assert.equal(M.classifyUpdate("claude_code").class, M.UPDATE_CLASS.CANARY_REQUIRED);
});

/* ── the bounded record ──────────────────────────────────────────────────── */
test("a canary record is bounded and carries no raw output", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 100, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1 };
  const cmp = T.compareCanary({ baseline: base, candidate: { ...base, corrections: 0 } });
  const rec = T.canaryRecord({ component: "claude_code", baseline: "2.1.269", candidate: "2.2.0", comparison: cmp, certified: true, canaryId: "c1" });
  assert.equal(rec.certified, true);
  assert.ok(JSON.stringify(rec).length < 2048, "a canary record is evidence, not a log");
  assert.ok(!/stdout|stderr/.test(JSON.stringify(rec)));
});

test("an UNMEASURED or WORSE comparison can never be recorded as certified", () => {
  const base = { completed: 1, corrections: 0, duration_ms: 100, tests_passed: 10, invariant_violations: 0, instruction_violations: 0, refusal_correct: 1, human_interventions: 0, evidence_complete: 1 };
  const unmeasured = T.compareCanary({ baseline: base, candidate: {} });
  assert.equal(T.canaryRecord({ component: "x", comparison: unmeasured, certified: true }).certified, false);
  const worse = T.compareCanary({ baseline: base, candidate: { ...base, instruction_violations: 2 } });
  assert.equal(T.canaryRecord({ component: "x", comparison: worse, certified: true }).certified, false);
});

/* ── N.3 · the push guard, wired as the git hook it actually is ─────────── */
test("the pre-push delegator contains no rule of its own", () => {
  const hook = readFileSync(join(HOOKS, "git", "pre-push"), "utf8");
  assert.ok(hook.includes("guard-push.sh"), "it must delegate");
  // No second guard: the delegator must not decide anything.
  for (const rule of ["archive", "MAX_NEW_BRANCHES", "recovery", "fan-out"]) {
    assert.ok(!new RegExp(`^[^#]*${rule}`, "m").test(hook), `the delegator must not reimplement ${rule}`);
  }
});

test("the wired hook blocks an archive push, allows an ordinary one, and fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-"));
  mkdirSync(join(dir, "hooks", "git"), { recursive: true });
  copyFileSync(join(HOOKS, "guard-push.sh"), join(dir, "hooks", "guard-push.sh"));
  copyFileSync(join(HOOKS, "git", "pre-push"), join(dir, "hooks", "git", "pre-push"));
  chmodSync(join(dir, "hooks", "guard-push.sh"), 0o755);
  chmodSync(join(dir, "hooks", "git", "pre-push"), 0o755);
  const hook = join(dir, "hooks", "git", "pre-push");

  const run = (refline) => {
    try {
      execFileSync(hook, ["origin", "https://github.com/ksquared-16/alloy.git"], { input: refline, stdio: ["pipe", "pipe", "pipe"] });
      return 0;
    } catch (e) { return e.status ?? 1; }
  };
  const z = "0".repeat(40); const one = "1".repeat(40);
  assert.equal(run(`refs/heads/x ${one} refs/heads/archive/recovery-1 ${z}\n`), 1, "archive namespace must be blocked");
  assert.equal(run(`refs/heads/x ${one} refs/heads/agent/normal ${z}\n`), 0, "an ordinary single-branch push must be allowed");

  rmSync(join(dir, "hooks", "guard-push.sh"));
  assert.equal(run(`refs/heads/x ${one} refs/heads/agent/normal ${z}\n`), 1, "a missing guard must fail closed, never silently allow");
  rmSync(dir, { recursive: true, force: true });
});

test("the installer points git at the repo hooks rather than copying them", () => {
  const inst = readFileSync(join(HERE, "..", "alloy-install-git-hooks"), "utf8");
  assert.ok(inst.includes("core.hooksPath"), "one setting, not a copy");
  assert.ok(inst.includes("--uninstall"), "and it is reversible");
  assert.ok(!/\bcp\b/.test(inst.replace(/^#.*$/gm, "")), "it must not copy hook files into .git/hooks");
});

/* ── the DevOps 7 seam, now carrying a real decider ──────────────────────── */
test("maintenance with no canary authority wired applies no CANARY_REQUIRED update", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  const seam = M.canarySeam();
  assert.equal(seam.implemented_here, false);
  assert.equal(seam.implemented_by, null);
  const d = seam.decide({ component: "claude_code", candidateIdentity: "2.2.0" });
  assert.equal(d.apply, false, "an unwired seam must refuse, not default to applying");
});

test("the DevOps 9 decider plugs into the DevOps 7 seam without maintenance judging quality", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  const seam = M.canarySeam({ decide: T.maintenanceUpdateDecision });
  assert.equal(seam.implemented_by, "toolchain-canary.maintenanceUpdateDecision");

  // Uncertified candidate: refused, and maintenance formed no opinion of its own.
  const refused = seam.decide({ component: "claude_code", candidateIdentity: "2.2.0", certifiedCanaries: [] });
  assert.equal(refused.apply, false);
  assert.equal(refused.class, M.UPDATE_CLASS.CANARY_REQUIRED);

  // Certified for this exact candidate: permitted.
  const allowed = seam.decide({
    component: "claude_code", candidateIdentity: "2.2.0",
    certifiedCanaries: [{ component: "claude_code", candidate_identity: "2.2.0", certified: true, canary_id: "c1" }],
  });
  assert.equal(allowed.apply, true);
});

test("a canary decision never gates the reboot itself", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  // An update being refused is not a reason to refuse maintenance: the window
  // reports it and reboots anyway.
  const decision = M.rebootDecision({
    preflight: { pass: true },
    drain: { safe: true, blockers: [], warnings: [], protected_mutations: 0 },
    checkpoint: { durable: true },
  });
  assert.equal(decision.may_reboot, true);
});

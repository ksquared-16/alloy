/**
 * Maintenance Activation Readiness V1.
 *
 * DevOps 7 built the gates. This proves there is now something behind them, and
 * that nothing behind them can be satisfied by absence.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as A from "../lib/vacilando/maintenance-activation.mjs";
import { CHECKPOINT_REQUIREMENTS, PHASE, evaluateCheckpoint, rebootDecision } from "../lib/vacilando/host-maintenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const healthyObs = () => ({
  lanes: [{ lane_id: "l1", active: true, restart_context: { next_action: "continue" } }],
  runs: [{ run_id: "r1", state: "COMPLETE" }],
  governedActions: [],
  worktrees: [{ name: "w1", durability: "merged" }],
});
const okWindow = () => ({ maintenance_id: "m1", phase: PHASE.READY_TO_REBOOT });
const okRequest = (over = {}) => ({ maintenance_id: "m1", issued_at: new Date().toISOString(), ...over });
const okCap = () => A.rebootCapability({ sudoersPresent: true, nopasswdVerified: true });
const okDrain = () => ({ safe: true, blockers: [], warnings: [], protected_mutations: 0 });

/* ── 1 · every requirement has a collector ──────────────────────────────── */
test("all five checkpoint requirements have canonical collectors", () => {
  const cov = A.collectorCoverage();
  assert.equal(cov.complete, true, `missing ${cov.missing.join(", ")} / orphan ${cov.orphan.join(", ")}`);
  assert.equal(cov.requirements, 5);
  for (const c of A.CHECKPOINT_COLLECTORS) {
    assert.ok(c.owner && !c.owner.includes("maintenance-activation"), `${c.id} must delegate to an existing owner`);
    assert.ok(c.observation, `${c.id} must say what observation it needs`);
  }
});

/* ── 2 · UNMEASURED blocks ──────────────────────────────────────────────── */
test("a collector with no observation is UNMEASURED, and UNMEASURED blocks", () => {
  const c = A.collectCheckpoint({});
  assert.equal(c.complete, false);
  assert.equal(c.unmeasured.length, 5);
  const gate = evaluateCheckpoint({ measurements: c.measurements });
  assert.equal(gate.durable, false);
  assert.equal(gate.unmeasured.length, 5, "an unmeasured collector contributes nothing, so the gate still sees absence");
});

test("a MISSING collector cannot accidentally satisfy the gate", () => {
  // The specific accident this mission had to make impossible: dropping a
  // collector must not look like a passing requirement.
  const partial = A.CHECKPOINT_COLLECTORS.filter((c) => c.id !== "worktree_durability_known");
  const c = A.collectCheckpoint(healthyObs(), { collectors: partial });
  assert.ok(c.unmeasured.includes("worktree_durability_known"));
  assert.equal(evaluateCheckpoint({ measurements: c.measurements }).durable, false);
  const cov = A.collectorCoverage({ collectors: partial });
  assert.equal(cov.complete, false);
  assert.deepEqual(cov.missing, ["worktree_durability_known"]);
});

test("a collector that throws is UNMEASURED, never an optimistic pass", () => {
  const boom = A.CHECKPOINT_COLLECTORS.map((c) => (c.id === "run_handoff_filed"
    ? { ...c, collect() { throw new Error("owner unreachable"); } } : c));
  const c = A.collectCheckpoint(healthyObs(), { collectors: boom });
  assert.ok(c.unmeasured.includes("run_handoff_filed"));
  assert.equal(evaluateCheckpoint({ measurements: c.measurements }).durable, false);
});

test("a collector returning nonsense is UNMEASURED", () => {
  const weird = A.CHECKPOINT_COLLECTORS.map((c) => (c.id === "lane_blockers_recorded"
    ? { ...c, collect: () => ({ outcome: "PROBABLY_FINE" }) } : c));
  const c = A.collectCheckpoint(healthyObs(), { collectors: weird });
  assert.ok(c.unmeasured.includes("lane_blockers_recorded"));
});

/* ── 3/4 · FAIL blocks, PASS allows ─────────────────────────────────────── */
test("a failing collector blocks the reboot decision", () => {
  const obs = healthyObs();
  obs.lanes = [{ lane_id: "l1", active: true, restart_context: {} }];
  const c = A.collectCheckpoint(obs);
  assert.deepEqual(c.failed, ["lane_next_action_recorded"]);
  const gate = evaluateCheckpoint({ measurements: c.measurements });
  assert.equal(gate.durable, false);
  assert.equal(rebootDecision({ preflight: { pass: true }, drain: okDrain(), checkpoint: gate }).may_reboot, false);
});

test("all collectors passing lets the reboot decision proceed", () => {
  const c = A.collectCheckpoint(healthyObs());
  assert.equal(c.complete, true, JSON.stringify(c.rows));
  const gate = evaluateCheckpoint({ measurements: c.measurements });
  assert.equal(gate.durable, true);
  assert.equal(rebootDecision({ preflight: { pass: true }, drain: okDrain(), checkpoint: gate }).may_reboot, true);
});

test("each collector detects its own defect", () => {
  const cases = [
    ["lane_next_action_recorded", { lanes: [{ lane_id: "l", active: true, restart_context: {} }] }],
    ["lane_blockers_recorded", { lanes: [{ lane_id: "l", active: true, blocked_on: "operator" }] }],
    ["accepted_executions_durable", { governedActions: [{ request_id: "g", status: "accepted" }] }],
    ["worktree_durability_known", { worktrees: [{ name: "w", durability: "unique_local_commits" }] }],
    ["run_handoff_filed", { runs: [{ run_id: "r", state: "EXECUTING" }] }],
  ];
  for (const [id, patch] of cases) {
    const c = A.collectCheckpoint({ ...healthyObs(), ...patch });
    assert.ok(c.failed.includes(id) || c.unmeasured.includes(id), `${id} must catch its own defect`);
  }
});

test("unmeasured worktree durability is UNMEASURED, not FAIL", () => {
  // DevOps 3's distinction: "nobody looked" and "it is unsafe" are different,
  // and both block.
  const c = A.collectCheckpoint({ ...healthyObs(), worktrees: [{ name: "w", durability: null }] });
  assert.ok(c.unmeasured.includes("worktree_durability_known"));
  assert.ok(!c.failed.includes("worktree_durability_known"));
});

/* ── 5/6 · the reboot gate ──────────────────────────────────────────────── */
test("a protected mutation appearing after the checkpoint blocks the reboot", () => {
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 1, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /began after the reboot decision/);
});

test("drain is re-measured immediately before execution, not inherited", () => {
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: null, protectedMutationsNow: 0, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /not re-measured immediately before execution/);
});

test("unchecked protected mutations refuse rather than assume zero", () => {
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: null, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /not re-checked/);
});

test("a stale reboot proof refuses", () => {
  const old = okRequest({ issued_at: new Date(Date.now() - 30 * 60000).toISOString() });
  const r = A.authorizeReboot({
    request: old, window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 0, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /expired/);
});

test("a replayed reboot proof refuses", () => {
  const r = A.authorizeReboot({
    request: okRequest({ consumed: true }), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 0, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /replayed/);
});

/* ── 7 · no generic reboot authority ────────────────────────────────────── */
test("an arbitrary lane cannot invoke a reboot", () => {
  // A request that does not name the open maintenance window is refused before
  // any other gate is consulted.
  const r = A.authorizeReboot({
    request: { maintenance_id: "some_other_lane_request", issued_at: new Date().toISOString() },
    window: okWindow(), checkpoint: { durable: true }, drainNow: okDrain(),
    protectedMutationsNow: 0, capability: okCap(),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /the open window is m1/);
});

test("a request with no maintenance id is refused outright", () => {
  assert.equal(A.authorizeReboot({ request: {}, window: okWindow() }).authorized, false);
  assert.equal(A.authorizeReboot({ request: null, window: okWindow() }).authorized, false);
});

test("a window not in READY_TO_REBOOT cannot reboot", () => {
  for (const phase of [PHASE.NORMAL, PHASE.DRAINING, PHASE.DEFERRED, PHASE.CONSTRAINED]) {
    const r = A.authorizeReboot({
      request: okRequest(), window: { maintenance_id: "m1", phase },
      checkpoint: { durable: true }, drainNow: okDrain(), protectedMutationsNow: 0, capability: okCap(),
    });
    assert.equal(r.authorized, false, `${phase} must not reboot`);
  }
});

/* ── 8 · no credential material ─────────────────────────────────────────── */
test("no plaintext admin credential exists anywhere in the privilege model", () => {
  const code = readFileSync(join(LIB, "maintenance-activation.mjs"), "utf8");
  /*
   * Asserted against CREDENTIAL STORAGE, not against the word. A first cut
   * banned "password" and failed on the module's own sentence explaining that it
   * grants no password-free sudo generally — a control that forbids the file
   * from describing the guarantee it provides.
   */
  for (const bad of [/password\s*[:=]/i, /askpass/i, /SUDO_ASKPASS/, /\bexpect\s+spawn/i, /-S\s+<<</]) {
    assert.ok(!bad.test(code), `the privilege model must not carry credential material (${bad})`);
  }
  // And the grant is exactly one command with fixed arguments.
  assert.equal(A.SUDOERS_CONTRACT.rule.includes("NOPASSWD: /sbin/shutdown -r now"), true);
  assert.ok(!/\*/.test(A.SUDOERS_CONTRACT.rule), "no wildcard in the sudoers rule");
  assert.ok(A.SUDOERS_CONTRACT.does_not_grant.includes("a shell"));
});

test("an uninstalled or unmeasured capability refuses the reboot", () => {
  assert.equal(A.rebootCapability({}).available, false);
  assert.equal(A.rebootCapability({}).measured, false);
  assert.equal(A.rebootCapability({ sudoersPresent: false, nopasswdVerified: false }).available, false);
  assert.equal(A.rebootCapability({ sudoersPresent: true, nopasswdVerified: false }).available, false);
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 0, capability: A.rebootCapability({}),
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /capability is unavailable/);
});

test("everything in place authorizes exactly one named command", () => {
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 0, capability: okCap(),
  });
  assert.equal(r.authorized, true, r.reason);
  assert.equal(r.command, "/sbin/shutdown -r now");
  assert.equal(r.maintenance_id, "m1");
});

/* ── 9 · one period, one reboot ─────────────────────────────────────────── */
test("a maintenance period initiates at most one reboot", () => {
  const r = A.authorizeReboot({
    request: okRequest(), window: okWindow(), checkpoint: { durable: true },
    drainNow: okDrain(), protectedMutationsNow: 0, capability: okCap(),
    alreadyRebootedThisPeriod: true,
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /at most one/);
});

/* ── 10/11/12 · the interpreter ─────────────────────────────────────────── */
test("the floating front path is recognised as unsafe, and the formula link as safe", () => {
  assert.equal(A.classifyInterpreterPath("/opt/homebrew/bin/node").class, A.INTERPRETER.FLOATING);
  assert.equal(A.classifyInterpreterPath("/opt/homebrew/bin/node").safe, false);
  const pinned = A.classifyInterpreterPath("/opt/homebrew/opt/node@22/bin/node");
  assert.equal(pinned.class, A.INTERPRETER.MAJOR_PINNED);
  assert.equal(pinned.safe, true);
});

test("the exact Cellar path is rejected for the reason that matters", () => {
  const exact = A.classifyInterpreterPath("/opt/homebrew/Cellar/node@22/22.23.2_1/bin/node");
  assert.equal(exact.class, A.INTERPRETER.EXACT);
  assert.equal(exact.safe, false, "brew cleanup removes it, turning a version change into a Gateway that cannot start");
  assert.match(exact.why, /cleanup/);
});

test("post-boot certification compares the RUNNING version, and a mismatch constrains", () => {
  const ok = A.certifyInterpreter({ expectedVersion: "v22.23.2", actualVersion: "v22.23.2", plistPath: "/opt/homebrew/opt/node@22/bin/node" });
  assert.equal(ok.certified, true);
  assert.equal(ok.constrained, false);

  const drift = A.certifyInterpreter({ expectedVersion: "v22.23.2", actualVersion: "v24.1.0", plistPath: "/opt/homebrew/bin/node" });
  assert.equal(drift.certified, false);
  assert.equal(drift.outcome, A.OUTCOME.FAIL);
  assert.equal(drift.constrained, true);
  assert.match(drift.reason, /running Node v24\.1\.0/);
});

test("an unmeasured interpreter keeps the host constrained rather than inheriting one", () => {
  const u = A.certifyInterpreter({ expectedVersion: null, actualVersion: "v22.23.2" });
  assert.equal(u.outcome, A.OUTCOME.UNMEASURED);
  assert.equal(u.constrained, true);
  assert.match(u.reason, /rather than inheriting an unknown interpreter/);
});

test("a matching version on an unsafe path still says the path is unsafe", () => {
  const r = A.certifyInterpreter({ expectedVersion: "v22.23.2", actualVersion: "v22.23.2", plistPath: "/opt/homebrew/bin/node" });
  assert.equal(r.certified, true, "the version matches today");
  assert.equal(r.path_safe, false, "and the path can change it tomorrow");
  assert.match(r.reason, /floating/);
});

test("the pinning tool reports, reverts, and does not restart the Gateway", () => {
  const src = readFileSync(join(HERE, "..", "alloy-pin-gateway-interpreter"), "utf8");
  assert.ok(src.includes("--status") && src.includes("--revert"), "reversible and inspectable");
  for (const f of ["launchctl kickstart", "launchctl unload", "launchctl bootout"]) {
    assert.ok(!src.includes(f), `the pinning tool must not ${f}`);
  }
  assert.ok(src.includes("was NOT restarted"), "it must say it did not restart the Gateway");
});

/* ── 13/14 · push guard activation ──────────────────────────────────────── */
test("the push-guard installer sets core.hooksPath, covers every worktree, and reverses", () => {
  const src = readFileSync(join(HERE, "..", "alloy-install-git-hooks"), "utf8");
  assert.ok(src.includes("core.hooksPath"), "one setting, not copies");
  assert.ok(src.includes("--uninstall"), "rollback exists");
  assert.ok(src.includes("--status"), "and it can be inspected without changing anything");
  // Shared .git means one setting covers every worktree.
  assert.match(src, /worktree/i);
});

test("the guard still blocks, allows, and fails closed", () => {
  const hook = join(HERE, "..", "hooks", "git", "pre-push");
  const run = (ref) => {
    try {
      execFileSync(hook, ["origin", "https://github.com/ksquared-16/alloy.git"], { input: ref, stdio: ["pipe", "pipe", "pipe"] });
      return 0;
    } catch (e) { return e.status ?? 1; }
  };
  const z = "0".repeat(40); const one = "1".repeat(40);
  assert.equal(run(`refs/heads/x ${one} refs/heads/archive/recovery-1 ${z}\n`), 1);
  assert.equal(run(`refs/heads/x ${one} refs/heads/agent/normal ${z}\n`), 0);
});

test("the CLAUDE.md push rule stays until enforcement is actually active", () => {
  const md = readFileSync(join(HERE, "..", "..", "..", "CLAUDE.md"), "utf8");
  assert.match(md, /Do not push, merge, rebase/, "the prose rule remains while the hook is uninstalled");
});

/* ── 15 · instruction baseline stamping ─────────────────────────────────── */
test("the baseline stamp is a pointer and a hash, never instruction text", async () => {
  const C = await import("../lib/vacilando/agent-configuration.mjs");
  const stamp = C.laneInstructionBaseline({ laneId: "l1", version: C.instructionBaselineVersion("# CLAUDE.md\nrule\n") });
  assert.match(stamp.baseline_version, /^ib_/);
  assert.equal(stamp.source, "CLAUDE.md");
  const text = JSON.stringify(stamp);
  assert.ok(!/rule/.test(text), "no instruction content may be copied into a lane record");
  assert.ok(text.length < 400);
});

test("a drifted lane is told to revalidate and its decisions are left alone", async () => {
  const C = await import("../lib/vacilando/agent-configuration.mjs");
  const d = C.detectInstructionDrift({
    lanes: [{ lane_id: "l1", instruction_baseline: { baseline_version: "ib_old" } }],
    currentVersion: C.instructionBaselineVersion("new"),
  });
  assert.equal(d.rows[0].requires_revalidation, true);
  assert.match(d.rows[0].durable_knowledge_action, /none/);
});

/* ── 16 · the stale port range ──────────────────────────────────────────── */
test("the toolkit instructions no longer restate a port ceiling as an authority", () => {
  const md = readFileSync(join(HERE, "..", "AGENT-INSTRUCTIONS.md"), "utf8");
  assert.ok(!/3011\s*[–-]\s*3016/.test(md), "the stale range must be gone");
  assert.match(md, /slot registry/, "and must point at the owner of that fact");
  assert.match(md, /Do not invent a/i, "while keeping the durable rule");
});

/* ── 17 · effort and subagents stay inactive ────────────────────────────── */
test("effort and subagent routing remain explicitly inactive, and the audit says so", async () => {
  const C = await import("../lib/vacilando/agent-configuration.mjs");
  assert.equal(C.SUBAGENT_POLICY.model_routing_configured, false);
  assert.equal(C.SUBAGENT_POLICY.default_posture, "none");
  const audit = C.auditAgentConfiguration({ effortConfigured: false });
  const finding = audit.findings.find((f) => f.id === "effort_unconfigured");
  assert.ok(finding, "the audit must report honestly that no effort level is configured");
  assert.equal(finding.severity, "watch", "reported, not activated, and not a failure");
});

/* ── 18 · first-cycle canary law ────────────────────────────────────────── */
test("the first cycle is attended and a failure disables unattended recurrence", () => {
  assert.equal(A.FIRST_CYCLE.attended, true);
  assert.equal(A.unattendedEligibility({ cycles: [] }).eligible, false);

  const failed = A.unattendedEligibility({ cycles: [{ maintenance_id: "m1", certified: false }] });
  assert.equal(failed.eligible, false);
  assert.equal(failed.disabled, true);
  assert.match(failed.reason, /stay disabled until a corrected cycle/);

  const one = A.unattendedEligibility({ cycles: [{ maintenance_id: "m1", certified: true }] });
  assert.equal(one.eligible, false, "one certified cycle is not yet enough");

  const two = A.unattendedEligibility({ cycles: [{ certified: true }, { certified: true }] });
  assert.equal(two.eligible, true);
});

/* ── 19 · planned reboot is not a failover ──────────────────────────────── */
test("a planned maintenance reboot does not open a takeover question", () => {
  for (const phase of [PHASE.READY_TO_REBOOT, PHASE.REBOOTING, PHASE.RECOVERING, PHASE.VERIFYING]) {
    const c = A.absenceClassification({ window: { maintenance_id: "m1", phase }, heartbeatMissing: true });
    assert.equal(c.class, "PLANNED_MAINTENANCE", phase);
    assert.equal(c.takeover_question, false);
    assert.equal(c.retain_leadership, true, "the primary keeps its epoch across a reboot it announced");
  }
});

test("an absence with no maintenance window remains DevOps 10's question", () => {
  const c = A.absenceClassification({ window: null, heartbeatMissing: true });
  assert.equal(c.class, "UNEXPECTED_ABSENCE");
  assert.equal(c.takeover_question, true);
  assert.equal(c.retain_leadership, false);
});

test("a NORMAL window does not excuse an absence", () => {
  const c = A.absenceClassification({ window: { maintenance_id: "m1", phase: PHASE.NORMAL }, heartbeatMissing: true });
  assert.equal(c.class, "UNEXPECTED_ABSENCE", "a window that is not rebooting explains nothing");
});

/* ── 20 · no second system ──────────────────────────────────────────────── */
test("no second maintenance, reboot or config system is introduced", () => {
  const code = codeOf("maintenance-activation.mjs");
  for (const f of ["child_process", "spawnSync", "execFileSync", "writeFileSync", "setInterval", "setTimeout"]) {
    assert.ok(!code.includes(f), `the activation module must not use ${f}`);
  }
  // It authorises; it never executes. Asserted on INVOCATION, not on the word
  // "execution", which this module has every reason to use.
  for (const call of [/\bexec\w*\(/, /\bspawn\w*\(/, /child_process/]) {
    assert.ok(!call.test(code), `it must not execute the reboot it authorises (${call})`);
  }
  const exported = Object.keys(A);
  assert.ok(!exported.some((k) => /^(write|save|install|execute|perform)/.test(k)), `no executor exports: ${exported.join(", ")}`);
});

test("the activation sequence orders dependencies, not conveniences", () => {
  const ids = A.ACTIVATION_SEQUENCE.map((s) => s.id);
  const idx = (id) => ids.indexOf(id);
  assert.ok(idx("interpreter_pinned") < idx("reboot_capability_installed"),
    "the interpreter must be pinned before a reboot is possible, because a reboot is when it changes");
  assert.ok(idx("checkpoint_collectors_measurable") < idx("schedule_enabled"));
  assert.ok(idx("reboot_capability_installed") < idx("first_cycle_attended"));
  assert.equal(ids[ids.length - 1], "post_boot_certified");
  for (const s of A.ACTIVATION_SEQUENCE) assert.ok(s.gate && s.owner, `step ${s.step} needs a gate and an owner`);
});

test("activation readiness reports the first blocking step, not just a boolean", () => {
  const r = A.activationReadiness({ steps: { toolkit_installed: true } });
  assert.equal(r.ready, false);
  assert.equal(r.next_step, "checkpoint_collectors_measurable");
  assert.match(r.reason, /blocked at step 2/);
  const all = Object.fromEntries(A.ACTIVATION_SEQUENCE.map((s) => [s.id, true]));
  assert.equal(A.activationReadiness({ steps: all }).ready, true);
});

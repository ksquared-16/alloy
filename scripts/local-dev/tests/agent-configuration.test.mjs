/**
 * DevOps 8 — Agent Configuration Hygiene V1.
 *
 * The audit is read-only by construction, so most of these prove that it
 * measures rather than assumes — and that it keeps emphatic rules that are
 * correct instead of shortening everything it can reach.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as C from "../lib/vacilando/agent-configuration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1 · one canonical baseline ──────────────────────────────────────────── */
test("two lanes reading the same instruction resolve the same baseline version", () => {
  const content = "# CLAUDE.md\nsome policy\n";
  const a = C.instructionBaselineVersion(content);
  const b = C.instructionBaselineVersion(content);
  assert.equal(a, b);
  assert.match(a, /^ib_/);
  assert.notEqual(a, C.instructionBaselineVersion(`${content}one more line\n`));
});

test("the baseline version is derived from content, never hand-maintained", () => {
  const code = codeOf("agent-configuration.mjs");
  // A constant somebody must remember to bump is a version that silently stops
  // moving. Assert there is no such constant.
  assert.ok(!/BASELINE_VERSION\s*=\s*["'`]/.test(code), "no hard-coded baseline version");
  assert.equal(C.instructionBaselineVersion(null), null, "absent content has no version, rather than a default one");
});

test("two lanes on the same content are CURRENT; one on older content DRIFTED", () => {
  const current = C.instructionBaselineVersion("v2");
  const drift = C.detectInstructionDrift({
    lanes: [
      { lane_id: "a", instruction_baseline: { baseline_version: current } },
      { lane_id: "b", instruction_baseline: { baseline_version: C.instructionBaselineVersion("v1") } },
      { lane_id: "c" },
    ],
    currentVersion: current,
  });
  assert.equal(drift.by_state.CURRENT, 1);
  assert.equal(drift.by_state.DRIFTED, 1);
  assert.equal(drift.by_state.UNRECORDED, 1);
  assert.equal(drift.drifted, 1);
});

test("drift requires revalidation and explicitly does not rewrite durable knowledge", () => {
  const current = C.instructionBaselineVersion("new");
  const d = C.detectInstructionDrift({
    lanes: [{ lane_id: "a", instruction_baseline: { baseline_version: "ib_old" } }],
    currentVersion: current,
  });
  const row = d.rows[0];
  assert.equal(row.requires_revalidation, true);
  assert.match(row.durable_knowledge_action, /none/);
  // The module records and reads; it has no writer at all.
  const code = codeOf("agent-configuration.mjs");
  for (const w of ["writeFileSync", "mkdirSync", "execFileSync", "spawnSync"]) {
    assert.ok(!code.includes(w), `the audit module must not ${w}`);
  }
});

test("an unmeasured current baseline is UNKNOWN, never assumed current", () => {
  const d = C.detectInstructionDrift({ lanes: [{ lane_id: "a", instruction_baseline: { baseline_version: "ib_x" } }], currentVersion: null });
  assert.equal(d.rows[0].state, "UNKNOWN");
});

/* ── 2/3 · overlays and precedence ───────────────────────────────────────── */
test("the mission overlay is the lowest-precedence injected layer, scoped to one run", () => {
  const overlay = C.layerById("vacilando_run_instruction");
  assert.equal(overlay.kind, "mission_overlay");
  assert.equal(overlay.scope, "one execution run");
  const baseline = C.layerById("repository_claude_md");
  assert.ok(overlay.precedence > baseline.precedence, "a mission overlay cannot outrank the durable baseline");
});

test("precedence is deterministic and unique", () => {
  const nums = C.INSTRUCTION_LAYERS.map((l) => l.precedence).filter((n) => n != null);
  assert.equal(new Set(nums).size, nums.length, "no two layers share a precedence, so ties are impossible");
  const r1 = C.resolvePrecedence([{ layer_id: "vacilando_run_instruction", value: "x" }, { layer_id: "repository_claude_md", value: "y" }]);
  const r2 = C.resolvePrecedence([{ layer_id: "repository_claude_md", value: "y" }, { layer_id: "vacilando_run_instruction", value: "x" }]);
  assert.equal(r1.winner.layer_id, r2.winner.layer_id, "input order does not change the answer");
  assert.equal(r1.winner.layer_id, "repository_claude_md");
});

test("a layer that is not injected can never win a fact", () => {
  const r = C.resolvePrecedence([{ layer_id: "toolkit_agent_docs", value: "3011-3016" }]);
  assert.equal(r.winner, null);
  assert.match(r.reason, /no injected layer/);
});

/* ── 4 · conflict versus duplication ─────────────────────────────────────── */
test("two layers agreeing is duplication; two disagreeing is a conflict", () => {
  const dup = C.resolvePrecedence([
    { layer_id: "repository_claude_md", value: "same" },
    { layer_id: "vacilando_run_instruction", value: "same" },
  ]);
  assert.deepEqual(dup.duplicated, ["vacilando_run_instruction"]);
  assert.deepEqual(dup.conflicting, []);

  const conflict = C.resolvePrecedence([
    { layer_id: "repository_claude_md", value: "A" },
    { layer_id: "vacilando_run_instruction", value: "B" },
  ]);
  assert.deepEqual(conflict.conflicting, ["vacilando_run_instruction"]);
  assert.deepEqual(conflict.duplicated, []);
});

/* ── 5/11 · code enforces, prompt explains — and the wiring check ────────── */
test("a guard that exists but is wired nowhere does NOT count as enforcement", () => {
  const s = C.enforcementStatus({ guardFile: "hooks/guard-push.sh", wiredIn: [] });
  assert.equal(s.enforced, false);
  assert.equal(s.finding, "unwired_guard");
  assert.match(s.reason, /registered nowhere/);
});

test("a wired guard counts, and is what lets a prompt stop restating the rule", () => {
  const s = C.enforcementStatus({ guardFile: "hooks/guard-supabase-start.sh", wiredIn: [".claude/settings.json PreToolUse"] });
  assert.equal(s.enforced, true);
  assert.deepEqual(s.wired_in, [".claude/settings.json PreToolUse"]);
});

test("an emphatic rule backed by a wired guard is KEPT, not shortened", () => {
  // The audit separates "what class is this" from "should it stay", because the
  // two most valuable outcomes are "emphatic AND correct" and "calm and wrong".
  const f = C.instructionFinding({
    id: "supabase_start", source: "CLAUDE.md", klass: C.INSTRUCTION_CLASS.DURABLE_POLICY,
    keep: true, enforced_by: ".claude/settings.json PreToolUse", why: "real safety rule",
  });
  assert.equal(f.keep, true);
  assert.equal(f.class, C.INSTRUCTION_CLASS.DURABLE_POLICY);
  const audit = C.auditAgentConfiguration({ instructionFindings: [f], effortConfigured: true });
  assert.equal(audit.counts.problems, 0, "a correct, enforced rule generates no finding to act on");
});

test("an unenforced rule is a PROBLEM that keeps the prompt text", () => {
  const f = C.instructionFinding({
    id: "push_guard_unwired", source: "hooks/guard-push.sh", klass: C.INSTRUCTION_CLASS.DURABLE_POLICY,
    keep: true, severity: "problem", why: "the guard is registered nowhere",
  });
  assert.equal(f.keep, true, "an unwired guard makes the prompt rule MORE necessary, not less");
  const audit = C.auditAgentConfiguration({ instructionFindings: [f], effortConfigured: true });
  assert.equal(audit.counts.problems, 1);
  assert.equal(audit.findings[0].kind, "unenforced_rule");
});

/* ── 6 · unsupported settings ────────────────────────────────────────────── */
test("an unsupported setting is reported, never silently accepted", () => {
  const audit = C.auditAgentConfiguration({ unsupportedSettings: ["--effort"], effortConfigured: true });
  assert.equal(audit.counts.problems, 1);
  assert.equal(audit.findings[0].kind, "unsupported_setting");
  assert.equal(audit.severity, "problem");
});

test("the supported effort levels are the ones this build actually accepts", () => {
  // Read from `claude --help` on 2.1.269 before being written down.
  assert.deepEqual([...C.SUPPORTED_EFFORT], ["low", "medium", "high", "xhigh", "max"]);
  const bad = C.resolveEffort("routine", { model: "m", byModel: { m: { routine: "extreme" } } });
  assert.equal(bad.supported, false);
  assert.equal(bad.effort, null, "an unsupported level resolves to nothing rather than to a guess");
  assert.match(bad.reason, /not supported by this build/);
});

/* ── 9 · effort policy ───────────────────────────────────────────────────── */
test("effort resolves by work class, not one level for everything", () => {
  assert.equal(C.resolveEffort(C.WORK_CLASS.MECHANICAL).effort, "low");
  assert.equal(C.resolveEffort(C.WORK_CLASS.ROUTINE).effort, "medium");
  assert.equal(C.resolveEffort(C.WORK_CLASS.GOVERNANCE).effort, "high");
  assert.equal(C.resolveEffort(C.WORK_CLASS.CERTIFICATION).effort, "high");
  const levels = new Set(Object.values(C.EFFORT_POLICY));
  assert.ok(levels.size > 1, "a policy with one level for everything is not a policy");
});

test("effort is configurable per model, and an unknown class is medium not cheapest", () => {
  const r = C.resolveEffort("routine", { model: "fast-model", byModel: { "fast-model": { routine: "low" } } });
  assert.equal(r.effort, "low");
  assert.equal(r.source, "model_override");
  const unknown = C.resolveEffort("something_new");
  assert.equal(unknown.effort, "medium", "guessing low on unrecognised work is worse than paying for medium");
});

test("the policy sets nothing; it only resolves", () => {
  const code = codeOf("agent-configuration.mjs");
  assert.ok(!/process\.env\.[A-Z_]+\s*=/.test(code), "the module must not set environment variables");
  assert.ok(!code.includes("--effort"), "the module must not invoke a flag; a caller passes it");
});

/* ── 10 · subagent policy ────────────────────────────────────────────────── */
test("the default subagent posture is none, so silence means do it yourself", () => {
  assert.equal(C.SUBAGENT_POLICY.default_posture, "none");
  assert.equal(C.subagentDecision("unrecognised_task").delegate, false);
});

test("synthesis and judgement are never delegated", () => {
  for (const kind of ["synthesis", "design_decision", "governance_judgement", "final_certification"]) {
    const d = C.subagentDecision(kind);
    assert.equal(d.delegate, false, `${kind} must not be delegated`);
    assert.match(d.reason, /must own and be able to defend/);
  }
});

test("bounded reads are delegable, up to a ceiling", () => {
  assert.equal(C.subagentDecision("targeted_search").delegate, true);
  assert.equal(C.subagentDecision("isolated_proof").delegate, true);
  const atCeiling = C.subagentDecision("targeted_search", { concurrent: C.SUBAGENT_POLICY.max_concurrent });
  assert.equal(atCeiling.delegate, false);
  assert.match(atCeiling.reason, /ceiling/);
});

test("the policy records that routing is supported but not configured", () => {
  // Measured: ~/.claude/agents does not exist and the project defines no agents.
  assert.equal(C.SUBAGENT_POLICY.model_routing_supported, true);
  assert.equal(C.SUBAGENT_POLICY.model_routing_configured, false);
});

/* ── 7/8 · baseline carried on the lane record ───────────────────────────── */
test("the lane baseline is a pointer and a version, never a copy of the instruction", () => {
  const b = C.laneInstructionBaseline({
    laneId: "lane_a", version: "ib_x", overlay: { mission_id: "m1", run_id: "r1" },
  });
  assert.equal(b.baseline_version, "ib_x");
  assert.equal(b.source, "CLAUDE.md");
  assert.equal(b.overlay.mission_id, "m1");
  const text = JSON.stringify(b);
  assert.ok(text.length < 400, "a lane record must not carry the instruction content");
});

/* ── 12/13 · the audit is read-only and gates nothing ────────────────────── */
test("the configuration audit is read-only by construction", () => {
  const code = codeOf("agent-configuration.mjs");
  for (const w of ["readFileSync", "writeFileSync", "existsSync", "child_process"]) {
    assert.ok(!code.includes(w), `the audit module must not ${w}; everything is passed in`);
  }
});

test("the audit declares in its payload that it does not gate maintenance", () => {
  const audit = C.auditAgentConfiguration({ instructionFindings: [], effortConfigured: true });
  assert.equal(audit.gates_maintenance, false);
  assert.equal(audit.clean, true);
  assert.equal(audit.severity, "healthy");
});

test("maintenance does not fail because hygiene reports WATCH", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  const watch = C.auditAgentConfiguration({
    instructionFindings: [C.instructionFinding({ id: "d", source: "x", klass: C.INSTRUCTION_CLASS.REDUNDANT, why: "dup" })],
    effortConfigured: true,
  });
  assert.equal(watch.severity, "watch");

  // DevOps 7's seam takes the result and still refuses to gate on it.
  const seam = M.configurationAuditSeam({ audit: watch });
  assert.equal(seam.gates_admission, false);
  assert.equal(seam.runs_in_phase, M.PHASE.VERIFYING);
  assert.match(seam.reported_as, /1 configuration finding/);

  // And the reboot gate never consults it: a clean drain and checkpoint reboot
  // regardless of what the configuration audit found.
  const decision = M.rebootDecision({
    preflight: { pass: true },
    drain: { safe: true, blockers: [], warnings: [], protected_mutations: 0 },
    checkpoint: { durable: true },
  });
  assert.equal(decision.may_reboot, true, "prompt hygiene must never block a reboot");
});

test("even a PROBLEM-severity audit does not block maintenance", async () => {
  const M = await import("../lib/vacilando/host-maintenance.mjs");
  const bad = C.auditAgentConfiguration({ unsupportedSettings: ["--nope"], effortConfigured: true });
  assert.equal(bad.severity, "problem");
  assert.equal(bad.gates_maintenance, false);
  assert.equal(M.configurationAuditSeam({ audit: bad }).gates_admission, false);
});

/* ── 14 · no second prompt system ────────────────────────────────────────── */
test("no second prompt or instruction registry is introduced", () => {
  const code = codeOf("agent-configuration.mjs");
  // It stores no prompt text and generates no instruction.
  for (const w of ["generateClaudeMd", "renderPrompt", "PROMPT_TEMPLATE", "promptStore", "instructionStore"]) {
    assert.ok(!code.includes(w), `must not define ${w}`);
  }
  // Every layer it knows about names an owner that is not this module.
  for (const l of C.INSTRUCTION_LAYERS) {
    assert.ok(l.owner && !l.owner.includes("agent-configuration"), `${l.id} must have an external owner`);
  }
  // And it has no export that writes a baseline anywhere.
  const exported = Object.keys(C);
  assert.ok(!exported.some((k) => /^(write|save|record|set|generate)/.test(k)), `no writer exports: ${exported.join(", ")}`);
});

/* ── J/M · the honest baseline ───────────────────────────────────────────── */
test("the behaviour baseline marks what cannot be measured as unavailable", () => {
  const b = C.behaviourBaseline({ instructionBytes: 4100, runs: [], claudeVersion: "2.1.269" });
  const cost = b.metrics.find((m) => m.id === "token_cost");
  assert.equal(cost.available, false);
  assert.equal(cost.value, null, "a cost that cannot be read must be null, not a number");
  const model = b.metrics.find((m) => m.id === "model_used_per_run");
  assert.equal(model.available, false);
  const bytes = b.metrics.find((m) => m.id === "instruction_bytes");
  assert.equal(bytes.available, true);
  assert.equal(bytes.value, 4100);
});

test("median run duration is computed only from runs that actually have both ends", () => {
  const b = C.behaviourBaseline({
    runs: [
      { created_at: "2026-09-12T00:00:00Z", ended_at: "2026-09-12T00:10:00Z" },
      { created_at: "2026-09-12T00:00:00Z" },
      { created_at: "2026-09-12T00:00:00Z", ended_at: "2026-09-12T00:20:00Z" },
    ],
  });
  const med = b.metrics.find((m) => m.id === "median_run_ms");
  assert.equal(med.available, true);
  assert.equal(med.value, 20 * 60000, "the run with no end is excluded rather than counted as zero");
});

test("the DevOps 9 seam says what it cannot provide", () => {
  const audit = C.auditAgentConfiguration({ baselineVersion: "ib_x", claudeVersion: "2.1.269", effortConfigured: true });
  const seam = C.canaryInputs({ audit, baseline: C.behaviourBaseline({}) });
  assert.equal(seam.owner, "DevOps 9");
  assert.equal(seam.implemented_here, false);
  assert.equal(seam.provides.instruction_baseline_version, "ib_x");
  assert.ok(seam.not_available.some((s) => /cost/.test(s)));
  assert.ok(seam.not_available.some((s) => /model/.test(s)));
});

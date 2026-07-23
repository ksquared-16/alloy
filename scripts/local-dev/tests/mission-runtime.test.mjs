/**
 * Mission Runtime — deterministic unit tests (node:test, no external deps).
 * Run: node --test scripts/local-dev/tests/mission-runtime.test.mjs
 * Uses a scratch ALLOY_RUNTIME_ROOT so it never touches live state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-test-"));

const { validatePackage, createPackage, getPackage } = await import("../lib/vacilando/commands/mission-packages.mjs");
const { retrieveCapability } = await import("../lib/vacilando/capability.mjs");
const { retrieveForCapability } = await import("../lib/vacilando/knowledge.mjs");
const { createMission, getMission, recoverMissions, updateMission } = await import("../lib/vacilando/commands/missions.mjs");
const { compile } = await import("../lib/vacilando/mission-compiler.mjs");
const { checkStartPreconditions, serializePackagePrompt, parseOutcome } = await import("../lib/vacilando/mission-executor.mjs");

test("readiness is computed: a complete package is ready", () => {
  const cap = retrieveCapability("Build Access & Roles V2");
  assert.equal(cap.ok, true);
  const snap = retrieveForCapability(cap.capability);
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: pkg } = compile({ capability: cap.capability, snapshot: snap, mission: m });
  assert.equal(pkg.readiness_status, "ready");
  assert.equal(pkg.package_origin, "compiled");
  assert.ok(pkg.knowledge_snapshot?.snapshot_id, "snapshot bound for reproducibility");
  assert.ok(pkg.compiler_trace?.sources_used.length >= 1, "compiler trace records sources");
});

test("an incomplete package is BLOCKED and start is refused", () => {
  const v = validatePackage({ objective: "x", scope_included: ["a"], scope_excluded: [], acceptance_criteria: [], QA_plan: [], expected_deliverables: [], governance_constraints: {} });
  assert.equal(v.readiness_status, "blocked");
  const codes = v.readiness_findings.filter((f) => f.severity === "block").map((f) => f.code);
  assert.ok(codes.includes("exclusions_missing") && codes.includes("acceptance_criteria_missing") && codes.includes("governance_missing"));
  const pre = checkStartPreconditions({ readiness_status: "blocked", objective: "x", scope_included: ["a"], scope_excluded: [], acceptance_criteria: [], QA_plan: [], governance_constraints: {} });
  assert.equal(pre.ok, false);
});

test("a blocking question moves a package to awaiting_operator (not ready)", () => {
  const base = { objective: "o", scope_included: ["a"], scope_excluded: ["b"], acceptance_criteria: [{ id: "AC1" }], QA_plan: [{ id: "Q1" }], expected_deliverables: [{ id: "D1" }], governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true }, unresolved_questions: [{ id: "q1", blocking: true }] };
  assert.equal(validatePackage(base).readiness_status, "awaiting_operator");
});

test("serialized prompt is structured (never a raw objective) and carries the turn protocol", () => {
  const cap = retrieveCapability("access & roles");
  const snap = retrieveForCapability(cap.capability);
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: pkg } = compile({ capability: cap.capability, snapshot: snap, mission: m });
  const prompt = serializePackagePrompt(pkg);
  assert.match(prompt, /## OBJECTIVE/);
  assert.match(prompt, /EXCLUDED — HARD/);
  assert.match(prompt, /ACCEPTANCE CRITERIA/);
  assert.match(prompt, /GOVERNANCE/);
  assert.match(prompt, /<<VACILANDO status=completed>>/);
});

test("outcome parsing classifies control tokens and extracts the report", () => {
  const completed = parseOutcome("did work\n```vacilando-report\n{\"provider_completion_claim\":true}\n```\n<<VACILANDO status=completed>>");
  assert.equal(completed.token, "completed");
  assert.equal(completed.report.provider_completion_claim, true);
  const waiting = parseOutcome("I need a decision on X.\n<<VACILANDO status=waiting_for_operator>>");
  assert.equal(waiting.token, "waiting_for_operator");
  assert.match(waiting.pending_question, /decision on X/);
  const none = parseOutcome("just some text with no token");
  assert.equal(none.token, null);
});

test("restart recovery marks a LIVE mission interrupted + resumable when a session was captured", () => {
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "ready" });
  updateMission(m.mission_id, { status: "running", provider_session_id: "sess-123" });
  const rec = recoverMissions({ providerResumable: () => true });
  const mine = rec.find((r) => r.mission_id === m.mission_id);
  assert.ok(mine, "the running mission was recovered");
  assert.equal(mine.resumable, true);
  assert.equal(getMission(m.mission_id).status, "interrupted");
});

test("package projection round-trips through the durable store", () => {
  const p = createPackage({ mission_id: "m1", title: "t", objective: "o", scope_included: ["a"], scope_excluded: ["b"], acceptance_criteria: [{ id: "AC1" }], QA_plan: [{ id: "Q1" }], expected_deliverables: [{ id: "D1" }], governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true } }, { origin: "manual" });
  const got = getPackage(p.package_id);
  assert.equal(got.package_id, p.package_id);
  assert.equal(got.readiness_status, "ready");
  assert.equal(got.package_origin, "manual");
});

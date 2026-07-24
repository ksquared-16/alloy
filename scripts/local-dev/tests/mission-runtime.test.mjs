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

const { validatePackage, createPackage, getPackage, revisePackage, computeDiff, packageLineage } = await import("../lib/vacilando/commands/mission-packages.mjs");
const { deriveVerdict } = await import("../lib/vacilando/director-review.mjs");
const { retrieveCapability, getCapability, registerCapability, listCapabilities } = await import("../lib/vacilando/capability.mjs");
const { getProductDefinitionForCapability, addAcceptedDecision, recordMissionInHistory, ensureProductDefinitionForCapability, addDecisionForCapability } = await import("../lib/vacilando/product-definition.mjs");
const { capabilityNameFromIntent } = await import("../lib/vacilando/mission-director.mjs");
const { retrieveForCapability, readSnapshot } = await import("../lib/vacilando/knowledge.mjs");
const { createMission, getMission, recoverMissions, updateMission } = await import("../lib/vacilando/commands/missions.mjs");
const { compile } = await import("../lib/vacilando/mission-compiler.mjs");
const { analyzeGap } = await import("../lib/vacilando/gap-analysis.mjs");
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

// --- Product Definition Runtime V1 (Director Intelligence, step 1) ---

test("product truth is OWNED by the Product Definition, hydrated onto the capability", () => {
  const pd = getProductDefinitionForCapability("cap_access_roles");
  assert.ok(pd, "a product definition exists for the capability");
  assert.equal(pd.product_definition_id, "pd_access_roles");
  assert.ok(pd.accepted_decisions.length >= 2 && pd.rejected_patterns.length >= 2, "PD owns decisions + rejected patterns");
  assert.ok(pd.constraints.length >= 1 && pd.goals.length >= 1, "PD owns constraints + goals (long-term memory)");
  // the capability resolves to the PD and hydrates those fields — it does not own them
  const cap = retrieveCapability("Build Access & Roles V2");
  assert.equal(cap.ok, true);
  assert.deepEqual(cap.capability.accepted_decisions.map((d) => d.id), pd.accepted_decisions.map((d) => d.id));
  assert.deepEqual(cap.capability.rejected_patterns.map((p) => p.id), pd.rejected_patterns.map((p) => p.id));
  assert.equal(cap.capability.product_definition?.product_definition_id, "pd_access_roles");
});

test("the learning loop accretes decisions + mission history (idempotent)", () => {
  const first = addAcceptedDecision("pd_access_roles", { id: "ad_learned", statement: "V2 audit records are immutable.", provenance: "mission:msn_test" });
  assert.equal(first.ok, true); assert.equal(first.added, true);
  const again = addAcceptedDecision("pd_access_roles", { id: "ad_learned", statement: "dup", provenance: "mission:msn_test" });
  assert.equal(again.added, false, "same decision id is not duplicated");
  // hydration reflects the newly-learned decision immediately
  const cap = getCapability("cap_access_roles");
  assert.ok(cap.accepted_decisions.some((d) => d.id === "ad_learned"), "learned decision hydrates onto the capability");
  const h = recordMissionInHistory("pd_access_roles", { mission_id: "msn_test", title: "t", outcome: "completed", decisions_added: ["ad_learned"] });
  assert.equal(h.added, true);
  assert.equal(recordMissionInHistory("pd_access_roles", { mission_id: "msn_test" }).added, false, "mission history is idempotent");
});

// --- Capability model v2 + registry (Director Intelligence, step 2) ---

test("the capability is enriched with projected metrics, readiness, and owner", () => {
  const cap = getCapability("cap_access_roles");
  assert.ok(cap.metrics, "metrics are projected");
  assert.equal(typeof cap.metrics.missions_total, "number");
  assert.equal(cap.metrics.open_issues, 1, "open_issues projected from known_issues");
  assert.equal(cap.readiness.level, "ready", "a capability with a product definition + refs is prep-ready");
  assert.ok(Array.isArray(cap.acceptance_history), "acceptance history projected");
  assert.equal(cap.owner.provider_default, "claude");
  assert.ok(cap.dependencies.length >= 1, "dependencies present");
});

test("the registry supports N capabilities (register is idempotent)", () => {
  const r1 = registerCapability({ name: "Programs", description: "Program config." });
  assert.equal(r1.ok, true); assert.equal(r1.created, true);
  assert.equal(r1.capability.capability_id.startsWith("cap_"), true);
  assert.equal(r1.capability.readiness.level, "needs_prep", "a bare capability names what it still needs");
  const r2 = registerCapability({ capability_id: r1.capability.capability_id, name: "Programs" });
  assert.equal(r2.created, false, "same id is not re-created");
  const all = listCapabilities();
  assert.ok(all.find((c) => c.capability_id === "cap_access_roles"), "seed present");
  assert.ok(all.find((c) => c.capability_id === r1.capability.capability_id), "registered capability present");
});

// --- Knowledge Snapshot v2: sectioned context, reproducible (step 3) ---

test("the knowledge snapshot is sectioned context and reproducible", () => {
  const cap = retrieveCapability("Access & Roles").capability;
  const s1 = retrieveForCapability(cap);
  assert.equal(s1.schema_version, "vacilando.knowledge-snapshot.v2");
  assert.ok(s1.items.length >= 1, "referenced files preserved (back-compat items)");
  assert.deepEqual(s1.sections.referenced_files, s1.items, "items == sections.referenced_files");
  assert.ok(s1.sections.accepted_decisions.length >= 2, "decisions section populated from the product definition");
  assert.ok(s1.sections.capability_data.goals.length >= 1, "capability_data carries product-definition goals");
  assert.ok("mission_history" in s1.sections && "acceptance_history" in s1.sections, "history sections present");
  // reproducible: same state → same snapshot_id (pure function of state)
  const s2 = retrieveForCapability(cap);
  assert.equal(s2.snapshot_id, s1.snapshot_id, "snapshot id is deterministic for unchanged state");
});

// --- Gap Analysis Runtime V1: the first reasoning stage (step 4) ---

test("gap analysis suggests criteria from roadmap + known issues, and is reproducible", () => {
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  const snap = retrieveForCapability(cap);
  const r1 = analyzeGap({ intent: "Build Access & Roles V2", capability: cap, snapshot: snap });
  assert.equal(r1.schema_version, "vacilando.gap-report.v1");
  assert.equal(r1.analyzer_version, "gap/v1-deterministic");
  // one suggested criterion per planned roadmap item (rm1..rm3) + the open known issue
  const froms = r1.findings.suggested_acceptance_criteria.map((c) => c.from);
  assert.ok(froms.includes("roadmap:rm1") && froms.includes("known_issue:ki1"), "criteria suggested from roadmap + issues");
  assert.ok(r1.findings.suggested_acceptance_criteria.every((c) => c.feeds_verdict === "Needs Acceptance Criteria"));
  assert.ok(r1.confidence > 0 && r1.confidence <= 1, "confidence is a real coverage ratio");
  // reproducible: same intent + snapshot + reasoner → same report id
  const r2 = analyzeGap({ intent: "Build Access & Roles V2", capability: cap, snapshot: snap });
  assert.equal(r2.gap_report_id, r1.gap_report_id);
});

test("a capability with no product definition yields a blocking Needs Decisions gap", () => {
  const reg = registerCapability({ name: "Billing Gap Test", description: "bare capability, no product definition" });
  const cap = getCapability(reg.capability.capability_id);
  const snap = retrieveForCapability(cap);
  const report = analyzeGap({ intent: "Build Billing V2", capability: cap, snapshot: snap });
  const block = report.findings.missing_information.find((m) => m.id === "m_pd");
  assert.ok(block, "missing product definition is surfaced");
  assert.equal(block.severity, "block");
  assert.equal(block.feeds_verdict, "Needs Product Decisions");
});

// --- Mission Package v2 + Director Review verdict (steps 5–6) ---

test("compile embeds the gap report, risks/questions, and honest reasoning_invocations", () => {
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  const snap = retrieveForCapability(cap);
  const gap = analyzeGap({ intent: "Build Access & Roles V2", capability: cap, snapshot: snap });
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: pkg } = compile({ capability: cap, snapshot: snap, mission: m, gapReport: gap });
  assert.equal(pkg.schema_version, "vacilando.mission-package.v2");
  assert.equal(pkg.gap_report?.gap_report_id, gap.gap_report_id, "gap report embedded");
  assert.ok(pkg.product_definition_snapshot, "product definition snapshot embedded");
  assert.equal(pkg.compiler_trace.reasoning_invocations.length, 1, "reasoning_invocations now honestly populated");
  assert.ok(pkg.questions.length >= 1, "questions populated from gap unknowns");
  assert.equal(pkg.package_lineage_id, pkg.package_id, "v1 lineage id == its own id");
});

test("readiness verdict: mature capability → Ready; missing product definition → Needs Decisions", () => {
  // Ready: no blocking gaps + a ready package.
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  const snap = retrieveForCapability(cap);
  const gap = analyzeGap({ intent: "Build Access & Roles V2", capability: cap, snapshot: snap });
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: pkg } = compile({ capability: cap, snapshot: snap, mission: m, gapReport: gap });
  const ready = deriveVerdict(gap, pkg);
  assert.equal(ready.verdict, "Ready");
  assert.equal(ready.send_back_to, null);
  assert.ok(ready.advisory.length >= 1, "non-blocking gaps surface as advisory, not blockers");
  // Needs Decisions: a bare capability with a blocking missing-PD gap.
  const bareGap = { findings: { missing_information: [{ id: "m_pd", what: "no PD", severity: "block", feeds_verdict: "Needs Product Decisions" }] }, confidence: 0.2 };
  const v = deriveVerdict(bareGap, pkg);
  assert.equal(v.verdict, "Needs Product Decisions");
  assert.equal(v.send_back_to, "product-definition");
  assert.ok(v.reasons.length >= 1);
});

test("package versioning: revise creates v2 with a diff and supersedes v1", () => {
  const base = { mission_id: "m_rev", title: "t", objective: "o", scope_included: ["a"], scope_excluded: ["b"], acceptance_criteria: [{ id: "AC1" }], QA_plan: [{ id: "Q1" }], expected_deliverables: [{ id: "D1" }], governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true }, readiness_verdict: { verdict: "Needs Acceptance" } };
  const v1 = createPackage(base, { origin: "compiled" });
  const v2 = revisePackage(v1.package_id, { ...base, acceptance_criteria: [{ id: "AC1" }, { id: "AC2" }], readiness_verdict: { verdict: "Ready" } });
  assert.equal(v2.version, 2);
  assert.equal(v2.package_lineage_id, v1.package_lineage_id, "same lineage");
  assert.equal(v2.supersedes_package_id, v1.package_id);
  assert.ok(v2.diff_from_previous.added.some((a) => /AC2/.test(a)), "diff records the added criterion");
  assert.equal(v2.diff_from_previous.verdict_change, "Needs Acceptance → Ready");
  assert.equal(getPackage(v1.package_id).readiness_status, "superseded", "v1 superseded");
  assert.equal(packageLineage(v1.package_lineage_id).length, 2, "lineage has both versions");
});

// --- Director Experience V1: define-capability + send-back loop + recompile ---

test("an intent becomes a clean capability name", () => {
  assert.equal(capabilityNameFromIntent("Improve Scheduling"), "Scheduling");
  assert.equal(capabilityNameFromIntent("Communications V2"), "Communications");
  assert.equal(capabilityNameFromIntent("Fix runtime responsiveness"), "Runtime Responsiveness");
  assert.equal(capabilityNameFromIntent("Redesign Financials"), "Financials");
});

test("a newly-defined capability can receive its first decision (send-back resolution)", () => {
  const reg = registerCapability({ name: "Scheduling Exp Test", maturity: "new" });
  const cid = reg.capability.capability_id;
  assert.equal(getProductDefinitionForCapability(cid), null, "no product definition yet");
  const pd = ensureProductDefinitionForCapability(cid, { name: "Scheduling Exp Test" });
  assert.ok(pd.product_definition_id.startsWith("pd_"));
  const add = addDecisionForCapability(cid, { statement: "Scheduling honors operating-day pills.", provenance: "operator" });
  assert.equal(add.ok, true); assert.equal(add.added, true);
  const cap = getCapability(cid);
  assert.ok(cap.accepted_decisions.some((d) => /operating-day/.test(d.statement)), "decision hydrates onto the capability");
});

test("recompile revises the package into a new version with a diff", () => {
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  const snap = retrieveForCapability(cap);
  const gap = analyzeGap({ intent: "Build Access & Roles V2", capability: cap, snapshot: snap });
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: v1 } = compile({ capability: cap, snapshot: snap, mission: m, gapReport: gap });
  const { package: v2 } = compile({ capability: cap, snapshot: snap, mission: m, gapReport: gap, reviseOf: v1.package_id });
  assert.equal(v2.version, 2, "recompile produces v2");
  assert.equal(v2.supersedes_package_id, v1.package_id);
  assert.ok(v2.diff_from_previous, "a diff is attached");
  assert.equal(getPackage(v1.package_id).readiness_status, "superseded");
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

// --- closeout classification regression (found by live certification) ---
const { classifyPath } = await import("../lib/vacilando/closeout.mjs");

test("planning documents are classified even inside a new untracked directory", () => {
  // `git status --porcelain=v1` collapses untracked files into their directory;
  // closeout must run with -uall so each FILE is classified. If a planning doc
  // were classified as "other" it would vanish from would_lose and closeout
  // could report a worktree as safe to delete while unique planning work exists.
  assert.equal(classifyPath("docs/platform/planning/certification/closeout-cert-planning-note.md"), "planning-doc");
  assert.equal(classifyPath("docs/audits/active/some-spec-2026-07.md"), "planning-doc");
  // the collapsed DIRECTORY form must not be mistaken for a planning doc
  assert.notEqual(classifyPath("docs/platform/planning/certification/"), "planning-doc");
  // evidence survives either way (path-based, not extension-based)
  assert.equal(classifyPath(".alloy-agent-evidence/qa/cert-evidence.txt"), "qa-evidence");
});

// --- closeout destructive-command guards (found by live Closeout certification) ---
const { getCommand } = await import("../lib/vacilando/commands/registry.mjs");

test("worktree.delete is internal, typed-confirmed, and frees the slot atomically", () => {
  const d = getCommand("worktree.delete");
  assert.equal(d.execution, "internal"); // removes worktree AND archives slot in one action
  assert.equal(d.confirmation, "required");
  assert.equal(typeof d.typedConfirm, "function");
  assert.equal(d.typedConfirm({ slot: 5 }), "delete 5"); // destructive phrase gate
  // eligibility + run resolve the worktree from the AUTHORITATIVE identity, not
  // the snapshot, so a degraded board can never weaken the guard or target the
  // wrong (or an undefined) path. The guard is exercised live in cert; here we
  // assert the contract shape that makes it safe.
  assert.equal(typeof d.run, "function");
});

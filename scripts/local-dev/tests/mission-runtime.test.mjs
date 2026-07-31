/**
 * Mission Runtime — deterministic unit tests (node:test, no external deps).
 * Run: node --test scripts/local-dev/tests/mission-runtime.test.mjs
 * Uses a scratch ALLOY_RUNTIME_ROOT so it never touches live state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-test-"));
process.env.VACILANDO_SEED_FIXTURES = "1"; // this suite relies on the Access & Roles seed fixture

const { validatePackage, createPackage, getPackage, revisePackage, computeDiff, packageLineage } = await import("../lib/vacilando/commands/mission-packages.mjs");
const { deriveVerdict } = await import("../lib/vacilando/director-review.mjs");
const { retrieveCapability, getCapability, registerCapability, listCapabilities } = await import("../lib/vacilando/capability.mjs");
const { getProductDefinitionForCapability, addAcceptedDecision, recordMissionInHistory, ensureProductDefinitionForCapability, addDecisionForCapability } = await import("../lib/vacilando/product-definition.mjs");
const { capabilityNameFromIntent } = await import("../lib/vacilando/mission-director.mjs");
const { retrieveForCapability, readSnapshot } = await import("../lib/vacilando/knowledge.mjs");
const { createMission, getMission, recoverMissions, updateMission } = await import("../lib/vacilando/commands/missions.mjs");
const { compile, isOperatorDirected } = await import("../lib/vacilando/mission-compiler.mjs");
const { evaluateMission: evalMission } = await import("../lib/vacilando/acceptance.mjs");
const { analyzeGap } = await import("../lib/vacilando/gap-analysis.mjs");
const { checkStartPreconditions, serializePackagePrompt, parseOutcome } = await import("../lib/vacilando/mission-executor.mjs");
const { composeCounsel, selectFrontier, attemptCounsel, readinessCounsel, frontierPhrase } = await import("../lib/vacilando/counsel.mjs");
const { assembleConversation } = await import("../lib/vacilando/conversation.mjs");
const { composeUnderstanding } = await import("../lib/vacilando/shared-understanding.mjs");
const { classifyCommandState, assessCommand, budgetFor, isValidTurnEnd, turnEndViolation, runGoverned, VALID_TURN_ENDS, WORKER_POLICY, COMMAND_CLASSES, classifyPassiveWaitEnding, buildStopDecision, buildSessionStartContext } = await import("../lib/vacilando/command-budget.mjs");
const { composeOperations, stateKeyFor, assembleReview, STATES, conversationStage, understandingQuestions } = await import("../lib/vacilando/operations.mjs");
const { close: directorCloseFn } = await import("../lib/vacilando/mission-director.mjs");
const { composePresence, isLaunching, launchSequence, executionEvent, LAUNCH_STEPS } = await import("../lib/vacilando/presence.mjs");

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

// ============================================================================
// Director Counsel (Product Realization V1, Phase 1) — confidence-qualified
// readiness, attempt-history counsel, frontier surfacing, composition.
// Behavioural contracts over brittle full-string snapshots.
// ============================================================================

// Internal taxonomy that must NEVER reach operator-facing text.
const TAXONOMY_LEAK = /\b(confidence[- ]qualified|attempt[- ]history|frontier|epistemic|leadership move|shared understanding|reliance surface|\bsignal\b|\btier\b)\b/i;
const readyV = (confidence, extra = {}) => ({ verdict: "Ready", confidence, why: null, what_to_do: null, reasons: [], advisory: [], ...extra });
const gapWith = (findings = {}) => ({ findings: { missing_information: [], conflicts: [], unknowns: [], ...findings }, confidence: 0.5 });
const missionOn = (capId, status, id) => ({ mission_id: id, capability_id: capId, status });

// ---- Confidence-qualified readiness ---------------------------------------

test("readiness: high confidence + no open question → strongly supported, no invented caution", () => {
  const r = readinessCounsel({ verdict: readyV(1.0), confidence: 1.0, hasFrontier: false });
  assert.equal(r.tier, "strong");
  assert.match(r.line, /line up well|go ahead/i);
  assert.doesNotMatch(r.line, /thin|judgment call|resting on/i); // no manufactured caution (acceptance #7)
});

test("readiness: low confidence with a positive verdict is NOT clean readiness", () => {
  const weak04 = readinessCounsel({ verdict: readyV(0.4), confidence: 0.4, hasFrontier: false });
  const weak02 = readinessCounsel({ verdict: readyV(0.2), confidence: 0.2, hasFrontier: false });
  assert.equal(weak04.tier, "weak");
  assert.equal(weak02.tier, "weak");
  // weak readiness must not borrow strong language
  assert.doesNotMatch(weak04.line, /line up well|go ahead/i);
  // 0.2 and 0.4 are materially DIFFERENT language, not one canned sentence
  assert.notEqual(weak02.line, weak04.line);
  assert.match(weak02.line, /very little|almost nothing|barely/i);
});

test("readiness: three confidence levels produce three different lines (no flat 'Ready')", () => {
  const strong = readinessCounsel({ verdict: readyV(1.0), confidence: 1.0, hasFrontier: false }).line;
  const thin = readinessCounsel({ verdict: readyV(0.4), confidence: 0.4, hasFrontier: false }).line;
  const veryThin = readinessCounsel({ verdict: readyV(0.2), confidence: 0.2, hasFrontier: false }).line;
  assert.equal(new Set([strong, thin, veryThin]).size, 3);
});

test("readiness: a load-bearing open question qualifies readiness regardless of a high score", () => {
  const r = readinessCounsel({ verdict: readyV(1.0), confidence: 1.0, hasFrontier: true });
  assert.equal(r.tier, "qualified");
});

test("readiness: not-Ready verdict → not honestly ready (honest send-back preserved)", () => {
  const V = { verdict: "Needs Product Decisions", confidence: 0.2, why: "Director doesn't yet have the product decisions this work depends on.", what_to_do: "Record the decisions.", reasons: [] };
  const r = readinessCounsel({ verdict: V, confidence: 0.2, hasFrontier: false });
  assert.equal(r.tier, "not_ready");
  assert.match(r.line, /product decisions/i);
});

test("readiness: money-touching capability gets a firmer thin note", () => {
  const plain = composeCounsel({ mission: { mission_id: "m1" }, capability: { name: "Reporting", description: "reads only" }, package: { readiness_verdict: readyV(0.4), gap_report: gapWith() }, capabilityMissions: [] });
  const money = composeCounsel({ mission: { mission_id: "m2" }, capability: { name: "Financials", description: "reconcile against the ledger" }, package: { readiness_verdict: readyV(0.4), gap_report: gapWith() }, capabilityMissions: [] });
  assert.match(money.closing, /ledger|firmer/i);
  assert.doesNotMatch(plain.closing, /ledger/i);
});

// ---- Attempt-history counsel ----------------------------------------------

test("attempts: zero prior attempts → no counsel (genuinely new work)", () => {
  assert.equal(attemptCounsel([missionOn("capX", "draft", "cur")], "cur", "X"), null);
  assert.equal(attemptCounsel([], "cur", "X"), null);
});

test("attempts: one accepted prior → build-on, recount names the completed work", () => {
  const a = attemptCounsel([missionOn("c", "completed", "p1"), missionOn("c", "draft", "cur")], "cur", "Onboarding");
  assert.equal(a.position, "build_on");
  assert.match(a.recount, /completed/i);
  assert.match(a.rec, /continue|start fresh/i);
});

test("attempts: an in-flight prior wins → continue it rather than start over", () => {
  const a = attemptCounsel([missionOn("c", "completed", "p1"), missionOn("c", "waiting_for_operator", "p2"), missionOn("c", "draft", "cur")], "cur", "Access & Roles");
  assert.equal(a.position, "continue");
  assert.match(a.rec, /still in progress|pick up/i);
});

test("attempts: only failed priors → resume with caution (learn before retrying)", () => {
  const a = attemptCounsel([missionOn("c", "failed", "p1"), missionOn("c", "draft", "cur")], "cur", "X");
  assert.equal(a.position, "resume_caution");
});

test("attempts: the real Access & Roles history is NOT reduced to 'one' — it is interpreted", () => {
  // 9 missions on the capability incl current → 8 priors, mixed outcomes.
  const ms = [
    missionOn("ar", "completed", "a1"), missionOn("ar", "waiting_for_operator", "a2"),
    missionOn("ar", "failed", "a3"), missionOn("ar", "draft", "a4"),
    missionOn("ar", "ready", "a5"), missionOn("ar", "draft", "a6"),
    missionOn("ar", "draft", "a7"), missionOn("ar", "ready", "a8"),
    missionOn("ar", "ready", "cur"),
  ];
  const a = attemptCounsel(ms, "cur", "Access & Roles");
  assert.equal(a.n, 8);
  assert.match(a.recount, /eight earlier attempts/i);
  assert.match(a.recount, /completed/i); // the accepted one is surfaced
  assert.equal(a.position, "continue"); // the waiting attempt is the continuation point
  // not a chronology dump: a single interpreted sentence
  assert.equal((a.recount.match(/\./g) || []).length, 1);
});

// ---- Frontier surfacing ----------------------------------------------------

test("frontier: no findings → nothing surfaced (silence over invention)", () => {
  assert.deepEqual(selectFrontier(gapWith()), []);
  assert.deepEqual(selectFrontier(null), []);
});

test("frontier: a load-bearing unknown is surfaced with why-it-matters", () => {
  const g = gapWith({ unknowns: [{ id: "u_maturity", question: "Intent asks for v2 but maturity is new — is there a V1?", blocking: false, feeds_verdict: "Needs Clarification" }] });
  const items = selectFrontier(g);
  assert.equal(items.length, 1);
  const p = frontierPhrase(items[0], { capName: "Communications" });
  assert.match(p.need, /extend|first version/i);
  assert.match(p.line, /earlier version|first real version/i);
});

test("frontier: systemic 'no architecture on disk' warn is NOT a frontier (every capability has it)", () => {
  const g = gapWith({ missing_information: [{ id: "m_arch", what: "No architecture reference resolves on disk for this capability.", severity: "warn" }] });
  assert.deepEqual(selectFrontier(g), []);
});

test("frontier: low-risk known-issue scope questions are accepted imperfections, not a frontier", () => {
  const g = gapWith({ unknowns: [{ id: "u_ki_ki1", question: "Does the intent's scope include known issue ki1?", blocking: false, feeds_verdict: "Needs Review" }] });
  assert.deepEqual(selectFrontier(g), []);
});

test("frontier: multiple findings are prioritised — a blocking item ranks above a non-blocking unknown", () => {
  const g = gapWith({
    unknowns: [
      { id: "u_soft", question: "soft q", blocking: false },
      { id: "u_hard", question: "hard q", blocking: true },
    ],
    missing_information: [{ id: "m_block", what: "a blocking gap", severity: "block" }],
  });
  const items = selectFrontier(g);
  assert.equal(items[0].kind, "missing"); // blocking missing_information first
  assert.ok(items.findIndex((i) => i.id === "u_hard") < items.findIndex((i) => i.id === "u_soft"));
});

// ---- Composition -----------------------------------------------------------

test("composition: all three behaviours compose into one coherent line (attempt + qualified + frontier)", () => {
  const c = composeCounsel({
    mission: { mission_id: "cur" },
    capability: { name: "Access & Roles" },
    package: { readiness_verdict: readyV(0.9), gap_report: gapWith({ unknowns: [{ id: "u_maturity", question: "v2 but new?", blocking: false }] }) },
    capabilityMissions: [missionOn("ar", "waiting_for_operator", "p1"), missionOn("ar", "ready", "cur")],
  });
  assert.equal(c.tier, "qualified");
  assert.ok(c.reviewedLine); // attempt history present
  assert.match(c.closing, /pick up|in progress/i); // continuation counsel
  assert.match(c.closing, /settling first|earlier version/i); // frontier
  assert.equal(c.frontier.length, 1);
});

test("composition: only one behaviour warranted → just that behaviour (no empty widgets)", () => {
  const c = composeCounsel({
    mission: { mission_id: "cur" },
    capability: { name: "Reporting" },
    package: { readiness_verdict: readyV(0.4), gap_report: gapWith() },
    capabilityMissions: [],
  });
  assert.equal(c.reviewedLine, null); // no attempts
  assert.deepEqual(c.frontier, []);    // no frontier
  assert.match(c.closing, /thin basis|thorough/i); // just readiness
});

test("composition: no verdict yet → silence (closing null, Director still preparing)", () => {
  const c = composeCounsel({ mission: { mission_id: "cur" }, capability: { name: "X" }, package: null, capabilityMissions: [] });
  assert.equal(c.closing, null);
});

test("composition: internal taxonomy never leaks into operator-facing text", () => {
  for (const conf of [0.2, 0.4, 1.0]) {
    for (const findings of [{}, { unknowns: [{ id: "u_maturity", question: "q", blocking: false }] }]) {
      const c = composeCounsel({
        mission: { mission_id: "cur" }, capability: { name: "Communications" },
        package: { readiness_verdict: readyV(conf), gap_report: gapWith(findings) },
        capabilityMissions: [missionOn("c", "completed", "p1"), missionOn("c", "ready", "cur")],
      });
      for (const s of [c.closing, c.reviewedLine, ...(c.needs || [])].filter(Boolean)) {
        assert.doesNotMatch(s, TAXONOMY_LEAK, `taxonomy leaked in: ${s}`);
      }
    }
  }
});

test("composition: Retention control stays honest — send-back only, no trailing frontier clause", () => {
  const V = { verdict: "Needs Product Decisions", confidence: 0.2, why: "Director doesn't yet have the product decisions this work depends on.", what_to_do: "Record the decisions, goals, or constraints that shape this capability.", reasons: ["This capability has no decisions, goals, or constraints recorded yet."] };
  const c = composeCounsel({
    mission: { mission_id: "cur" }, capability: { name: "Retention" },
    package: { readiness_verdict: V, gap_report: gapWith({ missing_information: [{ id: "m_pd_empty", what: "no decisions yet", severity: "block" }] }) },
    capabilityMissions: [],
  });
  assert.equal(c.tier, "not_ready");
  assert.match(c.closing, /product decisions/i);
  assert.doesNotMatch(c.closing, /before we lock|settling first/i); // send-back stands alone
  assert.ok(c.needs.length >= 1); // still asks for what's missing
});

// ---- Wiring: the retrieval-layer fix, through assembleConversation ---------

test("wiring: assembleConversation reads the real mission store, not the static seed count", () => {
  const capId = "cap_wiring_ar";
  const p1 = createMission({ slot: 6, provider: "claude", title: "Access & Roles V2", objective: "o", status: "completed" });
  updateMission(p1.mission_id, { capability_id: capId });
  const p2 = createMission({ slot: 6, provider: "claude", title: "Access & Roles V2", objective: "o", status: "waiting_for_operator" });
  updateMission(p2.mission_id, { capability_id: capId });
  const cur = createMission({ slot: 6, provider: "claude", title: "Access & Roles V2", objective: "o", status: "draft" });
  const pkg = createPackage({
    mission_id: cur.mission_id, capability_id: capId, title: "Access & Roles V2", objective: "o",
    readiness_verdict: readyV(1.0),
    gap_report: gapWith(),
  });
  updateMission(cur.mission_id, { capability_id: capId, package_id: pkg.package_id, intent: "Access & Roles V2" });

  const convo = assembleConversation(cur.mission_id);
  const reviewed = convo.messages.find((x) => x.kind === "reviewed");
  assert.ok(reviewed, "attempt-history line is present");
  assert.match(reviewed.text, /two earlier attempts/i); // real count (2 priors), not "1 past mission"
  const closing = convo.messages.filter((x) => x.from === "director").slice(-1)[0].text;
  assert.match(closing, /line up well|pick up|in progress/i); // strong readiness + continuation counsel
});

// ============================================================================
// Shared Understanding surface (Product Realization V1, Phase 2) — the visible
// reliance surface. Curated, typed by status × authorship, superseded demoted,
// projected from durable state, agreeing with Phase-1 counsel.
// ============================================================================

const decision = (id, statement, extra = {}) => ({ id, statement, rationale: extra.why ?? null, decided_at: "2026-06-01T00:00:00.000Z", provenance: extra.provenance || "operator", supersedes: extra.supersedes || null });
const pdWith = (o = {}) => ({ accepted_decisions: o.decisions || [], constraints: o.constraints || [], patterns: o.patterns || [], rejected_patterns: o.rejected || [], known_tradeoffs: o.tradeoffs || [] });
const capWith = (o = {}) => ({ name: o.name || "Cap", description: o.description || "", known_issues: o.known_issues || [], product_definition: o.pd || pdWith() });
const pkgU = (o = {}) => ({ readiness_verdict: o.verdict || readyV(1.0), gap_report: gapWith(o.findings || {}), suggested_acceptance_criteria: o.suggested || [] });
const U = (o = {}) => composeUnderstanding({ mission: { mission_id: o.mid || "cur", intent: o.intent ?? "Cap V2" }, capability: o.capability || capWith(), package: o.pkg || pkgU(), capabilityMissions: o.missions || [], capName: (o.capability?.name) || "Cap" });

// ---- Claim visibility ------------------------------------------------------

test("SU: an accepted active decision appears, carrying its authorship and why", () => {
  const u = U({ capability: capWith({ pd: pdWith({ decisions: [decision("ad1", "Roles are the unit of grant.", { why: "Auditable." })] }) }) });
  const d = u.relied_upon.find((r) => r.kind === "decision");
  assert.ok(d, "decision is visible");
  assert.equal(d.voice, "You decided");
  assert.equal(d.why, "Auditable.");
});

test("SU: a superseded decision is NOT active — it is demoted to history", () => {
  const pd = pdWith({ decisions: [decision("ad1", "Old direction"), decision("ad2", "New direction", { supersedes: "ad1" })] });
  const u = U({ capability: capWith({ pd }) });
  const activeText = u.relied_upon.map((r) => r.text);
  assert.ok(activeText.includes("New direction"));
  assert.ok(!activeText.includes("Old direction"), "superseded claim must not appear active");
  assert.ok(u.set_aside.some((s) => s.text === "Old direction"), "superseded claim is retained in history");
});

test("SU: a Director recommendation is present, OPTIONAL, and distinct from a decision", () => {
  const u = U({ pkg: pkgU({ suggested: [{ statement: "cover roadmap item" }, { statement: "address ki1" }] }) });
  assert.ok(u.advises, "recommendation is present");
  assert.equal(u.advises.optional, true, "surfaced as optional, not a pending decision");
  assert.equal(u.advises.count, 2);
  assert.doesNotMatch(u.advises.headline, /to confirm|not yet decided/i); // no false 'you must decide' pressure
  // it is NOT in the relied-upon (decided) set
  assert.ok(!u.relied_upon.some((r) => /criteria|criterion|check/i.test(r.text)));
});

test("SU: an assumption/constraint does not present as a fact", () => {
  const u = U({ capability: capWith({ pd: pdWith({ constraints: [{ statement: "Checks evaluate locally.", hard: true }] }) }) });
  const c = u.relied_upon.find((r) => r.kind === "constraint");
  assert.equal(c.voice, "Must"); // a bound, voiced as such — not stated as an established fact
});

test("SU: an unknown remains visible even when execution is permissible (Ready)", () => {
  const u = U({ pkg: pkgU({ verdict: readyV(0.4), findings: { unknowns: [{ id: "u_maturity", question: "v2 but new?", blocking: false }] } }) });
  assert.equal(u.frontier.length, 1);
  assert.equal(u.frontier[0].blocks_execution, false); // open but non-blocking — still shown
});

test("SU: historical volume does not become visual volume (curation cap)", () => {
  const many = Array.from({ length: 12 }, (_, i) => decision(`ad${i}`, `Decision ${i}`));
  const u = U({ capability: capWith({ pd: pdWith({ decisions: many, constraints: [{ statement: "hard one", hard: true }] }) }) });
  assert.ok(u.relied_upon.length <= 6, "surface stays compact regardless of history depth");
});

// ---- Frontier --------------------------------------------------------------

test("SU frontier: a single load-bearing unknown is surfaced with consequence", () => {
  const u = U({ pkg: pkgU({ findings: { unknowns: [{ id: "u_maturity", question: "q", blocking: false }] } }) });
  assert.equal(u.frontier.length, 1);
  assert.ok(u.frontier[0].why, "the frontier explains why it matters");
});

test("SU frontier: among many findings, only the consequential ones are selected", () => {
  const u = U({ pkg: pkgU({ findings: {
    unknowns: [{ id: "u_ki_ki1", question: "known-issue scope?", blocking: false }, { id: "u_maturity", question: "v2?", blocking: false }],
    missing_information: [{ id: "m_arch", what: "no arch on disk", severity: "warn" }],
  } }) });
  // systemic warn + low-risk known-issue demoted; only the real question remains
  assert.equal(u.frontier.length, 1);
  assert.match(u.frontier[0].question, /extend|first version/i);
});

test("SU frontier: a well-supported case shows no invented frontier (stays compact)", () => {
  const u = U({ pkg: pkgU({ verdict: readyV(1.0), findings: {} }) });
  assert.deepEqual(u.frontier, []);
});

test("SU frontier: a contested/conflict claim surfaces for human judgment", () => {
  const u = U({ pkg: pkgU({ findings: { conflicts: [{ id: "x1", detail: "intent overlaps rejected pattern rp1" }] } }) });
  assert.ok(u.frontier.some((f) => /set aside|overlaps|human call/i.test(`${f.question} ${f.why}`)));
});

test("SU frontier: an accepted imperfection is carried, not raised as a blocker", () => {
  const u = U({ capability: capWith({ known_issues: [{ id: "ki1", issue: "no audit trail", status: "open" }] }) });
  assert.ok(u.carrying.some((k) => k.kind === "accepted_imperfection"));
  assert.ok(!u.frontier.some((f) => /audit/i.test(f.question)), "accepted imperfection is not a frontier");
});

// ---- Provenance ------------------------------------------------------------

test("SU provenance: operator vs settled vs advised are voiced differently", () => {
  const u = U({ capability: capWith({ pd: pdWith({ decisions: [decision("a", "op", { provenance: "operator" }), decision("b", "seeded", { provenance: "seed" })] }) }) });
  const voices = u.relied_upon.filter((r) => r.kind === "decision").map((r) => r.voice);
  assert.ok(voices.includes("You decided"));
  assert.ok(voices.includes("Settled"));
});

test("SU provenance: prior-mission evidence yields a continuation basis", () => {
  const u = U({ missions: [missionOn("c", "waiting_for_operator", "p1"), missionOn("c", "ready", "cur")] });
  assert.ok(u.basis, "basis present from real attempts");
  assert.match(u.basis.continuation, /pick up|in progress|continue/i);
});

test("SU provenance: missing rationale is handled honestly (no fabricated why)", () => {
  const u = U({ capability: capWith({ pd: pdWith({ decisions: [decision("a", "no-rationale decision")] }) }) });
  const d = u.relied_upon.find((r) => r.kind === "decision");
  assert.equal(d.why, null); // absent, not invented
});

// ---- Continuity ------------------------------------------------------------

test("SU continuity: the surface is built from durable state, with no transcript input", () => {
  // composeUnderstanding never receives messages — only durable mission/pd/pkg.
  const u = U({ capability: capWith({ pd: pdWith({ decisions: [decision("a", "durable decision")] }) }) });
  assert.ok(u.relied_upon.some((r) => r.text === "durable decision"));
});

test("SU continuity: survives regeneration — same durable inputs give the same surface", () => {
  const cap = capWith({ pd: pdWith({ decisions: [decision("a", "d1")], constraints: [{ statement: "c1", hard: true }] }) });
  const a = U({ capability: cap });
  const b = U({ capability: cap });
  assert.deepEqual(a, b); // pure projection, replayable across sessions/restarts
});

// ---- Composition (agreement with Phase 1) ----------------------------------

test("SU composition: the visible frontier matches the Phase-1 counsel frontier (one source of truth)", () => {
  const args = { mission: { mission_id: "cur", intent: "Communications V2" }, capability: capWith({ name: "Communications" }),
    package: pkgU({ verdict: readyV(0.4), findings: { unknowns: [{ id: "u_maturity", question: "v2?", blocking: false }] } }), capabilityMissions: [], capName: "Communications" };
  const counsel = composeCounsel(args);
  const u = composeUnderstanding(args);
  assert.equal(u.frontier.length, 1);
  assert.equal(counsel.frontier.length, 1);
  assert.equal(u.frontier[0].question, counsel.frontier[0].need); // identical claim, not two reconstructions
});

test("SU composition: Retention stays honestly underdefined", () => {
  const V = { verdict: "Needs Product Decisions", why: "No decisions yet.", what_to_do: "Record the decisions that shape this.", reasons: [] };
  const u = U({ capability: capWith({ name: "Retention", pd: pdWith({}) }), pkg: { readiness_verdict: V, gap_report: gapWith() } });
  assert.equal(u.nothing_settled, true);
  assert.equal(u.relied_upon.length, 0);
  assert.ok(u.frontier.some((f) => f.blocks_execution)); // the missing decisions remain the open, blocking item
});

test("SU composition: Access & Roles shows history as one continuation, never a chronology dump", () => {
  const ms = Array.from({ length: 9 }, (_, i) => missionOn("ar", i === 0 ? "completed" : i === 1 ? "waiting_for_operator" : "draft", i === 8 ? "cur" : `a${i}`));
  const u = U({ capability: capWith({ name: "Access & Roles" }), missions: ms });
  assert.ok(u.basis);
  // continuation is a single sentence — not nine mission records
  assert.equal((u.basis.continuation.match(/\./g) || []).length, 1);
});

test("SU composition: no internal taxonomy leaks into the surface text", () => {
  const u = U({ capability: capWith({ name: "Communications" }), pkg: pkgU({ verdict: readyV(0.4), findings: { unknowns: [{ id: "u_maturity", question: "q", blocking: false }] }, suggested: [{ statement: "x" }] }) });
  const strings = [u.intent, ...u.relied_upon.flatMap((r) => [r.text, r.why]), ...u.frontier.flatMap((f) => [f.question, f.why]), ...u.carrying.map((c) => c.text), u.basis?.continuation].filter(Boolean);
  for (const s of strings) assert.doesNotMatch(s, TAXONOMY_LEAK, `taxonomy leaked in: ${s}`);
});

// ============================================================================
// Engineering Operations (Product Realization V1, Phase 3) — work-centric
// operational states, meaningful progress, interruption rules, verification,
// review assembly, acceptance, and closure. Behavioural over provider activity.
// ============================================================================

const mReady = (o = {}) => ({ mission_id: "cur", status: o.status || "ready", ...o });
const pReady = { readiness_verdict: { verdict: "Ready" }, readiness_status: "ready", acceptance_criteria: [] };
const OPS = (mission, pkg = pReady, acceptance = []) => composeOperations({ mission, package: pkg, acceptance });

// ---- Operational states are honest and distinct ----------------------------

test("ops states: each raw status maps to the right engineering state", () => {
  assert.equal(stateKeyFor({ status: "draft" }, {}), "preparing");
  assert.equal(stateKeyFor({ status: "ready" }, pReady), "ready");
  assert.equal(stateKeyFor({ status: "running" }, pReady), "executing");
  assert.equal(stateKeyFor({ status: "waiting_for_operator" }, pReady), "needs_operator");
  assert.equal(stateKeyFor({ status: "blocked" }, pReady), "blocked");
  assert.equal(stateKeyFor({ status: "waiting_for_acceptance" }, pReady), "verifying");
  assert.equal(stateKeyFor({ status: "waiting_for_acceptance", acceptance_gate: "pass" }, pReady), "review");
  assert.equal(stateKeyFor({ status: "completed" }, pReady), "accepted");
  assert.equal(stateKeyFor({ status: "closed" }, pReady), "closed");
  assert.equal(stateKeyFor({ status: "failed" }, pReady), "at_risk");
});

test("ops states: complete-vs-accepted and accepted-vs-closed are distinct", () => {
  assert.equal(stateKeyFor({ status: "waiting_for_acceptance", acceptance_gate: "pass" }, pReady), "review"); // system's claim
  assert.equal(stateKeyFor({ status: "completed" }, pReady), "accepted"); // operator's judgment
  assert.equal(stateKeyFor({ status: "closed" }, pReady), "closed"); // wound down
  assert.notEqual("review", "accepted");
});

// ---- Interruption: only needs-operator interrupts --------------------------

test("ops interruption: exactly one state interrupts the operator", () => {
  const interrupting = Object.entries(STATES).filter(([, v]) => v.interrupts).map(([k]) => k);
  assert.deepEqual(interrupting, ["needs_operator"]);
});

test("ops interruption: routine progress never interrupts", () => {
  assert.equal(OPS(mReady({ status: "running" })).state.interrupts, false);
  assert.equal(OPS(mReady({ status: "verifying" ? "waiting_for_acceptance" : "waiting_for_acceptance" })).state.interrupts, false);
  assert.equal(OPS(mReady({ status: "waiting_for_operator", pending_question: "Which scope?" })).state.interrupts, true);
});

test("ops needs-operator: surfaces the reason, and auth is distinguished from a decision", () => {
  const decision = OPS(mReady({ status: "waiting_for_operator", pending_question: "Broaden scope?" }));
  assert.equal(decision.needs_operator.kind, "decision");
  assert.match(decision.needs_operator.prompt, /scope/i);
  const auth = OPS(mReady({ status: "waiting_for_operator", error_code: "auth" }));
  assert.equal(auth.needs_operator.kind, "authentication");
});

// ---- Progress is engineering, not provider activity ------------------------

test("ops progress: 'what changed' is engineering artifacts, phase is engineering not tools", () => {
  const o = OPS(mReady({ status: "running", current_phase: "using Edit", latest_summary: "Adding the audit-trail section", completion_report: { changed_files: ["docs/a.md", "docs/b.md"] } }));
  assert.equal(o.progress.phase, "editing files"); // translated from "using Edit" — not a provider tool name
  assert.match(o.progress.headline, /audit-trail/);
  assert.deepEqual(o.progress.what_changed, ["docs/a.md", "docs/b.md"]);
  assert.doesNotMatch(o.progress.phase, /provider|claude|token|using/i);
});

test("ops progress: the engine stays beneath the work (no provider brand in routine state)", () => {
  const o = OPS(mReady({ status: "running", current_phase: "running" }));
  assert.equal(o.engine_problem, null);
  assert.match(o.engine_note, /engine/i);
  assert.doesNotMatch(o.engine_note, /claude|cursor|provider window is/i);
});

test("ops progress: the engine surfaces ONLY when the engine itself failed", () => {
  const authFail = OPS(mReady({ status: "failed", error_code: "auth", error_message: "authentication required" }));
  assert.ok(authFail.engine_problem);
  const workFail = OPS(mReady({ status: "failed", error_code: "blocked" }));
  assert.equal(workFail.engine_problem, null); // a work failure is not an engine failure
});

// ---- Verification + review assembly ----------------------------------------

test("ops verification: a completion CLAIM is 'verifying', a gated result is 'review'", () => {
  assert.equal(OPS(mReady({ status: "waiting_for_acceptance" })).state.key, "verifying");
  assert.equal(OPS(mReady({ status: "waiting_for_acceptance", acceptance_gate: "pass" })).state.key, "review");
});

test("ops review: assembles what-changed, evidence vs acceptance, risks, recommendation, action", () => {
  const mission = mReady({ status: "waiting_for_acceptance", acceptance_gate: "pass",
    completion_report: { implementation_summary: "Wrote the V2 proposal.", changed_files: ["docs/p.md"], deviations_from_package: [], unresolved_items: ["confirm rollout window"] } });
  const acc = [{ gate: "pass", criteria: [{ statement: "Proposal exists", status: "met", evidence: [{ detail: "p.md exists (2kb)" }] }], missing_evidence: [] }];
  const r = assembleReview(mission, pReady, acc[0]);
  assert.match(r.summary, /V2 proposal/);
  assert.deepEqual(r.what_changed, ["docs/p.md"]);
  assert.equal(r.evidence[0].status, "met");
  assert.ok(r.risks.includes("confirm rollout window"));
  assert.match(r.recommendation, /ready to accept/i);
  assert.equal(r.requested_action, "accept");
});

test("ops review: gate needs_operator asks for judgment, fail asks for another pass", () => {
  const acc = [{ gate: "needs_operator", criteria: [{ statement: "cited as rejected", status: "operator_review", evidence: [] }] }];
  const r1 = assembleReview(mReady({ status: "waiting_for_acceptance", acceptance_gate: "needs_operator" }), pReady, acc[0]);
  assert.equal(r1.requested_action, "review");
  assert.match(r1.recommendation, /judgment/i);
  const r2 = assembleReview(mReady({ status: "waiting_for_acceptance", acceptance_gate: "fail" }), pReady, { gate: "fail", criteria: [], missing_evidence: ["AC1"] });
  assert.equal(r2.requested_action, "send_back");
  assert.match(r2.recommendation, /not yet met|another pass/i);
});

// ---- Actions: the work's next step, never the substrate --------------------

test("ops actions: each state offers the right operator move", () => {
  assert.deepEqual(OPS(mReady({ status: "ready" })).actions, ["start"]);
  assert.deepEqual(OPS(mReady({ status: "running" })).actions, ["stop"]);
  assert.deepEqual(OPS(mReady({ status: "waiting_for_operator" })).actions, ["reply", "stop"]);
  assert.deepEqual(OPS(mReady({ status: "waiting_for_acceptance", acceptance_gate: "pass" }), pReady, [{ gate: "pass", criteria: [] }]).actions, ["accept", "close"]);
  assert.deepEqual(OPS(mReady({ status: "completed" })).actions, ["close"]);
  assert.deepEqual(OPS(mReady({ status: "closed" })).actions, []);
});

test("ops actions: a failing review routes back to reply, not accept", () => {
  const o = OPS(mReady({ status: "waiting_for_acceptance", acceptance_gate: "fail", completion_report: {} }), pReady, [{ gate: "fail", criteria: [], missing_evidence: ["AC1"] }]);
  assert.ok(o.actions.includes("reply"));
  assert.ok(!o.actions.includes("accept"));
});

// ---- Closure: only accepted work closes ------------------------------------

test("ops closure: close is refused unless the work is accepted", () => {
  process.env.__unused = ""; // keep lints quiet
  const notAccepted = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "ready" });
  const r = directorCloseFn({ mission_id: notAccepted.mission_id, confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.error, "not_accepted");
});

test("ops closure: accepted work closes, freeing capacity and preserving artifacts", () => {
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "ready" });
  updateMission(m.mission_id, { status: "completed" });
  const pre = directorCloseFn({ mission_id: m.mission_id }); // no confirm → preview gate
  assert.equal(pre.error, "confirmation_required");
  const r = directorCloseFn({ mission_id: m.mission_id, confirm: true });
  assert.equal(r.ok, true);
  assert.equal(r.status, "closed");
  assert.equal(getMission(m.mission_id).status, "closed");
});

// ============================================================================
// Mission-Intent Integrity — the operator's approved intent is authoritative
// through compilation and verification. Encodes the failed Access & Roles run:
// a substantial discovery scope must NOT execute the seeded "refresh V2 proposal"
// objective, and must not pass acceptance on a generic proposal artifact.
// ============================================================================

const DISCOVERY = "Discover and specify Access & Roles V2: inventory the real authority paths and gaps, define the canonical security model, produce implementation-ready specifications, and sequence a safe delivery plan. Do not build V2 immediately; do not modify application source.";
function directedPkg(intent = DISCOVERY) {
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  const snap = retrieveForCapability(cap);
  const m = createMission({ slot: 6, provider: "claude", title: "t", objective: "o", status: "draft" });
  const { package: pkg } = compile({ capability: cap, snapshot: snap, mission: { ...m, intent } });
  return { cap, snap, m, pkg };
}

test("intent authority: a substantial operator direction is detected as operator-directed", () => {
  const cap = retrieveCapability("Build Access & Roles V2").capability;
  assert.equal(isOperatorDirected({ intent: DISCOVERY }, cap), true);
  assert.equal(isOperatorDirected({ intent: "Access & Roles" }, cap), false);
  assert.equal(isOperatorDirected({ intent: "Access & Roles V2" }, cap), false);
  assert.equal(isOperatorDirected({ intent: "" }, cap), false);
});

test("intent authority: the objective derives from the operator's intent, NOT the generic template", () => {
  const { pkg } = directedPkg();
  assert.equal(pkg.operator_directed, true);
  assert.match(pkg.objective, /inventory the real authority paths/i);          // the operator's words
  assert.doesNotMatch(pkg.objective, /produce the Access & Roles V2 implementation proposal/i); // NOT the template
});

test("intent authority: thin capability-name intent falls back to the template (Phase 1–3 preserved)", () => {
  const { pkg } = directedPkg("Access & Roles");
  assert.equal(pkg.operator_directed, false);
  assert.match(pkg.objective, /produce the Access & Roles V2 implementation proposal/i);
});

test("intent authority: deliverables, exclusions, and acceptance all derive from the approved intent", () => {
  const { pkg } = directedPkg();
  // deliverable is mission-scoped, not the generic proposal path
  assert.match(pkg.expected_deliverables[0].path, /\/qa\/missions\//);
  assert.doesNotMatch(pkg.expected_deliverables[0].path, /v2-proposal\.md$/);
  // the operator's explicit "do not" became out-of-scope
  assert.ok(pkg.scope_excluded.some((s) => /do not build v2/i.test(s)));
  assert.ok(pkg.scope_excluded.some((s) => /do not modify application source/i.test(s)));
  // acceptance is intent-bound; there is NO generic "V2 proposal exists" criterion
  assert.ok(pkg.acceptance_criteria.some((c) => c.type === "intent-fidelity"));
  assert.ok(!pkg.acceptance_criteria.some((c) => /V2 proposal exists/i.test(c.statement)));
});

test("verification integrity: an intent-fidelity criterion is never auto-met (operator must confirm)", () => {
  const { m, pkg } = directedPkg();
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-cwd-"));
  const result = evalMission({ ...m, intent: DISCOVERY, git_baseline: [] }, pkg, { worktreePath: tmp });
  const acf = result.criteria.find((c) => c.criterion_id === "ACF");
  assert.equal(acf.status, "operator_review"); // semantic fidelity is the operator's judgment, never auto-passed
});

test("REGRESSION (failed A&R run): refreshing the generic V2 proposal cannot pass a discovery mission", () => {
  const { m, pkg } = directedPkg();
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-cwd-"));
  // Simulate the failure: the generic proposal file exists, but the mission's own
  // output does not. Acceptance must NOT pass.
  const proposalDir = join(tmp, "docs/platform/planning/vacilando-os/qa/vertical-slice-v1");
  mkdirSync(proposalDir, { recursive: true });
  writeFileSync(join(proposalDir, "access-roles-v2-proposal.md"), "# refreshed generic proposal\n", "utf8");
  const result = evalMission({ ...m, intent: DISCOVERY, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.notEqual(result.gate, "pass");                       // cannot pass on the wrong artifact
  const ac1 = result.criteria.find((c) => c.criterion_id === "AC1");
  assert.equal(ac1.status, "unmet");                          // the mission's own output is absent
});

test("intent authority: the operator's scope is the objective, not a side decision", () => {
  // The failure was that the scope became an accepted_decision while a generic
  // objective stayed authoritative. Here the intent IS the objective.
  const { pkg } = directedPkg();
  assert.ok(pkg.objective.includes("security model")); // the operator's substance is in the objective
});

// ============================================================================
// Understanding stage — the operator sees only the stage they are in. Director's
// open questions are shown (not buried under preparation); the operator answers;
// preparation waits until understanding is sufficient.
// ============================================================================

const pkgQ = (o = {}) => ({
  readiness_verdict: o.verdict || { verdict: "Needs Clarification", why: "open questions", what_to_do: "answer them" },
  readiness_status: o.status || "awaiting_operator",
  gap_report: { findings: { unknowns: o.unknowns || [{ id: "u1", question: "The intent's scope includes ki1?", blocking: false }], conflicts: o.conflicts || [{ id: "c1", detail: "Intent text overlaps rejected pattern rp1: Per-user direct grants" }] } },
});

test("understanding: Director's open questions are surfaced from gap conflicts + unknowns", () => {
  const qs = understandingQuestions({}, pkgQ());
  assert.equal(qs.length, 2);
  const conflict = qs.find((q) => q.id === "c1");
  assert.ok(conflict.blocks);                                   // a conflict is a blocking question
  assert.match(conflict.question, /set aside|did you mean|exclud/i);
  assert.ok(conflict.why && conflict.tests);                    // why it matters + what it tests
  const unknown = qs.find((q) => q.id === "u1");
  assert.equal(unknown.blocks, false);
  assert.doesNotMatch(unknown.question, /the intent's/i);       // de-jargoned
});

test("understanding: answered questions drop off", () => {
  assert.equal(understandingQuestions({ answered_questions: ["c1", "u1"] }, pkgQ()).length, 0);
  assert.equal(understandingQuestions({ answered_questions: ["c1"] }, pkgQ()).length, 1);
});

test("stage: a mission with open questions is Understanding, not Preparing", () => {
  assert.equal(conversationStage({ status: "draft" }, pkgQ()), "understanding");
});

test("stage: preparation waits until Ready with no open questions", () => {
  const ready = { readiness_verdict: { verdict: "Ready" }, readiness_status: "ready", gap_report: { findings: {} } };
  assert.equal(conversationStage({ status: "ready" }, ready), "preparing");
  // Ready but still carrying a question → stay in Understanding
  const readyWithQ = { ...ready, gap_report: { findings: { unknowns: [{ id: "u1", question: "confirm scope?", blocking: false }] } } };
  assert.equal(conversationStage({ status: "ready" }, readyWithQ), "understanding");
  assert.equal(conversationStage({ status: "ready", answered_questions: ["u1"] }, readyWithQ), "preparing"); // answered → prepares
});

test("stage: executing / reviewing / closed map to their stages", () => {
  assert.equal(conversationStage({ status: "running" }, pkgQ()), "executing");
  assert.equal(conversationStage({ status: "waiting_for_acceptance" }, {}), "reviewing");
  assert.equal(conversationStage({ status: "completed" }, {}), "reviewing");
  assert.equal(conversationStage({ status: "closed" }, {}), "closed");
});

test("stage: understanding offers 'answer'; start is withheld until preparing", () => {
  const u = composeOperations({ mission: { mission_id: "m", status: "draft" }, package: pkgQ(), acceptance: [] });
  assert.equal(u.stage, "understanding");
  assert.ok(u.actions.includes("answer"));
  assert.ok(!u.actions.includes("start"));              // cannot start while questions are open
  assert.ok(u.questions.length >= 1);
});

test("understanding: answering clears the verdict's blocking findings → Ready", () => {
  const gap = { findings: { conflicts: [{ id: "c1", detail: "overlaps rejected pattern rp1", feeds_verdict: "Needs Clarification" }] } };
  const pkgReady = { readiness_status: "ready" };
  assert.equal(deriveVerdict(gap, pkgReady).verdict, "Needs Clarification");            // conflict blocks
  assert.equal(deriveVerdict(gap, pkgReady, { answered: ["c1"] }).verdict, "Ready");     // answered → cleared
});

// ============================================================================
// Worker Operating Policy — forward progress + command budgets. A managed worker
// owns forward progress and can never end a turn because a command is "still
// running". Encodes the exact typecheck regression.
// ============================================================================

test("command state: running-but-recent-progress is progressing; no progress past soft is stalled", () => {
  const soft = budgetFor("typecheck").soft_ms;
  // Output appeared just now → progressing.
  assert.equal(classifyCommandState({ startedAt: 0, now: 5 * 60000, lastProgressAt: 5 * 60000 - 1000, soft_ms: soft }), "progressing");
  // Alive but no new output for longer than the soft budget → stalled (a PID is not progress).
  assert.equal(classifyCommandState({ startedAt: 0, now: 5 * 60000, lastProgressAt: 0, soft_ms: soft }), "stalled");
  assert.equal(classifyCommandState({ exited: true, exitCode: 0, startedAt: 0 }), "complete");
  assert.equal(classifyCommandState({ exited: true, exitCode: 1, startedAt: 0 }), "failed");
  assert.equal(classifyCommandState({ blocker: "missing credential", startedAt: 0 }), "blocked");
});

test("command budget: within → continue; soft+progress → parallel; soft+stall → diagnose; hard → corrective", () => {
  const b = budgetFor("typecheck");
  assert.equal(assessCommand({ cls: "typecheck", startedAt: 0, now: 30 * 1000, lastProgressAt: 29 * 1000 }).directive, "continue");
  assert.equal(assessCommand({ cls: "typecheck", startedAt: 0, now: b.soft_ms + 5000, lastProgressAt: b.soft_ms + 4000 }).directive, "continue_with_parallel_work");
  assert.equal(assessCommand({ cls: "typecheck", startedAt: 0, now: b.soft_ms + 5000, lastProgressAt: 0 }).directive, "diagnose");
  const hard = assessCommand({ cls: "typecheck", startedAt: 0, now: b.hard_ms + 5000, lastProgressAt: 0 });
  assert.equal(hard.phase, "hard_exceeded");
  assert.equal(hard.directive, "corrective_action"); // never "keep waiting"
  assert.ok(hard.fallback && hard.escalation);
});

test("turn-end: only complete/needs-operator/blocked/failed/paused can end a turn", () => {
  for (const ok of ["complete", "needs_operator", "blocked", "failed", "paused"]) assert.ok(isValidTurnEnd(ok));
  for (const bad of ["running", "still_running", "waiting_for_typecheck", "waiting_for_tests", "waiting_for_server", "monitoring", "no_errors_so_far", "will_notify", "status_unchanged", "stalled"]) {
    assert.equal(isValidTurnEnd(bad), false, `${bad} must not end a turn`);
    assert.ok(turnEndViolation(bad).message.length > 0);
  }
});

test("REGRESSION (the typecheck failure): a worker cannot end its turn on 'still running'", () => {
  // 1) edit a trivial file, 2) start a full typecheck, 3) it exceeds the soft
  // threshold, 4) worker polls, 5) worker tries to end with "still running".
  const v = turnEndViolation("waiting_for_typecheck");
  assert.ok(v && !v.ok);
  assert.match(v.message, /forward progress|not a valid turn end/i);
  // At 7 minutes with no progress, the typecheck is past its hard budget and STALLED —
  // the required directive is corrective action, not another poll.
  const a = assessCommand({ cls: "typecheck", startedAt: 0, now: 7 * 60000, lastProgressAt: 0 });
  assert.equal(a.state, "stalled");
  assert.equal(a.phase, "hard_exceeded");
  assert.equal(a.directive, "corrective_action");
});

test("governed runner: a completing command returns complete with output", async () => {
  const r = await runGoverned({ command: "node", args: ["-e", "process.stdout.write('ok')"], cls: "targeted_test" });
  assert.equal(r.state, "complete");
  assert.match(r.output, /ok/);
  assert.ok(!r.killed_at_hard);
});

test("governed runner: a stalled command is terminated at the hard budget — never left 'running'", async () => {
  // A command that produces no output and would outlive its budget → hard-killed,
  // returned as a diagnosed stall, NOT "still running". Tiny budget for the test.
  const r = await runGoverned({ command: "node", args: ["-e", "setTimeout(()=>{}, 60000)"], budget: { soft_ms: 60, hard_ms: 200, fallback: "narrow", escalation: "isolate" } });
  assert.notEqual(r.state, "complete");
  assert.ok(r.killed_at_hard, "the command was terminated at the hard budget");
  assert.match(r.summary, /hard budget|terminated/i);
});

// ============================================================================
// Operational Presence — Director stays quietly present across the lifecycle. A
// single, event-driven voice: the operator never has to ask "what is happening?".
// Pure projection over durable state; silence (a stable line) is correct.
// ============================================================================

test("presence: every lifecycle stage has an honest, non-empty voice", () => {
  const cases = [
    ["understanding", { mission: { status: "draft" }, stage: "understanding", questions: [{ id: "u1" }] }],
    ["preparing", { mission: { status: "draft" }, stateKey: "preparing", counsel: { closing: "I need a decision first." } }],
    ["ready", { mission: { status: "draft" }, stateKey: "ready", counsel: { closing: "I'd go ahead." } }],
    ["launching", { mission: { status: "starting", current_phase: "attaching engine" } }],
    ["executing", { mission: { status: "running", current_phase: "using Write", last_activity_at: "2026-07-25T14:00:00Z" } }],
    ["reviewing", { mission: { status: "waiting_for_acceptance" } }],
    ["accepted", { mission: { status: "completed" } }],
    ["closed", { mission: { status: "closed" } }],
    ["needs_operator", { mission: { status: "waiting_for_operator" } }],
    ["blocked", { mission: { status: "blocked" } }],
    ["at_risk", { mission: { status: "failed" } }],
  ];
  for (const [phase, inp] of cases) {
    const p = composePresence(inp);
    assert.equal(p.phase, phase, `${phase} → phase`);
    assert.ok(p.line && p.line.trim().length > 0, `${phase} has a voice`);
    // No manufactured reassurance / "still here" narration.
    assert.doesNotMatch(p.line, /still here|just checking|hang tight/i);
  }
});

test("presence: LAUNCHING is distinct from executing until the worker actually produces activity", () => {
  // Dispatched but no activity yet → still launching (fixes the 'running with dead air').
  assert.equal(isLaunching({ status: "running", current_phase: "dispatching work" }), true);
  assert.equal(composePresence({ mission: { status: "running", current_phase: "dispatching work" } }).phase, "launching");
  // First real activity flips it to executing.
  const execMission = { status: "running", current_phase: "using Bash", last_activity_at: "2026-07-25T14:00:00Z" };
  assert.equal(isLaunching(execMission), false);
  assert.equal(composePresence({ mission: execMission }).phase, "executing");
});

test("presence: the launch sequence is an ordered, honest set of real steps", () => {
  const seq = launchSequence({ current_phase: "attaching engine" });
  assert.deepEqual(LAUNCH_STEPS.map((s) => s.key), ["preparing", "verifying", "attaching", "dispatching"]);
  assert.equal(seq.current, "attaching");
  const active = seq.steps.find((s) => s.active);
  assert.equal(active.key, "attaching");
  assert.ok(seq.steps.slice(0, 2).every((s) => s.done), "earlier steps are done");
  assert.ok(seq.steps[3].active === false && seq.steps[3].done === false, "later steps are pending");
});

test("presence: executing is event-driven from the phase, coarse not twitchy", () => {
  assert.equal(executionEvent({ current_phase: "using Write" }).key, "writing");
  assert.equal(executionEvent({ current_phase: "using Read" }).key, "exploring");
  assert.equal(executionEvent({ current_phase: "running vitest" }).key, "verifying");
  // A running worker with a writing phase speaks the deliverable event.
  assert.match(composePresence({ mission: { status: "running", current_phase: "using Write", last_activity_at: "x" } }).line, /writing the deliverable/i);
});

test("presence: silence is stable — identical state yields an identical line (no manufactured updates)", () => {
  const m = { mission: { status: "running", current_phase: "using Bash", last_activity_at: "2026-07-25T14:00:00Z" } };
  assert.equal(composePresence(m).line, composePresence(m).line);
});

test("policy is one canonical text carrying the load-bearing rules", () => {
  assert.match(WORKER_POLICY, /forward progress/i);
  assert.match(WORKER_POLICY, /still running/i);
  assert.match(WORKER_POLICY, /soft/i);
  assert.match(WORKER_POLICY, /hard/i);
  assert.ok(Object.keys(COMMAND_CLASSES).includes("typecheck") && Object.keys(COMMAND_CLASSES).includes("full_test_suite"));
});

// ============================================================================
// Direct-worker DELIVERY + turn-end GUARD. A directly-opened Claude loads CLAUDE.md
// but NOT .alloy-agent-instructions.md, so the policy was never delivered to it (a
// file on disk is not consumption). SessionStart delivers it; a Stop-hook guard
// refuses a turn that ends on "still running". Both are thin wrappers over these
// tested pure functions. Semantic rules — not brittle provider-prose snapshots.
// ============================================================================

test("passive-wait ending: forbidden phrasing is flagged; resolution + quoting are not", () => {
  // The exact failure mode: a worker hands background monitoring back to the operator.
  assert.ok(classifyPassiveWaitEnding("The build is still running; I'll check back later.").passive);
  assert.ok(classifyPassiveWaitEnding("No errors so far — I'll keep you posted.").passive);
  assert.ok(classifyPassiveWaitEnding("Waiting for the typecheck to finish.").passive);
  // Resolution (diagnosis / corrective action / a concrete blocker) suppresses a false positive.
  assert.equal(classifyPassiveWaitEnding("The suite ran long so I terminated it, isolated the slow suite, and the targeted run completed green.").passive, false);
  assert.equal(classifyPassiveWaitEnding("It's still running but blocked on a missing DB credential — needs your input.").passive, false);
  // A quoted / meta mention of the phrase is discussion, not a live report.
  assert.equal(classifyPassiveWaitEnding('The rule is: "Still running" is not a valid state to end a turn on. Nothing is running here.').passive, false);
  // Clean terminal / a real question / empty → not flagged.
  assert.equal(classifyPassiveWaitEnding("Typecheck completed with no errors. Complete.").passive, false);
  assert.equal(classifyPassiveWaitEnding("Which environment should I target for the migration?").passive, false);
  assert.equal(classifyPassiveWaitEnding("").passive, false);
});

test("stop-guard decision: blocks a passive turn-end, points at the governed runner, never loops", () => {
  const blocked = buildStopDecision({ lastAssistantText: "The typecheck is still running; I'll notify you when it finishes.", stopHookActive: false });
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /forward progress|still running/i);
  assert.match(blocked.reason, /command-budget\.mjs run/);                 // steers to the governed runner
  assert.match(blocked.reason, /complete|needs_operator|blocked|failed/);  // names the valid terminal states
  // A resolved ending is allowed through.
  assert.equal(buildStopDecision({ lastAssistantText: "Terminated the stalled build and isolated the failure; blocked on X — needs your input.", stopHookActive: false }).block, false);
  // Loop backstop: once the guard is already active, allow the stop regardless (fires at most once per stuck turn).
  assert.equal(buildStopDecision({ lastAssistantText: "still running", stopHookActive: true }).block, false);
});

test("session-start delivery: slot instructions become SessionStart additionalContext", () => {
  assert.equal(buildSessionStartContext("   "), null);                     // nothing to deliver → the hook stays silent
  const ctx = buildSessionStartContext("# Alloy agent instructions\nWorker Operating Policy: own forward progress.");
  assert.match(ctx, /Managed-slot operating instructions/);               // framed as the worker's own operating rules
  assert.match(ctx, /Worker Operating Policy/);                            // carries the delivered content
});

test("CLI seams: session-start emits additionalContext; stop-guard blocks a passive transcript, allows a resolved one", async () => {
  const { execFileSync } = await import("node:child_process");
  const cbPath = new URL("../lib/vacilando/command-budget.mjs", import.meta.url).pathname;
  const dir = mkdtempSync(join(os.tmpdir(), "cb-cli-"));

  // session-start over a temp instructions file → valid SessionStart hook JSON.
  const instr = join(dir, "instr.md");
  writeFileSync(instr, "# Slot\n\nWorker Operating Policy: \"still running\" is not a valid turn end.");
  const ss = JSON.parse(execFileSync("node", [cbPath, "session-start", instr], { encoding: "utf8" }));
  assert.equal(ss.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(ss.hookSpecificOutput.additionalContext, /Worker Operating Policy/);
  // missing file → silent (empty stdout), exit 0.
  assert.equal(execFileSync("node", [cbPath, "session-start", join(dir, "nope.md")], { encoding: "utf8" }).trim(), "");

  // stop-guard over a PASSIVE transcript → block decision.
  const tr = join(dir, "t.jsonl");
  const asst = (text) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } }) + "\n";
  writeFileSync(tr, asst("The tests are still running; I'll report back when they finish."));
  const sg = execFileSync("node", [cbPath, "stop-guard"], { input: JSON.stringify({ transcript_path: tr, stop_hook_active: false }), encoding: "utf8" });
  assert.match(sg, /"decision":"block"/);
  // RESOLVED transcript → allow (empty stdout).
  writeFileSync(tr, asst("Terminated the stall at the hard budget, isolated it; blocked on a credential — needs your input."));
  const sg2 = execFileSync("node", [cbPath, "stop-guard"], { input: JSON.stringify({ transcript_path: tr, stop_hook_active: false }), encoding: "utf8" });
  assert.equal(sg2.trim(), "");
});

test("budget class names resolve tolerantly (policy prose is hyphenated; keys are underscored)", () => {
  // The exact gotcha a real worker hit: it typed the class as the policy writes it.
  assert.equal(budgetFor("targeted-test"), budgetFor("targeted_test"));   // hyphen → underscore
  assert.equal(budgetFor("full-suite"), budgetFor("full_test_suite"));    // prose alias → real class
  assert.equal(budgetFor("dev-server-start"), budgetFor("dev_server_start"));
  assert.equal(budgetFor("browser-validation"), budgetFor("browser_validation"));
  // A resolved class must NOT be the default fallback (which is the silent-degradation bug).
  assert.notEqual(budgetFor("targeted-test").soft_ms, budgetFor("default").soft_ms);
  // A genuinely unknown class still falls back to default.
  assert.equal(budgetFor("nonsense-class"), budgetFor("default"));
});

test("governed runner (Case A — long but progressing): past the soft budget, still completes — not killed", async () => {
  // Emits output steadily so lastProgressAt keeps advancing; soft is tiny, hard generous.
  // "Slow but progressing" must NOT be killed just for being slow.
  const r = await runGoverned({
    command: "node",
    args: ["-e", "let n=0;const t=setInterval(()=>{process.stdout.write('tick'+(++n)+'\\n');if(n>=6){clearInterval(t)}},40)"],
    budget: { soft_ms: 60, hard_ms: 5000, fallback: "run the targeted suite", escalation: "isolate" },
  });
  assert.equal(r.state, "complete");
  assert.ok(!r.killed_at_hard, "a progressing command must not be terminated");
  assert.ok(r.soft_exceeded, "it ran past its soft budget — proving slow-but-progressing is allowed to finish");
  assert.match(r.output, /tick6/);
});

test("governed runner (Case B — stalled): terminated with a corrective directive, state never 'running'", async () => {
  // Alive but producing no output past its budget → hard-killed, returned as a diagnosed
  // stall with a corrective directive. The turn can never end on "running".
  const r = await runGoverned({
    command: "node",
    args: ["-e", "setInterval(()=>{},1000)"],
    budget: { soft_ms: 40, hard_ms: 150, fallback: "run the targeted suite", escalation: "isolate" },
  });
  assert.equal(r.killed_at_hard, true);
  assert.equal(r.state, "stalled");
  assert.equal(r.directive, "corrective_action");
  assert.match(r.summary, /terminated|hard budget/i);
  assert.equal(isValidTurnEnd(r.state), false, "'stalled' is not a valid turn end — it demands corrective action");
});

// ---------------------------------------------------------------------------
// Implement-phase evidence checkers (source_changed / tests_pass / qa_evidence)
// — the last autonomy switch: without these, implement gates never fully pass.
// ---------------------------------------------------------------------------
function implPkg(overrides = {}) {
  return {
    package_id: "pkg_impl",
    capability_id: "cap_test",
    acceptance_criteria: [
      { id: "AC1", evidence_required: ["source_changed"] },
      { id: "AC2", evidence_required: ["tests_pass"] },
      { id: "AC3", evidence_required: ["qa_evidence"] },
      { id: "AC4", evidence_required: ["rejected_patterns_not_reintroduced"] },
    ],
    expected_deliverables: [
      { id: "D2", kind: "evidence", description: "QA screenshots", path: "docs/platform/planning/vacilando-os/qa/cap-test-v2/" },
    ],
    rejected_patterns: [],
    ...overrides,
  };
}

test("conversationNeedsAttention: at_risk/failed does not notify; waiting_for_operator does", async () => {
  const { conversationNeedsAttention, conversationState } = await import("../lib/vacilando/conversation.mjs");
  const pkg = { readiness_status: "ready", readiness_verdict: { verdict: "Ready" } };
  const fail = conversationState({ status: "failed", error_message: "API Error: 529 Overloaded" }, pkg);
  assert.equal(fail.key, "at_risk");
  assert.equal(fail.action, "Open");
  assert.equal(conversationNeedsAttention(fail), false);
  const wait = conversationState({ status: "waiting_for_operator", pending_question: "Pick a scope" }, pkg);
  assert.equal(wait.key, "needs_operator");
  assert.equal(wait.action, "Continue");
  assert.equal(conversationNeedsAttention(wait), true);
});

test("implement evidence: unmet when no source/tests/qa", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-"));
  mkdirSync(join(tmp, ".git"), { recursive: true }); // dirtyPaths tolerates missing git
  const result = evalMission({ mission_id: "msn_impl_empty", git_baseline: [] }, implPkg(), { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC1").status, "unmet");
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC2").status, "unmet");
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC3").status, "unmet");
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC4").status, "met"); // no rejected patterns → auto-met
  assert.equal(result.gate, "fail");
});

test("implement evidence: source_changed + tests_pass + qa_evidence → gate pass", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-"));
  // Fake a git repo with an attributable source change
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  // leave untracked so porcelain shows ?? (attributable vs empty baseline)

  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  // Seed a mission report with tests.ran/results
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", "msn_impl_ok");
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts"],
    tests: { ran: true, results: { pass: true, failed: 0, passed: 3 } },
  }));

  const result = evalMission({ mission_id: "msn_impl_ok", git_baseline: [] }, implPkg(), { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC1").status, "met", JSON.stringify(result.criteria.find((c) => c.criterion_id === "AC1")));
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC2").status, "met");
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC3").status, "met");
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC4").status, "met");
  assert.equal(result.gate, "pass");
});

test("implement evidence: migration_accounted unmet when mig file missing from report", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-mig-"));
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "supabase/migrations"), { recursive: true });
  writeFileSync(join(tmp, "supabase/migrations/20260101_roles.sql"), "-- mig\n");
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  const mid = "msn_impl_mig_miss";
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", mid);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts", "supabase/migrations/20260101_roles.sql"],
    tests: { ran: true, results: { pass: true } },
    // migrations[] intentionally absent
  }));

  const pkg = implPkg({
    acceptance_criteria: [
      ...implPkg().acceptance_criteria,
      { id: "AC5", evidence_required: ["migration_accounted"] },
    ],
  });
  const result = evalMission({ mission_id: mid, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC5").status, "unmet");
  assert.equal(result.gate, "fail");
});

test("implement evidence: migration awaiting_authorization → needs_operator", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-mig-auth-"));
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "supabase/migrations"), { recursive: true });
  writeFileSync(join(tmp, "supabase/migrations/20260101_roles.sql"), "-- mig\n");
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  const mid = "msn_impl_mig_auth";
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", mid);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts", "supabase/migrations/20260101_roles.sql"],
    tests: { ran: true, results: { pass: true } },
    migrations: [{
      path: "supabase/migrations/20260101_roles.sql",
      status: "awaiting_authorization",
      target: "shared",
      note: "needs Kelly",
      preflight: { ok: true, summary: "orphan grants=0", evidence_path: "docs/…/preflight.json" },
    }],
  }));

  const pkg = implPkg({
    acceptance_criteria: [
      ...implPkg().acceptance_criteria,
      { id: "AC5", evidence_required: ["migration_accounted"] },
    ],
  });
  const result = evalMission({ mission_id: mid, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC5").status, "operator_review");
  assert.equal(result.gate, "needs_operator");
});

test("implement evidence: shared awaiting_authorization without preflight → unmet", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-mig-nopf-"));
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "supabase/migrations"), { recursive: true });
  writeFileSync(join(tmp, "supabase/migrations/20260101_roles.sql"), "-- mig\n");
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  const mid = "msn_impl_mig_nopf";
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", mid);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts", "supabase/migrations/20260101_roles.sql"],
    tests: { ran: true, results: { pass: true } },
    migrations: [{ path: "supabase/migrations/20260101_roles.sql", status: "awaiting_authorization", target: "shared", note: "needs Kelly" }],
  }));

  const pkg = implPkg({
    acceptance_criteria: [
      ...implPkg().acceptance_criteria,
      { id: "AC5", evidence_required: ["migration_accounted"] },
    ],
  });
  const result = evalMission({ mission_id: mid, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC5").status, "unmet");
  assert.match(result.criteria.find((c) => c.criterion_id === "AC5").evidence[0].detail, /preflight/);
  assert.equal(result.gate, "fail");
});

test("implement evidence: shared awaiting_authorization with failed preflight → unmet", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-mig-badpf-"));
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "supabase/migrations"), { recursive: true });
  writeFileSync(join(tmp, "supabase/migrations/20260101_roles.sql"), "-- mig\n");
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  const mid = "msn_impl_mig_badpf";
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", mid);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts", "supabase/migrations/20260101_roles.sql"],
    tests: { ran: true, results: { pass: true } },
    migrations: [{
      path: "supabase/migrations/20260101_roles.sql",
      status: "awaiting_authorization",
      target: "shared",
      preflight: { ok: false, summary: "orphan grants=3" },
    }],
  }));

  const pkg = implPkg({
    acceptance_criteria: [
      ...implPkg().acceptance_criteria,
      { id: "AC5", evidence_required: ["migration_accounted"] },
    ],
  });
  const result = evalMission({ mission_id: mid, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC5").status, "unmet");
  assert.equal(result.gate, "fail");
});

test("implement evidence: no migration files → migration_accounted met", () => {
  const tmp = mkdtempSync(join(os.tmpdir(), "vac-impl-mig-none-"));
  execFileSync("git", ["init"], { cwd: tmp });
  mkdirSync(join(tmp, "web/lib"), { recursive: true });
  writeFileSync(join(tmp, "web/lib/access.ts"), "export const x = 1;\n");
  const qaDir = join(tmp, "docs/platform/planning/vacilando-os/qa/cap-test-v2");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "phase0.png"), "fake-png");

  const mid = "msn_impl_mig_none";
  const outRoot = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "missions", "outputs", mid);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "outputs.jsonl"), JSON.stringify({ turn: 1, has_report: true }) + "\n");
  writeFileSync(join(outRoot, "turn-1.report.json"), JSON.stringify({
    changed_files: ["web/lib/access.ts"],
    tests: { ran: true, results: { pass: true } },
  }));

  const pkg = implPkg({
    acceptance_criteria: [
      ...implPkg().acceptance_criteria,
      { id: "AC5", evidence_required: ["migration_accounted"] },
    ],
  });
  const result = evalMission({ mission_id: mid, git_baseline: [] }, pkg, { worktreePath: tmp });
  assert.equal(result.criteria.find((c) => c.criterion_id === "AC5").status, "met");
  assert.equal(result.gate, "pass");
});

// --- Accept must not advance past needs_operator; strip must surface judgment ---
const { projectObjectiveLive } = await import("../lib/vacilando/objective.mjs");

test("objective live: waiting_for_acceptance + needs_operator → operator_needed (even autonomous)", () => {
  const o = {
    capability_id: "cap_test",
    mode: "autonomous",
    phases: [
      { id: "p1", title: "Phase 0", status: "done" },
      { id: "p2", title: "Phase 1", status: "pending", mission_id: "msn_x" },
    ],
  };
  const mission = {
    mission_id: "msn_x",
    status: "waiting_for_acceptance",
    acceptance_gate: "needs_operator",
    phase_id: "p2",
    objective_capability_id: "cap_test",
    updated_at: new Date().toISOString(),
  };
  const live = projectObjectiveLive(o, () => mission, () => [mission]);
  assert.equal(live.operator_needed, true);
  assert.equal(live.status, "needs_you");
  assert.match(live.label, /judgment/i);
});

test("objective live: waiting_for_acceptance without gate stays reviewing in autonomous", () => {
  const o = {
    capability_id: "cap_test",
    mode: "autonomous",
    phases: [{ id: "p2", title: "Phase 1", status: "pending", mission_id: "msn_y" }],
  };
  const mission = {
    mission_id: "msn_y",
    status: "waiting_for_acceptance",
    phase_id: "p2",
    objective_capability_id: "cap_test",
    updated_at: new Date().toISOString(),
  };
  const live = projectObjectiveLive(o, () => mission, () => [mission]);
  assert.equal(live.operator_needed, false);
  assert.equal(live.status, "reviewing");
});

// --- Heavy validation broker guard (Vacilando must not allow raw tsc) ---
const {
  isUnbrokeredHeavyCommand,
  CLAUDE_IMPLEMENT_ALLOWED_TOOLS,
} = await import("../lib/vacilando/heavy-validation-guard.mjs");

test("unbrokered heavy command detection: raw tsc variants", () => {
  assert.equal(isUnbrokeredHeavyCommand("npx tsc --noEmit -p tsconfig.json"), true);
  assert.equal(isUnbrokeredHeavyCommand("npm exec tsc --noEmit"), true);
  assert.equal(isUnbrokeredHeavyCommand("node …/web/node_modules/.bin/tsc --noEmit -p tsconfig.json"), true);
  assert.equal(isUnbrokeredHeavyCommand("node /Users/x/web/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit"), true);
  assert.equal(isUnbrokeredHeavyCommand("npx next build"), true);
});

test("brokered heavy commands are not flagged", () => {
  assert.equal(isUnbrokeredHeavyCommand("vac run typecheck"), false);
  assert.equal(isUnbrokeredHeavyCommand("bash ../scripts/local-dev/vac-run typecheck:tests"), false);
  assert.equal(isUnbrokeredHeavyCommand("alloy-validate wt1 typecheck"), false);
  assert.equal(isUnbrokeredHeavyCommand("npx vitest run tests/access/foo.test.ts"), false);
});

test("Claude implement allowlist omits raw tsc vectors", () => {
  const joined = CLAUDE_IMPLEMENT_ALLOWED_TOOLS.join("\n");
  assert.ok(joined.includes("Bash(vac *)"));
  assert.ok(joined.includes("Bash(npm run *)"));
  assert.ok(joined.includes("Bash(npx vitest *)"));
  assert.equal(joined.includes("Bash(npx *)"), false);
  assert.equal(joined.includes("Bash(npm *)"), false);
  assert.equal(joined.includes("Bash(node *)"), false);
});

// --- Director Execution System V2 Phase 1: Mission Brief authority ---

const {
  createBrief, getBrief, getBriefVersion, listBriefVersions, proposeBriefRevision, computeContentHash,
} = await import("../lib/vacilando/mission-brief.mjs");
const { appendTimelineEvent, readTimeline, readTimelineSummary } = await import("../lib/vacilando/timeline.mjs");
const {
  reviewMissionReadiness, ingestMissionBrief, approveMissionExecution, getKickoffState,
} = await import("../lib/vacilando/mission-kickoff.mjs");
const { ensureObjective, getObjective, getObjectiveByMission } = await import("../lib/vacilando/objective.mjs");

function sampleBriefBody(overrides = {}) {
  return {
    title: "Access & Identity V2",
    objective: "Ship Access & Identity V2 from the operator-owned plan",
    plan: [
      { phaseId: "p0", order: 1, title: "Catalog integrity", objective: "Lock catalog", requiredOutputs: ["migration"], acceptanceCriteriaIds: ["AC1"] },
      { phaseId: "p1", order: 2, title: "Audit trail", objective: "Audit log", requiredOutputs: ["code"], dependencies: ["p0"], acceptanceCriteriaIds: ["AC2"] },
    ],
    acceptanceCriteria: [
      { id: "AC1", statement: "permission_definitions is canonical" },
      { id: "AC2", statement: "mutations write audit events" },
    ],
    constraints: [{ id: "C1", text: "No push without approval" }],
    sourceMaterials: [{ id: "S1", ref: "docs/platform/planning/access.md", kind: "document" }],
    executionPreferences: { maxConcurrentWorkers: 2, requireUserApprovalBeforeMerge: true },
    ...overrides,
  };
}

test("brief create → version immutable → revise requires explicit new version", () => {
  const brief = createBrief(sampleBriefBody({ missionId: "msn_brief_immut_test" }));
  assert.equal(brief.version, 1);
  assert.ok(brief.contentHash);
  const v1path = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "mission-briefs", "versions", "msn_brief_immut_test-v1.json");
  const before = readFileSync(v1path, "utf8");
  // Attempting silent mutate of the head must not rewrite the immutable version snapshot
  // without going through proposeBriefRevision.
  assert.throws(() => proposeBriefRevision("msn_brief_immut_test", { title: "Hijacked" }, { changeSummary: "" }), /change_summary|changeSummary/i);
  const still = getBriefVersion("msn_brief_immut_test", 1);
  assert.equal(still.title, "Access & Identity V2");
  assert.equal(readFileSync(v1path, "utf8"), before);

  const v2 = proposeBriefRevision("msn_brief_immut_test", { title: "Access & Identity V2 (revised)" }, {
    changeSummary: "Operator renamed title after review",
    actor: "operator",
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.title, "Access & Identity V2 (revised)");
  assert.equal(getBriefVersion("msn_brief_immut_test", 1).title, "Access & Identity V2");
  assert.equal(listBriefVersions("msn_brief_immut_test").length, 2);
  assert.equal(getBrief("msn_brief_immut_test").version, 2);
});

test("contentHash is stable for identical brief bodies", () => {
  const a = computeContentHash(sampleBriefBody());
  const b = computeContentHash(sampleBriefBody());
  assert.equal(a, b);
  const c = computeContentHash(sampleBriefBody({ title: "Different" }));
  assert.notEqual(a, c);
});

test("kickoff readiness distinguishes operational vs mission ambiguity", () => {
  const ready = reviewMissionReadiness(createBrief(sampleBriefBody({ missionId: "msn_ready_rev" })));
  assert.equal(ready.ready, true);
  assert.equal(ready.mission_ambiguities.length, 0);
  assert.ok(ready.operational_gaps.some((g) => g.code === "unclear_branch_target"));
  assert.equal(ready.kickoff_card.plan_changes_by_director, "None");

  const amb = reviewMissionReadiness(createBrief(sampleBriefBody({
    missionId: "msn_amb_rev",
    acceptanceCriteria: [],
    plan: [{ phaseId: "p0", order: 1, title: "Only", objective: "x", requiredOutputs: [], dependencies: ["missing"] }],
  })));
  assert.equal(amb.ready, false);
  assert.ok(amb.mission_ambiguities.some((g) => g.code === "missing_acceptance_criteria"));
  assert.ok(amb.mission_ambiguities.some((g) => g.code === "unknown_dependency"));
});

test("approve execution creates phases matching brief order; titles locked without new version", () => {
  const ingested = ingestMissionBrief(sampleBriefBody({
    title: "Brief Spine Mission",
    executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 1 },
  }), { slot: 6 });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.mission.kickoff_status, "awaiting_kickoff_approval");
  assert.equal(ingested.objective.status, "awaiting_kickoff_approval");
  assert.equal(ingested.objective.phases.map((p) => p.title).join("|"), "Catalog integrity|Audit trail");

  const approved = approveMissionExecution(ingested.brief.missionId, ingested.brief.version);
  assert.equal(approved.ok, true);
  assert.equal(approved.mission.kickoff_status, "executing");
  assert.equal(approved.mission.mission_brief_version, 1);
  assert.equal(approved.mission.mission_content_hash, ingested.brief.contentHash);
  assert.deepEqual(approved.objective.phases.map((p) => p.id), ["p0", "p1"]);
  assert.deepEqual(approved.objective.phases.map((p) => p.title), ["Catalog integrity", "Audit trail"]);

  // Director cannot change phase titles on the objective without a new brief version:
  // recreating from the same brief restores the same titles.
  const again = approveMissionExecution(ingested.brief.missionId, 1);
  assert.equal(again.ok, true);
  assert.deepEqual(again.objective.phases.map((p) => p.title), ["Catalog integrity", "Audit trail"]);
});

test("timeline events emitted for create/approve/phase start", () => {
  const ingested = ingestMissionBrief(sampleBriefBody({
    missionId: undefined,
    title: "Timeline Mission",
    executionPreferences: { mergeTarget: "staging" },
  }), { slot: 6 });
  const mid = ingested.mission.mission_id;
  const created = readTimeline(mid).filter((e) => e.type === "mission_created");
  assert.equal(created.length, 1);
  assert.match(created[0].summary, /awaiting kickoff/i);
  assert.equal(created[0].visibility, "summary");

  const approved = approveMissionExecution(mid, ingested.brief.version);
  assert.equal(approved.ok, true);
  const types = readTimelineSummary(mid).map((e) => e.type);
  assert.ok(types.includes("mission_started"));
  assert.ok(types.includes("phase_started"));
  assert.match(readTimeline(mid).find((e) => e.type === "phase_started").summary, /Catalog integrity/);
});

test("legacy Access & Roles capability objective path still loads (gated)", () => {
  const cap = retrieveCapability("Build Access & Roles V2");
  assert.equal(cap.ok, true);
  const obj = ensureObjective(cap.capability, { intent: "Build Access & Roles V2" });
  assert.ok(obj);
  assert.equal(obj.origin == null || obj.origin !== "mission_brief", true);
  assert.ok(obj.phases.length >= 1);
  assert.equal(obj.phases[0].kind, "plan");
  assert.equal(getObjective(cap.capability.capability_id).capability_id, cap.capability.capability_id);
  // Brief-origin lookup must not collide with capability-keyed objective
  assert.equal(getObjectiveByMission(cap.capability.capability_id), null);
});

test("getKickoffState prefers timeline + brief over inventing a plan", () => {
  const ingested = ingestMissionBrief(sampleBriefBody({
    title: "Kickoff State Mission",
    executionPreferences: { mergeTarget: "staging" },
  }), { slot: 6 });
  const state = getKickoffState(ingested.mission.mission_id);
  assert.equal(state.ok, true);
  assert.equal(state.kickoff_card.plan_changes_by_director, "None");
  assert.equal(state.kickoff_card.phase_count, 2);
  assert.ok(state.timeline.some((e) => e.type === "mission_created"));
});

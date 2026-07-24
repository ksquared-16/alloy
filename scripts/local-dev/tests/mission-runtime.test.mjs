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
const { composeCounsel, selectFrontier, attemptCounsel, readinessCounsel, frontierPhrase } = await import("../lib/vacilando/counsel.mjs");
const { assembleConversation } = await import("../lib/vacilando/conversation.mjs");
const { composeUnderstanding } = await import("../lib/vacilando/shared-understanding.mjs");
const { composeOperations, stateKeyFor, assembleReview, STATES } = await import("../lib/vacilando/operations.mjs");
const { close: directorCloseFn } = await import("../lib/vacilando/mission-director.mjs");

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

test("SU: a Director recommendation stays distinguishable from a decision", () => {
  const u = U({ pkg: pkgU({ suggested: [{ statement: "cover roadmap item" }, { statement: "address ki1" }] }) });
  assert.ok(u.advises, "recommendation is present");
  assert.match(JSON.stringify(u.advises), /criteria|criterion/i);
  // it is NOT in the relied-upon (decided) set
  assert.ok(!u.relied_upon.some((r) => /criteria|criterion/i.test(r.text)));
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

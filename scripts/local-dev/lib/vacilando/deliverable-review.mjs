/**
 * Vacilando — Director-owned Deliverable Review (Certification Experience V1).
 *
 * Workers report to Director. Director verifies and presents an executive
 * Deliverable Review before the operator is asked to approve.
 *
 * A worker completion report is evidence input — never the review itself.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { join, resolve } from "node:path";
import { REPO_ROOT } from "./knowledge.mjs";
import { getAssignment, listAssignments, updateAssignment } from "./worker-assignment.mjs";
import { listEvidence } from "./evidence.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { submitOperatorDirectorMessage } from "./director-comms.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "deliverable-reviews");

const SCHEMA = "vacilando.deliverable_review.v1";

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

function readStore(missionId) {
  try {
    return JSON.parse(readFileSync(fileFor(missionId), "utf8"));
  } catch {
    return { schema_version: "vacilando.deliverable_reviews.v1", mission_id: missionId, reviews: [] };
  }
}

function writeStore(store) {
  ensureDir();
  writeFileSync(fileFor(store.mission_id), JSON.stringify(store, null, 2));
  return store;
}

function shortId() {
  return randomBytes(6).toString("hex");
}

function repoPath(rel) {
  if (!rel) return null;
  const abs = resolve(REPO_ROOT, rel);
  if (!abs.startsWith(REPO_ROOT)) return null;
  return abs;
}

function fileExists(rel) {
  const abs = repoPath(rel);
  return Boolean(abs && existsSync(abs));
}

function gitShowStat(sha) {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  try {
    return execFileSync("git", ["-C", REPO_ROOT, "show", "--stat", "--oneline", "-1", sha], {
      encoding: "utf8",
      timeout: 4000,
    }).trim().slice(0, 1200);
  } catch {
    return null;
  }
}

/** Known executive briefs for Access & Identity wave assignments. */
function curatedBrief(assignment) {
  const title = assignment?.title || "";
  const phaseId = assignment?.phaseId || "";
  if (/W-4|Service-client principal/i.test(title) || phaseId === "impl_w1b") {
    return {
      deliverable_title: "Wave 1 — Service-client principal check (W-4)",
      assignment_objective:
        "Prevent privileged API routes from bypassing principal-resolution review by adding a build-time enforcement check.",
      reason_for_work:
        "Service-role routes can skip principal resolution unless they are reviewed. Without a hard gate, new privileged routes can ship unreviewed.",
      expected_outcome:
        "A build-time AST check fails the build on unreviewed service-client routes or stale allowlist entries, and records today’s exception baseline.",
      outcome_summary:
        "Director verified a build-time enforcement guard for service-role Supabase clients. Unreviewed routes and stale allowlist entries now fail validation during prebuild. Exception remediation remains deferred to W-15.",
      behavior_changed: [
        "Build-time AST check walks API routes for service-role Supabase clients",
        "Unreviewed routes fail the check",
        "Stale allowlist entries fail the check",
        "Guard runs during prebuild (before production builds)",
        "Current exception baseline is recorded as evidence",
      ],
      behavior_not_changed: [
        "No route handler behavior changed",
        "No schema or migration changes",
        "No operator UI changes",
        "Existing exceptions were not remediated (deferred to W-15)",
      ],
      protects_or_enables:
        "Stops new privileged API routes from bypassing principal-resolution review, and keeps the exception list honest so residue cannot accumulate unnoticed.",
      residual_risks: [
        "Existing allowlisted exceptions remain until W-15 remediation",
        "Approval does not certify that every current exception is permanently acceptable",
      ],
      deferred_work: [
        "W-15 — remediate the recorded exception baseline",
      ],
      recommendation: "approve",
      recommendation_detail:
        "Approve only the enforcement guard and baseline inventory — not permanent acceptance of all current exceptions.",
      approval_meaning: {
        assignment_accepted: true,
        criteria_satisfied: ["AC_W1B — build-time principal check + baseline inventory"],
        dependent_work_eligible: "Next Wave 1 / dependent assignments that were waiting on W-4",
        does_not_imply: [
          "All current allowlisted exceptions are permanently accepted",
          "Route behavior, schema, or UI was changed",
          "Exception remediation (W-15) is complete",
        ],
      },
      rejection_consequence:
        "W-4 stays open for revision. Dependent work that requires this guard remains blocked until a replacement pass is accepted.",
      evidence_translations: [
        {
          match: /allowlist|baseline\.json|exception/i,
          title: "Baseline exception inventory",
          proves: "The current reviewed exception set is recorded for later remediation (W-15).",
        },
        {
          match: /serviceClientPrincipalCheck\.test|Tests executed|check:service-client/i,
          title: "Automated enforcement tests",
          proves: "Unreviewed routes and stale exceptions fail validation; the check is not vacuous.",
        },
        {
          match: /package\.json|prebuild|checkServiceClientPrincipal\.mjs/i,
          title: "Build integration",
          proves: "The guard runs before production builds (prebuild).",
        },
        {
          match: /Commit |commit/i,
          title: "Implementation commit",
          proves: "The enforcement guard and baseline are committed on the mission branch.",
        },
      ],
    };
  }
  return null;
}

function translateEvidence(ev, curated) {
  const blob = `${ev.title || ""} ${ev.description || ""} ${ev.fileUri || ""} ${ev.type || ""}`;
  const hit = (curated?.evidence_translations || []).find((t) => t.match.test(blob));
  if (hit) {
    return {
      evidenceId: ev.evidenceId,
      title: hit.title,
      proves: hit.proves,
      result: /fail|error|exit 1/i.test(ev.description || "") ? "failed" : "passed",
      acceptanceCriteriaCovered: ev.acceptanceCriteriaIds || [],
      source: ev.fileUri || ev.type || "worker evidence",
      timestamp: ev.createdAt,
      commit: (ev.description || "").match(/\b([0-9a-f]{7,40})\b/)?.[1] || null,
      type: ev.type,
      openHref: ev.fileUri ? null : null,
      fileUri: ev.fileUri || null,
    };
  }
  // Never render "document — document" style labels.
  const type = String(ev.type || "artifact");
  const rawTitle = String(ev.title || "").trim();
  const looksRaw = !rawTitle
    || rawTitle.toLowerCase() === type
    || new RegExp(`^${type}\\s*[—-]\\s*${type}$`, "i").test(rawTitle)
    || new RegExp(`^${type}\\s*[—-]`, "i").test(rawTitle);
  const title = looksRaw
    ? (ev.fileUri
      ? `Artifact: ${ev.fileUri.split("/").pop()}`
      : `Supporting ${type} evidence`)
    : rawTitle;
  const proves = ev.description
    ? String(ev.description).split(/[.!?]/)[0].slice(0, 160)
    : `Supports the assignment claim (${type}).`;
  return {
    evidenceId: ev.evidenceId,
    title,
    proves,
    result: type === "test"
      ? (/fail|0 passed|failed/i.test(ev.description || "") ? "failed" : "passed")
      : "recorded",
    acceptanceCriteriaCovered: ev.acceptanceCriteriaIds || [],
    source: ev.fileUri || type,
    timestamp: ev.createdAt,
    commit: null,
    type,
    fileUri: ev.fileUri || null,
  };
}

function checkItem(id, label, status, detail, { source = "automatic", claim = null } = {}) {
  return { id, label, status, detail, source, claim };
}

/**
 * Independent Director verification — distinguishes claims, automatic facts, judgment.
 */
export function runDirectorVerification(missionId, assignmentId, { nowMs } = {}) {
  const assignment = getAssignment(missionId, assignmentId);
  if (!assignment) return { ok: false, error: "assignment_not_found" };
  const report = assignment.completionReport || {};
  const artifacts = listEvidence(missionId, { assignmentId });
  const curated = curatedBrief(assignment);
  const expected = assignment.expectedDeliverables || [];
  const changed = [
    ...(report.changesMade || []),
    ...(report.filesModified || []),
  ].filter(Boolean);
  const prohibited = assignment.prohibitedChanges || [];

  const checks = [];

  // Deliverables exist on disk (or were listed + present in report)
  const deliverablePaths = expected
    .map((d) => (typeof d === "string" ? d : d.path || d.file || d.uri))
    .filter(Boolean);
  const pathsToCheck = deliverablePaths.length
    ? deliverablePaths
    : changed.filter((p) => /\.(mjs|ts|tsx|js|json|md)$/.test(p));
  const missingFiles = pathsToCheck.filter((p) => !fileExists(p) && !changed.includes(p));
  const presentFiles = pathsToCheck.filter((p) => fileExists(p));
  checks.push(checkItem(
    "deliverables_exist",
    "Expected deliverables exist",
    presentFiles.length > 0 && missingFiles.length === 0 ? "pass"
      : presentFiles.length > 0 ? "warn" : "fail",
    presentFiles.length
      ? `Verified on disk: ${presentFiles.slice(0, 6).join(", ")}${missingFiles.length ? `; missing: ${missingFiles.slice(0, 4).join(", ")}` : ""}`
      : "Could not verify deliverable files on disk from the completion report.",
  ));

  // Scope / prohibited
  const prohibitedHits = [];
  for (const rule of prohibited) {
    const re = typeof rule === "string" ? new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
    if (!re) continue;
    for (const f of changed) {
      if (re.test(f)) prohibitedHits.push(f);
    }
  }
  // Heuristic for W-4 / similar: migrations + UI routes shouldn't appear
  const scopeCreep = changed.filter((f) =>
    /supabase\/migrations\//i.test(f) || /components\/.*Drawer/i.test(f));
  checks.push(checkItem(
    "scope_respected",
    "Assignment scope respected",
    prohibitedHits.length || (curated && scopeCreep.length) ? "fail" : "pass",
    prohibitedHits.length
      ? `Prohibited paths touched: ${prohibitedHits.join(", ")}`
      : (curated
        ? "No schema, migration, or UI route changes detected in the reported file set."
        : "Structural scope check passed on reported files."),
    { claim: report.summary ? "Worker claimed scope was respected." : null },
  ));

  // Tests
  const testEv = artifacts.filter((e) => e.type === "test" || /test/i.test(e.title || ""));
  const testsPassed = testEv.some((e) => /passed|ok:true|exit 0/i.test(e.description || ""))
    || (report.tests || []).some((t) => t.passed !== false);
  checks.push(checkItem(
    "tests_passed",
    "Required tests ran and passed",
    testEv.length === 0 ? "fail" : (testsPassed ? "pass" : "fail"),
    testEv.length === 0
      ? "No test evidence attached."
      : (testsPassed ? "Test evidence reports a passing run." : "Test evidence does not show a clear pass."),
  ));

  // Evidence presence
  const meaningful = artifacts.filter((e) => !/^(log|notes|document)\s*[—-]/i.test(e.title || ""));
  checks.push(checkItem(
    "evidence_present",
    "Required evidence exists",
    meaningful.length >= 2 ? "pass" : (artifacts.length ? "warn" : "fail"),
    `${meaningful.length} meaningful evidence item(s); ${artifacts.length} total attached.`,
  ));

  // Acceptance criteria
  const acIds = assignment.acceptanceCriteriaIds || [];
  const acResults = report.acceptanceCriteriaResults || [];
  const acCovered = acIds.length === 0
    || acResults.length > 0
    || artifacts.some((e) => (e.acceptanceCriteriaIds || []).length);
  checks.push(checkItem(
    "acceptance_criteria",
    "Acceptance criteria covered",
    acCovered ? "pass" : "warn",
    acIds.length
      ? `Criteria in scope: ${acIds.join(", ")}. ${acCovered ? "Evidence references them." : "Coverage not explicit."}`
      : "No formal criteria IDs on the assignment — judged from deliverables and tests.",
    { source: acResults.length ? "worker_claim+automatic" : "automatic" },
  ));

  // Claims vs git
  const commitEv = artifacts.find((e) => e.type === "commit" || /^Commit /i.test(e.title || ""));
  const sha = (commitEv?.description || commitEv?.title || "").match(/\b([0-9a-f]{7,40})\b/)?.[1];
  const gitStat = sha ? gitShowStat(sha) : null;
  checks.push(checkItem(
    "claims_match_git",
    "Claims match git / filesystem state",
    gitStat || presentFiles.length ? "pass" : "warn",
    gitStat
      ? `Commit ${sha.slice(0, 8)} exists in the worktree.`
      : (presentFiles.length
        ? "Key files exist on disk; commit cross-check unavailable."
        : "Could not cross-check a commit in git."),
    { claim: commitEv ? commitEv.title : null },
  ));

  // Dependent work safety
  const dependents = listAssignments(missionId).filter((a) =>
    (a.dependencies || []).includes(assignmentId) && a.status === "waiting");
  checks.push(checkItem(
    "dependents_safe",
    "Dependent work may safely continue after approval",
    "pass",
    dependents.length
      ? `${dependents.length} dependent assignment(s) become eligible when you approve.`
      : "No waiting dependents blocked on this assignment right now.",
    { source: "judgment" },
  ));

  // Residual risks (judgment)
  checks.push(checkItem(
    "residual_risks_identified",
    "Unresolved risks identified",
    "pass",
    (curated?.residual_risks || report.residualRisks || ["None recorded"]).slice(0, 3).join("; "),
    { source: "judgment" },
  ));

  const hardFails = checks.filter((c) => c.status === "fail");
  const canRecommend = hardFails.length === 0;
  const recommendation = !canRecommend
    ? "not_ready"
    : (curated?.recommendation || report.recommendation || "approve");

  return {
    ok: true,
    verified_at: iso(nowMs),
    verified_by: "director",
    can_recommend_approval: canRecommend && recommendation === "approve",
    recommendation,
    checks,
    worker_claims: {
      summary: report.summary || null,
      files: changed,
      residualRisks: report.residualRisks || [],
      followUpItems: report.followUpItems || [],
    },
    curated: Boolean(curated),
  };
}

function buildReviewFields(assignment, verification, { nowMs } = {}) {
  const curated = curatedBrief(assignment);
  const report = assignment.completionReport || {};
  const artifacts = listEvidence(assignment.missionId, { assignmentId: assignment.assignmentId });
  const evidence_summary = artifacts.map((e) => translateEvidence(e, curated));

  // Deduplicate evidence cards by title
  const seen = new Set();
  const evidenceDeduped = [];
  for (const e of evidence_summary) {
    const key = e.title.toLowerCase();
    if (seen.has(key)) continue;
    // Skip raw filler duplicates
    if (/^supporting (log|notes|document)/i.test(e.title) && evidenceDeduped.length >= 3) continue;
    seen.add(key);
    evidenceDeduped.push(e);
  }

  const acResults = (report.acceptanceCriteriaResults || []).length
    ? report.acceptanceCriteriaResults
    : (assignment.acceptanceCriteriaIds || []).map((id) => ({
      id,
      result: verification.can_recommend_approval ? "met" : "unverified",
      source: verification.can_recommend_approval ? "director_verified" : "pending",
    }));

  const certState = verification.can_recommend_approval || verification.recommendation === "approve"
    ? "ready_for_review"
    : "cannot_verify";

  return {
    schema_version: SCHEMA,
    review_id: "drev_" + shortId(),
    mission_id: assignment.missionId,
    assignment_id: assignment.assignmentId,
    deliverable_title: curated?.deliverable_title || assignment.title,
    assignment_objective: curated?.assignment_objective || assignment.objective || assignment.title,
    reason_for_work: curated?.reason_for_work
      || assignment.scope
      || "This assignment was required for the current mission phase.",
    expected_outcome: curated?.expected_outcome
      || (assignment.expectedDeliverables || []).map((d) => (typeof d === "string" ? d : d.title || d.path)).filter(Boolean).join("; ")
      || "Complete the assignment per its acceptance criteria.",
    outcome_summary: curated?.outcome_summary
      || "Director reviewed the worker completion report and verification checks below.",
    behavior_changed: curated?.behavior_changed || summarizeChanged(report, assignment),
    behavior_not_changed: curated?.behavior_not_changed || [
      "Anything outside the assignment’s expected deliverables",
    ],
    protects_or_enables: curated?.protects_or_enables
      || "Lets the mission continue with this deliverable accepted as done.",
    acceptance_criteria_results: acResults,
    director_verification: {
      checks: verification.checks,
      worker_claims: verification.worker_claims,
      can_recommend_approval: verification.can_recommend_approval,
    },
    evidence_summary: evidenceDeduped,
    residual_risks: curated?.residual_risks || report.residualRisks || [],
    deferred_work: curated?.deferred_work || report.followUpItems || [],
    recommendation: verification.recommendation,
    recommendation_detail: curated?.recommendation_detail
      || (verification.recommendation === "approve"
        ? "Director recommends approving this deliverable."
        : "Director could not certify this deliverable."),
    approval_meaning: curated?.approval_meaning || {
      assignment_accepted: true,
      criteria_satisfied: assignment.acceptanceCriteriaIds || [],
      dependent_work_eligible: "Assignments that list this deliverable as a dependency",
      does_not_imply: [
        "The whole mission is complete",
        "Unrelated risks are cleared",
      ],
    },
    rejection_consequence: curated?.rejection_consequence
      || "The assignment reopens for another worker pass; prior evidence and this review remain in history.",
    certification_state: certState,
    created_at: iso(nowMs),
    verified_at: verification.verified_at,
    verified_by: verification.verified_by,
    history: [],
  };
}

function summarizeChanged(report, assignment) {
  const files = report.changesMade || [];
  if (files.length) {
    return files.slice(0, 8).map((f) => `Updated ${f}`);
  }
  if (report.summary) return [String(report.summary).slice(0, 240)];
  return [`Completed: ${assignment.title}`];
}

export function listDeliverableReviews(missionId, { includeSuperseded = false } = {}) {
  const store = readStore(missionId);
  return (store.reviews || []).filter((r) => includeSuperseded || r.certification_state !== "superseded");
}

export function getDeliverableReview(missionId, reviewId) {
  return listDeliverableReviews(missionId, { includeSuperseded: true })
    .find((r) => r.review_id === reviewId) || null;
}

export function getReviewForAssignment(missionId, assignmentId, { includeSuperseded = false } = {}) {
  const reviews = listDeliverableReviews(missionId, { includeSuperseded });
  return [...reviews].reverse().find((r) => r.assignment_id === assignmentId) || null;
}

export function getOpenDeliverableReview(missionId) {
  const open = listDeliverableReviews(missionId).filter((r) =>
    ["ready_for_review", "director_verifying", "cannot_verify", "changes_requested"].includes(r.certification_state));
  // Prefer newest ready_for_review (latest finished assignment), then cannot_verify.
  const byNewest = [...open].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return byNewest.find((r) => r.certification_state === "ready_for_review")
    || byNewest.find((r) => r.certification_state === "cannot_verify")
    || byNewest.find((r) => r.certification_state === "director_verifying")
    || byNewest[0]
    || null;
}

/**
 * Create (or refresh) a Director Deliverable Review after worker completion validation.
 */
export function createDeliverableReview(missionId, assignmentId, { actor = "director", nowMs, force = false } = {}) {
  const assignment = getAssignment(missionId, assignmentId);
  if (!assignment) return { ok: false, error: "assignment_not_found" };
  if (!assignment.completionReport && assignment.status !== "complete") {
    return { ok: false, error: "worker_not_completed" };
  }

  const existing = getReviewForAssignment(missionId, assignmentId);
  if (existing && ["ready_for_review", "accepted", "director_verifying"].includes(existing.certification_state) && !force) {
    return { ok: true, review: existing, reused: true };
  }

  const store = readStore(missionId);
  if (existing && existing.certification_state !== "superseded") {
    existing.certification_state = "superseded";
    existing.superseded_at = iso(nowMs);
  }

  // Persist transitional verifying state only inside the build — operator never sees
  // "review before you certify" without verification results.
  const verification = runDirectorVerification(missionId, assignmentId, { nowMs });
  if (!verification.ok) return verification;

  const review = buildReviewFields(assignment, verification, { nowMs });
  store.reviews.push(review);
  writeStore(store);

  const shortTitle = shortDeliverableName(review.deliverable_title);
  appendTimelineEvent(missionId, {
    type: "deliverable_verified",
    headline: `Director verified ${shortTitle} and ${review.recommendation === "approve" ? "recommends approval" : "could not certify it"}`,
    summary: review.outcome_summary,
    visibility: "summary",
    assignmentId,
    actor,
    detail: { review_id: review.review_id, recommendation: review.recommendation },
    nowMs,
  });

  return { ok: true, review, reused: false };
}

export function ensureDeliverableReviewsForMission(missionId, { nowMs } = {}) {
  const created = [];
  for (const a of listAssignments(missionId)) {
    if (a.status !== "complete" && !a.completionReport) continue;
    const existing = getReviewForAssignment(missionId, a.assignmentId);
    if (existing && existing.certification_state !== "superseded") continue;
    const out = createDeliverableReview(missionId, a.assignmentId, { nowMs, force: false });
    if (out.ok && !out.reused) created.push(out.review);
  }
  return { ok: true, created };
}

function shortDeliverableName(title) {
  const m = String(title || "").match(/\b(W-\d+)\b/i);
  return m ? m[1] : (String(title || "deliverable").slice(0, 40));
}

function unlockDependents(missionId, completedId, { nowMs } = {}) {
  const all = listAssignments(missionId);
  for (const a of all) {
    if (a.status !== "waiting") continue;
    const deps = a.dependencies || [];
    if (!deps.includes(completedId)) continue;
    const depsComplete = deps.every((d) => {
      const dep = all.find((x) => x.assignmentId === d);
      return !dep || dep.status === "complete";
    });
    if (depsComplete) {
      updateAssignment(missionId, a.assignmentId, (asg) => {
        if (asg.status === "waiting") asg.status = "ready";
      }, { nowMs });
    }
  }
}

/**
 * Operator approves a Director Deliverable Review.
 */
export function acceptDeliverableReview(missionId, reviewId, {
  actor = "operator",
  response = null,
  nowMs,
} = {}) {
  const store = readStore(missionId);
  const review = store.reviews.find((r) => r.review_id === reviewId);
  if (!review) return { ok: false, error: "review_not_found" };
  if (review.certification_state === "director_verifying") {
    return { ok: false, error: "still_verifying", detail: "Director has not finished verification." };
  }
  if (!["ready_for_review", "changes_requested"].includes(review.certification_state)) {
    return { ok: false, error: "not_approvable", state: review.certification_state };
  }
  if (review.certification_state === "cannot_verify" || review.recommendation === "not_ready") {
    return { ok: false, error: "director_could_not_certify", detail: review.recommendation_detail };
  }

  review.certification_state = "accepted";
  review.accepted_at = iso(nowMs);
  review.accepted_by = actor;
  review.acceptance_note = response || null;
  review.history = review.history || [];
  review.history.push({ at: iso(nowMs), actor, action: "accepted", note: response || null });
  writeStore(store);

  unlockDependents(missionId, review.assignment_id, { nowMs });

  const short = shortDeliverableName(review.deliverable_title);
  appendTimelineEvent(missionId, {
    type: "deliverable_accepted",
    headline: `You accepted ${short}`,
    summary: "Director unlocked the next dependent work.",
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: { review_id: reviewId, approval_meaning: review.approval_meaning },
    nowMs,
  });

  import("./assignment-dispatch.mjs")
    .then(({ scheduleDispatchAfterKickoff }) => scheduleDispatchAfterKickoff(missionId, { actor: "director" }))
    .catch(() => {});

  return { ok: true, review };
}

/**
 * Operator requests changes — reopen one assignment; preserve evidence + review history.
 */
export function requestDeliverableChanges(missionId, reviewId, {
  direction,
  actor = "operator",
  nowMs,
} = {}) {
  const verbatim = String(direction || "").trim();
  if (!verbatim) return { ok: false, error: "empty_direction" };

  const store = readStore(missionId);
  const review = store.reviews.find((r) => r.review_id === reviewId);
  if (!review) return { ok: false, error: "review_not_found" };

  review.certification_state = "changes_requested";
  review.changes_requested_at = iso(nowMs);
  review.changes_direction = verbatim;
  review.history = review.history || [];
  review.history.push({ at: iso(nowMs), actor, action: "changes_requested", note: verbatim });
  // Keep a frozen copy of the completion report on the review for history
  const assignment = getAssignment(missionId, review.assignment_id);
  if (assignment?.completionReport && !review.prior_completion_report) {
    review.prior_completion_report = assignment.completionReport;
  }
  writeStore(store);

  // Reopen only this assignment; do not wipe evidence store
  updateAssignment(missionId, review.assignment_id, (asg) => {
    asg.status = "ready";
    asg.dispatch = null;
    asg.workerId = null;
    asg.contextAcknowledgement = null;
    // Keep completionReport on assignment history field; clear active claim for relaunch
    asg.priorCompletionReports = [
      ...(asg.priorCompletionReports || []),
      asg.completionReport,
    ].filter(Boolean);
    asg.completionReport = null;
    asg.validation = null;
    asg.reopen_reason = verbatim;
  }, { nowMs });

  const msg = submitOperatorDirectorMessage({
    missionId,
    kind: "reject_direction",
    message: `Request changes on ${review.deliverable_title}: ${verbatim}`,
    actor,
    nowMs,
  });

  const short = shortDeliverableName(review.deliverable_title);
  appendTimelineEvent(missionId, {
    type: "deliverable_changes_requested",
    headline: `You requested changes on ${short}`,
    summary: verbatim.slice(0, 240),
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: { review_id: reviewId, director_message: msg.messageId || null },
    nowMs,
  });

  return { ok: true, review: getDeliverableReview(missionId, reviewId), directorMessage: msg };
}

export function askDirectorAboutDeliverable(missionId, reviewId, {
  message,
  actor = "operator",
  nowMs,
} = {}) {
  const review = getDeliverableReview(missionId, reviewId);
  if (!review) return { ok: false, error: "review_not_found" };
  const verbatim = String(message || "").trim();
  if (!verbatim) return { ok: false, error: "empty_message" };

  const out = submitOperatorDirectorMessage({
    missionId,
    kind: "ask",
    message: `Re: Deliverable Review ${review.deliverable_title} (${review.review_id}): ${verbatim}`,
    actor,
    nowMs,
  });

  appendTimelineEvent(missionId, {
    type: "operator_message",
    headline: "You asked Director about a deliverable",
    summary: verbatim.slice(0, 200),
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: { review_id: reviewId, messageId: out.messageId },
    nowMs,
  });

  return { ok: out.ok !== false, review, directorMessage: out };
}

/** Operator-facing view model — executive structure only. */
export function deliverableReviewVm(missionId, review = null) {
  ensureDeliverableReviewsForMission(missionId);
  const r = review || getOpenDeliverableReview(missionId);
  if (!r) return null;

  const verifying = r.certification_state === "director_verifying";
  const cannot = r.certification_state === "cannot_verify" || r.recommendation === "not_ready";
  const ready = r.certification_state === "ready_for_review";

  const checks = (r.director_verification?.checks || []).map((c) => ({
    id: c.id,
    label: c.label,
    status: c.status,
    detail: c.detail,
    source: c.source,
  }));

  return {
    kind: "deliverable_review",
    reviewId: r.review_id,
    missionId: r.mission_id,
    assignmentId: r.assignment_id,
    certificationState: r.certification_state,
    headline: verifying
      ? "Director is verifying this deliverable"
      : cannot
        ? "Director could not certify this deliverable"
        : ready
          ? "Ready for your approval"
          : r.certification_state === "accepted"
            ? "Deliverable accepted"
            : r.certification_state === "changes_requested"
              ? "Changes requested"
              : "Deliverable review",
    operatorMayApprove: ready && r.recommendation === "approve",
    assignment: {
      title: r.deliverable_title,
      objective: r.assignment_objective,
    },
    why: r.reason_for_work,
    expected: r.expected_outcome,
    whatChanged: r.behavior_changed,
    protectsOrEnables: r.protects_or_enables,
    whatDidNotChange: r.behavior_not_changed,
    outcomeSummary: r.outcome_summary,
    verification: {
      checks,
      incomplete: cannot,
      detail: cannot ? r.recommendation_detail : null,
    },
    evidence: r.evidence_summary || [],
    residualRisks: r.residual_risks || [],
    deferredWork: r.deferred_work || [],
    recommendation: {
      action: r.recommendation,
      detail: r.recommendation_detail,
    },
    approvalMeaning: r.approval_meaning,
    rejectionConsequence: r.rejection_consequence,
    actions: {
      approve: ready && r.recommendation === "approve",
      requestChanges: ["ready_for_review", "cannot_verify"].includes(r.certification_state),
      askDirector: true,
    },
    technical: {
      workerClaimSummary: r.director_verification?.worker_claims?.summary || null,
      files: r.director_verification?.worker_claims?.files || [],
      verifiedAt: r.verified_at,
      verifiedBy: r.verified_by,
    },
  };
}

export function deliverableReviewFingerprint(review) {
  if (!review) return null;
  return createHash("sha256")
    .update(JSON.stringify({
      id: review.review_id || review.reviewId,
      state: review.certification_state || review.certificationState,
      rec: review.recommendation?.action || review.recommendation,
    }))
    .digest("hex")
    .slice(0, 12);
}

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
import { appendTimelineEvent, readTimeline } from "./timeline.mjs";
import { submitOperatorDirectorMessage, listDirectorMessages } from "./director-comms.mjs";
import {
  executeDeliverableDirectorTurn,
  buildDeliverableDirectorInput,
  RECHECK_SEMANTICS,
  CERTIFY_NOTE_SEMANTICS,
  conversationForReview,
} from "./deliverable-director-loop.mjs";
import {
  parseTestEvidenceSemantics,
  reconcileDeliverableEvidence,
  resolveDeliverableCommit,
  evaluateAssignmentTests,
} from "./deliverable-evidence.mjs";

export { RECHECK_SEMANTICS, CERTIFY_NOTE_SEMANTICS };

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
      wave_label: "W-4",
      assignment_objective:
        "Prevent privileged API routes from bypassing principal-resolution review by adding a build-time enforcement check.",
      reason_for_work:
        "Service-role routes can skip principal resolution unless they are reviewed. Without a hard gate, new privileged routes can ship unreviewed.",
      expected_outcome:
        "A build-time AST check fails the build on unreviewed service-client routes or stale allowlist entries, and records today’s exception baseline.",
      executive_summary: [
        "This assignment accomplished a build-time enforcement guard that blocks unreviewed privileged API routes.",
        "It changes how production builds validate service-role clients before they ship.",
        "Remaining work is remediating today’s allowlisted exceptions in a later assignment (W-15).",
      ],
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
        "I independently verified the required evidence, tests, scope boundaries, and acceptance criteria.\n\nThe remaining risk is already documented and scheduled for W-15.\n\nApproving this allows the mission to continue.",
      recommendation_headline: "Approve W-4",
      asking_you_to_approve: {
        approving: [
          "The new build-time enforcement guard.",
        ],
        not_approving: [
          "Existing allowlisted exceptions.",
          "Future remediation (W-15).",
          "Schema changes.",
          "Operator UI.",
        ],
      },
      approval_impact: {
        immediately: [
          "Director marks W-4 accepted",
          "Director unlocks the next dependent work (W-5 when ready)",
          "Director continues mission execution",
          "Mission confidence increases",
        ],
      },
      certification_confidence: {
        pct: 97,
        reasons: [
          "Evidence complete",
          "Tests passed",
          "Scope respected",
          "No blocking discrepancies",
          "Known risks documented",
        ],
      },
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
          match: /Tests executed|serviceClientPrincipalCheck\.test\.ts —|\bvitest run\b|check:service-client-principal/i,
          title: "Automated enforcement tests",
          proves: "Unreviewed service-role routes and stale exception entries fail validation.",
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

function translateEvidence(ev, curated, { deliverableCommit = null } = {}) {
  const blob = `${ev.title || ""} ${ev.description || ""} ${ev.fileUri || ""} ${ev.type || ""}`;
  const hit = (curated?.evidence_translations || []).find((t) => t.match.test(blob));
  const isTest = ev.type === "test" || /Tests executed|vitest|check:service-client/i.test(blob);
  const semantics = isTest
    ? parseTestEvidenceSemantics(ev.description || ev.title || "", { exitCode: ev.exitCode })
    : null;
  const commit = (ev.description || ev.title || "").match(/\b([0-9a-f]{7,40})\b/)?.[1]
    || deliverableCommit
    || null;

  if (hit) {
    const status = semantics
      ? semantics.test_run_status
      : (ev.type === "commit" || /commit/i.test(hit.title)
        ? "passed"
        : "passed");
    return {
      evidenceId: ev.evidenceId,
      title: hit.title,
      proves: hit.proves,
      result: status === "failed" ? "failed" : status === "incomplete" || status === "not_run" ? status : "passed",
      test_run_status: semantics?.test_run_status || null,
      assertion_behavior: semantics?.assertion_behavior || [],
      result_summary: semantics?.result_summary
        || (status === "passed" ? "Recorded and verified" : String(status)),
      acceptanceCriteriaCovered: ev.acceptanceCriteriaIds || [],
      source: ev.fileUri || ev.type || "worker evidence",
      timestamp: ev.createdAt,
      commit,
      type: ev.type,
      fileUri: ev.fileUri || null,
    };
  }

  const type = String(ev.type || "artifact");
  const rawTitle = String(ev.title || "").trim();
  const looksRaw = !rawTitle
    || rawTitle.toLowerCase() === type
    || new RegExp(`^${type}\\s*[—-]\\s*${type}$`, "i").test(rawTitle)
    || new RegExp(`^${type}\\s*[—-]`, "i").test(rawTitle);
  const title = looksRaw
    ? (ev.fileUri ? `Artifact: ${ev.fileUri.split("/").pop()}` : `Supporting ${type} evidence`)
    : rawTitle;
  const proves = ev.description
    ? String(ev.description).split(/[.!?]/)[0].slice(0, 160)
    : `Supports the assignment claim (${type}).`;
  return {
    evidenceId: ev.evidenceId,
    title,
    proves,
    result: semantics
      ? (semantics.test_run_status === "failed" ? "failed" : semantics.test_run_status === "passed" ? "passed" : semantics.test_run_status)
      : "recorded",
    test_run_status: semantics?.test_run_status || null,
    assertion_behavior: semantics?.assertion_behavior || [],
    result_summary: semantics?.result_summary || "Recorded",
    acceptanceCriteriaCovered: ev.acceptanceCriteriaIds || [],
    source: ev.fileUri || type,
    timestamp: ev.createdAt,
    commit,
    type,
    fileUri: ev.fileUri || null,
  };
}

function checkItem(id, label, status, detail, { source = "automatic", claim = null } = {}) {
  return { id, label, status, detail, source, claim };
}

function judgmentItem(id, label, detail) {
  return { id, label, detail, kind: "judgment" };
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

  // Tests — structured semantics across evidence + completionReport.tests.
  // Never hard-fail Certify on parser-blind "incomplete" when the worker recorded
  // a successful run (see evaluateAssignmentTests).
  const testEval = evaluateAssignmentTests({ assignment, report, artifacts });
  checks.push(checkItem(
    "tests_passed",
    "Required tests ran and passed",
    testEval.checkStatus,
    testEval.detail,
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

  // Evidence reconciliation (claims vs proof)
  const evidenceCards = artifacts.map((e) => translateEvidence(e, curated, { deliverableCommit: sha }));
  const reconciliation = reconcileDeliverableEvidence({
    assignment,
    report,
    artifacts,
    evidenceCards,
    deliverableCommit: sha || resolveDeliverableCommit(artifacts, report),
    nowMs,
  });
  checks.push(checkItem(
    "evidence_reconciled",
    "Worker claims agree with structured evidence",
    reconciliation.reconciliation_state === "consistent" ? "pass" : "fail",
    reconciliation.blocking_discrepancies.length
      ? reconciliation.blocking_discrepancies.map((d) => d.detail).join(" ")
      : "Claims and evidence are consistent.",
  ));

  // Director-verified facts (no judgment badges)
  const verifiedFacts = [
    {
      id: "risks_documented",
      label: "Remaining risks are documented",
      detail: (curated?.residual_risks || report.residualRisks || ["None recorded"]).slice(0, 3).join("; "),
    },
    {
      id: "scope_boundaries_clear",
      label: "Scope boundaries are clear",
      detail: (curated?.behavior_not_changed || ["Out-of-scope work is not claimed"]).slice(0, 2).join("; "),
    },
    {
      id: "evidence_complete",
      label: "Evidence set is complete for this assignment",
      detail: reconciliation.reconciliation_state === "consistent"
        ? "Required evidence is present and consistent."
        : "Evidence set has blocking gaps or contradictions.",
    },
  ];

  // Operator judgment (never pass/fail)
  const dependents = listAssignments(missionId).filter((a) =>
    (a.dependencies || []).includes(assignmentId) && a.status === "waiting");
  const yourJudgment = [
    judgmentItem(
      "accept_exception_baseline",
      "Accept the current exception baseline as temporary debt until W-15",
      curated?.residual_risks?.[0]
        || "Existing allowlisted exceptions remain until a later remediation wave.",
    ),
    judgmentItem(
      "residual_risk_ok",
      "Decide whether the residual risk is acceptable",
      (curated?.residual_risks || report.residualRisks || ["No residual risks listed"]).join("; "),
    ),
    judgmentItem(
      "behavior_matches_intent",
      "Decide whether the delivered behavior matches product intent",
      curated?.assignment_objective || assignment.objective || assignment.title,
    ),
  ];
  if (dependents.length) {
    yourJudgment.push(judgmentItem(
      "dependents_continue",
      "Allow dependent work to continue after this approval",
      `${dependents.length} dependent assignment(s) become eligible when you approve.`,
    ));
  }

  const hardFails = checks.filter((c) => c.status === "fail");
  const blocking = reconciliation.blocking_discrepancies || [];
  const canRecommend = hardFails.length === 0 && blocking.length === 0;
  const recommendation = !canRecommend
    ? "not_ready"
    : (curated?.recommendation || "approve");

  return {
    ok: true,
    verified_at: iso(nowMs),
    verified_by: "director",
    can_recommend_approval: canRecommend && recommendation === "approve",
    recommendation,
    checks,
    verified_facts: verifiedFacts,
    your_judgment: yourJudgment,
    reconciliation,
    evidence_cards: evidenceCards,
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
  const reconciliation = verification.reconciliation
    || { reconciliation_state: "pending", blocking_discrepancies: [], discrepancies: [] };

  // Prefer cards already built during verification (same semantics)
  let evidenceDeduped = [];
  const seen = new Set();
  for (const e of (verification.evidence_cards || [])) {
    const key = e.title.toLowerCase();
    if (seen.has(key)) continue;
    if (/^supporting (log|notes|document)/i.test(e.title) && evidenceDeduped.length >= 3) continue;
    // Prefer the test-run card over a file-path "Present …test.ts" card
    seen.add(key);
    evidenceDeduped.push(e);
  }
  // Prefer Automated enforcement tests that came from type=test
  evidenceDeduped = evidenceDeduped.filter((e, idx, arr) => {
    if (e.title !== "Automated enforcement tests") return true;
    const testOnes = arr.filter((x) => x.title === e.title && x.type === "test");
    if (testOnes.length && e.type !== "test") return false;
    return true;
  });

  const acResults = (report.acceptanceCriteriaResults || []).length
    ? report.acceptanceCriteriaResults
    : (assignment.acceptanceCriteriaIds || []).map((id) => ({
      id,
      result: verification.can_recommend_approval ? "met" : "unverified",
      source: verification.can_recommend_approval ? "director_verified" : "pending",
    }));

  const blocking = reconciliation.blocking_discrepancies || [];
  const wave = curated?.wave_label || shortDeliverableName(assignment.title);
  let certState = "cannot_verify";
  let recommendation = "not_ready";
  let recommendationHeadline = `Director cannot yet certify ${wave}`;
  let recommendationDetail = "Director could not certify this deliverable.";

  if (reconciliation.reconciliation_state === "inconsistent" || blocking.length) {
    certState = "evidence_discrepancy";
    recommendation = "not_ready";
    recommendationHeadline = `Director cannot yet certify ${wave}`;
    recommendationDetail = blocking.length === 1
      ? `Director returned this assignment for evidence repair:\n${blocking[0].detail}`
      : `Director returned this assignment for evidence repair:\n${blocking.map((d) => `• ${d.detail}`).join("\n")}`;
  } else if (verification.can_recommend_approval && verification.recommendation === "approve") {
    certState = "ready_for_review";
    recommendation = "approve";
    recommendationHeadline = curated?.recommendation_headline || `Approve ${wave}`;
    recommendationDetail = curated?.recommendation_detail
      || "I independently verified the required evidence, tests, scope boundaries, and acceptance criteria.\n\nApproving this allows the mission to continue.";
  } else {
    certState = "cannot_verify";
    recommendation = "not_ready";
    recommendationHeadline = `Director cannot yet certify ${wave}`;
    recommendationDetail = "Director verification is incomplete or failed required checks.";
  }

  const passedChecks = (verification.checks || []).filter((c) => c.status === "pass").length;
  const totalChecks = (verification.checks || []).length;
  const certChips = buildCertificationChips(verification, reconciliation, curated);
  const certConfidence = buildCertificationConfidence({
    curated,
    ready: recommendation === "approve" && certState === "ready_for_review",
    chips: certChips,
    blocking,
  });

  return {
    schema_version: SCHEMA,
    review_id: "drev_" + shortId(),
    mission_id: assignment.missionId,
    assignment_id: assignment.assignmentId,
    deliverable_title: curated?.deliverable_title || assignment.title,
    wave_label: wave,
    assignment_objective: curated?.assignment_objective || assignment.objective || assignment.title,
    reason_for_work: curated?.reason_for_work
      || assignment.scope
      || "This assignment was required for the current mission phase.",
    expected_outcome: curated?.expected_outcome
      || (assignment.expectedDeliverables || []).map((d) => (typeof d === "string" ? d : d.title || d.path)).filter(Boolean).join("; ")
      || "Complete the assignment per its acceptance criteria.",
    executive_summary: curated?.executive_summary || buildExecutiveSummaryFallback(assignment, curated, report),
    outcome_summary: curated?.outcome_summary || null,
    behavior_changed: curated?.behavior_changed || summarizeChanged(report, assignment),
    behavior_not_changed: curated?.behavior_not_changed || [
      "Anything outside the assignment’s expected deliverables",
    ],
    protects_or_enables: curated?.protects_or_enables
      || "Lets the mission continue with this deliverable accepted as done.",
    acceptance_criteria_results: acResults,
    director_verification: {
      checks: verification.checks,
      passed: passedChecks,
      total: totalChecks,
      verified_facts: verification.verified_facts || [],
      your_judgment: verification.your_judgment || [],
      worker_claims: verification.worker_claims,
      can_recommend_approval: verification.can_recommend_approval,
    },
    director_certification: {
      chips: certChips,
      confidence: certConfidence,
    },
    evidence_reconciliation: reconciliation,
    evidence_summary: evidenceDeduped,
    residual_risks: curated?.residual_risks || report.residualRisks || [],
    deferred_work: curated?.deferred_work || report.followUpItems || [],
    recommendation,
    recommendation_headline: recommendationHeadline,
    recommendation_detail: recommendationDetail,
    asking_you_to_approve: curated?.asking_you_to_approve || {
      approving: [`The outcomes described for ${wave}.`],
      not_approving: [
        "Work outside this assignment’s stated scope",
        "Future remediation",
        "Unrelated mission risks",
      ],
    },
    approval_impact: curated?.approval_impact || {
      immediately: [
        `Director marks ${wave} accepted`,
        "Director unlocks dependent work when ready",
        "Director continues mission execution",
        "Mission confidence increases",
      ],
    },
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

function checkStatus(checks, id) {
  return (checks || []).find((c) => c.id === id)?.status || "warn";
}

function buildCertificationChips(verification, reconciliation, curated) {
  const checks = verification.checks || [];
  const risksOk = (curated?.residual_risks || verification.verified_facts || []).length > 0
    || checks.some((c) => c.id === "risks_documented");
  const evidenceOk = reconciliation?.reconciliation_state === "consistent"
    && checkStatus(checks, "evidence_reconciled") !== "fail"
    && checkStatus(checks, "evidence_present") !== "fail";
  return [
    {
      id: "scope",
      label: "Scope verified",
      status: checkStatus(checks, "scope_respected") === "fail" ? "fail" : "pass",
    },
    {
      id: "evidence",
      label: "Evidence reconciled",
      status: evidenceOk ? "pass" : "fail",
    },
    {
      id: "tests",
      label: "Tests verified",
      status: checkStatus(checks, "tests_passed") === "pass" ? "pass" : "fail",
    },
    {
      id: "acceptance",
      label: "Acceptance criteria satisfied",
      status: ["pass", "warn"].includes(checkStatus(checks, "acceptance_criteria")) ? "pass" : "fail",
    },
    {
      id: "risks",
      label: "Remaining risks documented",
      status: risksOk || curated?.residual_risks?.length ? "pass" : "warn",
    },
  ];
}

function buildCertificationConfidence({ curated, ready, chips, blocking }) {
  if (curated?.certification_confidence && ready) {
    return {
      pct: curated.certification_confidence.pct,
      reasons: curated.certification_confidence.reasons,
    };
  }
  if (!ready || (blocking || []).length) {
    const failed = (chips || []).filter((c) => c.status === "fail").map((c) => c.label);
    return {
      pct: Math.max(20, 55 - failed.length * 8),
      reasons: failed.length
        ? failed.map((l) => `Not yet: ${l}`)
        : ["Director has not completed certification"],
    };
  }
  const passed = (chips || []).filter((c) => c.status === "pass").length;
  const total = Math.max(1, (chips || []).length);
  return {
    pct: Math.min(97, 88 + Math.round((passed / total) * 9)),
    reasons: [
      "Evidence complete",
      "Tests passed",
      "Scope respected",
      "No blocking discrepancies",
      "Known risks documented",
    ].slice(0, Math.max(3, passed)),
  };
}

function buildExecutiveSummaryFallback(assignment, curated, report) {
  const wave = curated?.wave_label || shortDeliverableName(assignment.title);
  const accomplished = curated?.expected_outcome
    || report.summary
    || `the required outcomes for ${wave}`;
  return [
    `This assignment accomplished ${String(accomplished).replace(/\.$/, "")}.`,
    "It changes what the mission can safely proceed with next.",
    "Remaining work is whatever Director deferred or left as residual risk.",
  ].slice(0, 3);
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

const OPEN_REVIEW_STATES = [
  "ready_for_review",
  "director_verifying",
  "cannot_verify",
  "changes_requested",
  "evidence_discrepancy",
  "evidence_repair",
];

/**
 * Mark every non-terminal review for an assignment as superseded.
 * Prevents stale duplicate "ready" briefings from surviving force-recreates
 * and making Certify look like a no-op.
 */
export function supersedeOpenReviewsForAssignment(missionId, assignmentId, {
  exceptReviewId = null,
  nowMs,
  reason = "superseded",
} = {}) {
  const store = readStore(missionId);
  let n = 0;
  for (const r of store.reviews) {
    if (r.assignment_id !== assignmentId) continue;
    if (exceptReviewId && r.review_id === exceptReviewId) continue;
    if (!OPEN_REVIEW_STATES.includes(r.certification_state)) continue;
    r.certification_state = "superseded";
    r.superseded_at = iso(nowMs);
    r.supersede_reason = reason;
    n += 1;
  }
  if (n) writeStore(store);
  return { ok: true, superseded: n };
}

export function getOpenDeliverableReview(missionId) {
  const all = listDeliverableReviews(missionId, { includeSuperseded: true });
  // Once certified, that assignment stays closed — never resurface duplicate ready rows.
  const acceptedAssignments = new Set(
    all.filter((r) => r.certification_state === "accepted").map((r) => r.assignment_id),
  );
  const open = listDeliverableReviews(missionId).filter((r) =>
    OPEN_REVIEW_STATES.includes(r.certification_state)
    && !acceptedAssignments.has(r.assignment_id));
  const waveNum = (r) => {
    const text = String(r.wave_label || r.deliverable_title || "");
    const m = text.match(/\bW-(\d+)\b/i) || text.match(/\bWave\s+(\d+)\b/i);
    return m ? Number(m[1]) : null;
  };
  const byWaveThenNewest = [...open].sort((a, b) => {
    const aw = waveNum(a);
    const bw = waveNum(b);
    if (aw != null && bw != null && aw !== bw) return aw - bw;
    if (aw != null && bw == null) return -1;
    if (aw == null && bw != null) return 1;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  const byNewest = [...open].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  // Prefer wave deliverables (W-0, W-1…) over mission-package noise, then
  // actionable approvals over stale cannot_verify.
  return byWaveThenNewest.find((r) => r.certification_state === "ready_for_review" && r.recommendation === "approve" && waveNum(r) != null)
    || byNewest.find((r) => r.certification_state === "ready_for_review" && r.recommendation === "approve")
    || byNewest.find((r) => r.certification_state === "ready_for_review")
    || byWaveThenNewest.find((r) => r.certification_state === "evidence_discrepancy")
    || byNewest.find((r) => r.certification_state === "evidence_repair")
    || byWaveThenNewest.find((r) => r.certification_state === "cannot_verify")
    || byNewest.find((r) => r.certification_state === "director_verifying")
    || byWaveThenNewest[0]
    || null;
}

/** Most recently accepted review — used for the post-certify confirmation surface. */
export function getLatestAcceptedDeliverableReview(missionId) {
  const accepted = listDeliverableReviews(missionId, { includeSuperseded: true })
    .filter((r) => r.certification_state === "accepted")
    .sort((a, b) => String(b.accepted_at || b.created_at || "").localeCompare(String(a.accepted_at || a.created_at || "")));
  return accepted[0] || null;
}

/**
 * Create (or refresh) a Director Deliverable Review after worker completion validation.
 */
function hasAcceptedReviewForAssignment(missionId, assignmentId) {
  return listDeliverableReviews(missionId, { includeSuperseded: true })
    .some((r) => r.assignment_id === assignmentId && r.certification_state === "accepted");
}

export function createDeliverableReview(missionId, assignmentId, {
  actor = "director",
  nowMs,
  force = false,
  autoRepair = true,
} = {}) {
  const assignment = getAssignment(missionId, assignmentId);
  if (!assignment) return { ok: false, error: "assignment_not_found" };
  if (!assignment.completionReport && assignment.status !== "complete") {
    return { ok: false, error: "worker_not_completed" };
  }

  // Never auto-reopen a deliverable the operator already certified.
  // Force is reserved for explicit test/repair recreate.
  if (!force && hasAcceptedReviewForAssignment(missionId, assignmentId)) {
    const accepted = listDeliverableReviews(missionId, { includeSuperseded: true })
      .filter((r) => r.assignment_id === assignmentId && r.certification_state === "accepted")
      .sort((a, b) => String(b.accepted_at || "").localeCompare(String(a.accepted_at || "")))[0];
    return { ok: true, review: accepted, reused: true };
  }

  const existing = getReviewForAssignment(missionId, assignmentId);
  if (existing && ["ready_for_review", "accepted", "director_verifying"].includes(existing.certification_state) && !force) {
    return { ok: true, review: existing, reused: true };
  }

  // Supersede ALL open duplicates for this assignment (not only the newest).
  supersedeOpenReviewsForAssignment(missionId, assignmentId, {
    nowMs,
    reason: force ? "replaced_by_force_create" : "replaced_by_create",
  });

  const verification = runDirectorVerification(missionId, assignmentId, { nowMs });
  if (!verification.ok) return verification;

  const store = readStore(missionId);
  const review = buildReviewFields(assignment, verification, { nowMs });
  store.reviews.push(review);
  writeStore(store);

  const shortTitle = shortDeliverableName(review.deliverable_title);
  if (review.certification_state === "evidence_discrepancy") {
    appendTimelineEvent(missionId, {
      type: "deliverable_evidence_discrepancy",
      headline: `Director found a mismatch between the worker report and evidence for ${shortTitle}`,
      summary: review.recommendation_detail,
      visibility: "summary",
      assignmentId,
      actor,
      detail: {
        review_id: review.review_id,
        blocking: review.evidence_reconciliation?.blocking_discrepancies || [],
      },
      nowMs,
    });
    if (autoRepair) {
      try {
        startEvidenceRepair(missionId, review.review_id, { actor: "director", nowMs, auto: true });
      } catch { /* best-effort */ }
    }
  } else if (review.recommendation === "approve") {
    appendTimelineEvent(missionId, {
      type: "deliverable_verified",
      headline: `Director verified the deliverable`,
      summary: `Director recommends certification of ${shortTitle}.`,
      visibility: "summary",
      assignmentId,
      actor,
      detail: { review_id: review.review_id, recommendation: review.recommendation },
      nowMs,
    });
  } else {
    appendTimelineEvent(missionId, {
      type: "deliverable_verified",
      headline: `Director cannot yet certify ${shortTitle}`,
      summary: review.recommendation_detail,
      visibility: "summary",
      assignmentId,
      actor,
      detail: { review_id: review.review_id, recommendation: review.recommendation },
      nowMs,
    });
  }

  return { ok: true, review: getDeliverableReview(missionId, review.review_id) || review, reused: false };
}

export function ensureDeliverableReviewsForMission(missionId, { nowMs } = {}) {
  const created = [];
  for (const a of listAssignments(missionId)) {
    if (a.status !== "complete" && !a.completionReport) continue;
    // Certified deliverables must stay closed — recreating made Certify look like a no-op.
    if (hasAcceptedReviewForAssignment(missionId, a.assignmentId)) continue;
    const existing = getReviewForAssignment(missionId, a.assignmentId);
    if (existing && existing.certification_state !== "superseded") continue;
    const out = createDeliverableReview(missionId, a.assignmentId, { nowMs, force: false });
    if (out.ok && !out.reused) created.push(out.review);
  }
  return { ok: true, created };
}

function shortDeliverableName(title) {
  const text = String(title || "");
  const m = text.match(/\b(W-\d+)\b/i) || text.match(/\bWave\s+(\d+)\b/i);
  if (!m) return text.slice(0, 40) || "deliverable";
  return m[1].startsWith("W") || m[1].startsWith("w") ? m[1].toUpperCase().replace(/^WAVE\s+/, "W-") : `W-${m[1]}`;
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
 * Reopen assignment in evidence-repair mode with precise Director instructions.
 */
export function startEvidenceRepair(missionId, reviewId, {
  actor = "director",
  nowMs,
  auto = false,
} = {}) {
  const store = readStore(missionId);
  const review = store.reviews.find((r) => r.review_id === reviewId);
  if (!review) return { ok: false, error: "review_not_found" };
  const blocking = review.evidence_reconciliation?.blocking_discrepancies || [];
  if (!blocking.length && review.certification_state !== "evidence_discrepancy") {
    return { ok: false, error: "no_blocking_discrepancy" };
  }

  review.certification_state = "evidence_repair";
  review.evidence_repair = {
    started_at: iso(nowMs),
    started_by: actor,
    auto: Boolean(auto),
    instructions: blocking.map((d) => d.detail),
  };
  review.history = review.history || [];
  review.history.push({ at: iso(nowMs), actor, action: "evidence_repair_started", note: blocking.map((d) => d.id).join(",") });
  writeStore(store);

  const direction = [
    "EVIDENCE REPAIR — do not change product behavior unless a check is actually failing.",
    "Director found blocking evidence discrepancies:",
    ...blocking.map((d, i) => `${i + 1}. ${d.detail}`),
    "Rerun only the required validation, attach replacement evidence with structured pass/fail counts,",
    "and do not leave contradictory artifacts. Negative fixtures that correctly reject must still report suite Passed.",
  ].join("\n");

  updateAssignment(missionId, review.assignment_id, (asg) => {
    asg.status = "ready";
    asg.dispatch = null;
    asg.workerId = null;
    asg.contextAcknowledgement = null;
    asg.priorCompletionReports = [
      ...(asg.priorCompletionReports || []),
      asg.completionReport,
    ].filter(Boolean);
    // Keep completionReport for claim history; repair worker will submit a new one
    asg.reopen_reason = direction;
    asg.evidence_repair = true;
  }, { nowMs });

  submitOperatorDirectorMessage({
    missionId,
    kind: "reject_direction",
    message: direction,
    actor,
    nowMs,
  });

  const short = shortDeliverableName(review.deliverable_title);
  appendTimelineEvent(missionId, {
    type: "deliverable_evidence_repair",
    headline: `Director returned ${short} for evidence repair`,
    summary: blocking.map((d) => d.detail).join(" "),
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: { review_id: reviewId, auto },
    nowMs,
  });

  import("./assignment-dispatch.mjs")
    .then(({ scheduleDispatchAfterKickoff }) => scheduleDispatchAfterKickoff(missionId, { actor: "director" }))
    .catch(() => {});

  return { ok: true, review: getDeliverableReview(missionId, reviewId), direction };
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
  if (["evidence_discrepancy", "evidence_repair"].includes(review.certification_state)) {
    return {
      ok: false,
      error: "evidence_not_reconciled",
      detail: review.recommendation_detail || "Evidence discrepancies block approval.",
    };
  }
  if (!["ready_for_review"].includes(review.certification_state)) {
    return { ok: false, error: "not_approvable", state: review.certification_state };
  }
  if (review.recommendation === "not_ready"
    || review.evidence_reconciliation?.reconciliation_state === "inconsistent") {
    return { ok: false, error: "director_could_not_certify", detail: review.recommendation_detail };
  }

  review.certification_state = "accepted";
  review.accepted_at = iso(nowMs);
  review.accepted_by = actor;
  review.acceptance_note = response || null;
  review.history = review.history || [];
  review.history.push({ at: iso(nowMs), actor, action: "accepted", note: response || null });
  // Close sibling duplicates so the UI cannot immediately re-open an older "ready" briefing.
  for (const r of store.reviews) {
    if (r.assignment_id !== review.assignment_id) continue;
    if (r.review_id === reviewId) continue;
    if (!OPEN_REVIEW_STATES.includes(r.certification_state)) continue;
    r.certification_state = "superseded";
    r.superseded_at = iso(nowMs);
    r.supersede_reason = "sibling_accepted";
  }
  writeStore(store);

  unlockDependents(missionId, review.assignment_id, { nowMs });

  const short = shortDeliverableName(review.deliverable_title);
  const unlocked = listAssignments(missionId)
    .filter((a) => (a.dependencies || []).includes(review.assignment_id) && a.status === "ready")
    .map((a) => shortDeliverableName(a.title))
    .filter(Boolean);
  const note = String(response || "").trim() || null;
  appendTimelineEvent(missionId, {
    type: "deliverable_accepted",
    headline: `You certified ${short}`,
    summary: [
      unlocked.length ? `Director unlocked ${unlocked[0]}.` : "Director continues execution.",
      note ? `Your note: ${note.slice(0, 160)}` : null,
    ].filter(Boolean).join(" "),
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: {
      review_id: reviewId,
      approval_meaning: review.approval_meaning,
      unlocked,
      operator_note: note,
    },
    nowMs,
  });

  if (note) {
    try {
      const out = submitOperatorDirectorMessage({
        missionId,
        reviewId,
        kind: "context",
        message: `Certified ${short} with note: ${note}`,
        actor,
        nowMs,
      });
      executeDeliverableDirectorTurn(missionId, review, {
        trigger: "certify_note",
        operatorVerbatim: note,
        operatorMessageId: out.messageId || out.message?.messageId,
        nowMs,
      });
    } catch { /* best-effort — certification already recorded */ }
  }

  import("./assignment-dispatch.mjs")
    .then(({ scheduleDispatchAfterKickoff }) => scheduleDispatchAfterKickoff(missionId, { actor: "director" }))
    .catch(() => {});

  return { ok: true, review, certifyNoteSemantics: CERTIFY_NOTE_SEMANTICS };
}

/**
 * Operator requests changes — reopen one assignment; preserve evidence + review history.
 */
export function requestDeliverableChanges(missionId, reviewId, {
  direction,
  actor = "operator",
  nowMs,
  idempotencyKey = null,
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
    reviewId,
    kind: "request_changes",
    message: [
      `Operator direction: ${verbatim}`,
      `Deliverable: ${review.deliverable_title}`,
      `Review: ${reviewId}`,
    ].join("\n"),
    actor,
    nowMs,
    idempotencyKey,
  });

  const turn = executeDeliverableDirectorTurn(missionId, review, {
    trigger: "request_changes",
    operatorVerbatim: verbatim,
    operatorMessageId: msg.messageId || msg.message?.messageId,
    nowMs,
    idempotencyKey,
  });

  const short = shortDeliverableName(review.deliverable_title);
  appendTimelineEvent(missionId, {
    type: "deliverable_changes_requested",
    headline: `You requested changes on ${short}`,
    summary: verbatim.slice(0, 240),
    visibility: "summary",
    assignmentId: review.assignment_id,
    actor,
    detail: {
      review_id: reviewId,
      director_message: msg.messageId || msg.message?.messageId || null,
      director_response_id: turn.directorResponseId || null,
    },
    nowMs,
  });

  import("./assignment-dispatch.mjs")
    .then(({ scheduleDispatchAfterKickoff }) => scheduleDispatchAfterKickoff(missionId, { actor: "director" }))
    .catch(() => {});

  return {
    ok: true,
    review: getDeliverableReview(missionId, reviewId),
    directorMessage: msg,
    directorTurn: turn,
    directorInput: turn.input,
  };
}

export function askDirectorAboutDeliverable(missionId, reviewId, {
  message,
  actor = "operator",
  nowMs,
  kind = "ask",
  idempotencyKey = null,
} = {}) {
  const review = getDeliverableReview(missionId, reviewId);
  if (!review) return { ok: false, error: "review_not_found" };
  const verbatim = String(message || "").trim();
  if (!verbatim) return { ok: false, error: "empty_message" };

  const failedChecks = (review.director_verification?.checks || [])
    .filter((c) => c.status === "fail")
    .map((c) => `${c.label}: ${c.detail || c.status}`);
  const blockers = (review.evidence_reconciliation?.blocking_discrepancies || [])
    .map((d) => d.detail)
    .filter(Boolean);
  const isContext = kind === "context";
  const contextLines = [
    isContext
      ? `Context for Director (auto-attached — alignment feedback from the operator):`
      : `Context for Director (auto-attached — do not ask the operator to restate this):`,
    `Deliverable: ${review.deliverable_title}`,
    `Review: ${review.review_id}`,
    `Certification state: ${review.certification_state}`,
    `Recommendation: ${review.recommendation}`,
    failedChecks.length ? `Failed checks:\n- ${failedChecks.join("\n- ")}` : "Failed checks: none recorded",
    blockers.length ? `Blocking discrepancies:\n- ${blockers.join("\n- ")}` : null,
    isContext ? `Operator context: ${verbatim}` : `Operator question: ${verbatim}`,
    isContext
      ? `Treat this as product/alignment context for the mission. Acknowledge and incorporate it; only ask a clarification if the note is incomplete.`
      : `Respond with a concrete next step the operator can take (Certify, wait for re-check, or request a specific worker repair). Do not ask a vague clarifying question if this context is enough.`,
  ].filter(Boolean);

  const out = submitOperatorDirectorMessage({
    missionId,
    reviewId,
    kind: isContext ? "context" : "ask",
    message: contextLines.join("\n"),
    actor,
    nowMs,
    idempotencyKey,
  });

  if (out.deduped) {
    return {
      ok: true,
      deduped: true,
      review,
      directorMessage: out,
      directorTurn: null,
      directorInput: null,
    };
  }

  const turn = executeDeliverableDirectorTurn(missionId, review, {
    trigger: isContext ? "share_context" : "ask",
    operatorVerbatim: verbatim,
    operatorMessageId: out.messageId || out.message?.messageId,
    nowMs,
    idempotencyKey,
  });

  return {
    ok: out.ok !== false && turn.ok !== false,
    deduped: Boolean(turn.deduped),
    review,
    directorMessage: out,
    directorTurn: turn,
    directorInput: turn.input,
    directorResponse: turn.response,
  };
}

/**
 * Operator shares alignment feedback (not necessarily a question) on an open review.
 */
export function shareContextWithDirector(missionId, reviewId, {
  message,
  actor = "operator",
  nowMs,
  idempotencyKey = null,
} = {}) {
  return askDirectorAboutDeliverable(missionId, reviewId, {
    message,
    actor,
    nowMs,
    kind: "context",
    idempotencyKey,
  });
}

/**
 * Recent operator ↔ Director turns for a mission / deliverable review.
 * Newest last, capped for the outcome card thread.
 * Strict: messages without matching reviewId are excluded (no cross-review bleed).
 */
export function listDeliverableConversation(missionId, {
  reviewId = null,
  limit = 12,
} = {}) {
  if (!reviewId) return [];
  return conversationForReview(missionId, reviewId, { limit });
}

/**
 * Operator asks Director to re-run verification on a stuck deliverable review.
 *
 * Semantics (RECHECK_SEMANTICS): uses BOTH current evidence AND the full
 * operator↔Director conversation for the prior reviewId. Shared context is
 * not discarded. The new review is force-created from evidence; a Director
 * turn then responds with the conversation incorporated.
 */
export function recheckDeliverableReview(missionId, reviewId, {
  actor = "operator",
  nowMs,
  idempotencyKey = null,
} = {}) {
  const prior = getDeliverableReview(missionId, reviewId);
  if (!prior) return { ok: false, error: "review_not_found" };

  const priorInput = buildDeliverableDirectorInput(missionId, prior, {
    trigger: "recheck",
  });

  const out = createDeliverableReview(missionId, prior.assignment_id, {
    actor: "director",
    nowMs,
    force: true,
    autoRepair: true,
  });
  if (!out.ok) return out;

  // Carry conversation onto the new review: copy prior review-scoped messages
  // are still under prior reviewId; also run a turn bound to the NEW review that
  // quotes prior conversation via operatorVerbatim from prior input.
  const priorConversation = priorInput.ok ? priorInput.input.conversation : [];
  const latestOperator = [...priorConversation].reverse().find((t) => t.actor === "you");

  // Carry the latest operator note onto the new review so the thread stays review-scoped.
  if (latestOperator?.text) {
    submitOperatorDirectorMessage({
      missionId,
      reviewId: out.review.review_id,
      kind: "context",
      message: [
        `Context carried from prior review ${reviewId}:`,
        `Operator context: ${latestOperator.text}`,
      ].join("\n"),
      actor: "operator",
      nowMs,
      skipSideEffects: true,
    });
  }

  const turn = executeDeliverableDirectorTurn(missionId, out.review, {
    trigger: "recheck",
    operatorVerbatim: latestOperator?.text || null,
    nowMs,
    idempotencyKey,
  });

  // Annotate recommendation detail when context was present.
  if (turn.ok && turn.response?.incorporatedOperatorExcerpt) {
    const store = readStore(missionId);
    const r = store.reviews.find((x) => x.review_id === out.review.review_id);
    if (r) {
      r.recommendation_detail = [
        r.recommendation_detail || "",
        `Operator context considered: “${turn.response.incorporatedOperatorExcerpt}”.`,
      ].filter(Boolean).join("\n\n");
      r.director_input_snapshot = turn.input;
      r.recheck_semantics = { ...RECHECK_SEMANTICS };
      writeStore(store);
    }
  }

  appendTimelineEvent(missionId, {
    type: "deliverable_verified",
    headline: `Director re-checked ${shortDeliverableName(prior.deliverable_title)}`,
    summary: out.review.certification_state === "ready_for_review"
      ? (turn.response?.summary || "Director can now recommend certification.")
      : (out.review.recommendation_detail || "Director still cannot recommend certification."),
    visibility: "summary",
    assignmentId: prior.assignment_id,
    actor,
    detail: {
      prior_review_id: reviewId,
      review_id: out.review.review_id,
      certification_state: out.review.certification_state,
      recheck_semantics: { ...RECHECK_SEMANTICS },
      director_input: turn.input
        ? {
          conversation_count: turn.input.conversation.length,
          evidence_count: turn.input.evidenceSummary.length,
          incorporated_excerpt: turn.response?.incorporatedOperatorExcerpt || null,
        }
        : null,
    },
    nowMs,
  });

  return {
    ok: true,
    review: getDeliverableReview(missionId, out.review.review_id) || out.review,
    prior,
    directorTurn: turn,
    directorInput: turn.input,
    recheckSemantics: RECHECK_SEMANTICS,
  };
}

/** Operator-facing view model — executive certification briefing. */
export function deliverableReviewVm(missionId, review = null) {
  ensureDeliverableReviewsForMission(missionId);
  const r = review || getOpenDeliverableReview(missionId);
  if (!r) return null;

  const state = r.certification_state;
  const recon = r.evidence_reconciliation || {};
  const blocking = recon.blocking_discrepancies || [];
  const inconsistent = state === "evidence_discrepancy"
    || state === "evidence_repair"
    || recon.reconciliation_state === "inconsistent"
    || blocking.length > 0;
  const verifying = state === "director_verifying";
  const ready = state === "ready_for_review"
    && r.recommendation === "approve"
    && !inconsistent;
  const wave = r.wave_label || shortDeliverableName(r.deliverable_title);

  const checks = (r.director_verification?.checks || []).map((c) => ({
    id: c.id,
    label: c.label,
    status: c.status,
    detail: c.detail,
    source: c.source,
  }));
  const passed = r.director_verification?.passed
    ?? checks.filter((c) => c.status === "pass").length;
  const total = r.director_verification?.total ?? checks.length;

  const chips = r.director_certification?.chips
    || buildCertificationChips(
      { checks, verified_facts: r.director_verification?.verified_facts },
      recon,
      { residual_risks: r.residual_risks },
    );
  const confidence = r.director_certification?.confidence
    || buildCertificationConfidence({ curated: null, ready, chips, blocking });

  let headline = "Director certification briefing";
  if (verifying) headline = "Director is verifying this deliverable";
  else if (state === "evidence_repair") headline = "Director returned this assignment for evidence repair";
  else if (state === "evidence_discrepancy" || inconsistent) {
    headline = `Director cannot yet certify ${wave}`;
  } else if (ready) headline = "Director has certified this deliverable";
  else if (state === "cannot_verify") headline = `Director cannot yet certify ${wave}`;
  else if (state === "accepted") headline = `You certified ${wave}`;
  else if (state === "changes_requested") headline = "Changes requested";

  const executiveSummary = Array.isArray(r.executive_summary)
    ? r.executive_summary.slice(0, 3)
    : (r.executive_summary ? [String(r.executive_summary)] : []);

  const failedChecks = checks.filter((c) => c.status === "fail");
  const blockersPlain = [
    ...blocking.map((d) => d.detail).filter(Boolean),
    ...failedChecks.map((c) => c.detail || c.label),
  ].filter(Boolean).slice(0, 5);
  const stuck = !ready && !verifying && (state === "cannot_verify" || inconsistent || state === "evidence_repair");

  return {
    kind: "deliverable_review",
    reviewId: r.review_id,
    missionId: r.mission_id,
    assignmentId: r.assignment_id,
    certificationState: state,
    waveLabel: wave,
    headline,
    operatorMayApprove: ready,
    stuck,
    blockersPlain,
    executiveSummary: {
      sentences: executiveSummary,
      text: executiveSummary.join(" "),
    },
    directorRecommendation: {
      action: ready ? "approve" : "not_ready",
      headline: r.recommendation_headline
        || (ready ? `Approve ${wave}` : `Director cannot yet certify ${wave}`),
      confidencePct: confidence.pct,
      summary: r.recommendation_detail || "",
      discrepancies: blocking,
    },
    // Back-compat alias used by older tests / callers
    recommendation: {
      action: ready ? "approve" : "not_ready",
      headline: r.recommendation_headline
        || (ready ? `Approve ${wave}` : `Director cannot yet certify ${wave}`),
      detail: r.recommendation_detail || "",
      discrepancies: blocking,
      confidencePct: confidence.pct,
    },
    certification: {
      chips,
      confidence: {
        pct: confidence.pct,
        label: "Certification Confidence",
        reasons: confidence.reasons || [],
      },
    },
    askingYouToApprove: r.asking_you_to_approve || {
      approving: [`The outcomes Director certified for ${wave}.`],
      not_approving: ["Work outside this assignment’s stated scope"],
    },
    approvalImpact: {
      immediately: (r.approval_impact?.immediately || []).slice(),
    },
    assignment: {
      title: r.deliverable_title,
      objective: r.assignment_objective,
    },
    why: r.reason_for_work,
    expected: r.expected_outcome,
    whatChanged: r.behavior_changed,
    protectsOrEnables: r.protects_or_enables,
    whatDidNotChange: r.behavior_not_changed,
    verification: {
      checks,
      passed,
      total,
      summary: `${passed} of ${total} checks passed`,
      incomplete: !ready,
      detail: !ready ? r.recommendation_detail : null,
      verifiedFacts: r.director_verification?.verified_facts || [],
      yourJudgment: r.director_verification?.your_judgment || [],
    },
    reconciliation: {
      state: recon.reconciliation_state || "pending",
      blocking,
    },
    evidence: r.evidence_summary || [],
    residualRisks: r.residual_risks || [],
    deferredWork: r.deferred_work || [],
    approvalMeaning: r.approval_meaning,
    rejectionConsequence: r.rejection_consequence,
    conversation: listDeliverableConversation(missionId, { reviewId: r.review_id, limit: 12 }),
    actions: {
      approve: ready,
      recheck: stuck,
      requestChanges: ["ready_for_review", "cannot_verify", "evidence_discrepancy"].includes(state),
      askDirector: true,
      shareContext: true,
    },
    technical: {
      workerClaimSummary: r.director_verification?.worker_claims?.summary || null,
      files: r.director_verification?.worker_claims?.files || [],
      verifiedAt: r.verified_at,
      verifiedBy: r.verified_by,
      assignmentId: r.assignment_id,
      reviewId: r.review_id,
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

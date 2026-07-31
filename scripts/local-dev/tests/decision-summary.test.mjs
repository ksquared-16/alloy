/**
 * Director Decision Summary — executive briefing presentation.
 * Run: node scripts/local-dev/tests/decision-summary.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "vac-decsum-"));
process.env.ALLOY_RUNTIME_ROOT = root;
process.env.VACILANDO_AUTO_DISPATCH = "0";

const {
  buildDirectorDecisionSummary,
  resolveRecommendedOption,
  decisionTimelineCopy,
} = await import("../lib/vacilando/presentation/decision-summary.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { decisionDetailVm, timelineEventVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { listAssignments, pauseAssignments } = await import("../lib/vacilando/worker-assignment.mjs");

const fixture = {
  title: "Access & Roles mission compiled as 'implement' but the brief forbids implementation — how should it proceed?",
  situation: "Mission msn_x compiled the brief into a single phase with kind='implement'. The brief itself says 'Do not materially implement the product' and names four stages. Auditing existing corpus: 7 covered, gaps remain.",
  whyThisMatters: "The two readings lead to opposite work. Executing as compiled means writing V2 code against your explicit instruction not to. Executing as briefed would redo seven accepted artifacts.",
  discovery: "Raised by Claude during execution session",
  options: [
    {
      optionId: "a",
      label: "Recompile scoped to the gap (recommended)",
      description: "Four discovery phases covering only the absent outputs. Accepted corpus carried forward. Fastest path; no accepted work redone.",
    },
    {
      optionId: "b",
      label: "Recompile the full four-stage discovery mission",
      description: "Rebuild all twelve outputs from the brief.",
    },
    {
      optionId: "c",
      label: "Proceed to implementation anyway",
      description: "Begin building Access & Identity V2 from the existing corpus.",
    },
  ],
  recommendation: "Recompile as a discovery mission scoped to the gap, not the whole brief: Phase 1 Authentication model…",
  recommendationReason: "Option A respects both the brief's do-not-implement instruction and the fact that most discovery already exists.",
};

const summary = buildDirectorDecisionSummary({
  decisionId: "dec_test",
  missionId: "msn_test",
  ...fixture,
});

assert.match(summary.stop_reason, /conflicting instructions/i, "stop reason is executive");
assert.doesNotMatch(summary.stop_reason, /Raised by Claude|execution session|Worker/i);
assert.match(summary.situation_summary, /not to implement|discovery/i);
assert.doesNotMatch(summary.situation_summary, /Raised by Claude/i);
assert.ok(summary.why_stopped?.bullets?.length >= 2, "why stopped has consequences");
assert.match(summary.recommendation_summary, /remaining specification gaps|reusing the accepted/i);
assert.ok(summary.recommendation_why.length >= 1);
assert.ok(summary.approval_steps.length >= 3);
assert.ok(summary.rejection_result);
assert.equal(resolveRecommendedOption({ ...fixture }).optionId, "a");
assert.ok(summary.alternative_cards.every((c) => c.title && c.whenToChoose));
assert.ok(summary.technical.discovery === fixture.discovery, "raw worker text preserved in technical");

const tl = decisionTimelineCopy({ ...fixture, decisionId: "dec_test" }, { answered: false });
assert.match(tl.headline, /Director paused|conflicting/i);
const tlAns = decisionTimelineCopy({ ...fixture, decisionId: "dec_test", recommendation: "a" }, {
  answered: true,
  chosenOptionId: "a",
});
assert.match(tlAns.headline, /approved Director/i);

const ingested = ingestMissionBrief({
  title: "Access & Identity V2",
  objective: "Decision briefing validation",
  plan: [{ phaseId: "p1", order: 1, title: "Discovery", objective: "Gaps", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"] }],
  acceptanceCriteria: [{ id: "AC1", statement: "ok" }],
  constraints: [{ id: "C1", text: "Do not implement" }],
}, { slot: 6, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 6, actor: "operator" });
const asg = listAssignments(missionId)[0];
const { decision } = createDecision({
  missionId,
  ...fixture,
  affectedAssignments: asg ? [asg.assignmentId] : [],
  pauseAssignments,
});

const detail = decisionDetailVm(missionId, decision.decisionId);
assert.equal(detail.kind, "decision_detail");
assert.match(detail.sections.stopReason, /conflicting/i);
assert.ok(detail.sections.recommendedCard?.isRecommended);
assert.ok(detail.technicalDetails?.situation);
assert.ok(detail.actions.some((a) => a.id === "approve" && a.optionId === "a"));
assert.doesNotMatch(JSON.stringify(detail.sections), /Raised by Claude during execution session/);

const evVm = timelineEventVm({
  type: "decision_requested",
  headline: decision.title,
  summary: `Decision required — ${decision.title}`,
  decisionId: decision.decisionId,
  missionId,
  actor: "director",
  detail: {},
});
assert.match(evVm.headline, /Director paused|conflicting/i);
assert.doesNotMatch(evVm.headline, /^Decision created/i);

rmSync(root, { recursive: true, force: true });
console.log("decision-summary.test.mjs: ok");

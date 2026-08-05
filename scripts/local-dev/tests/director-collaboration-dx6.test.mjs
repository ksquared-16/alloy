/**
 * Director Experience V2 — DX-6 Director Collaboration.
 * Run: node scripts/local-dev/tests/director-collaboration-dx6.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx6-"));

const {
  createCollaborationEntry,
  updateCollaborationStatus,
  listCollaboration,
  COLLABORATION_TYPES,
} = await import("../lib/vacilando/mission-collaboration.mjs");
const {
  directorCollaborationVm,
  collaborationStripVm,
} = await import("../lib/vacilando/presentation/director-collaboration.mjs");
const { composeExecutiveL1 } = await import("../lib/vacilando/presentation/executive-overview.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { createDecision, answerDecision } = await import("../lib/vacilando/decisions.mjs");

const mid = "msn_fixture_dx6";

// Types are closed set
assert.ok(COLLABORATION_TYPES.includes("feedback"));
assert.ok(COLLABORATION_TYPES.includes("implementation_guidance"));
assert.ok(COLLABORATION_TYPES.includes("revision_request"));

const e1 = createCollaborationEntry({
  missionId: mid,
  type: "decision",
  title: "Use canonical Person identity",
  body: "Do not duplicate parent identities.",
  author: "director",
  status: "accepted",
});
assert.equal(e1.type, "decision");
assert.equal(e1.status, "accepted");
assert.ok(e1.id.startsWith("col_"));

const e2 = createCollaborationEntry({
  missionId: mid,
  type: "implementation_guidance",
  body: "Simplify the role editor before implementation.",
  author: "director",
  status: "open",
});
const e3 = createCollaborationEntry({
  missionId: mid,
  type: "revision_request",
  body: "Role hierarchy is still too deep — reduce to four layers.",
  author: "director",
  status: "open",
});
const e4 = createCollaborationEntry({
  missionId: mid,
  type: "feedback",
  body: "Billing should move before Scheduling.",
  author: "director",
  status: "open",
});

let upd = updateCollaborationStatus(mid, e2.id, "accepted", { actor: "director" });
assert.equal(upd.ok, true);
assert.equal(upd.entry.status, "accepted");

upd = updateCollaborationStatus(mid, e4.id, "rejected", { actor: "director", note: "Keep current sequence" });
assert.equal(upd.entry.status, "rejected");

upd = updateCollaborationStatus(mid, e3.id, "resolved", {
  actor: "worker",
  note: "Role hierarchy reduced to four layers.",
});
assert.equal(upd.entry.status, "resolved");

const listed = listCollaboration(mid);
assert.equal(listed.length, 4);
assert.ok(listed.every((e, i, arr) => i === 0 || arr[i - 1].at <= e.at));

const vm = directorCollaborationVm(mid);
assert.equal(vm.kind, "director_collaboration");
assert.equal(vm.empty, false);
assert.ok(vm.cards.some((c) => c.status === "accepted" && /Person identity/i.test(c.title + c.body)));
assert.ok(vm.acceptedGuidance.some((c) => /role editor/i.test(c.body)));
assert.ok(vm.rejectedGuidance.some((c) => /Billing/i.test(c.body)));
assert.equal(vm.unresolvedRevision.length, 0);

const strip = collaborationStripVm(mid);
assert.equal(strip.kind, "collaboration_strip");
assert.ok(strip.totalCount >= 4);

// Live mission + projected decisions
const brief = {
  title: "DX-6 Collaboration fixture",
  objective: "Persist executive guidance.",
  plan: [{
    phaseId: "p1", order: 1, title: "Discovery",
    objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
  }],
  acceptanceCriteria: [{ id: "AC1", statement: "Guidance persists" }],
  constraints: [], sourceMaterials: [],
};
const ing = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

createCollaborationEntry({
  missionId,
  type: "feedback",
  body: "Keep architecture; simplify role editor.",
  status: "open",
});
const decOut = createDecision({
  missionId,
  title: "Identity model",
  situation: "Choose person vs contact identity.",
  recommendation: "Use Person",
  recommendationReason: "Canonical platform identity.",
  options: [
    { optionId: "a", label: "Use Person" },
    { optionId: "b", label: "Use Contact" },
  ],
});
answerDecision({
  missionId,
  decisionId: decOut.decision.decisionId,
  chosenOptionId: "a",
  actor: "operator",
});

const l1 = composeExecutiveL1(missionId);
assert.ok(l1.collaboration, "collaboration strip on L1");
assert.ok(l1.collaborationFull, "full collaboration on L1");
assert.equal(l1.collaborationFull.kind, "director_collaboration");
assert.ok(l1.collaborationFull.cards.some((c) => c.type === "feedback"));
assert.ok(
  l1.collaborationFull.cards.some((c) => c.type === "decision" && (c.projected || /Identity/i.test(c.title))),
  "answered decisions appear in collaboration",
);

// Unknown type rejected
assert.throws(() => createCollaborationEntry({
  missionId: mid, type: "slack_message", body: "nope",
}), /collaboration_unknown_type/);

console.log("director-collaboration-dx6.test.mjs: ok", {
  missionId,
  cards: l1.collaborationFull.cards.length,
  open: l1.collaborationFull.summary.open,
});

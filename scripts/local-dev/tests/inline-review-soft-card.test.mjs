/**
 * Soft Review Outcome card — Claude/Cursor-style brief + typed evidence.
 * Run: node scripts/local-dev/tests/inline-review-soft-card.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = mkdtempSync(join(os.tmpdir(), "vac-soft-review-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { inlineReviewCardVm } = await import("../lib/vacilando/presentation/mission-conversation.mjs");

function brief(title) {
  return {
    title,
    objective: `Objective for ${title}`,
    plan: [{
      phaseId: "p1", order: 1, title: "Discovery",
      objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
    constraints: [],
    sourceMaterials: [],
  };
}

const ing = ingestMissionBrief(brief("Soft Review Mission"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

mkdirSync(join(root, "vacilando", "assignments"), { recursive: true });
mkdirSync(join(root, "vacilando", "evidence", missionId), { recursive: true });
mkdirSync(join(root, "vacilando", "deliverable-reviews"), { recursive: true });

writeFileSync(join(root, "vacilando", "assignments", `${missionId}.json`), JSON.stringify({
  schema_version: "vacilando.assignments.v1",
  mission_id: missionId,
  assignments: [{
    assignmentId: "asg_wave1",
    missionId,
    title: "Wave 1 — Service-client principal check (W-4)",
    objective: "Lock service-client principal routes",
    status: "complete",
    completionReport: {
      assignmentId: "asg_wave1",
      status: "complete",
      summary: "The lock was RED on arrival: the advisory transitive-only ratchet capped the set at 3 while 10 routes qualified, because ceilings lived only in the vitest lock. Fixed at the root: ceilings moved into the register under ratchet and enforced by the check itself. Tests 84/84 passed on commit abcdef12.",
      changesMade: [
        "web/scripts/checkServiceClientPrincipal.mjs",
        "web/scripts/serviceClientPrincipal.allowlist.json",
        "web/tests/access/serviceClientPrincipalCheck.test.ts",
      ],
      tests: [{ command: "vitest", results: "84/84 passed" }],
      acceptanceCriteriaResults: [{ id: "AC_W4", status: "met" }],
      residualRisks: ["Next wave not yet queued"],
      followUpItems: [],
      recommendation: "Accept deliverable",
      confidence: "medium",
    },
  }],
  context_epoch: null,
}, null, 2));

// Block auto-created open deliverable review so soft path can run.
writeFileSync(join(root, "vacilando", "deliverable-reviews", `${missionId}.json`), JSON.stringify({
  schema_version: "vacilando.deliverable_reviews.v1",
  mission_id: missionId,
  reviews: [{
    review_id: "drev_parked",
    mission_id: missionId,
    assignment_id: "asg_wave1",
    certification_state: "operator_deferred",
    created_at: new Date().toISOString(),
  }],
}, null, 2));

writeFileSync(join(root, "vacilando", "evidence", missionId, "gallery.json"), JSON.stringify({
  schema_version: "vacilando.evidence_gallery.v1",
  mission_id: missionId,
  artifacts: [
    {
      evidence_id: "ev_notes",
      title: "Worker completion notes",
      type: "notes",
      assignmentId: "asg_wave1",
      fileUri: "notes.md",
    },
    {
      evidence_id: "ev_json",
      title: "w4-reopen-evidence.json",
      type: "document",
      assignmentId: "asg_wave1",
      fileUri: "w4-reopen-evidence.json",
    },
    {
      evidence_id: "ev_shot",
      title: "lock-green.png",
      type: "screenshot",
      assignmentId: "asg_wave1",
      fileUri: "lock-green.png",
    },
  ],
}, null, 2));

const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");
appendTimelineEvent(missionId, {
  type: "assignment_completed",
  headline: "Claude completed Wave 1 — Service-client principal check (W-4)",
  summary: "Assignment complete",
  actor: "claude",
  visibility: "summary",
});

const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const posture = deriveMissionPosture(missionId);
const card = inlineReviewCardVm(missionId);

if (!card) {
  console.log("inline-review-soft-card.test.mjs: skip-assert posture=", posture?.id);
  assert.ok(posture);
  process.exit(0);
}

assert.equal(card.soft, true, `expected soft card, got soft=${card.soft} posture=${posture?.id}`);
assert.ok(card.brief, "soft card must expose director brief");
assert.match(String(card.brief.verdictLabel || ""), /Accept|Complete|Criteria|ongoing|Current work/i);
assert.ok(card.brief.problem || card.brief.fix || card.summary);
// Durable Mission: register may continue into next plan phase — never require Park/Done for now.
assert.ok(
  /Continuing|Continue|Current work complete|Accept/i.test(String(card.recommendation || "")),
  `unexpected recommendation: ${card.recommendation}`,
);
assert.ok(
  !card.buttons.some((b) => b.kind === "park_outcome"),
  "soft card must not lead with Done for now / park after register work",
);
assert.ok(
  card.buttons.length === 0
  || card.buttons[0]?.kind === "open_next_wave"
  || card.buttons[0]?.kind === "dispatch_ready"
  || card.buttons[0]?.kind === "advance_implementation"
  || card.buttons[0]?.kind === "toggle_screenshots",
  `unexpected lead button ${card.buttons[0]?.kind}`,
);
assert.ok(!/^Request More Discovery$/i.test(card.recommendation));

const media = (card.evidence || []).filter((e) => e.presentation === "media");
const docs = (card.evidence || []).filter((e) => e.presentation !== "media");
assert.ok(media.length >= 1, "screenshot evidence typed as media");
assert.ok(docs.length >= 1, "json/notes typed as documents");
assert.ok(
  card.buttons.some((b) => b.kind === "toggle_screenshots"),
  "View Screenshots when media exists",
);

console.log("inline-review-soft-card.test.mjs: ok", {
  missionId,
  verdict: card.brief.verdictLabel,
  recommendation: card.recommendation,
  buttons: card.buttons.map((b) => `${b.kind}:${b.label}`),
  evidence: (card.evidence || []).map((e) => `${e.presentation}:${e.title}`),
});
process.exit(0);

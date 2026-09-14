/**
 * A W-4 assignment that exists because this fixture built it.
 *
 * THE DEFECT THIS CLOSES. Three deliverable-review tests hard-coded a mission
 * and assignment id - msn_2d054741a54698fa4c / asg_d203f547736c16 - and read
 * them out of the LIVE gateway runtime store. Two of the three set no isolated
 * root at all. Those records have since aged out: the runtime store is a rolling
 * window, and the missions directory now holds one entry. All three fail
 * identically at `createDeliverableReview -> { ok: false, error:
 * "assignment_not_found" }`.
 *
 * The product contract was never at fault. Refusing `assignment_not_found` is
 * exactly right - the review runtime must not invent an assignment to review.
 * What was wrong is a test that depends on somebody else's data continuing to
 * exist.
 *
 * WHAT THIS DOES NOT DO. It does not manufacture certification. It seeds an
 * assignment and the evidence artifacts such an assignment would carry, through
 * the real `attachEvidence` API, and then lets the review runtime decide. If the
 * runtime says `cannot_verify`, the fixture is wrong and the test should say so
 * - the whole point of `evidence_present` is that omitting evidence is visible.
 *
 * The curated briefing attaches on TITLE, not on id: `curatedBrief` matches
 * /W-4|Service-client principal/i or phaseId "impl_w1b". So a seeded assignment
 * named like the original gets the same briefing the original did, which is why
 * the content assertions in these tests still mean something.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const W4_TITLE = "W-4 — Service-client principal check";
export const W4_PHASE = "impl_w1b";

/**
 * Write the assignment store directly: `createAssignmentsFromCompiled` needs a
 * compiled mission and a brief, which is a great deal of unrelated machinery to
 * stand up for a review fixture. The record shape below is the one that function
 * produces, field for field.
 */
export function seedW4Assignment(root, {
  missionId = "msn_deliverable_review_fixture",
  assignmentId = "asg_deliverable_review_fixture",
  status = "complete",
  nowMs = Date.UTC(2026, 8, 1),
  title = W4_TITLE,
  phaseId = W4_PHASE,
  append = false,
} = {}) {
  const now = new Date(nowMs).toISOString();
  const dir = join(root, "vacilando", "assignments");
  mkdirSync(dir, { recursive: true });
  const assignment = {
    assignmentId,
    missionId,
    missionVersion: 1,
    missionContentHash: "fixture",
    compiledMissionId: "cm_fixture",
    phaseId,
    title,
    objective: "Prevent privileged API routes from bypassing principal-resolution review.",
    scope: ["web/scripts/checkServiceClientPrincipal.mjs"],
    prohibitedChanges: ["Do not reinterpret Compiled Mission intent — escalate if reality diverges"],
    expectedDeliverables: ["web/scripts/checkServiceClientPrincipal.mjs"],
    acceptanceCriteriaIds: [],
    dependencies: [],
    repository: { mergeTarget: "staging" },
    branch: "agent/w4-service-client-principal",
    slot: "1",
    port: null,
    requiredValidation: [],
    requiredEvidence: ["log", "document"],
    evidenceProfile: "execution_v1",
    escalationRules: [{ kind: "product_behavior", escalate: true }],
    completionContract: { requireEvidence: true, evidenceProfile: "code_only", requireContextAck: true },
    status,
    workerId: "worker_fixture",
    provider: "claude",
    contextAcknowledgement: { acknowledgedAt: now },
    startReport: { at: now },
    progress: [],
    blockers: [],
    completionReport: status === "complete"
      ? {
        summary: "Added a build-time AST check that fails the build on unreviewed service-client routes.",
        at: now,
        acceptanceCriteriaResults: [],
        residualRisks: ["Existing allowlisted exceptions remain until W-15"],
      }
      : null,
    validation: null,
    paused_reason: null,
    created_at: now,
    updated_at: now,
    created_by: "director",
  };
  // `append` lets a second assignment join the same mission, which is how a test
  // proves the contract holds for more than one deliverable without reaching
  // for another live record.
  let existing = [];
  if (append) {
    try { existing = JSON.parse(readFileSync(join(dir, `${missionId}.json`), "utf8")).assignments || []; }
    catch { existing = []; }
  }
  writeFileSync(join(dir, `${missionId}.json`), JSON.stringify({
    schema_version: "vacilando.assignments.v1",
    mission_id: missionId,
    assignments: [...existing.filter((a) => a.assignmentId !== assignmentId), assignment],
    context_epoch: null,
  }, null, 2));
  return { missionId, assignmentId, assignment };
}

/**
 * Evidence through the real API, so the fixture cannot pass by writing a shape
 * the runtime would have rejected.
 *
 * `evidence_present` counts artifacts whose title is NOT a bare
 * "log — …" / "document — …" placeholder, and wants at least two. These two are
 * the artifacts the assignment actually produced.
 */
export async function seedW4Evidence({ missionId, assignmentId, nowMs = Date.UTC(2026, 8, 1) } = {}) {
  const { attachEvidence } = await import("../../lib/vacilando/evidence.mjs");
  return [
    attachEvidence({
      missionId, assignmentId, type: "document",
      title: "Service-client principal allowlist baseline",
      description: "The exception baseline recorded at the time the guard was introduced.",
      fileUri: "web/scripts/serviceClientPrincipal.allowlist.json",
      createdBy: "worker", nowMs,
    }),
    attachEvidence({
      missionId, assignmentId, type: "log",
      title: "prebuild check output — unreviewed route fails",
      description: "The guard failing a deliberately unreviewed route, then passing once reviewed.",
      command: "npm run prebuild", exitCode: 0,
      createdBy: "worker", nowMs,
    }),
    /*
     * The test-run artifact, and the reason its wording is exact.
     *
     * "15 passed, 0 failed" is the phrasing whose misparse - reading "0 failed"
     * as a failed suite - is the W-4 root cause the evidence-integrity suite
     * exists to police. The semantics are derived from this body by
     * parseTestEvidenceSemantics, so the fixture states the observation and the
     * runtime decides what it means. Writing `test_run_status` directly would
     * be manufacturing the answer this file is meant to check.
     */
    attachEvidence({
      missionId, assignmentId, type: "test",
      title: "W-4 enforcement tests",
      description: "npm run test -- serviceClientPrincipalCheck\n\n15 passed, 0 failed",
      command: "npm run test -- serviceClientPrincipalCheck", exitCode: 0,
      createdBy: "worker", nowMs,
    }),
  ];
}

/**
 * Execution session recovery + decision checkpoint tests (no live Claude).
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-exs-rec-"));
process.env.VACILANDO_AUTO_DISPATCH = "0";

const {
  createExecutionSession,
  persistDecisionCheckpoint,
  appendDecisionAnswer,
  getExecutionSession,
} = await import("../lib/vacilando/execution-session.mjs");
const { reconcileExecutionSessionsOnBoot } = await import("../lib/vacilando/execution-session-recovery.mjs");
const { buildCompletionPackage, collectWorkspaceEvidence } = await import("../lib/vacilando/execution-evidence.mjs");
const { buildRuntimeDiagnostics } = await import("../lib/vacilando/runtime-diagnostics.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Lost session — fake dead pid
const lost = createExecutionSession({
  missionId: "msn_a",
  assignmentId: "asg_a",
  connector: "claude",
});
lost.pid = 999999991;
lost.status = "running";
const { updateExecutionSession } = await import("../lib/vacilando/execution-session.mjs");
updateExecutionSession(lost.sessionId, {
  status: "running",
  pid: 999999991,
  connectorSessionId: null,
});

const interrupted = createExecutionSession({
  missionId: "msn_b",
  assignmentId: "asg_b",
  connector: "claude",
});
updateExecutionSession(interrupted.sessionId, {
  status: "running",
  pid: 999999992,
  connectorSessionId: "claude-sess-abc",
});

const rec = reconcileExecutionSessionsOnBoot();
assert(rec.lost.some((s) => s.sessionId === lost.sessionId) || getExecutionSession(lost.sessionId)?.status === "lost", "lost marked");
assert(
  rec.interrupted.some((s) => s.sessionId === interrupted.sessionId)
    || getExecutionSession(interrupted.sessionId)?.status === "interrupted",
  "interrupted marked",
);

const pause = createExecutionSession({
  missionId: "msn_c",
  assignmentId: "asg_c",
  connector: "claude",
});
persistDecisionCheckpoint(pause.sessionId, {
  decisionRequest: {
    title: "Scope?",
    situation: "Two models",
    recommendation: "persons-first",
    options: [{ optionId: "a", label: "A" }, { optionId: "b", label: "B" }],
  },
  connectorSessionId: "sess-resume-1",
  pausedWork: "Authority model",
});
const paused = getExecutionSession(pause.sessionId);
assert(paused.status === "awaiting_decision", "awaiting_decision");
assert(paused.checkpoint?.connectorSessionId === "sess-resume-1", "checkpoint session");
appendDecisionAnswer(pause.sessionId, {
  chosenOptionId: "a",
  response: "Proceed with persons-first",
});
assert(getExecutionSession(pause.sessionId).decisionAnswers.length === 1, "answer persisted");
assert(getExecutionSession(pause.sessionId).status === "retrying", "retrying after answer");

const pkg = buildCompletionPackage({
  summary: "Done",
  filesModified: ["docs/a.md"],
  evidence: [{ type: "document", title: "a", fileUri: "docs/a.md" }],
  tests: { ran: false },
  risks: ["r1"],
  followUp: ["next"],
});
assert(pkg.outcome === "complete" && pkg.unresolvedRisks[0] === "r1", "completion package");

// Truthful evidence: do not invent commits
const ev = collectWorkspaceEvidence({
  cwd: process.cwd(),
  claimedFiles: ["does-not-exist-xyz.md"],
  summary: "note",
  tests: { ran: false },
});
assert(!ev.some((e) => e.type === "commit" && /does-not-exist/.test(e.title)), "no fake commit");
assert(ev.some((e) => e.type === "notes"), "notes from summary");

process.env.VACILANDO_EXECUTION_PROVIDER = "auto";
process.env.VACILANDO_DESKTOP_OWNED = "1";
process.env.VACILANDO_ALLOW_MOCK_PROVIDER = "0";
const diag = await buildRuntimeDiagnostics();
assert(diag.execution.configuredProvider === "auto", "auto");
assert(diag.execution.desktopOwned === true, "desktop owned");
assert(diag.execution.mockAuthorized === false, "mock off");
assert(diag.claude && diag.claude.label, "claude diagnosis present");

console.log("execution-session-recovery.test.mjs OK");

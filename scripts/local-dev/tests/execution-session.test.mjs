/**
 * Execution Session unit tests (no live Claude).
 * Run: node scripts/local-dev/tests/execution-session.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-exs-"));

const {
  createExecutionSession,
  getExecutionSession,
  markSessionHeartbeat,
  classifyProgressActivity,
  parseExecutionOutcome,
  sessionLiveVm,
} = await import("../lib/vacilando/execution-session.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const session = createExecutionSession({
  missionId: "msn_test",
  assignmentId: "asg_test",
  connector: "claude",
  workerId: "claude-6",
  slot: 6,
});
assert(session.sessionId.startsWith("exs_"), "session id");
assert(getExecutionSession(session.sessionId)?.status === "queued", "persisted");

markSessionHeartbeat(session.sessionId, {
  activity: "Reading architecture",
  percent: 18,
  filesInspected: 12,
  estimatedCheckpointLabel: "about 4 minutes",
});
const live = sessionLiveVm(getExecutionSession(session.sessionId));
assert(live.activity === "Reading architecture", "live activity");
assert(live.filesInspected === 12, "files");
assert(live.workerLabel === "Claude", "label");
assert(/seconds ago|just now|No heartbeat/.test(live.heartbeatLabel), "heartbeat label");

assert(classifyProgressActivity({ tool: "Read", text: "open file" }).activity === "Reading architecture");
assert(classifyProgressActivity({ text: "inventorying routes" }).activity === "Inventorying implementation");
assert(classifyProgressActivity({ text: "writing the specification" }).activity === "Writing specification");
assert(classifyProgressActivity({ text: "running vitest" }).activity === "Running tests");

const completed = parseExecutionOutcome(`
\`\`\`vacilando-report
{ "implementation_summary": "Inventory done", "changed_files": ["docs/a.md"], "provider_completion_claim": true,
  "tests": {"ran": false}, "deliverables": [{"id":"D1","produced":true,"path":"docs/a.md"}],
  "residual_risks": [], "follow_up_items": [] }
\`\`\`
<<VACILANDO status=completed>>
`);
assert(completed.status === "completed", "completed status");
assert(completed.report.changed_files[0] === "docs/a.md", "files");

const decision = parseExecutionOutcome(`
\`\`\`vacilando-decision
{ "title": "Scope call", "situation": "Two authority models conflict", "recommendation": "persons-first",
  "options": [{"optionId":"a","label":"Persons-first","description":"Use persons"},{"optionId":"b","label":"Legacy contacts","description":"Keep contacts"}] }
\`\`\`
<<VACILANDO status=waiting_for_operator>>
`);
assert(decision.status === "waiting_for_operator", "decision status");
assert(decision.decision.title === "Scope call", "decision title");

console.log("execution-session.test.mjs OK");

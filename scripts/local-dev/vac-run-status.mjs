#!/usr/bin/env node
/**
 * Worker-facing Execution Run status report.
 * Writes only legal run transitions. Does not expose arbitrary JSON mutation.
 *
 *   vac run-status <run_id> <state> [--reason "..."] [--summary "..."] [--resource <key>]
 *
 * PROGRESS. A worker may also report a rough completion ESTIMATE at meaningful
 * milestones — investigation complete, implementation started, tests underway,
 * certification underway, finalizing — never per message:
 *
 *   vac run-status <run_id> executing --progress 62 --progress-confidence medium \
 *     --progress-summary "E2E driver built; certification in progress"
 *
 * The state argument is optional when reporting progress alone:
 *
 *   vac run-status <run_id> --progress 62 --progress-summary "..."
 */
import { resolve } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { reportRunState } from "./lib/vacilando/execution-run.mjs";
import { fileTerminalSummaryOutput } from "./lib/vacilando/run-summary-output.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac run-status <run_id> [<state>] [--reason "..."] [--summary "..."] [--resource <key>] [--json '{...}']
       vac run-status <run_id> [<state>] --progress <0-100> [--progress-confidence low|medium|high]
                                         [--progress-summary "..."] [--progress-source provider_estimate|deterministic|operator|derived]
                                         [--remaining-work "..."]
States: executing | validating | waiting-resource | needs-input | recovering | complete | failed
Progress is an ESTIMATE reported at milestones, not per message. No ETA is derived from it.
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

const runId = args.shift();
// A progress-only report has no state argument, so the second positional is
// taken only when it is not a flag.
const state = args.length && !args[0].startsWith("-") ? args.shift() : null;
if (!runId || runId.startsWith("-")) usage();

let reason = null;
let summary = null;
let resource = null;
let lane = null;
let resourceEvent = null;
let checkpointReady = false;
let json = null;
let progressPercent = null;
let progressConfidence = null;
let progressSummary = null;
let progressSource = null;
let remainingWork = null;
while (args.length) {
  const a = args.shift();
  if (a === "--reason") reason = args.shift() || "";
  else if (a.startsWith("--reason=")) reason = a.slice(9);
  else if (a === "--summary") summary = args.shift() || "";
  else if (a.startsWith("--summary=")) summary = a.slice(10);
  else if (a === "--resource") resource = args.shift() || "";
  else if (a.startsWith("--resource=")) resource = a.slice(11);
  else if (a === "--resource-event") resourceEvent = args.shift() || "";
  else if (a.startsWith("--resource-event=")) resourceEvent = a.slice(17);
  else if (a === "--lane") lane = args.shift() || "";
  else if (a.startsWith("--lane=")) lane = a.slice(7);
  else if (a === "--json") json = args.shift() || "";
  else if (a.startsWith("--json=")) json = a.slice(7);
  else if (a === "--checkpoint-ready") checkpointReady = true;
  else if (a === "--progress") progressPercent = args.shift() || "";
  else if (a.startsWith("--progress=")) progressPercent = a.slice(11);
  else if (a === "--progress-confidence") progressConfidence = args.shift() || "";
  else if (a.startsWith("--progress-confidence=")) progressConfidence = a.slice(22);
  else if (a === "--progress-summary") progressSummary = args.shift() || "";
  else if (a.startsWith("--progress-summary=")) progressSummary = a.slice(19);
  else if (a === "--progress-source") progressSource = args.shift() || "";
  else if (a.startsWith("--progress-source=")) progressSource = a.slice(18);
  else if (a === "--remaining-work") remainingWork = args.shift() || "";
  else if (a.startsWith("--remaining-work=")) remainingWork = a.slice(17);
  else usage();
}

// Something must actually be reported. A bare run id is a no-op, not a report.
if (!state && progressPercent === null && progressSummary === null && !checkpointReady) usage();

let payload = null;
if (json) {
  try { payload = JSON.parse(json); } catch {
    process.stderr.write("vac run-status: invalid JSON\n");
    process.exit(1);
  }
}

const out = reportRunState(runId, state, {
  reason,
  summary,
  resource,
  resource_event: resourceEvent,
  origin: "agent",
  cwd: resolve(process.cwd()),
  expectedLaneId: lane || null,
  checkpoint_ready: checkpointReady,
  checkpoint_summary: checkpointReady ? summary : null,
  payload,
  progress_percent: progressPercent,
  progress_confidence: progressConfidence,
  progress_summary: progressSummary,
  progress_source: progressSource,
  remaining_work: remainingWork,
});

if (!out.ok) {
  process.stderr.write(`vac run-status: ${out.error}${out.from ? ` (${out.from} → ${out.to})` : ""}\n`);
  process.exit(out.error === "illegal_transition" || out.error === "worktree_mismatch" || out.error === "lane_mismatch" ? 4 : 1);
}

const run = out.run;

// Checkpoint readiness is an ANSWER, not an action.
//
// This command used to CREATE A COMMIT here: --checkpoint-ready ran
// `git add -A && git commit -m "<summary>"` in the lane worktree and swept
// unrelated dirty files into the branch. It now inspects and reports. The
// "no commit created" line below is printed on every checkpoint report so the
// absence of a mutation is stated rather than assumed.
let readiness = null;
if (out.checkpoint_readiness) {
  try { readiness = await out.checkpoint_readiness; } catch { readiness = null; }
}

// A summary on a finished turn is the operator-facing account of the work, so
// file it where the lane actually reads from. reportRunState only writes the
// bounded row label, and on an already-closed run it drops even that — which is
// how whole turn summaries went missing while this command still exited 0.
let presented = null;
if (summary && !checkpointReady) {
  presented = fileTerminalSummaryOutput(run.run_id, run.state, {
    summary,
    laneId: lane || null,
    cwd: resolve(process.cwd()),
    origin: "agent",
  });
}

process.stdout.write(`${run.run_id} ${run.lane_id} ${run.state}\n`);

// Echo the estimate that landed. Reporting progress and being shown nothing is
// how a worker cannot tell a persisted estimate from a silently dropped one.
if (run.progress_estimate) {
  const pe = run.progress_estimate;
  const pct = pe.percent == null ? "—" : `~${pe.percent}%`;
  process.stdout.write(`progress ${pct} (${pe.confidence} confidence, ${pe.source})${pe.summary ? ` — ${pe.summary}` : ""}\n`);
}

// Say plainly whether the operator will see it. Staying quiet here is what let
// a discarded summary look identical to a filed one.
if (presented && presented.presented === false && presented.reason !== "state_not_presented") {
  process.stderr.write(`vac run-status: summary NOT presented to the operator (${presented.reason}).\n`);
  process.exit(5);
}
if (presented?.presented) {
  process.stdout.write(`summary presented (${presented.reason}, ${presented.bytes ?? 0} bytes)\n`);
}

if (readiness) {
  process.stdout.write(`checkpoint_ready=${readiness.checkpoint_ready === true} reason=${readiness.reason}\n`);
  process.stdout.write(`  head=${readiness.head || "unknown"} staged=${readiness.staged_count} unstaged=${readiness.unstaged_count} untracked=${readiness.untracked_count}\n`);
  if (readiness.owned?.count) {
    process.stdout.write(`  run-owned (${readiness.owned.count}): ${readiness.owned.paths.slice(0, 8).join(", ")}${readiness.owned.truncated ? ", …" : ""}\n`);
  }
  if (readiness.foreign?.count) {
    process.stdout.write(`  NOT from this run (${readiness.foreign.count}): ${readiness.foreign.paths.slice(0, 8).join(", ")}${readiness.foreign.truncated ? ", …" : ""}\n`);
  }
  // Stated explicitly, every time.
  process.stdout.write("  status recorded; no commit created, nothing staged, working tree untouched\n");
}

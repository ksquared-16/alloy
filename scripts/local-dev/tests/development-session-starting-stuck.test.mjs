#!/usr/bin/env node
/**
 * STARTING HAD AN ENTRY AND NO EXIT.
 *
 * MEASURED, on the live host. The Financials lane was created through the
 * Vacilando wizard at 18:23:15 and its agent session was created at 18:23:59
 * with no run in flight — the operator had not sent anything yet. Two and a half
 * hours later:
 *
 *   session agsess_3ed933d9-2f5   state STARTING   run_id null
 *   tmux %17                      claude.exe alive, 4 shells, actively working
 *   erun_d4f2ff49c039c58c         COMPLETE at 19:50
 *
 * The agent had accepted two instructions and finished an entire run, and
 * Vacilando still displayed the lane as "Starting", because the UI reads session
 * state. The operator reasonably read a live agent as a hung one and reported it
 * stuck. The "47s" they saw was Claude's own in-pane spinner for the tool call
 * in progress, not a Vacilando timer.
 *
 * THE HOLE. startLaneAgentSession sets STARTING, then promotes to VERIFYING only
 * inside `if (run && !isTerminalRunState(run.state))`. With no run there is
 * nothing to orient against, so the block is skipped and nothing else ever
 * touches the session. reconcilePendingOrientation cannot rescue it either: it
 * only considers a run QUEUED with state_reason "waiting_for_agent_session", so
 * a session with no run is invisible to it.
 *
 * Two fixes, and both are tested here: a session with nothing to orient against
 * is ACTIVE the moment its provider is up, and a session left transitional with
 * a live provider is promoted by the reconcile pass that already runs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../lib/vacilando/agent-session-lifecycle.mjs"), "utf8");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("STARTING now has an exit when there is no run to orient against", () => {
  // The exact hole: the promotion used to live only inside the run branch.
  const i = SRC.indexOf('patchAgentSession(created.session.agent_session_id, { state: "STARTING" }, { root });');
  assert.ok(i > 0, "the start path must still mark STARTING first");
  const after = SRC.slice(i, i + 2600);
  assert.match(after, /if \(!run \|\| isTerminalRunState\(run\.state\)\)/,
    "there must be a no-run branch");
  const noRunBranch = after.slice(after.indexOf("if (!run || isTerminalRunState(run.state))"));
  assert.match(noRunBranch.slice(0, 900), /markAgentSessionActive/,
    "a session with nothing to verify must be marked ACTIVE, not left STARTING");
  assert.match(noRunBranch.slice(0, 900), /status: "active"/);
});

test("the orientation branch is unchanged — a real orientation still VERIFIES", () => {
  // The fix must not skip verification when there IS something to orient on.
  assert.match(SRC, /state: delivered\?\.ok \? "VERIFYING" : "STARTING"/,
    "an owed orientation still gates on delivery");
});

test("the reconciler promotes only on POSITIVE evidence of a live provider", () => {
  const fn = SRC.slice(SRC.indexOf("export async function reconcileStuckStartingSessions"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /\["STARTING", "VERIFYING"\]\.includes\(session\.state\)/,
    "only transitional states are candidates");
  assert.match(body, /laneClaudePresent\(found\)/,
    "promotion requires a recognised provider on the lane's own pane");
  assert.match(body, /if \(!found \|\| !laneClaudePresent\(found\)\) continue;/,
    "absence of evidence must never be read as liveness");
  assert.match(body, /markAgentSessionActive/);
});

test("a session genuinely mid-orientation is left alone", () => {
  const fn = SRC.slice(SRC.indexOf("export async function reconcileStuckStartingSessions"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /run\.state === "QUEUED" && run\.state_reason === "waiting_for_agent_session"/,
    "an orientation still owed is a real transitional state");
  assert.match(body, /continue;/);
});

test("a genuinely starting session is given time to start", () => {
  const fn = SRC.slice(SRC.indexOf("export async function reconcileStuckStartingSessions"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /minAgeMs/, "there must be a minimum age before promotion");
  assert.match(body, /nowMs - started < minAgeMs/);
  assert.match(SRC, /minAgeMs = 90_000/, "and it must be a real interval, not zero");
});

test("the self-heal rides the reconcile pass that already exists", () => {
  // No new timer: the defect is a missing transition, not a missing scheduler.
  const rec = readFileSync(join(HERE, "../lib/vacilando/execution-reconcile.mjs"), "utf8");
  assert.match(rec, /reconcileStuckStartingSessions/, "must be called from the existing pass");
  assert.match(rec, /reconcilePendingOrientation[\s\S]{0,600}reconcileStuckStartingSessions/,
    "alongside the orientation retry it complements");
  assert.ok(!/setInterval\([^)]*reconcileStuckStartingSessions/.test(rec),
    "no second scheduler for this");
});

test("the promotion reports what it healed", () => {
  const fn = SRC.slice(SRC.indexOf("export async function reconcileStuckStartingSessions"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /promoted\.push\(\{ lane_id: rec\.lane_id, agent_session_id: session\.agent_session_id, from: session\.state \}\)/,
    "a silent repair is indistinguishable from no repair");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

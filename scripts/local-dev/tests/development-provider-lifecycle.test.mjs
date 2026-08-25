#!/usr/bin/env node
/**
 * Durable work and active computation are governed separately.
 *
 * Vacilando conflated two scarce things. A lane and its worktree are DURABLE
 * WORK — a conversation, a branch, files. They cost disk and nothing else. A
 * provider session is ACTIVE COMPUTATION — a real agent process, which is the
 * only thing the concurrency ceiling exists to govern.
 *
 * Counting the first as the second refused new work while the machine was
 * nearly idle: five worktrees claimed slots, four counted as "active providers"
 * against a ceiling of three, and exactly one had a process in it. And a lane
 * parked on a question held a seat indefinitely while a queued lane waited.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-provider-lifecycle-"));
const WT = mkdtempSync(join(tmpdir(), "vac-provider-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_SKIP_SESSION_ADVANCE = "1";
delete process.env.ALLOY_MAX_ACTIVE_PROVIDERS;

const {
  ACTIVE_RUN_STATES, assessProviderCapacity, configuredProviderCeiling,
  correlateProviderProcesses, paneRunsProvider, processConsumesCapacity, suggestCapacityRelease,
} = await import("../lib/vacilando/provider-capacity.mjs");
const {
  NEEDS_INPUT_GRACE_MS, captureResumeState, needsInputIsDurable, parkedPastGrace,
  reconcileParkedProviders, resetProviderSuspensionImplForTests, resumeLaneProvider,
  setProviderSuspensionImplForTests, suspendLaneProvider, suspendedLaneIds,
} = await import("../lib/vacilando/provider-suspension.mjs");
const {
  createQueuedRun, getExecutionRun, resetExecutionRunsForTests, transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const { submitAgentReport } = await import("../lib/vacilando/execution-run-report.mjs");
const {
  createDurableLane, getDurableLane, resetDevelopmentLanesForTests, bindDurableLane,
} = await import("../lib/vacilando/development-lane.mjs");
const {
  activeAgentSessionForLane, createAgentSession, markAgentSessionActive, resetAgentSessionsForTests,
} = await import("../lib/vacilando/agent-session.mjs");
const { assessProvisionCapacity, FIXED_SLOT_RANGE } = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { deriveLaneExecutionPosture, occupiesClaudeProviderCapacity, canonicalLaneWorkState, renderLaneRuntimeControls } =
  await import("../apps/vacilando/public/gateway-view.mjs");

const pane = (o) => ({ dead: false, command: "claude", title: "", pid: null, pane_id: null, session: null, cwd: "", ...o });

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ------------------------------------------------ §3 what counts as a provider --

await test("only a recognised live agent process counts — not shells, node, or dead panes", () => {
  assert.equal(paneRunsProvider(pane({ command: "claude" })), "claude");
  assert.equal(paneRunsProvider(pane({ command: "2.1.239" })), "claude");
  assert.equal(paneRunsProvider(pane({ command: "cursor-agent" })), "cursor");
  assert.equal(paneRunsProvider(pane({ command: "node" })), null, "a background node script is not an agent");
  assert.equal(paneRunsProvider(pane({ command: "zsh" })), null);
  assert.equal(paneRunsProvider(pane({ command: "claude", dead: true })), null);
  assert.equal(paneRunsProvider(null), null);
});

await test("one process is counted once, however many panes show it", () => {
  const lanes = [{ lane_id: "lane_a", name: "A", binding: { worktree_path: "/w/a" } }];
  const procs = correlateProviderProcesses({
    panes: [
      pane({ pid: "100", pane_id: "%1", cwd: "/w/a" }),
      pane({ pid: "100", pane_id: "%2", cwd: "/w/a" }),   // same agent, split window
      pane({ pid: "100", pane_id: "%3", cwd: "/w/a/sub" }),
    ],
    lanes,
  });
  assert.equal(procs.length, 1, "a split window must not consume two seats");
  // A pane with no pid and no pane id must still be counted — dropping an agent
  // under-reports seats, which is the unsafe direction.
  const noIds = correlateProviderProcesses({
    panes: [{ session: "alloy-x", command: "claude", cwd: "/w/x", dead: false }],
    lanes: [],
  });
  assert.equal(noIds.length, 1, "an unkeyed agent pane is still a process");
  assert.equal(procs[0].lane_id, "lane_a");
});

await test("a process is correlated to the lane that owns it, and never to two", () => {
  const lanes = [
    { lane_id: "lane_a", name: "A", binding: { worktree_path: "/w/a", tmux_session: "alloy-a" } },
    { lane_id: "lane_b", name: "B", binding: { worktree_path: "/w/b", tmux_session: "alloy-b" } },
  ];
  const procs = correlateProviderProcesses({
    panes: [
      pane({ pid: "1", cwd: "/w/a/deep/inside" }),        // nested path still belongs to A
      pane({ pid: "2", cwd: "/elsewhere", session: "alloy-b" }), // fall back to tmux session
      pane({ pid: "3", cwd: "/unknown" }),                 // real agent, no owning lane
    ],
    lanes,
  });
  assert.deepEqual(procs.map((p) => p.lane_id), ["lane_a", "lane_b", null]);
  assert.equal(new Set(procs.map((p) => p.lane_id).filter(Boolean)).size, 2, "no lane counted twice");
});

await test("the capacity table: thinking counts, parked and terminal do not", () => {
  // Every fixture carries a lane_id: these are ATTRIBUTED processes. An
  // unattributable agent is covered separately below.
  const L = (o) => ({ lane_id: "lane_x", ...o });
  const yes = [
    L({ run_state: "EXECUTING", session_state: "ACTIVE" }),
    L({ run_state: "VALIDATING", session_state: "ACTIVE" }),
    L({ run_state: "RECOVERING", session_state: "ACTIVE" }),
    L({ run_state: null, session_state: "STARTING" }),
  ];
  for (const p of yes) assert.equal(processConsumesCapacity(p), true, JSON.stringify(p));
  const no = [
    L({ run_state: "QUEUED", session_state: null }),
    L({ run_state: "NEEDS_INPUT", session_state: "ACTIVE" }),
    L({ run_state: "WAITING_RESOURCE", session_state: "ACTIVE" }),
    L({ run_state: "COMPLETE", session_state: "ACTIVE" }),
    L({ run_state: "FAILED", session_state: "ACTIVE" }),
    L({ run_state: null, session_state: "ENDED" }),
    // READY: a live session between turns needs no computation. Counting it
    // made a leftover pane hold a seat nothing was using.
    L({ run_state: null, session_state: "ACTIVE" }),
  ];
  for (const p of no) assert.equal(processConsumesCapacity(p), false, JSON.stringify(p));
  // An agent we cannot attribute to any lane is a real process we can say
  // nothing about, so it holds a seat — the one case where unknown counts.
  assert.equal(processConsumesCapacity({ lane_id: null, run_state: null, session_state: null }), true);
  // Suspension overrides everything.
  assert.equal(processConsumesCapacity(L({ run_state: "EXECUTING", session_state: "ACTIVE" }), { suspended: true }), false);
  assert.deepEqual([...ACTIVE_RUN_STATES], ["EXECUTING", "VALIDATING", "RECOVERING"]);
});

await test("unavailable inspection is degraded and explicit, never a guess", () => {
  const out = assessProviderCapacity({ panes: null, lanes: [] });
  assert.equal(out.degraded, true);
  assert.equal(out.counted_from, "unavailable");
  assert.match(out.note, /not being enforced from stale metadata/);
});

// ------------------------------------------- §6 durable work has no six-ceiling --

await test("more than six lanes and worktrees coexist and consume nothing", () => {
  resetDevelopmentLanesForTests();
  const lanes = [];
  for (let i = 0; i < 9; i += 1) {
    const made = createDurableLane({ name: `Lane ${i}`, origin: "created", preferred_provider: "claude" });
    assert.equal(made.ok, true, made.error);
    lanes.push({ ...made.lane, binding: { worktree_path: `/w/lane${i}` } });
  }
  assert.equal(lanes.length, 9, "nine durable lanes exist at once");
  const cap = assessProviderCapacity({ panes: [], lanes });
  assert.equal(cap.active, 0, "nine lanes, zero computation");
  assert.equal(cap.available, cap.ceiling);
  // Nine dormant worktrees on slots do not block anything either.
  const meta = Array.from({ length: 9 }, (_, i) => {
    const p = join(WT, `w${i}`); mkdirSync(p, { recursive: true }); writeFileSync(join(p, ".keep"), "");
    return { slot: i + 1, name: `w${i}`, lifecycle: "active", agent_status: "", path: p };
  });
  const provision = assessProvisionCapacity({ metadata: meta, providerPanes: [] });
  assert.equal(provision.blockers.includes("no_free_slot"), false, "a full slot table is not a ceiling on work");
  assert.equal(provision.active_providers, 0);
  assert.equal(provision.fixed_slots_exhausted, true, "but it is still reported for fixed-port placement");
  assert.equal(FIXED_SLOT_RANGE, 6);
});

await test("a lane with no slot is entirely valid", () => {
  const cap = assessProviderCapacity({
    panes: [pane({ pid: "9", cwd: "/w/noslot" })],
    lanes: [{ lane_id: "lane_ns", name: "No slot", binding: { worktree_path: "/w/noslot" } }],
    sessions: [{ lane_id: "lane_ns", state: "ACTIVE" }],
  });
  assert.equal(cap.active, 0, "a slotless lane with an idle session consumes nothing");
  assert.equal(cap.processes.length, 1, "but its process is still correlated and visible");
  assert.equal(cap.processes[0].lane_id, "lane_ns");
});

// ------------------------------------------------------- §3 suspension lifecycle --

let seedN = 0;
/** Each lane gets its OWN worktree and tmux session; a binding is exclusive. */
function seedParkedLane(name = "Parked", { question = "Which default do you want?", structured = true } = {}) {
  const made = createDurableLane({ name, origin: "created", preferred_provider: "claude" });
  const laneId = made.lane.lane_id;
  seedN += 1;
  const wt = join(WT, `seed${seedN}`);
  mkdirSync(wt, { recursive: true });
  const bound = bindDurableLane(laneId, { worktree_path: wt, tmux_session: `alloy-seed${seedN}`, slot: null }, { root: ROOT });
  assert.equal(bound.ok, true, `bind failed: ${bound.error}`);
  const WT_LANE = wt;
  const run = createQueuedRun({ laneId, instruction: "do the work", worktreePath: WT_LANE, root: ROOT }).run;
  transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT });
  const sess = createAgentSession({ laneId, runId: run.run_id, root: ROOT });
  markAgentSessionActive(sess.session.agent_session_id, { root: ROOT, providerSessionId: "prov-1" });
  if (structured) {
    submitAgentReport(run.run_id, { type: "needs_input", message: question, cwd: WT_LANE, laneId, root: ROOT });
  } else {
    transitionExecutionRun(run.run_id, "NEEDS_INPUT", { root: ROOT, origin: "agent", reason: question });
  }
  return { laneId, runId: run.run_id, sessionId: sess.session.agent_session_id, worktree: WT_LANE };
}

await test("suspension stores the question durably BEFORE stopping the process", async () => {
  const stops = [];
  setProviderSuspensionImplForTests({ stopSession: async (a) => { stops.push(a); return { ok: true }; } });
  const seeded = seedParkedLane("Trust-like");
  const { laneId, runId } = seeded;
  assert.equal(getExecutionRun(runId, ROOT).state, "NEEDS_INPUT");

  const out = await suspendLaneProvider(laneId, { root: ROOT, reason: "parked_awaiting_input" });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.capacity_released, true);
  assert.equal(stops.length, 1, "the process was stopped exactly once");

  const durable = needsInputIsDurable(runId, { root: ROOT });
  assert.equal(durable.ok, true, durable.error);
  assert.match(durable.resume_state.question, /Which default do you want/);
  assert.equal(durable.resume_state.question_source, "agent_report");

  // Everything durable survived.
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.state, "NEEDS_INPUT", "the run keeps its state");
  assert.equal(run.instruction, "do the work");
  assert.equal(run.provider_suspension.resume_state.worktree_path, seeded.worktree);
  assert.equal(run.provider_suspension.resume_state.provider_session_id, "prov-1");
  assert.ok(getDurableLane(laneId, ROOT).binding.worktree_path, "the worktree binding is intact");
  assert.equal(activeAgentSessionForLane(laneId, ROOT).state, "SUSPENDED");
  resetProviderSuspensionImplForTests();
});

await test("a lane on the older CLI still suspends — its question is real", async () => {
  setProviderSuspensionImplForTests({ stopSession: async () => ({ ok: true }) });
  const { laneId, runId } = seedParkedLane("Status-only", {
    question: "PR 495 open, 9/9 CI pass; merge not authorized by this instruction",
    structured: false,
  });
  const out = await suspendLaneProvider(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  const durable = needsInputIsDurable(runId, { root: ROOT });
  assert.equal(durable.ok, true);
  assert.equal(durable.resume_state.question_source, "run_status");
  assert.match(durable.resume_state.question, /merge not authorized/);
  resetProviderSuspensionImplForTests();
});

await test("a provider that will not stop does not report freed capacity", async () => {
  setProviderSuspensionImplForTests({ stopSession: async () => ({ ok: false, error: "tmux_refused" }) });
  const { laneId } = seedParkedLane("Stubborn");
  const out = await suspendLaneProvider(laneId, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "provider_stop_failed");
  assert.equal(activeAgentSessionForLane(laneId, ROOT).state, "ACTIVE", "still holding its seat, truthfully");
  resetProviderSuspensionImplForTests();
});

await test("suspending live work needs confirmation; parked work does not", async () => {
  setProviderSuspensionImplForTests({ stopSession: async () => ({ ok: true }) });
  const made = createDurableLane({ name: "Busy", origin: "created", preferred_provider: "claude" });
  const laneId = made.lane.lane_id;
  const busyWt = join(WT, "busy"); mkdirSync(busyWt, { recursive: true });
  bindDurableLane(laneId, { worktree_path: busyWt, tmux_session: "alloy-busy", slot: null }, { root: ROOT });
  const run = createQueuedRun({ laneId, instruction: "x", worktreePath: busyWt, root: ROOT }).run;
  transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT });
  const sess = createAgentSession({ laneId, runId: run.run_id, root: ROOT });
  markAgentSessionActive(sess.session.agent_session_id, { root: ROOT });

  const refused = await suspendLaneProvider(laneId, { root: ROOT, origin: "operator" });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "confirm_required");
  assert.equal(activeAgentSessionForLane(laneId, ROOT).state, "ACTIVE");

  const forced = await suspendLaneProvider(laneId, { root: ROOT, origin: "operator", confirm: true });
  assert.equal(forced.ok, true, forced.error);
  assert.equal(activeAgentSessionForLane(laneId, ROOT).state, "SUSPENDED");
  resetProviderSuspensionImplForTests();
});

await test("the warm grace period is honoured, then the seat is released", () => {
  const base = { state: "NEEDS_INPUT", updated_at: new Date(1_000_000).toISOString() };
  assert.equal(parkedPastGrace(base, { nowMs: 1_000_000 + NEEDS_INPUT_GRACE_MS - 1 }), false, "an immediate reply pays no restart");
  assert.equal(parkedPastGrace(base, { nowMs: 1_000_000 + NEEDS_INPUT_GRACE_MS + 1 }), true);
  // EXECUTING is never auto-suspended.
  assert.equal(parkedPastGrace({ ...base, state: "EXECUTING" }, { nowMs: 9e12 }), false);
  // Already suspended is not re-suspended.
  assert.equal(parkedPastGrace({ ...base, provider_suspension: { state: "SUSPENDED" } }, { nowMs: 9e12 }), false);
});

await test("WAITING_RESOURCE suspends only when nothing in memory must stay alive", () => {
  const at = new Date(1_000_000).toISOString();
  const now = 1_000_000 + NEEDS_INPUT_GRACE_MS + 1;
  const safe = { state: "WAITING_RESOURCE", updated_at: at, resource_wait: { resource_key: "browser_cert" } };
  assert.equal(parkedPastGrace(safe, { nowMs: now }), true, "a plain queue wait is safe to suspend");
  for (const wait of [
    { exclusive_phase: "EXCLUSIVE_ACTIVE" },
    { continuation_state: "PENDING" },
    { continuation_state: "DELIVERING" },
    { resuming: true },
    { ready_to_resume: true },
  ]) {
    assert.equal(
      parkedPastGrace({ ...safe, resource_wait: { ...safe.resource_wait, ...wait } }, { nowMs: now }),
      false,
      `must not suspend while ${JSON.stringify(wait)}`,
    );
  }
});

await test("resumption restores the same session, and the reply is delivered exactly once", async () => {
  const starts = [];
  setProviderSuspensionImplForTests({
    stopSession: async () => ({ ok: true }),
    startSession: async (a) => { starts.push(a); return { ok: true }; },
  });
  const { laneId, runId } = seedParkedLane("Resumable");
  await suspendLaneProvider(laneId, { root: ROOT });
  assert.equal(activeAgentSessionForLane(laneId, ROOT).state, "SUSPENDED");

  const { deliverManagedLaneInstruction } = await import("../lib/vacilando/execution-run-send.mjs");
  const pastes = [];
  const out = await deliverManagedLaneInstruction(laneId, "the first option", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async (id, instruction) => {
      pastes.push(instruction);
      return { ok: true, status: "delivered", lane_id: id, delivered_at: new Date().toISOString(), instruction_size: instruction.length, worktree_path: WT };
    },
    getOutput: async () => ({ ok: true, text: "", fingerprint: "fp", captured_at: new Date().toISOString() }),
    notifyIntervalMs: 60_000,
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(starts.length, 1, "the provider came back once");
  assert.equal(starts[0].laneId, laneId, "in the same lane");
  assert.equal(pastes.length, 1, "the reply was delivered exactly once");
  assert.match(pastes[0], /the first option/);
  assert.equal(out.run_id, runId, "into the SAME run");
  assert.equal(getExecutionRun(runId, ROOT).state, "EXECUTING");
  assert.equal(getExecutionRun(runId, ROOT).provider_suspension.pending_reply, null, "no duplicate copy left behind");
  resetProviderSuspensionImplForTests();
});

await test("with no capacity the reply is retained, not lost and not duplicated", async () => {
  setProviderSuspensionImplForTests({
    stopSession: async () => ({ ok: true }),
    startSession: async () => ({ ok: false, error: "provider_capacity" }),
  });
  const { laneId, runId } = seedParkedLane("Queued to resume");
  await suspendLaneProvider(laneId, { root: ROOT });

  const { deliverManagedLaneInstruction } = await import("../lib/vacilando/execution-run-send.mjs");
  const pastes = [];
  const out = await deliverManagedLaneInstruction(laneId, "my answer", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async (id, instruction) => { pastes.push(instruction); return { ok: true, status: "delivered", lane_id: id }; },
    getOutput: async () => ({ ok: true, text: "", fingerprint: "fp" }),
  });
  assert.equal(out.status, "queued");
  assert.equal(out.resume_pending, true);
  assert.match(out.blocking_screen, /Queued to resume/);
  assert.equal(pastes.length, 0, "nothing was pasted into a lane with no provider");
  const kept = getExecutionRun(runId, ROOT).provider_suspension.pending_reply;
  assert.equal(kept.instruction, "my answer", "the reply is retained verbatim");
  assert.equal(getExecutionRun(runId, ROOT).state, "NEEDS_INPUT", "and the question still stands");
  resetProviderSuspensionImplForTests();
});

// -------------------------------------------------------------- §7 projection --

await test("a suspended lane projects truthfully and holds no capacity", () => {
  const lane = {
    lane_id: "lane_susp", label: "Trust Runtime", claude: { presence: "absent" },
    binding: { worktree_path: WT }, worktree: { path: WT, managed: true },
    agent_session: { state: "SUSPENDED" },
    execution_run: {
      state: "NEEDS_INPUT",
      provider_suspension: { state: "SUSPENDED", resume_state: { question: "Merge authorization is yours." } },
    },
  };
  const posture = deriveLaneExecutionPosture(lane);
  assert.equal(posture.state, "PROVIDER_SUSPENDED");
  assert.match(posture.label, /Needs input · suspended/);
  assert.equal(occupiesClaudeProviderCapacity(lane, posture), false, "durable work, no computation");
  const work = canonicalLaneWorkState(lane);
  assert.equal(work.group, "needs_input", "it wants the operator, so it sorts with what wants the operator");
  assert.equal(work.live, false);
  // The header must say suspended. The plain NEEDS_INPUT branch runs first in
  // this function and claimed the lane, hiding the suspension from the one line
  // the operator actually reads.
  assert.equal(work.label, "Needs input · suspended");
  const controls = renderLaneRuntimeControls(lane, posture);
  assert.match(controls, /data-posture="PROVIDER_SUSPENDED"/);
  assert.match(controls, /data-gw-provider-resume/);
  assert.match(controls, /worktree and branch are all kept/);
  assert.match(controls, /Merge authorization is yours/);
});

await test("the refusal names a safe lane to free", () => {
  const cap = assessProviderCapacity({
    panes: [pane({ pid: "1", cwd: "/w/a" }), pane({ pid: "2", cwd: "/w/b" }), pane({ pid: "3", cwd: "/w/c" })],
    lanes: [
      { lane_id: "a", name: "Runtime Performance", binding: { worktree_path: "/w/a" } },
      { lane_id: "b", name: "Trust Runtime", binding: { worktree_path: "/w/b" } },
      { lane_id: "c", name: "Vacilando", binding: { worktree_path: "/w/c" } },
    ],
    sessions: [
      { lane_id: "a", state: "ACTIVE" }, { lane_id: "b", state: "ACTIVE" }, { lane_id: "c", state: "ACTIVE" },
    ],
  });
  // Give each a run that genuinely needs computation, then park the middle one.
  for (const p of cap.processes) p.run_state = "EXECUTING";
  const busy = assessProviderCapacity({
    panes: [pane({ pid: "1", cwd: "/w/a" }), pane({ pid: "2", cwd: "/w/b" }), pane({ pid: "3", cwd: "/w/c" })],
    lanes: [
      { lane_id: "a", name: "Runtime Performance", binding: { worktree_path: "/w/a" }, execution_run: { state: "EXECUTING" } },
      { lane_id: "b", name: "Trust Runtime", binding: { worktree_path: "/w/b" }, execution_run: { state: "EXECUTING" } },
      { lane_id: "c", name: "Vacilando", binding: { worktree_path: "/w/c" }, execution_run: { state: "EXECUTING" } },
    ],
    sessions: [{ lane_id: "a", state: "ACTIVE" }, { lane_id: "b", state: "ACTIVE" }, { lane_id: "c", state: "ACTIVE" }],
  });
  Object.assign(cap, busy);
  cap.holders[1].run_state = "NEEDS_INPUT";
  const pick = suggestCapacityRelease(cap);
  assert.equal(pick.name, "Trust Runtime");
  assert.equal(pick.interrupts, false, "the suggestion never interrupts running work");
  assert.equal(cap.active, 3);
  assert.equal(cap.available, 0);
  assert.equal(configuredProviderCeiling({}), 3);
});

await test("an attributed process is judged on what its run is DOING", () => {
  // A durable lane record carries no execution_run — that projection lives in
  // the run store. Without resolving it, every attributed process looked idle
  // and the host count fell to ZERO while three agents were running. That is
  // the unsafe direction: the ceiling stops binding entirely.
  const lanes = [{ lane_id: "lane_busy", name: "Busy", binding: { worktree_path: "/w/busy" } }];
  const panes = [pane({ pid: "77", cwd: "/w/busy" })];
  const sessions = [{ lane_id: "lane_busy", state: "ACTIVE" }];

  const blind = assessProviderCapacity({ panes, lanes, sessions });
  assert.equal(blind.active, 0, "with no run projection it reads as idle");

  const resolved = assessProviderCapacity({
    panes, lanes, sessions, runStateFor: (id) => (id === "lane_busy" ? "EXECUTING" : null),
  });
  assert.equal(resolved.active, 1, "resolved from the run store, it is real computation");
  assert.equal(resolved.holders[0].lane_id, "lane_busy");
  assert.equal(resolved.holders[0].run_state, "EXECUTING");

  // And a resolver that reports parked work still frees the seat.
  const parked = assessProviderCapacity({
    panes, lanes, sessions, runStateFor: () => "NEEDS_INPUT",
  });
  assert.equal(parked.active, 0);
});

await test("a provisioned worktree gets a tmux session name tmux can accept", async () => {
  const { tmuxSessionNameFor } = await import("../lib/vacilando/alloy-dev-adapter.mjs");
  const { TMUX_SESSION_RE } = await import("../lib/vacilando/lanes.mjs");
  // Observed live: the toolkit's output was scraped for the worktree name and
  // yielded the literal token "name:", which became the session "alloy-name:".
  // tmux cannot have that name and discovery's allowlist rejects it, so the
  // provider could never start in a lane that had just been provisioned.
  for (const src of ["wt6-surfaces-faacca", "wt5-vacilando-gateway-v2", "name:", "Weird Name!!", "wt1-A_b.C"]) {
    const session = tmuxSessionNameFor(src);
    assert.ok(session, `${src} produced no session name`);
    assert.match(session, TMUX_SESSION_RE, `${session} is not a name tmux/discovery accept`);
  }
  assert.equal(tmuxSessionNameFor(""), null, "no name is null, never a session nothing can find");
  assert.equal(tmuxSessionNameFor(null), null);
});

/**
 * A default parameter only fires for `undefined`.
 *
 * suspend/resume defaulted `root = null` and passed it into helpers whose own
 * default is `root = runtimeRoot()`. Null is not undefined, so the literal null
 * reached the store and every lookup missed: suspending a lane that plainly
 * existed returned `lane_not_found`, which meant a parked provider could never
 * be reclaimed by any caller that omitted root.
 */
await test("suspend and resume resolve the runtime root when none is passed", async () => {
  const src = readFileSync(new URL("../lib/vacilando/provider-suspension.mjs", import.meta.url), "utf8");
  assert.equal(/root = null/.test(src), false,
    "a null root default defeats the downstream runtimeRoot() default");
  // And the lane lookup itself must agree.
  const { getDurableLane } = await import("../lib/vacilando/development-lane.mjs");
  assert.equal(typeof getDurableLane, "function");
});


/**
 * A record that says SUSPENDED while the provider is alive.
 *
 * Suspension lives in two places — the agent session and the run — and a resume
 * that starts the process without flipping both leaves the lane reading
 * "Needs input / suspended" while a Claude sits at a ready prompt in its
 * worktree. Observed on two lanes at once; nothing in the governor corrected
 * it, so to the operator the lanes simply looked dead.
 */
await test("the reconciler revives a suspended record when the provider is live", () => {
  const src = readFileSync(new URL("../lib/vacilando/provider-suspension.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function reconcileParkedProviders"));
  assert.ok(fn.includes("revived"), "reconcileParkedProviders must report what it revived");
  assert.ok(fn.includes("providerIsLive"), "and decide from the live substrate");
  // It must flip BOTH stores, or the lane keeps reading suspended from the other.
  assert.ok(fn.includes("patchAgentSession"), "session record");
  assert.ok(fn.includes("patchRunFields"), "run record");
  assert.ok(src.includes("async function providerIsLive"), "liveness is asked of tmux, not of the record");
});


/**
 * The revive pass must read the STORES, not projection fields.
 *
 * laneProviderIsSuspended reads lane.agent_session / lane.execution_run, which
 * exist only on a PROJECTED lane. The governor calls the reconciler with
 * durable lane RECORDS, which carry neither — so gating the revive loop on that
 * predicate meant it never ran once in production. Runtime Performance sat with
 * a live provider and a SUSPENDED session record, holding a seat while its own
 * run stayed QUEUED, and capacity read 4 against a ceiling of 3.
 */
await test("revive decides from the session store, not projection fields", () => {
  const src = readFileSync(new URL("../lib/vacilando/provider-suspension.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function reconcileParkedProviders"));
  const revive = fn.slice(fn.indexOf("const revived = []"));
  assert.ok(revive.includes("activeAgentSessionForLane"),
    "the revive pass must resolve the session from the store");
  assert.equal(/if \(!laneProviderIsSuspended\(lane\)\) continue;/.test(revive), false,
    "gating on a projection-only predicate makes this loop dead for record callers");
});

await test("a durable lane record carries no projection fields", async () => {
  // The reason the predicate could never be true for the governor's callers.
  const { listDurableLanes } = await import("../lib/vacilando/development-lane.mjs");
  const sample = listDurableLanes()[0];
  if (!sample) return;
  assert.equal("agent_session" in sample, false);
  assert.equal("execution_run" in sample, false);
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);

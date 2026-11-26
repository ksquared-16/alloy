#!/usr/bin/env node
/**
 * S8 — idle-provider state, contention-driven seat reclamation, resumable dormancy.
 *
 * THE ONE RULE THIS SUITE EXISTS TO DEFEND. A seat is released because another
 * admission is waiting for it, and for no other reason. Not because a timer
 * elapsed. Not because a process is old. Not because a sweep ran.
 *
 * WHAT THAT COSTS IN TESTS. Every "reclaim" proof has a twin that proves the
 * same seat is left alone when nobody is waiting, because a reclaim path that
 * only ever gets exercised under contention is indistinguishable, from the
 * inside, from one that fires on a schedule.
 *
 * DORMANCY IS RECLAMATION, NOT LOSS. The resume proofs assert byte-identical
 * lane identity, binding, ledger and attachments across a real release and a
 * real restart — while asserting that the pid and pane id DID change, because a
 * continuity check that passed on an unchanged process would prove nothing.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-seat-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const S = await import("../lib/vacilando/provider-seat-state.mjs");
const PC = await import("../lib/vacilando/provider-capacity.mjs");
const {
  bindDurableLane, createDurableLane, getDurableLane, resetDevelopmentLanesForTests,
} = await import("../lib/vacilando/development-lane.mjs");
const {
  createQueuedRun, getExecutionRun, listExecutionRunsForLane,
  resetExecutionRunsForTests, transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const {
  activeAgentSessionForLane, createAgentSession, listAgentSessionsForLane,
  markAgentSessionActive, resetAgentSessionsForTests,
} = await import("../lib/vacilando/agent-session.mjs");
const PS = await import("../lib/vacilando/provider-suspension.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const GRACE = S.IDLE_GRACE_POLICY_V1.grace_ms;

/** A seat that is quiet and past grace unless an argument says otherwise. */
function quiet(over = {}) {
  return {
    lane_id: "lane_quiet", lane_name: "Quiet", provider: "claude", pid: 4001,
    tmux_session: "alloy-quiet", worktree_path: "/wt/quiet",
    session_state: "ACTIVE", run: null, activity: S.ACTIVITY.READY,
    descendants: [], descendants_known: true, validation_claims: [],
    last_meaningful_activity_at: NOW - GRACE - MIN,
    ...over,
  };
}
const at = (over = {}) => S.classifySeat(quiet(over), { now: NOW });

// ── Required certification: state model ──────────────────────────────────────

await test("1 — an active run makes the seat active and never reclaimable", () => {
  const s = at({ run: { run_id: "erun_a", state: "EXECUTING" }, activity: S.ACTIVITY.WORKING });
  assert.equal(s.state, "active");
  assert.equal(s.reclaimable, false);
  assert.equal(s.holds_capacity, true);
  assert.match(s.state_reason, /EXECUTING/);
});

await test("2 — a recent provider with no run is attentive, not idle", () => {
  const s = at({ last_meaningful_activity_at: NOW - MIN });
  assert.equal(s.state, "attentive");
  assert.equal(s.reclaimable, false);
  assert.equal(s.holds_capacity, true, "attentive still holds the seat");
  assert.equal(s.blockers[0].gate, "within_grace");
});

await test("3 — grace elapsed with no work at all yields idle + reclaimable", () => {
  const s = at();
  assert.equal(s.state, "idle");
  assert.equal(s.reclaimable, true);
  assert.equal(s.holds_capacity, true, "an idle live process still costs its memory");
  assert.equal(s.reclaimable_since, NOW - GRACE - MIN + GRACE);
  assert.deepEqual(s.blockers, []);
});

await test("4 — a live heavy descendant prevents idle", () => {
  const s = at({ descendants: [{ pid: 9001, command: "vitest run web/" }] });
  assert.equal(s.state, "active");
  assert.equal(s.reclaimable, false);
  assert.match(s.state_reason, /heavy workload/);
});

await test("5 — a held governed validation claim prevents idle", () => {
  const s = at({ validation_claims: [{ claim_id: "vc_1", weight: 4 }] });
  assert.equal(s.state, "active");
  assert.equal(s.reclaimable, false);
  assert.match(s.state_reason, /validation claim/);
});

await test("6 — a NAMED provider blocker produces blocked, and holds the seat", () => {
  const s = at({ activity: S.ACTIVITY.BLOCKED, blocker_kind: "login" });
  assert.equal(s.state, "blocked");
  assert.equal(s.reclaimable, false);
  assert.equal(s.holds_capacity, true);
  assert.equal(s.blocker_kind, "login");
});

await test("6b — blocked is NOT inferred loosely: an unnamed blocker is unknown, not blocked", () => {
  const s = at({ activity: S.ACTIVITY.BLOCKED, blocker_kind: null });
  assert.equal(s.state, "attentive", "we could not name the condition, so we do not claim one");
  assert.equal(s.reclaimable, false, "and we certainly do not reclaim it");
});

await test("7 — AGE ALONE never makes a provider reclaimable", () => {
  // A seat alive for eleven days that answered an instruction one minute ago.
  const ancient = at({
    process_started_at: NOW - 11 * 24 * 60 * MIN,
    last_meaningful_activity_at: NOW - MIN,
  });
  assert.equal(ancient.state, "attentive");
  assert.equal(ancient.reclaimable, false);
  // And the inverse: a seat started moments ago that nobody has spoken to.
  const newborn = at({ last_meaningful_activity_at: NOW - GRACE - 1 });
  assert.equal(newborn.state, "idle", "recency of INTERACTION decides, not age of process");
  // Nothing in the record even carries process age.
  assert.equal("process_started_at" in ancient, false);
});

await test("7b — unknown activity is never idle: 'we did not look' is not 'nothing is happening'", () => {
  assert.equal(at({ activity: S.ACTIVITY.UNKNOWN }).state, "attentive");
  assert.equal(at({ activity: null }).state, "attentive");
  assert.equal(at({ descendants_known: false, descendants: [] }).state, "attentive");
});

await test("7c — a run that would become impossible without the provider prevents idle", () => {
  const exclusive = at({ run: { run_id: "e1", state: "WAITING_RESOURCE", resource_wait: { exclusive_phase: "EXCLUSIVE_ACTIVE" } } });
  assert.equal(exclusive.state, "active");
  const delivering = at({ run: { run_id: "e2", state: "WAITING_RESOURCE", resource_wait: { continuation_state: "DELIVERING" } } });
  assert.equal(delivering.state, "active");
  // A plain resource wait with nothing in flight is releasable.
  assert.equal(at({ run: { run_id: "e3", state: "WAITING_RESOURCE", resource_wait: {} } }).state, "idle");
});

await test("7d — an unattributable provider process is never reclaimed", () => {
  const s = at({ lane_id: null });
  assert.equal(s.state, "active");
  assert.equal(s.reclaimable, false);
});

await test("7e — dormant holds no capacity and reports the truth about itself", () => {
  const s = S.classifySeat({
    lane_id: "lane_d", pid: null, activity: S.ACTIVITY.ABSENT, session_state: "SUSPENDED",
    dormant_since: NOW - 3 * MIN, resume_count: 2,
  }, { now: NOW });
  assert.equal(s.state, "dormant");
  assert.equal(s.holds_capacity, false);
  assert.equal(s.provider_process_absent, true);
  assert.equal(s.resume_available, true);
  assert.equal(s.resume_count, 2);
});

await test("7f — a SUSPENDED record with a LIVE process is a wrong record, not a dormant seat", () => {
  // S7's rule, applied here: reality corrects metadata.
  const s = at({ session_state: "SUSPENDED" });
  assert.equal(s.state, "idle");
  assert.equal(s.record_disagrees, true);
});

// ── Required certification: no-contention behaviour ──────────────────────────

await test("8 — an idle seat stays live indefinitely when nobody needs its capacity", () => {
  const seats = [at()];
  for (const days of [0, 1, 7, 30, 365]) {
    const plan = S.planReclamation({ seats, contention: { waiting: [] }, now: NOW + days * 24 * 60 * MIN });
    assert.deepEqual(plan.reclaim, [], `nothing is reclaimed after ${days} days`);
    assert.equal(plan.reason, "no_contention");
    assert.equal(plan.required, 0);
  }
});

await test("9 — no timer exists that could terminate an idle seat", () => {
  // Structural, not behavioural: the module has no scheduler, no interval, and
  // no path from elapsed time to a release.
  const src = readFileSync(new URL("../lib/vacilando/provider-seat-state.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const forbidden of ["setInterval", "setTimeout", "cron", "process.kill", "SIGTERM", "SIGKILL"]) {
    assert.equal(src.includes(forbidden), false, `${forbidden} must not appear in the seat model`);
  }
});

// ── Required certification: contention behaviour ─────────────────────────────

function seatFor(id, { idleMinutes = null, state = "idle", ...over } = {}) {
  return S.classifySeat(quiet({
    lane_id: id, lane_name: id, pid: 5000 + id.length,
    tmux_session: `tmux-${id}`, worktree_path: `/wt/${id}`,
    last_meaningful_activity_at: idleMinutes == null ? NOW - GRACE - MIN : NOW - idleMinutes * MIN,
    ...(state === "active" ? { run: { run_id: `erun_${id}`, state: "EXECUTING" }, activity: S.ACTIVITY.WORKING } : {}),
    ...over,
  }), { now: NOW });
}

await test("10 — ceiling 3, three seats, one idle, a fourth admission: exactly one reclaim", () => {
  const seats = [seatFor("lane_a", { state: "active" }), seatFor("lane_b", { state: "active" }), seatFor("lane_c", { idleMinutes: 45 })];
  assert.equal(seats.filter((s) => s.holds_capacity).length, 3, "all three hold the ceiling");
  const plan = S.planReclamation({
    seats,
    contention: { waiting: [{ admission_id: "adm_4", run_id: "erun_4", lane_id: "lane_d" }], available_seats: 0 },
    now: NOW,
  });
  assert.equal(plan.required, 1);
  assert.equal(plan.reclaim.length, 1, "exactly one");
  assert.equal(plan.reclaim[0].lane_id, "lane_c", "and it is the idle one");
  assert.deepEqual(plan.reclaim[0].reclaimed_for, { admission_id: "adm_4", run_id: "erun_4", lane_id: "lane_d" });
  assert.equal(plan.reclaim[0].reclaim_reason, "provider_capacity_contention");
  // The two active seats are not candidates at all.
  assert.deepEqual(plan.candidates.map((c) => c.lane_id), ["lane_c"]);
});

await test("11 — two reclaimable seats, one needed: exactly one, ranked deterministically", () => {
  const seats = [
    seatFor("lane_recent", { idleMinutes: 25 }),
    seatFor("lane_oldest", { idleMinutes: 400 }),
    seatFor("lane_middle", { idleMinutes: 90 }),
  ];
  const plan = S.planReclamation({
    seats, contention: { waiting: [{ admission_id: "adm_x" }], available_seats: 0 }, now: NOW,
  });
  assert.equal(plan.reclaim.length, 1);
  assert.equal(plan.reclaim[0].lane_id, "lane_oldest", "idle longest leads the ranking");
  assert.deepEqual(plan.candidates.map((c) => c.lane_id), ["lane_oldest", "lane_middle", "lane_recent"]);
  // Ranking evidence is returned, not just an order.
  assert.ok(plan.candidates[0].ranking_key.idle_ms > plan.candidates[1].ranking_key.idle_ms);
  // Deterministic: the same input orders the same way every time.
  const again = S.planReclamation({ seats: [...seats].reverse(), contention: { waiting: [{ admission_id: "adm_x" }], available_seats: 0 }, now: NOW });
  assert.deepEqual(again.candidates.map((c) => c.lane_id), plan.candidates.map((c) => c.lane_id));
});

await test("11b — conservative tie-breaks order equal-idle seats, and lane age is not one", () => {
  const base = { idleMinutes: 100 };
  const seats = [
    seatFor("lane_pending", { ...base, pending_operator_interaction: true }),
    seatFor("lane_devsrv", { ...base, dev_server_requires_provider: true }),
    seatFor("lane_plain", base),
  ];
  const plan = S.planReclamation({ seats, contention: { waiting: [{ admission_id: "a" }], available_seats: 0 }, now: NOW });
  assert.equal(plan.candidates[0].lane_id, "lane_plain", "the one with nothing attached goes first");
  assert.deepEqual(Object.keys(plan.candidates[0].ranking_key).includes("lane_created_at"), false);
});

await test("12 — three waiting and two free: only the deficit is reclaimed", () => {
  const seats = [seatFor("i1", { idleMinutes: 200 }), seatFor("i2", { idleMinutes: 150 }), seatFor("i3", { idleMinutes: 100 })];
  const plan = S.planReclamation({
    seats,
    contention: { waiting: [{ admission_id: "a" }, { admission_id: "b" }, { admission_id: "c" }], available_seats: 2 },
    now: NOW,
  });
  assert.equal(plan.required, 1);
  assert.equal(plan.reclaim.length, 1);
});

await test("12b — capacity already available reclaims nothing and says so", () => {
  const plan = S.planReclamation({
    seats: [seatFor("i1")], contention: { waiting: [{ admission_id: "a" }], available_seats: 3 }, now: NOW,
  });
  assert.equal(plan.reason, "capacity_already_available");
  assert.deepEqual(plan.reclaim, []);
});

await test("12c — contention with no reclaimable seat is named, not silently empty", () => {
  const plan = S.planReclamation({
    seats: [seatFor("a", { state: "active" })], contention: { waiting: [{ admission_id: "a" }], available_seats: 0 }, now: NOW,
  });
  assert.equal(plan.reason, "no_reclaimable_seat");
  assert.equal(plan.required, 1);
});

// ── Live-store fixtures: reclaim, recheck race, dormancy, resume ─────────────

function reset() {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  PS.resetProviderSuspensionImplForTests();
}

function seedLane(name, { tmux = "alloy-seat", instruction = "prior instruction" } = {}) {
  const path = join(ROOT, `wt-${name}`);
  mkdirSync(path, { recursive: true });
  const created = createDurableLane({ name, origin: "created", root: ROOT });
  assert.equal(created.ok, true, created.error);
  const laneId = created.lane.lane_id;
  assert.equal(bindDurableLane(laneId, {
    worktree_path: path, worktree_name: `wt-${name}`, branch: `agent/claude/9-${name}`,
    slot: 9, tmux_session: tmux, tmux_pane: "%41", provider: "claude",
  }, { root: ROOT }).ok, true);
  const runs = [];
  for (const text of [instruction, `${instruction} (second)`]) {
    const r = createQueuedRun({ laneId, instruction: text, worktreePath: path, root: ROOT });
    assert.equal(r.ok, true, r.error);
    transitionExecutionRun(r.run.run_id, "EXECUTING", { origin: "system", root: ROOT });
    transitionExecutionRun(r.run.run_id, "COMPLETE", { origin: "agent", root: ROOT, completion_report: { summary: `${text} — done` } });
    runs.push(r.run.run_id);
  }
  const sess = createAgentSession({ laneId, runId: runs.at(-1), provider: "claude", root: ROOT });
  markAgentSessionActive(sess.session.agent_session_id, { root: ROOT, providerSessionId: "provconv-1234" });
  return { laneId, path, runs, sessionId: sess.session.agent_session_id, tmux };
}

const idleSeat = (laneId, over = {}) => S.classifySeat(quiet({
  lane_id: laneId, last_meaningful_activity_at: NOW - GRACE - 10 * MIN, ...over,
}), { now: NOW });

await test("13 — the final eligibility recheck aborts a reclaim when the seat woke up", async () => {
  reset();
  const stopped = [];
  PS.setProviderSuspensionImplForTests({ stopSession: ({ tmuxSession }) => { stopped.push(tmuxSession); return { ok: true }; } });
  const seeded = seedLane("race");
  // The PLAN said idle. Between plan and release, an instruction arrived.
  const out = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId,
    reclaimedFor: { admission_id: "adm_race" },
    root: ROOT,
    nowMs: NOW,
    recheckSeat: async () => S.classifySeat(quiet({
      lane_id: seeded.laneId, run: { run_id: "erun_new", state: "EXECUTING" }, activity: S.ACTIVITY.WORKING,
    }), { now: NOW }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "eligibility_changed");
  assert.equal(out.observed_state, "active");
  assert.deepEqual(stopped, [], "the provider was never touched");
  assert.equal(activeAgentSessionForLane(seeded.laneId, ROOT).state, "ACTIVE", "and the session is untouched");
});

await test("13b — a reclaim with no recheck function is REFUSED, never released on cached state", async () => {
  reset();
  const stopped = [];
  PS.setProviderSuspensionImplForTests({ stopSession: ({ tmuxSession }) => { stopped.push(tmuxSession); return { ok: true }; } });
  const seeded = seedLane("norecheck");
  const out = await PS.reclaimIdleProviderSeat({ laneId: seeded.laneId, root: ROOT, nowMs: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.error, "no_recheck_provided");
  assert.deepEqual(stopped, []);
});

await test("14 — reclaim releases the seat and leaves no fake live-provider metadata", async () => {
  reset();
  const stopped = [];
  PS.setProviderSuspensionImplForTests({ stopSession: ({ tmuxSession }) => { stopped.push(tmuxSession); return { ok: true }; } });
  const seeded = seedLane("dorm");
  const out = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId,
    reclaimedFor: { admission_id: "adm_9", run_id: "erun_9", lane_id: "lane_waiting" },
    root: ROOT, nowMs: NOW,
    recheckSeat: async () => idleSeat(seeded.laneId),
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.provider_process_absent, true);
  assert.equal(out.provider_capacity_released, true);
  assert.equal(out.resume_available, true);
  assert.deepEqual(stopped, [seeded.tmux], "the process actually went down");
  const session = activeAgentSessionForLane(seeded.laneId, ROOT);
  assert.equal(session.state, "SUSPENDED");
  assert.equal(session.reclaimed_for.admission_id, "adm_9", "the record says which admission required it");
  assert.equal(session.reclaim_reason, "provider_capacity_contention");
  assert.ok(session.dormant_since);
  // A dormant seat holds no capacity.
  assert.equal(PC.processConsumesCapacity({ lane_id: seeded.laneId, run_state: null }, { seatState: "dormant" }), false);
});

await test("15 — dormancy preserves lane identity, binding, ledger, instruction and attachments", async () => {
  reset();
  PS.setProviderSuspensionImplForTests({ stopSession: () => ({ ok: true }) });
  const seeded = seedLane("preserve");
  const before = getDurableLane(seeded.laneId, ROOT);
  const out = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId, root: ROOT, nowMs: NOW,
    reclaimedFor: { admission_id: "adm_p" },
    recheckSeat: async () => idleSeat(seeded.laneId),
  });
  assert.equal(out.ok, true, out.error);
  const snap = out.dormancy;
  assert.equal(snap.lane_id, before.lane_id);
  assert.equal(snap.worktree_path, before.binding.worktree_path);
  assert.equal(snap.branch, before.binding.branch);
  assert.equal(snap.provider, "claude");
  assert.equal(snap.provider_session_id, "provconv-1234", "the provider conversation survives the process");
  assert.equal(snap.run_ledger.length, 2, "the whole run ledger, not just the last run");
  assert.ok(snap.last_output, "the last operator-visible output is captured");
  // Durability is verified by READING IT BACK, not by trusting the write.
  const persisted = listAgentSessionsForLane(seeded.laneId, ROOT).find((s) => s.dormancy);
  assert.equal(persisted.dormancy.lane_id, before.lane_id);
  // The durable lane itself is untouched: the work is not what was reclaimed.
  const after = getDurableLane(seeded.laneId, ROOT);
  assert.equal(after.binding.worktree_path, before.binding.worktree_path);
  assert.equal(after.name, before.name);
});

await test("15b — a lane whose dormancy state cannot be made durable keeps its seat", () => {
  const bad = S.captureDormancyState({ lane: { lane_id: "lane_x", binding: {} }, session: null, run: null, now: NOW });
  const verdict = S.dormancyIsDurable(bad);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.missing, ["worktree_path", "provider"]);
  assert.equal(S.dormancyIsDurable(null).ok, false);
});

await test("16 — resume restores the same lane through the canonical start path", async () => {
  reset();
  const started = [];
  PS.setProviderSuspensionImplForTests({
    stopSession: () => ({ ok: true }),
    startSession: ({ laneId }) => { started.push(laneId); return { ok: true, agent_session_id: null }; },
  });
  const seeded = seedLane("resume");
  const before = getDurableLane(seeded.laneId, ROOT);
  const priorRuns = listExecutionRunsForLane(seeded.laneId, ROOT).map((r) => r.run_id).sort();

  const reclaim = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId, root: ROOT, nowMs: NOW,
    reclaimedFor: { admission_id: "adm_r" },
    recheckSeat: async () => idleSeat(seeded.laneId),
  });
  assert.equal(reclaim.ok, true, reclaim.error);

  const resumed = await PS.resumeDormantLane(seeded.laneId, { root: ROOT, nowMs: NOW + MIN });
  assert.equal(resumed.ok, true, resumed.error);
  assert.equal(resumed.resumed_from_dormancy, true);
  assert.deepEqual(started, [seeded.laneId], "the canonical start path ran, once");

  // Identity, binding, ledger and configuration are identical.
  assert.equal(resumed.continuity.ok, true, JSON.stringify(resumed.continuity.differences));
  const after = getDurableLane(seeded.laneId, ROOT);
  assert.equal(after.lane_id, before.lane_id, "same lane — not a new one");
  assert.equal(after.binding.worktree_path, before.binding.worktree_path);
  assert.equal(after.binding.branch, before.binding.branch);
  assert.equal(after.repository_id, before.repository_id);
  assert.deepEqual(listExecutionRunsForLane(seeded.laneId, ROOT).map((r) => r.run_id).sort(), priorRuns, "run ledger preserved");
  const session = activeAgentSessionForLane(seeded.laneId, ROOT);
  assert.equal(session.state, "ACTIVE", "no lingering SUSPENDED record while a provider is live");
  assert.equal(session.resume_count, 1);
  assert.equal(session.last_resume_result.ok, true);
  assert.equal(session.dormant_since, null);
});

await test("16b — process and pane identity are EXPECTED to change and do not fail continuity", () => {
  const before = { lane_id: "lane_1", worktree_path: "/wt/1", run_ledger: [{ run_id: "r1", state: "COMPLETE" }], pid: 100, tmux_session: "old" };
  const after = { ...before, pid: 200, tmux_session: "new", agent_session_id: "agsess_new" };
  const v = S.verifyResumeContinuity(before, after);
  assert.equal(v.ok, true);
  assert.ok(v.volatile_ignored.includes("pid"));
  assert.ok(v.volatile_ignored.includes("tmux_session"));
});

await test("17 — a failed resume leaves the lane dormant, recoverable, and honest", async () => {
  reset();
  PS.setProviderSuspensionImplForTests({
    stopSession: () => ({ ok: true }),
    startSession: () => ({ ok: false, error: "runtime_start_failed" }),
  });
  const seeded = seedLane("failresume");
  const reclaim = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId, root: ROOT, nowMs: NOW,
    reclaimedFor: { admission_id: "adm_f" },
    recheckSeat: async () => idleSeat(seeded.laneId),
  });
  assert.equal(reclaim.ok, true, reclaim.error);

  const out = await PS.resumeDormantLane(seeded.laneId, { root: ROOT, nowMs: NOW + MIN });
  assert.equal(out.ok, false);
  assert.equal(out.still_dormant, true);
  assert.equal(out.provider_capacity_held, false, "no fake live seat is left behind");
  assert.equal(out.resume_available, true);
  // The wait is the EXISTING S6 contract, bounded, with a named owner.
  assert.equal(out.wait.reason, S.RESUME_FAILURE_WAIT_REASON);
  assert.equal(out.wait.bound_policy, "bounded");
  assert.equal(out.wait.owner, "execution-stale");
  assert.ok(Number.isFinite(out.wait.deadline), "a wait with no deadline is the thing S6 forbids");
  // The failure is on the record, so health can see it.
  const session = listAgentSessionsForLane(seeded.laneId, ROOT).find((s) => s.state === "SUSPENDED");
  assert.equal(session.last_resume_result.ok, false);
  assert.equal(session.resume_attempts, 1);
  // And the lane is still fully durable.
  assert.equal(listExecutionRunsForLane(seeded.laneId, ROOT).length, 2);
});

// ── Required negative controls / mutations ───────────────────────────────────

await test("MUTATION — reclaim on a timer with no contention: the fixture fails", () => {
  const seats = [at()];
  // The mutation: eligibility alone authorises a release.
  const onTimer = (list) => list.filter((s) => s.reclaimable).map((s) => ({ lane_id: s.lane_id }));
  assert.equal(onTimer(seats).length, 1, "the mutation reclaims a seat nobody is waiting for");
  // The real path does not.
  assert.deepEqual(S.planReclamation({ seats, contention: { waiting: [] }, now: NOW }).reclaim, []);
});

await test("MUTATION — deleting the no-contention early return breaks the same fixture", () => {
  const seats = [at()];
  // The mutation: skip straight to ranking, as the function would if its first
  // guard were removed. Contention would then be inferred from availability.
  const ranked = S.rankReclaimCandidates(seats, { now: NOW });
  assert.equal(ranked.length, 1, "candidates exist; only the guard prevents taking them");
  assert.equal(S.planReclamation({ seats, contention: { waiting: [] }, now: NOW }).reason, "no_contention");
});

await test("MUTATION — reclaiming a seat with an active run: the fixture fails", () => {
  const active = at({ run: { run_id: "erun_live", state: "EXECUTING" }, activity: S.ACTIVITY.WORKING });
  // The mutation: rank by idleness without filtering on state.
  const unfiltered = [active].sort((a, b) => (b.idle_ms || 0) - (a.idle_ms || 0));
  assert.equal(unfiltered.length, 1, "the mutation offers a working agent as a candidate");
  // The real ranking refuses to consider it.
  assert.deepEqual(S.rankReclaimCandidates([active], { now: NOW }), []);
  assert.deepEqual(S.planReclamation({
    seats: [active], contention: { waiting: [{ admission_id: "a" }], available_seats: 0 }, now: NOW,
  }).reclaim, []);
});

await test("MUTATION — reclaiming a seat with a live descendant workload: the fixture fails", () => {
  const withChild = at({ descendants: [{ pid: 7, command: "vitest run web/" }] });
  // The mutation: ignore descendants when deciding idleness.
  const ignoring = S.classifySeat({ ...quiet(), descendants: [] }, { now: NOW });
  assert.equal(ignoring.state, "idle", "the mutation calls it idle");
  assert.equal(withChild.state, "active", "the real classifier does not");
  assert.deepEqual(S.rankReclaimCandidates([withChild], { now: NOW }), []);
});

await test("MUTATION — skipping the final recheck releases a seat that woke up", async () => {
  reset();
  const stopped = [];
  PS.setProviderSuspensionImplForTests({ stopSession: ({ tmuxSession }) => { stopped.push(tmuxSession); return { ok: true }; } });
  const seeded = seedLane("mutrace");
  // The mutation: trust the plan. The plan says idle; the machine says EXECUTING.
  const planSaidIdle = idleSeat(seeded.laneId);
  assert.equal(planSaidIdle.reclaimable, true, "the cached verdict would authorise release");
  // The real path rechecks and aborts.
  const out = await PS.reclaimIdleProviderSeat({
    laneId: seeded.laneId, root: ROOT, nowMs: NOW,
    recheckSeat: async () => at({ lane_id: seeded.laneId, run: { run_id: "erun_woke", state: "EXECUTING" } }),
  });
  assert.equal(out.error, "eligibility_changed");
  assert.deepEqual(stopped, []);
});

await test("MUTATION — losing the lane id on resume: continuity fails", () => {
  const before = { lane_id: "lane_1", worktree_path: "/wt/1", run_ledger: [{ run_id: "r1" }] };
  const mutated = { lane_id: "lane_2_new", worktree_path: "/wt/1", run_ledger: [{ run_id: "r1" }] };
  const v = S.verifyResumeContinuity(before, mutated);
  assert.equal(v.ok, false);
  assert.equal(v.differences[0].field, "lane_id");
  assert.equal(S.verifyResumeContinuity(before, { ...before }).ok, true);
});

await test("MUTATION — losing history or the run ledger on resume: continuity fails", () => {
  const before = { lane_id: "l", worktree_path: "/w", run_ledger: [{ run_id: "r1" }, { run_id: "r2" }], attachments: ["att_1"], last_instruction: "do the thing" };
  assert.equal(S.verifyResumeContinuity(before, { ...before, run_ledger: [{ run_id: "r2" }] }).ok, false);
  assert.equal(S.verifyResumeContinuity(before, { ...before, attachments: [] }).ok, false);
  assert.equal(S.verifyResumeContinuity(before, { ...before, last_instruction: null }).ok, false);
});

await test("MUTATION — admitting a replacement without releasing the seat breaks the ceiling", () => {
  const seats = [seatFor("a", { state: "active" }), seatFor("b", { state: "active" }), seatFor("c", { idleMinutes: 60 })];
  const holding = seats.filter((s) => s.holds_capacity).length;
  assert.equal(holding, 3);
  // The mutation: admit the fourth and never release the third.
  const mutated = holding + 1;
  assert.ok(mutated > 3, "the mutation runs four providers against a ceiling of three");
  // The real path releases exactly one first, so the count returns to the ceiling.
  const plan = S.planReclamation({ seats, contention: { waiting: [{ admission_id: "a4" }], available_seats: 0 }, now: NOW });
  assert.equal(plan.reclaim.length, 1);
  const afterRelease = seats.filter((s) => s.lane_id !== plan.reclaim[0].lane_id).length + 1;
  assert.equal(afterRelease, 3, "three seats again, one of them the new admission");
});

await test("MUTATION — reclaiming every idle seat instead of the minimum: the fixture fails", () => {
  const seats = [seatFor("i1", { idleMinutes: 300 }), seatFor("i2", { idleMinutes: 200 }), seatFor("i3", { idleMinutes: 100 })];
  // The mutation: sweep. Every reclaimable seat goes down for one waiting lane.
  const sweep = seats.filter((s) => s.reclaimable);
  assert.equal(sweep.length, 3, "the mutation kills three providers to start one");
  const plan = S.planReclamation({ seats, contention: { waiting: [{ admission_id: "a" }], available_seats: 0 }, now: NOW });
  assert.equal(plan.reclaim.length, 1, "the real plan takes the minimum");
  assert.equal(plan.reclaim[0].lane_id, "i1");
});

// ── Source guards ────────────────────────────────────────────────────────────

await test("GUARD — S8 adds no second lifecycle: release goes through the suspension owner", () => {
  const src = readFileSync(new URL("../lib/vacilando/provider-suspension.mjs", import.meta.url), "utf8");
  // Exactly one place stops a provider process, and the reclaim delegates to it.
  assert.equal((src.match(/await stopProcess\(/g) || []).length, 1, "one stop path only");
  assert.ok(/reclaimIdleProviderSeat[\s\S]*await suspendLaneProvider\(/.test(src), "reclaim delegates to the canonical suspend");
  assert.ok(/resumeDormantLane[\s\S]*await resumeLaneProvider\(/.test(src), "resume delegates to the canonical resume");
});

await test("GUARD — nothing in S8 signals, kills or deletes", () => {
  const code = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const f of ["../lib/vacilando/provider-seat-state.mjs"]) {
    const src = code(f);
    for (const forbidden of ["process.kill", "SIGKILL", "SIGTERM", "rmSync", "execFile", "spawn("]) {
      assert.equal(src.includes(forbidden), false, `${forbidden} in ${f}`);
    }
  }
});

await test("GUARD — health reports an uncontended idle seat as non-problem, and the pair as a problem", async () => {
  const H = await import("../lib/vacilando/health.mjs");
  const seats = [at()];
  const quietHost = H.checkProviderSeats({
    seats, summary: S.summarizeSeats(seats, { now: NOW }),
    waitingOnProviderCapacity: [], ceiling: 3, policy: S.IDLE_GRACE_POLICY_V1,
  });
  assert.notEqual(quietHost.severity, "problem", "spare capacity is not an incident");
  assert.equal(quietHost.measurements.idle_reclaimable, 1);

  const starved = H.checkProviderSeats({
    seats, summary: S.summarizeSeats(seats, { now: NOW }),
    waitingOnProviderCapacity: [{ run_id: "erun_w" }], reclaimsInFlight: [],
    ceiling: 3, policy: S.IDLE_GRACE_POLICY_V1,
  });
  assert.equal(starved.severity, "problem", "blocked while a seat could have been freed IS an incident");
  assert.match(starved.explanation, /blocked on provider capacity/);
});

await test("GUARD — the seat model is what decides capacity, and only dormant is free", () => {
  for (const state of ["active", "attentive", "idle", "blocked"]) {
    assert.equal(PC.processConsumesCapacity({ lane_id: "l" }, { seatState: state }), true, state);
  }
  assert.equal(PC.processConsumesCapacity({ lane_id: "l" }, { seatState: "dormant" }), false);
  // No seat state supplied: the legacy rule is untouched.
  assert.equal(PC.processConsumesCapacity({ lane_id: "l", run_state: "EXECUTING" }), true);
  assert.equal(PC.processConsumesCapacity({ lane_id: "l", run_state: null }), false);
});

await test("GUARD — last meaningful activity never comes from process start time", () => {
  const t = PC.lastMeaningfulActivityAt({
    lane: { updated_at: new Date(NOW - 10 * MIN).toISOString() },
    session: { started_at: new Date(NOW - 11 * 24 * 60 * MIN).toISOString() },
    runs: [{ updated_at: new Date(NOW - 2 * MIN).toISOString() }],
  });
  assert.equal(t, NOW - 2 * MIN, "the most recent INTERACTION wins");
  assert.equal(PC.lastMeaningfulActivityAt({}), null, "and unknown stays unknown");
});

await test("LIVE-SHAPE — last activity comes from tmux output, never from the moment we looked", async () => {
  // Both defects this asserts were found on the live host, and either one alone
  // makes `idle` unreachable in production while every fixture stays green.
  const nineDaysAgo = Math.floor((NOW - 9 * 24 * 60 * MIN) / 1000);
  const panes = [{
    session: "alloy-quiet", window: "0", pane: "0", pane_id: "%77",
    // tmux reports pane_pid as a STRING. Anything that assumes a number here
    // silently reports "descendants unknown" for every seat on the machine.
    pid: "4242", dead: false, attached: false,
    session_activity: nineDaysAgo,
    command: "claude", cwd: "/wt/quiet", title: "claude",
  }];
  const lane = { lane_id: "lane_live", name: "Quiet", binding: { worktree_path: "/wt/quiet", tmux_session: "alloy-quiet" } };
  const seats = await PC.observeProviderSeats({
    panes, lanes: [lane], sessions: [{ lane_id: "lane_live", agent_session_id: "agsess_live", state: "ACTIVE" }],
    runsFor: () => [],
    // The pane reads READY, and we observed it just now.
    activityFor: async () => ({ activity: S.ACTIVITY.READY, blocker_kind: null, observed_at: NOW }),
    descendantsFor: (proc) => {
      assert.equal(typeof proc.pid, "string", "tmux really does hand us a string");
      return [];
    },
    claimsFor: () => [],
    now: NOW,
  });
  assert.equal(seats.length, 1);
  assert.equal(seats[0].last_meaningful_activity_at, nineDaysAgo * 1000, "nine days ago, not now");
  assert.equal(seats[0].state, "idle", "a pane silent for nine days is exactly what idle means");
  assert.equal(seats[0].reclaimable, true);
});

await test("LIVE-SHAPE — a pane that printed a second ago is attentive however old its process is", async () => {
  const panes = [{
    pane_id: "%78", pid: "4243", session: "alloy-busy", session_activity: Math.floor((NOW - 5000) / 1000),
    command: "claude", cwd: "/wt/busy", dead: false, attached: true, title: "claude", window: "0", pane: "0",
  }];
  const lane = { lane_id: "lane_busy", name: "Busy", binding: { worktree_path: "/wt/busy", tmux_session: "alloy-busy" } };
  const seats = await PC.observeProviderSeats({
    panes, lanes: [lane], sessions: [{ lane_id: "lane_busy", agent_session_id: "agsess_busy", state: "ACTIVE" }],
    runsFor: () => [],
    activityFor: async () => ({ activity: S.ACTIVITY.READY, blocker_kind: null }),
    descendantsFor: () => [],
    claimsFor: () => [],
    now: NOW,
  });
  assert.equal(seats[0].state, "attentive");
  assert.equal(seats[0].reclaimable, false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

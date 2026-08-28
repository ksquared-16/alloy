#!/usr/bin/env node
/**
 * S6 — run bounds and waiting-state durability.
 *
 * THE GAP THIS CLOSES. Fixture Proof sat QUEUED for 2.8 days on
 * `waiting_for_agent_session` for a lane with no worktree binding — a session
 * that could never arrive. Nothing owned that wait, so nothing could end it.
 *
 * THE TWO THINGS THAT MUST NEVER REGRESS.
 *
 * A machine or resource wait cannot survive past its bound without either
 * resolving or becoming terminal. And a deliberate human wait can stay
 * non-terminal for as long as it takes WITHOUT being called stale — because
 * `human_indefinite` is an explicit policy, not the absence of a bound.
 *
 * Age is never the verdict. A five-day NEEDS_INPUT is healthy; a five-minute
 * expired send lock is not.
 */
import assert from "node:assert/strict";

const W = await import("../lib/vacilando/run-wait.mjs");

let pass = 0;
let fail = 0;
const started = [];
function test(name, fn) {
  const p = (async () => {
    try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
    catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  })();
  started.push(p);
  return p;
}

const T0 = 1_800_000_000_000;
const mk = (reason, over = {}) => W.describeWait({ reason, waiting_since: T0, now: T0, ...over });

// ── Contract ─────────────────────────────────────────────────────────────────

await test("every wait descriptor carries the full contract", () => {
  const d = mk("waiting_for_agent_session", { resource_id: "lane_x" });
  for (const k of ["reason", "resource_type", "resource_id", "owner", "waiting_since",
    "deadline", "bound_policy", "last_observed_at", "resolution_state"]) {
    assert.ok(k in d, `missing ${k}`);
  }
  assert.equal(d.schema_version, W.RUN_WAIT_SCHEMA);
  assert.equal(d.owner, "agent-session-lifecycle", "every condition names its canonical owner");
  assert.ok(W.BOUND_POLICIES.includes(d.bound_policy));
});

await test("every machine/resource reason is bounded; only the human one is not", () => {
  for (const [reason, spec] of Object.entries(W.WAIT_REASONS)) {
    if (reason === "needs_operator_input") {
      assert.equal(spec.policy, "human_indefinite");
      assert.equal(spec.bound_ms, null);
      continue;
    }
    assert.equal(spec.policy, "bounded", `${reason} must be bounded`);
    assert.ok(Number.isFinite(spec.bound_ms) && spec.bound_ms > 0, `${reason} needs a real bound`);
    assert.ok(spec.owner, `${reason} needs an owner`);
  }
});

// ── Required cases ───────────────────────────────────────────────────────────

await test("1 — provider/session wait resolves normally", () => {
  const d = mk("waiting_for_agent_session");
  const r = W.reconcileWait(d, { resolved: true, now: T0 + 60_000 });
  assert.equal(r.action, "resume");
  assert.equal(r.via, "canonical_run_path");
  assert.equal(r.descriptor.resolution_state, "resolved");
  assert.equal(W.waitStatus(r.descriptor), "resolved");
});

await test("2 — provider/session wait that is IMPOSSIBLE expires at once", () => {
  // THE FIXTURE PROOF CASE: a lane with no session binding.
  const d = mk("waiting_for_agent_session", { context: { no_session_binding: true } });
  assert.equal(d.resolution_state, "impossible");
  assert.equal(W.waitStatus(d, T0 + 1000), "expired", "impossible does not wait out its bound");
  const r = W.reconcileWait(d, { now: T0 + 1000 });
  assert.equal(r.action, "fail");
  assert.equal(r.failure_reason, "waiting_for_agent_session_impossible");
  assert.equal(r.evidence.reason, "waiting_for_agent_session", "prior wait retained as evidence");
});

await test("3 — validation capacity wait resumes after release", () => {
  const d = W.waitFromValidationQueueEntry({
    request_id: "vq_1", lane_id: "lane_b", execution_run_id: "erun_b",
    waiting_since: T0, wait_deadline: T0 + 600_000,
    blocked_by: [{ axis: "validation_capacity" }],
  }, { now: T0 });
  // S5's own semantics, expressed in the S6 shape — not a second contract.
  assert.equal(d.reason, "waiting_for_validation_capacity");
  assert.equal(d.owner, "validation-admission");
  assert.equal(d.deadline, T0 + 600_000, "S5's deadline is authoritative when present");
  assert.deepEqual(d.blocked_axes, ["validation_capacity"]);
  assert.equal(W.reconcileWait(d, { resolved: true, now: T0 + 1000 }).action, "resume");
});

await test("4 — resource lease wait resumes", () => {
  const d = mk("waiting_for_resource_lease", { resource_id: "docker_stack" });
  assert.equal(d.owner, "execution-resource");
  assert.equal(W.waitStatus(d, T0 + 1000), "waiting");
  assert.equal(W.reconcileWait(d, { resolved: true, now: T0 + 1000 }).action, "resume");
});

await test("5 — machine pressure wait stays blocked, then resumes", () => {
  const d = mk("waiting_for_machine_pressure");
  assert.equal(W.reconcileWait(d, { now: T0 + 60_000 }).action, "hold");
  assert.equal(W.reconcileWait(d, { resolved: true, now: T0 + 120_000 }).action, "resume");
});

await test("6 — a recovering run reaches its bound and becomes terminal", () => {
  const d = mk("recovering");
  const spec = W.WAIT_REASONS.recovering;
  assert.equal(W.waitStatus(d, T0 + spec.bound_ms - 1000), "near_deadline");
  const r = W.reconcileWait(d, { now: T0 + spec.bound_ms + 1 });
  assert.equal(r.action, "fail");
  assert.equal(r.failure_reason, "recovering_bound_exceeded");
  assert.ok(r.evidence.expired_at, "evidence records when it expired");
});

await test("7 — NEEDS_INPUT stays non-terminal under EXPLICIT human policy", () => {
  const d = mk("needs_operator_input");
  assert.equal(d.bound_policy, "human_indefinite");
  assert.equal(d.deadline, null);
  // Five days later it is still healthy, and explicitly so.
  const fiveDays = T0 + 5 * 24 * 60 * 60 * 1000;
  assert.equal(W.waitStatus(d, fiveDays), "indefinite_human");
  const r = W.reconcileWait(d, { now: fiveDays });
  assert.equal(r.action, "hold");
  assert.equal(r.reason, "explicit_human_wait_policy");
});

await test("8 — an unknown wait reason is INVALID, not silently kept alive", () => {
  const d = mk("waiting_for_something_nobody_defined");
  assert.equal(d.bound_policy, "invalid");
  assert.equal(d.invalid_because, "unknown_wait_reason");
  assert.equal(d.owner, null);
  assert.equal(W.waitStatus(d, T0 + 1000), "invalid");
  const r = W.reconcileWait(d, { now: T0 + 1000 });
  assert.equal(r.action, "fail", "an undefined wait is a defect to surface");
  assert.equal(r.failure_reason, "unknown_wait_reason");
  // A missing reason is equally invalid.
  assert.equal(W.describeWait({ waiting_since: T0, now: T0 }).invalid_because, "missing_wait_reason");
});

await test("9 — restart preserves the descriptor and its deadline", () => {
  const d = mk("waiting_for_execution_capacity", { resource_id: "seat" });
  const roundTripped = JSON.parse(JSON.stringify(d));
  assert.deepEqual(roundTripped, d, "the descriptor survives serialisation intact");
  assert.equal(roundTripped.deadline, d.deadline);
  // And the deadline is absolute, so a restart does not reset the clock.
  const later = T0 + W.WAIT_REASONS.waiting_for_execution_capacity.bound_ms + 1;
  assert.equal(W.waitStatus(roundTripped, later), "expired");
});

// ── send_in_progress: the defect this slice fixes ────────────────────────────

await test("send_in_progress is a bounded wait, never a terminal failure", () => {
  const d = mk("send_in_progress");
  assert.equal(d.bound_policy, "bounded");
  assert.equal(d.owner, "execution-run-send");
  assert.equal(W.reconcileWait(d, { now: T0 + 1000 }).action, "hold");
  assert.equal(W.reconcileWait(d, { resolved: true, now: T0 + 1000 }).action, "resume");
});

await test("the send path treats retryable refusals as waits, not failures", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "lib", "vacilando", "execution-run-send.mjs"), "utf8");
  assert.match(src, /RETRYABLE_DELIVERY_REFUSALS/);
  assert.match(src, /RETRYABLE_DELIVERY_REFUSALS\.has\(out\.error\)/);
  // The retryable branch must come BEFORE the terminal transition.
  const guard = src.indexOf("RETRYABLE_DELIVERY_REFUSALS.has(out.error)");
  const failAt = src.indexOf('reason: out.error || "delivery_failed"');
  assert.ok(guard > 0 && failAt > guard, "the retry guard must precede the FAILED transition");
  // And it must agree with execution-resume, which already called it retryable.
  const resume = readFileSync(join(here, "..", "lib", "vacilando", "execution-resume.mjs"), "utf8");
  assert.match(resume, /RETRYABLE = new Set\(\["send_in_progress"\]\)/);
});

// ── Reconciliation shape ─────────────────────────────────────────────────────

await test("backoff grows and is capped — never a busy loop", () => {
  assert.equal(W.nextBackoffMs(0), 2000);
  assert.equal(W.nextBackoffMs(1), 4000);
  assert.equal(W.nextBackoffMs(3), 16000);
  assert.equal(W.nextBackoffMs(50), 60000, "capped");
  assert.ok(W.nextBackoffMs(2) > W.nextBackoffMs(1), "monotonic");
});

await test("reconciliation never terminates a process", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "lib", "vacilando", "run-wait.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["process.kill", "SIGKILL", "SIGTERM", "spawn(", "execFile"]) {
    assert.equal(code.includes(forbidden), false, `run-wait must not contain ${forbidden}`);
  }
});

await test("summary counts every status for health", () => {
  const s = W.summarizeWaits([
    mk("waiting_for_agent_session"),
    mk("needs_operator_input"),
    mk("nonsense_reason"),
    { ...mk("recovering"), deadline: T0 - 1 },
  ], T0);
  assert.equal(s.total, 4);
  assert.equal(s.counts.indefinite_human, 1);
  assert.equal(s.counts.invalid, 1);
  assert.equal(s.counts.expired, 1);
  assert.equal(s.expired.length, 1);
  assert.equal(s.invalid.length, 1);
});

// ── Required mutations ───────────────────────────────────────────────────────

await test("MUTATION — removing the deadline lets a machine wait live forever", () => {
  const noDeadline = { ...mk("waiting_for_agent_session"), deadline: null };
  // Without a deadline the status cannot be computed, so it reads invalid —
  // which is the point: an unbounded machine wait is never silently "fine".
  assert.equal(W.waitStatus(noDeadline, T0 + 10 * 24 * 3600_000), "invalid");
  // The real descriptor DOES expire.
  const real = mk("waiting_for_agent_session");
  assert.equal(W.waitStatus(real, T0 + W.WAIT_REASONS.waiting_for_agent_session.bound_ms + 1), "expired");
});

await test("MUTATION — ignoring the resource owner loses accountability", () => {
  const ownerless = { ...mk("waiting_for_resource_lease"), owner: null };
  assert.equal(ownerless.owner, null);
  // The real descriptor always names one, which is what makes a wait actionable.
  assert.equal(mk("waiting_for_resource_lease").owner, "execution-resource");
  for (const reason of Object.keys(W.WAIT_REASONS)) {
    assert.ok(mk(reason).owner, `${reason} must name an owner`);
  }
});

await test("MUTATION — treating AGE alone as stale condemns a healthy human wait", () => {
  const human = mk("needs_operator_input");
  const tenDays = T0 + 10 * 24 * 3600_000;
  // An age-based rule would call this stale.
  const ageBasedStale = (tenDays - human.waiting_since) > 24 * 3600_000;
  assert.equal(ageBasedStale, true, "age alone says stale");
  // The real rule does not.
  assert.equal(W.waitStatus(human, tenDays), "indefinite_human");
  assert.equal(W.reconcileWait(human, { now: tenDays }).action, "hold");
  // And conversely, a SHORT machine wait past its bound IS expired.
  const shortMachine = mk("send_in_progress");
  const justPast = T0 + W.WAIT_REASONS.send_in_progress.bound_ms + 1;
  assert.equal((justPast - shortMachine.waiting_since) > 24 * 3600_000, false, "young by age");
  assert.equal(W.waitStatus(shortMachine, justPast), "expired", "but expired by bound");
});

await test("MUTATION — making all waits indefinitely valid breaks the Fixture Proof case", () => {
  const allIndefinite = Object.fromEntries(
    Object.entries(W.WAIT_REASONS).map(([k, v]) => [k, { ...v, policy: "human_indefinite", bound_ms: null }]),
  );
  const d = W.describeWait({ reason: "waiting_for_agent_session", waiting_since: T0, now: T0, policyTable: allIndefinite });
  assert.equal(W.waitStatus(d, T0 + 3 * 24 * 3600_000), "indefinite_human",
    "the mutation lets the 2.8-day queue survive");
  assert.equal(W.reconcileWait(d, { now: T0 + 3 * 24 * 3600_000 }).action, "hold");
  // The real policy fails it.
  const real = mk("waiting_for_agent_session");
  assert.equal(W.reconcileWait(real, { now: T0 + 3 * 24 * 3600_000 }).action, "fail");
});

await Promise.all(started);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * A FAILED RUN STAYS FAILED. ITS SUCCESSOR SAYS SO OUT LOUD.
 *
 * `continuation_of` existed, was documented, and had one test - and was written
 * with no checks at all. Any string was accepted: a run that does not exist, a
 * run still executing, the successor itself, a cycle. Measured on the live
 * store: 0 of 181 runs carried it, and `publicExecutionRun` never projected it,
 * so even a correct link would have been invisible to every operator surface.
 *
 * The doctrine is unchanged and deliberately so: the successor carries the link,
 * the predecessor is never rewritten, and FAILED never becomes COMPLETE. What
 * changes is that a claim which cannot be true is now refused rather than stored.
 *
 * Chronology is NOT a criterion anywhere here. "It ran afterwards" is how an
 * unrelated mission gets adopted into someone else's failure.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "continuation-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const {
  createQueuedRun, transitionExecutionRun, patchRunFields, getExecutionRun,
  publicExecutionRun, validateContinuation, CONTINUATION_REFUSALS, isTerminalRunState,
} = await import("../lib/vacilando/execution-run.mjs");
const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/*
 * A LANE HOLDS ONE ACTIVE RUN, and `createQueuedRun` returns the existing one
 * rather than making a second. A first version of these fixtures called it
 * twice in a lane and got the SAME run back, which surfaced as
 * `continuation_self_reference` where a not-terminal refusal was expected - the
 * fixture was wrong, not the validator. Each case therefore gets its own lane,
 * and a predecessor is driven terminal before its successor is queued.
 */
let laneSeq = 0;
const laneOf = (n) => {
  const seeded = createDurableLane({ name: `${n}-${laneSeq += 1}`, root: ROOT });
  return seeded.lane?.lane_id || seeded.lane_id;
};

function queued(laneId = laneOf("lineage"), instruction = "work") {
  return createQueuedRun({ laneId, instruction, root: ROOT }).run;
}
function toFailed(run) {
  transitionExecutionRun(run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(run.run_id, "FAILED", { reason: "missing_wait_reason", origin: "governor", root: ROOT });
  return run;
}
/** A terminal predecessor and a fresh successor, in one lane. */
function pair(laneId = laneOf("lineage")) {
  const prior = toFailed(queued(laneId));
  const next = queued(laneId);
  return { laneId, prior, next };
}
const link = (successor, prior, reason = "operator instruction re-sent") =>
  patchRunFields(successor.run_id, { continuation_of: { run_id: prior.run_id, reason } }, { root: ROOT });

/* ── the accepted case ────────────────────────────────────────────────────── */

test("1 — a terminal predecessor in the same lane is accepted", () => {
  const { prior, next } = pair();
  const out = link(next, prior);
  assert.notEqual(out?.ok, false, `refused: ${out?.error || ""} ${out?.detail || ""}`);
  assert.equal(getExecutionRun(next.run_id, ROOT).continuation_of.run_id, prior.run_id);
});

test("1a — and the predecessor is not touched", () => {
  const { prior, next } = pair();
  const before = JSON.stringify(getExecutionRun(prior.run_id, ROOT));
  link(next, prior);
  assert.equal(JSON.stringify(getExecutionRun(prior.run_id, ROOT)), before,
    "linking must never rewrite the run being continued");
});

test("1b — the predecessor stays FAILED and the successor has its own state", () => {
  const { prior, next } = pair();
  link(next, prior);
  assert.equal(getExecutionRun(prior.run_id, ROOT).state, "FAILED");
  assert.ok(isTerminalRunState("FAILED"));
  assert.equal(getExecutionRun(next.run_id, ROOT).state, "QUEUED");
  assert.equal(getExecutionRun(next.run_id, ROOT).continuation_of.run_id, prior.run_id);
});

/* ── the refusals ─────────────────────────────────────────────────────────── */

test("2 — a predecessor that does not exist is refused", () => {
  const out = patchRunFields(queued().run_id, { continuation_of: { run_id: "erun_nothing" } }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, CONTINUATION_REFUSALS.MISSING);
});

test("3 — a predecessor still in flight is refused", () => {
  const laneA = laneOf("live");
  const live = queued(laneA);
  transitionExecutionRun(live.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  // A DIFFERENT lane, so the successor is genuinely a different run.
  const out = link(queued(laneOf("live-successor")), live);
  assert.equal(out.ok, false);
  assert.equal(out.error, CONTINUATION_REFUSALS.NOT_TERMINAL);
  assert.match(out.detail, /EXECUTING/, "the refusal must name the state it saw");
});

test("4 — a run cannot continue itself", () => {
  const r = toFailed(queued());
  const out = patchRunFields(r.run_id, { continuation_of: { run_id: r.run_id } }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, CONTINUATION_REFUSALS.SELF);
});

test("5 — a cycle is refused", () => {
  const { laneId, prior: a, next: b } = pair();
  link(b, a);
  toFailed(b);
  // a -> b would close a -> b -> a.
  void laneId;
  const out = patchRunFields(a.run_id, { continuation_of: { run_id: b.run_id } }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, CONTINUATION_REFUSALS.CYCLE);
});

test("6 — lineage does not cross lanes", () => {
  const out = link(queued(laneOf("here")), toFailed(queued(laneOf("elsewhere"))));
  assert.equal(out.ok, false);
  assert.equal(out.error, CONTINUATION_REFUSALS.LANE);
});

/* ── explicit, never inferred ─────────────────────────────────────────────── */

test("7 — a later run in the same lane is NOT a continuation by itself", () => {
  const { prior, next: later } = pair();
  assert.equal(getExecutionRun(later.run_id, ROOT).continuation_of, undefined,
    "chronology must never create lineage; that is how an unrelated mission gets adopted into someone else's failure");
  assert.ok(prior.run_id);
});

/* ── the operator can see it ──────────────────────────────────────────────── */

test("8 — lineage reaches the public projection", () => {
  const { prior, next } = pair();
  link(next, prior, "continuing after the governor collected the run");
  const shown = publicExecutionRun(getExecutionRun(next.run_id, ROOT));
  assert.ok("continuation_of" in shown, "a field no surface projects might as well not exist");
  assert.equal(shown.continuation_of.run_id, prior.run_id);
  assert.equal(shown.continuation_of.reason, "continuing after the governor collected the run");
  assert.equal(publicExecutionRun(getExecutionRun(prior.run_id, ROOT)).continuation_of, null,
    "the predecessor shows no lineage of its own - it was not reopened");
});

test("9 — a chain is traversable A -> B -> C", () => {
  const { laneId, prior: a, next: b } = pair();
  link(b, a);
  toFailed(b);
  const c = queued(laneId); const out = link(c, b);
  assert.notEqual(out?.ok, false, `refused: ${out?.error || ""}`);
  const seen = [];
  let cursor = getExecutionRun(c.run_id, ROOT);
  while (cursor?.continuation_of?.run_id) {
    seen.push(cursor.continuation_of.run_id);
    cursor = getExecutionRun(cursor.continuation_of.run_id, ROOT);
  }
  assert.deepEqual(seen, [b.run_id, a.run_id], "mission history must traverse backwards through the chain");
});

test("10 — clearing lineage is allowed and validates nothing", () => {
  const { prior, next } = pair();
  link(next, prior);
  const out = patchRunFields(next.run_id, { continuation_of: null }, { root: ROOT });
  assert.notEqual(out?.ok, false);
  assert.equal(getExecutionRun(next.run_id, ROOT).continuation_of, null);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);

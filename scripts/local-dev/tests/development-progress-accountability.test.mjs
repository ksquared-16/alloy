#!/usr/bin/env node
/**
 * Provider progress accountability — how far in, and how much longer.
 *
 * THE RULE THIS SUITE DEFENDS. The finish estimate is REPORTED, never derived.
 * The product already refused to compute an ETA, for a good reason recorded in
 * gateway-view: elapsed time divided by a provider's own guess is "a lie with a
 * decimal point on it". That refusal stands. What is added here is a different
 * claim — the provider SAYING how much longer it needs — carrying its own
 * confidence, its own timestamp, and its own staleness.
 *
 * The distinction is the whole feature. A derived ETA looks identical to a
 * reported one on screen and is worth nothing, so the only way to keep the
 * difference real is to make deriving one impossible in the model and to test
 * that it stays impossible.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-progress-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const R = await import("../lib/vacilando/execution-run.mjs");
const M = await import("../apps/vacilando/public/vacilando-ui-model.mjs");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (mins) => new Date(T0 + mins * 60_000).toISOString();

// ------------------------------------------------------------- reported, never derived

test("a percentage alone never produces a finish estimate", () => {
  // The refusal that predates this feature, pinned. 62% and forty minutes
  // elapsed is not "about 25 minutes left"; it is 62% and no time claim.
  const est = R.normalizeProgressEstimate({ percent: 62, confidence: "high", nowMs: T0 });
  assert.equal(est.percent, 62);
  assert.equal(est.estimated_finish_at, undefined);
  assert.equal(est.estimated_remaining_minutes, undefined);
});

test("reported minutes anchor to the report, not to read time", () => {
  // "20 minutes" read forty minutes later is not stale, it is confidently
  // wrong. It normalises to an instant so it can only ever age honestly.
  const est = R.normalizeProgressEstimate({ percent: 40, estimated_remaining_minutes: 20, nowMs: T0 });
  assert.equal(est.estimated_finish_at, at(20));
  assert.equal(est.estimated_remaining_minutes, 20);
});

test("a wall-clock finish is accepted in place of minutes", () => {
  const est = R.normalizeProgressEstimate({ estimated_finish_at: at(90), nowMs: T0 });
  assert.equal(est.estimated_finish_at, at(90));
  assert.equal(est.estimated_remaining_minutes, 90);
});

test("a finish estimate alone is a complete report", () => {
  // A provider that will not guess a percentage can still say how long it
  // needs, and that is the more useful of the two answers.
  const est = R.normalizeProgressEstimate({ estimated_remaining_minutes: 45, nowMs: T0 });
  assert.ok(est, "not discarded for lacking a percentage");
  assert.equal(est.percent, null);
  assert.equal(est.estimated_remaining_minutes, 45);
});

test("nothing reported stays null — no value is invented to avoid one", () => {
  assert.equal(R.normalizeProgressEstimate({ nowMs: T0 }), null);
});

test("the estimate carries its own confidence and source", () => {
  const est = R.normalizeProgressEstimate({
    estimated_remaining_minutes: 10, estimate_confidence: "high", source: "deterministic", nowMs: T0,
  });
  assert.equal(est.estimate_confidence, "high");
  assert.equal(est.estimate_source, "deterministic");
  assert.equal(est.estimate_updated_at, new Date(T0).toISOString());
});

test("an unrecognised confidence degrades to low rather than being trusted", () => {
  const est = R.normalizeProgressEstimate({
    estimated_remaining_minutes: 10, estimate_confidence: "certain", nowMs: T0,
  });
  assert.equal(est.estimate_confidence, "low");
});

// ------------------------------------------------------------------- rendering

const runWith = (est) => ({ state: "EXECUTING", progress_estimate: est });

test("a fresh estimate renders as the claim it is", () => {
  const f = M.laneFinishEstimate(runWith({
    estimated_finish_at: at(20), estimate_updated_at: at(0), estimate_confidence: "medium",
  }), { nowMs: T0 });
  assert.equal(f.available, true);
  assert.match(f.label, /^~/, "the tilde says estimate, out loud");
  assert.equal(f.label, "~20m left");
});

test("a stale estimate says so instead of promising a time", () => {
  const f = M.laneFinishEstimate(runWith({
    estimated_finish_at: at(20), estimate_updated_at: at(-180),
  }), { nowMs: T0 });
  assert.equal(f.available, false);
  assert.equal(f.stale, true);
  assert.equal(f.label, "Finish estimate out of date");
});

test("an estimate the clock has passed does not count upward", () => {
  // "-12m left" pretends to a precision nobody claimed.
  const f = M.laneFinishEstimate(runWith({
    estimated_finish_at: at(-5), estimate_updated_at: at(0),
  }), { nowMs: T0 });
  assert.equal(f.available, false);
  assert.equal(f.label, "Finish estimate passed");
});

test("absent is a renderable state, not an error", () => {
  const f = M.laneFinishEstimate({ state: "EXECUTING" }, { nowMs: T0 });
  assert.equal(f.available, false);
  assert.equal(f.stale, false);
  assert.equal(f.label, "No finish estimate");
});

test("one status line serves every surface, and drops what is absent", () => {
  // Six surfaces show lane state. They share this function precisely so a
  // second, disagreeing answer cannot appear on one of them.
  assert.equal(
    M.operatorStatusLine({ label: "Working", percent: 62, estimate: true, finish_label: "~20m left" }, "Claude"),
    "Working · ~62% · ~20m left · Claude",
  );
  assert.equal(
    M.operatorStatusLine({ label: "Working", percent: 62, estimate: true, finish_label: null }, "Claude"),
    "Working · ~62% · Claude",
  );
  assert.equal(M.operatorStatusLine({ label: "Ready" }, null), "Ready");
});

test("a stale finish claim never reaches the identity line", () => {
  const status = M.laneOperatorStatus(
    { execution_run: runWith({ percent: 62, updated_at: at(-180), estimated_finish_at: at(20), estimate_updated_at: at(-180) }) },
    { group: "active", label: "Working" },
    { nowMs: T0 },
  );
  assert.equal(status.finish_label, null, "a lane nobody has heard from promises nothing");
});

// ----------------------------------------------------------------- solicitation

test("an active run with no estimate is solicited", () => {
  assert.equal(R.progressSolicitationDue({ state: "EXECUTING" }, { nowMs: T0 }), true);
});

test("a fresh estimate is not solicited again", () => {
  assert.equal(
    R.progressSolicitationDue({ state: "EXECUTING", progress_estimate: { updated_at: at(0) } }, { nowMs: T0 }),
    false,
  );
});

test("a stale estimate is solicited", () => {
  assert.equal(
    R.progressSolicitationDue({ state: "EXECUTING", progress_estimate: { updated_at: at(-180) } }, { nowMs: T0 }),
    true,
  );
});

test("a run with no remaining plan is never solicited", () => {
  // Asking a finished, failed or blocked run how much longer it needs produces
  // a number about nothing.
  for (const state of ["COMPLETE", "FAILED", "ABANDONED", "NEEDS_INPUT", "QUEUED"]) {
    assert.equal(R.progressSolicitationDue({ state }, { nowMs: T0 }), false, state);
  }
});

test("the solicitation names a flag the CLI actually accepts", async () => {
  // A product that tells an agent to run a flag that does not exist is worse
  // than one that says nothing.
  const { readFileSync } = await import("node:fs");
  const lifecycle = readFileSync(new URL("../lib/vacilando/agent-session-lifecycle.mjs", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../vac-run-status.mjs", import.meta.url), "utf8");
  const asked = lifecycle.match(/vac run-status[^"]*/)?.[0] || "";
  assert.match(asked, /--estimated-remaining-minutes/);
  for (const flag of ["--progress", "--estimated-remaining-minutes", "--progress-summary"]) {
    assert.ok(cli.includes(`"${flag}"`), `vac-run-status.mjs parses ${flag}`);
  }
});

test("the provider is asked, and the operator is not", () => {
  // The operator is the party WAITING for this answer. Interrupting them to
  // ask how long their own agent will take is exactly backwards, so the
  // solicitation rides orientation text and raises no notification.
  return import("node:fs").then(({ readFileSync }) => {
    const src = readFileSync(new URL("../lib/vacilando/agent-session-lifecycle.mjs", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("progressSolicitationDue(run)"), src.indexOf("Report ORIENTED with the Gateway-owned"));
    assert.doesNotMatch(block, /upsertNotification|pushRunOutcome|sendPush/);
  });
});

// ------------------------------------------- a finish claim is about the future

test("a blocked or terminal lane does not keep promising a finish", async () => {
  // OBSERVED on the installed runtime with a real reported estimate: a lane
  // that reached NEEDS_INPUT still rendered "Needs you · ~80% · ~19m left".
  // It was not nineteen minutes from finishing — it was stopped, waiting for a
  // person, and would have said nineteen minutes for as long as nobody
  // answered. FAILED said "~19m left" for work that had stopped entirely, and
  // COMPLETE promised a finish it had already reached.
  //
  // The percentage describes the PAST and survives. The finish time is a
  // promise about the FUTURE, which only a moving run can make.
  const V = await import("../apps/vacilando/public/gateway-view.mjs");
  const est = {
    percent: 80, confidence: "medium", source: "provider_estimate",
    updated_at: at(0),
    estimated_finish_at: at(19), estimate_updated_at: at(0), estimate_confidence: "medium",
  };
  const lineFor = (state) => {
    const lane = { lane_id: "l", name: "probe", execution_run: { state, progress_estimate: est } };
    const work = V.canonicalLaneWorkState(lane, { nowMs: T0 });
    return M.operatorStatusLine(M.laneOperatorStatus(lane, work, { nowMs: T0 }), "Claude");
  };
  for (const state of ["EXECUTING", "VALIDATING", "RECOVERING"]) {
    assert.match(lineFor(state), /~19m left/, `${state} is moving and may estimate`);
  }
  for (const state of ["NEEDS_INPUT", "WAITING_RESOURCE", "FAILED", "COMPLETE", "ABANDONED"]) {
    assert.doesNotMatch(lineFor(state), /left/, `${state} must not promise a finish`);
    assert.match(lineFor(state), /~80%/, `${state} still reports how far it got`);
  }
});

test("the states that may claim a finish are the states that may be solicited", () => {
  // Same underlying question — is this run still moving? — so the two sets must
  // not be able to drift apart.
  for (const state of ["EXECUTING", "VALIDATING", "RECOVERING"]) {
    assert.equal(M.finishClaimIsMeaningful({ state }), true, state);
    assert.equal(R.progressSolicitationDue({ state }, { nowMs: T0 }), true, state);
  }
  for (const state of ["NEEDS_INPUT", "FAILED", "COMPLETE", "ABANDONED"]) {
    assert.equal(M.finishClaimIsMeaningful({ state }), false, state);
    assert.equal(R.progressSolicitationDue({ state }, { nowMs: T0 }), false, state);
  }
});

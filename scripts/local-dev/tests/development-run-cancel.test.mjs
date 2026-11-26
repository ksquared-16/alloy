#!/usr/bin/env node
/**
 * Taking back a prompt, and refusing to send into a dirty composer.
 *
 * TWO THINGS THE OPERATOR COULD NOT DO. Once an instruction was delivered there
 * was no way to stop it — closeStaleExecutionRun refuses a genuinely active
 * run, which is right for stale cleanup and useless for "I sent the wrong
 * thing". And readiness reported ready:true for a composer that already held
 * unsent text, so the next paste would have been appended to it and submitted
 * as one line.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cancel-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const C = await import("../lib/vacilando/execution-cancel.mjs");
const P = await import("../lib/vacilando/provider-prompt-readiness.mjs");
const L = await import("../lib/vacilando/lanes.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

const NBSP = String.fromCharCode(0x00a0);
const pane = (composer) => [
  "  some earlier output",
  "─".repeat(60),
  `❯${NBSP}${composer}`,
  "─".repeat(60),
  "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
].join("\n");

// ------------------------------------------------------- dirty composer

test("residual composer text is detectable", () => {
  // The live Surfaces pane sat at this while readiness reported ready.
  assert.equal(
    P.residualPromptText(pane("alloy-dev-stop wt6-surfaces-faacca")),
    "alloy-dev-stop wt6-surfaces-faacca",
  );
  assert.equal(P.residualPromptText(pane("")), null);
});

test("detecting it does NOT flip the readiness verdict", () => {
  // A merged contract says a composer holding text is still an actionable
  // prompt — that rule exists because refusing one blocked a live operator from
  // sending at all. The pane structure is identical either way (rule, caret
  // line, rule, footer), so nothing can tell leftover text apart from a
  // legitimate composer. Flipping this on a guess would re-break sending.
  const r = P.assessPanePromptReadiness(pane("alloy-dev-stop wt6-surfaces-faacca"), {
    provider: "claude", captured: true,
  });
  assert.equal(r.ready, true, "readiness must not regress on a guess");
});

test("the composer-clearing transport exists but is not wired into delivery", () => {
  // paste-buffer inserts at the cursor, so residual text is appended to and
  // submitted as one line. Clearing first is the fix — but delivery's tmux
  // sequence is a governed contract with tests asserting the exact mutations,
  // and widening it broke five of them. It lands with that contract updated,
  // not as a side effect.
  assert.equal(typeof L.clearComposerArgv, "function");
  assert.deepEqual(L.clearComposerArgv("%1"), ["send-keys", "-t", "%1", "C-u"]);
  const src = readFileSync(new URL("../lib/vacilando/lanes.mjs", import.meta.url), "utf8");
  const deliver = src.slice(src.indexOf("async function defaultDeliverInstruction"));
  const body = deliver.slice(0, deliver.indexOf("\n}"));
  assert.equal(body.includes("clearComposerArgv"), false, "not wired yet, by decision");
});

test("the caret separator is a non-breaking space, and that is matched", () => {
  // Claude Code draws U+00A0 after the caret. Matching only [ \t] found no
  // composer line at all, so the check silently passed on every pane.
  assert.equal(P.residualPromptText(`❯${NBSP}leftover text`), "leftover text");
  assert.equal(P.residualPromptText("❯ leftover text"), "leftover text");
  assert.equal(P.residualPromptText(`❯${NBSP}`), null);
});

test("a cursor block is not mistaken for operator text", () => {
  for (const glyph of ["▏", "█", "_", "  "]) {
    assert.equal(P.residualPromptText(`❯${NBSP}${glyph}`), null, JSON.stringify(glyph));
  }
});

test("the last composer line wins when the pane has scrollback", () => {
  const text = [`❯${NBSP}old and gone`, "output", `❯${NBSP}current text`].join("\n");
  assert.equal(P.residualPromptText(text), "current text");
});

// -------------------------------------------------------------- cancel

test("a terminal run cannot be cancelled", () => {
  for (const state of ["COMPLETE", "FAILED", "ABANDONED"]) {
    const out = C.cancellability({ state });
    assert.equal(out.ok, false, state);
    assert.equal(out.error, "run_already_terminal");
  }
});

test("an undelivered prompt cancels without interrupting anything", () => {
  const out = C.cancellability({ state: "QUEUED" });
  assert.equal(out.ok, true);
  assert.equal(out.delivered, false);
  assert.equal(out.interrupts_work, false);
  assert.equal(out.warning, null, "nothing to warn about — the agent never saw it");
});

test("a running prompt is cancellable but warns first", () => {
  const out = C.cancellability({ state: "EXECUTING", delivery: { acknowledged: true } });
  assert.equal(out.ok, true);
  assert.equal(out.interrupts_work, true);
  assert.ok(/interrupt/i.test(out.warning));
  assert.ok(/worktree/.test(out.warning), "and says what survives");
});

test("interrupting work requires an explicit confirm", async () => {
  const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
  const { createQueuedRun, transitionExecutionRun } = await import("../lib/vacilando/execution-run.mjs");
  const lane = createDurableLane({ name: "Cancel Me" });
  const run = createQueuedRun({ laneId: lane.lane.lane_id, instruction: "wrong prompt" });
  transitionExecutionRun(run.run.run_id, "EXECUTING", {});
  // Mark it delivered so it counts as work in progress.
  const { patchRunFields } = await import("../lib/vacilando/execution-run.mjs");
  patchRunFields(run.run.run_id, { delivery: { acknowledged: true } }, {});

  const refused = await C.cancelActiveRun(lane.lane.lane_id, { confirm: false, tmux: async () => ({ ok: true }) });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "confirm_required");

  const done = await C.cancelActiveRun(lane.lane.lane_id, { confirm: true, tmux: async () => ({ ok: true }) });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.reason, "operator_cancelled");
  assert.equal(done.state, "FAILED", "closest valid state; no invented CANCELLED");
  assert.equal(done.previous_state, "EXECUTING");
});

test("cancelling frees the lane for the next prompt", async () => {
  const { listDurableLanes } = await import("../lib/vacilando/development-lane.mjs");
  const { activeRunForLane } = await import("../lib/vacilando/execution-run.mjs");
  const lane = listDurableLanes().find((l) => l.name === "Cancel Me");
  assert.equal(activeRunForLane(lane.lane_id), null, "the one-active-run rule no longer blocks a resend");
});

test("the cancel says what it did NOT destroy", async () => {
  const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
  const { createQueuedRun } = await import("../lib/vacilando/execution-run.mjs");
  const lane = createDurableLane({ name: "Preserve Me" });
  createQueuedRun({ laneId: lane.lane.lane_id, instruction: "x" });
  const out = await C.cancelActiveRun(lane.lane.lane_id, { tmux: async () => ({ ok: true }) });
  assert.equal(out.ok, true, out.error);
  for (const kept of ["lane", "branch", "worktree", "conversation", "provider session"]) {
    assert.ok(out.preserved.includes(kept), kept);
  }
});

test("a failed interrupt still cancels the run", async () => {
  // Otherwise a lane could be left EXECUTING on a prompt that cannot be
  // cancelled again — unusable and unrecoverable.
  const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
  const { createQueuedRun, transitionExecutionRun, patchRunFields } = await import("../lib/vacilando/execution-run.mjs");
  const lane = createDurableLane({
    name: "Stubborn", binding: { worktree_path: ROOT, tmux_session: "alloy-stubborn" },
  });
  const run = createQueuedRun({ laneId: lane.lane.lane_id, instruction: "y", worktreePath: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", {});
  patchRunFields(run.run.run_id, { delivery: { acknowledged: true } }, {});
  const out = await C.cancelActiveRun(lane.lane.lane_id, {
    confirm: true, tmux: async () => { throw new Error("tmux is gone"); },
  });
  assert.equal(out.ok, true, "the run must still be cancelled");
  assert.equal(out.interrupted, false);
  assert.ok(out.interrupt_error, "and the failure is reported honestly");
});

test("a run id from another lane cannot cancel this lane's work", async () => {
  const { listDurableLanes } = await import("../lib/vacilando/development-lane.mjs");
  const lanes = listDurableLanes();
  const a = lanes.find((l) => l.name === "Cancel Me");
  const b = lanes.find((l) => l.name === "Stubborn");
  const { listExecutionRunsForLane } = await import("../lib/vacilando/execution-run.mjs");
  const foreign = listExecutionRunsForLane(b.lane_id)[0];
  const out = await C.cancelActiveRun(a.lane_id, { runId: foreign.run_id, confirm: true });
  assert.equal(out.ok, false);
  assert.equal(out.error, "run_lane_mismatch");
});

// ------------------------------------------------------------------ UI

test("the control appears only while there is something to cancel", () => {
  assert.ok(V.renderCancelControl({ state: "EXECUTING", delivery: { acknowledged: true } }).includes("Stop this prompt"));
  assert.ok(V.renderCancelControl({ state: "QUEUED" }).includes("Cancel this prompt"));
  for (const state of ["COMPLETE", "FAILED", "ABANDONED"]) {
    assert.equal(V.renderCancelControl({ state }), "", state);
  }
  assert.equal(V.renderCancelControl(null), "");
});

test("the wording matches whether work is actually in flight", () => {
  const running = V.cancelConfirmCopy({ state: "EXECUTING", delivery: { acknowledged: true } });
  assert.ok(/interrupted/.test(running));
  assert.ok(/kept/.test(running), "and names what survives");
  const queued = V.cancelConfirmCopy({ state: "QUEUED" });
  assert.ok(/never received/.test(queued), "no false alarm for an undelivered prompt");
});

test("the control is disabled while a cancel is in flight", () => {
  assert.match(V.renderCancelControl({ state: "EXECUTING" }, { pending: true }), /disabled/);
});

test("every cancel refusal has operator-facing copy", () => {
  for (const e of ["no_active_run", "run_already_terminal", "confirm_required", "run_lane_mismatch", "lane_not_found"]) {
    const text = V.cancelErrorText(e);
    assert.ok(text && !text.includes("_"), `${e} -> ${text}`);
  }
});

test("the interrupt uses an exported transport", () => {
  // Reaching for a private symbol is how two earlier fixes silently no-opped.
  assert.equal(typeof L.interruptPane, "function");
});

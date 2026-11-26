/**
 * Finished work must survive a governed wait.
 *
 * The trap this closes, observed repeatedly: a lane finishes an implementation,
 * files a governed action, the action waits for the Director, the governor
 * collects the NEEDS_INPUT run as ABANDONED to free the lane — and the code
 * that was already written becomes uncommittable, because checkpoint-create
 * refused on isTerminalRunState and ABANDONED is terminal for scheduling.
 *
 * The model already draws the right line one function over: ABANDONED is
 * recoverable, COMPLETE and FAILED are not. These fixtures hold checkpointing
 * to that same line, and hold adoption to being recovery for genuinely
 * interrupted work rather than the ordinary end of a governed turn.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RUN = await import("../lib/vacilando/execution-run.mjs");
const SRC = readFileSync(new URL("../lib/vacilando/checkpoint-create.mjs", import.meta.url), "utf8");

test("the two state sets differ exactly where it matters", () => {
  assert.deepEqual([...RUN.TERMINAL_RUN_STATES].sort(), ["ABANDONED", "COMPLETE", "FAILED"]);
  assert.deepEqual([...RUN.IRREVERSIBLE_RUN_STATES].sort(), ["COMPLETE", "FAILED"]);
  // ABANDONED is the whole difference, and it is the recoverable one.
  assert.equal(RUN.isTerminalRunState("ABANDONED"), true);
  assert.equal(RUN.isIrreversibleRunState("ABANDONED"), false);
});

test("checkpoint gates on irreversibility, not on terminality", () => {
  // Structural: the ownership guard must not reach for the broader test again.
  assert.match(SRC, /if \(isIrreversibleRunState\(run\.state\)\)/);
  assert.doesNotMatch(SRC, /if \(isTerminalRunState\(run\.state\)\)/);
});

test("an ABANDONED run may still checkpoint; COMPLETE and FAILED may not", () => {
  const refuses = (state) => RUN.isIrreversibleRunState(state);
  assert.equal(refuses("ABANDONED"), false, "work finished before the wait must remain committable");
  assert.equal(refuses("COMPLETE"), true, "a run that filed its outcome must not add commits underneath it");
  assert.equal(refuses("FAILED"), true);
  for (const live of ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT"]) {
    assert.equal(refuses(live), false, `${live} is not terminal at all`);
  }
});

test("adoption is still required for a genuinely interrupted predecessor", () => {
  // The foreign-path guard is what separates "this run wrote it" from "it was
  // already dirty when this run started". Relaxing the state check must not
  // have touched it, or a crashed predecessor's work would be swept in silently.
  assert.match(SRC, /path_dirty_before_run/);
  assert.match(SRC, /adopted_path_was_not_dirty_before_run/);
  assert.match(SRC, /an adopted path must also be named in the manifest/);
});

test("the relaxation is scoped to the state check alone", () => {
  // Every other refusal must still exist. A fix that quietly widened the
  // manifest rules would be a much larger change wearing this one's clothes.
  for (const refusal of [
    "expected_head_mismatch", "unexpected_staged_files", "nothing_to_commit",
    "invalid_message", "commit_contents_unexpected", "worktree_conflict",
    "adopted_path_fingerprint_mismatch", "adoption_requires_origin_and_reason",
  ]) {
    assert.match(SRC, new RegExp(refusal), `${refusal} must still be enforced`);
  }
});

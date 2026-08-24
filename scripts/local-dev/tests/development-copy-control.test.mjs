#!/usr/bin/env node
/**
 * The copy icon copies what the operator is reading.
 *
 * THE BUG THIS PINS. The conversation renders from assistantMessageSource,
 * which falls back agent report -> session transcript -> status summary. The
 * copy control was computed by a different function that only knew about the
 * report and the pane. So on any lane whose message came from the transcript or
 * the status summary, copyable text was null, the control rendered `disabled`,
 * and clicking it did nothing — measured live across four lanes, the button was
 * disabled on every one.
 *
 * The invariant: if a message is shown, it can be copied.
 */
import assert from "node:assert/strict";
import test from "node:test";

const V = await import("../apps/vacilando/public/gateway-view.mjs");

const lane = (run, prev = null) => ({ lane_id: "l", execution_run: run, previous_run: prev });
const transcript = (text) => ({
  lane_id: "l", mode: "latest_response", source: "claude_code_session_transcript",
  text, ok: true,
});

/** Every way the conversation can produce a message. */
const SOURCES = [
  ["agent report", lane({ state: "COMPLETE", agent_report: { message: "REPORT BODY" } }), null, "REPORT BODY"],
  ["session transcript", lane({ state: "COMPLETE" }), transcript("TRANSCRIPT BODY"), "TRANSCRIPT BODY"],
  ["status summary", lane({ state: "NEEDS_INPUT", state_reason: "Which port?" }), null, "Which port?"],
  ["previous run report", lane(null, { state: "COMPLETE", agent_report: { message: "PREVIOUS BODY" } }), null, "PREVIOUS BODY"],
];

test("anything the operator can read, the operator can copy", () => {
  for (const [name, l, latest, want] of SOURCES) {
    const shown = V.assistantMessageSource(l, { output: null, outputText: "", latestResponse: latest });
    assert.ok(shown?.text, `${name}: nothing rendered, fixture is wrong`);
    const copy = V.copyableOutputText({ selectedId: "l", output: null, outputText: "", lane: l, latestResponse: latest });
    assert.ok(copy, `${name}: message is shown but copy returned nothing`);
    assert.ok(copy.includes(want), `${name}: copied the wrong text`);
  }
});

test("the control is enabled whenever a message is shown", () => {
  for (const [name, l, latest] of SOURCES) {
    const copy = V.copyableOutputText({ selectedId: "l", output: null, outputText: "", lane: l, latestResponse: latest });
    const html = V.renderCopyControl({ text: copy });
    assert.equal(/disabled/.test(html), false, `${name}: the copy icon rendered disabled`);
  }
});

test("copy and the rendered message never disagree", () => {
  // They are the same source now; this asserts they stay that way.
  for (const [name, l, latest] of SOURCES) {
    const shown = V.assistantMessageSource(l, { output: null, outputText: "", latestResponse: latest });
    const copy = V.copyableOutputText({ selectedId: "l", output: null, outputText: "", lane: l, latestResponse: latest });
    assert.equal(copy, String(shown.text), `${name}: copy differs from what is displayed`);
  }
});

test("with nothing to read, the control is correctly disabled", () => {
  const empty = lane({ state: "EXECUTING" });
  const copy = V.copyableOutputText({ selectedId: "l", output: null, outputText: "", lane: empty, latestResponse: null });
  assert.equal(copy, null);
  assert.match(V.renderCopyControl({ text: copy }), /disabled/);
});

test("a pane snapshot is still copyable when it is the only source", () => {
  const l = lane({ state: "EXECUTING" });
  const copy = V.copyableOutputText({
    selectedId: "l", output: { lane_id: "l", text: "PANE TEXT", ok: true }, outputText: "PANE TEXT", lane: l,
  });
  assert.equal(copy, "PANE TEXT");
});

test("output belonging to another lane is never copied", () => {
  const l = lane({ state: "EXECUTING" });
  const copy = V.copyableOutputText({
    selectedId: "l", output: { lane_id: "other", text: "SOMEONE ELSE" }, outputText: "", lane: l,
  });
  assert.equal(copy, null);
});

test("the shell passes the transcript through to copy", () => {
  // Without this the shell would compute copy text from a narrower source than
  // the message beside it, which is exactly how they drifted apart.
  const html = V.renderGatewayShell({
    selectedId: "l", lanes: [{ lane_id: "l", label: "L" }], listReady: true,
    lane: { lane_id: "l", label: "L", execution_run: { state: "COMPLETE" } },
    latestResponse: transcript("SHELL TRANSCRIPT"),
  });
  assert.ok(html.includes("data-gw-copy"), "the control is present");
  assert.equal(/data-gw-copy[^>]*disabled/.test(html), false, "and enabled, because a message is shown");
});

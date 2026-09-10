#!/usr/bin/env node
/**
 * THREE INTERACTION DEFECTS THE OPERATOR HIT ON A PHONE, AND THE ONE PRINCIPLE
 * BEHIND THE THIRD.
 *
 * ISSUE 1 — RETURN SENT INSTEAD OF INSERTING A NEWLINE. The composer had one
 * rule for every device: `Enter && !shiftKey` submits. A software keyboard has
 * no Shift key, so Return — the only way a phone can start a new line — sent
 * the instruction. Multiline instructions were not awkward from a phone, they
 * were impossible, and every attempt dispatched a half-written prompt to a live
 * agent.
 *
 * ISSUE 2 — SEND TOOK TWO TAPS. With the keyboard up, the first tap only
 * dismissed it. The tap was not ignored; it was spent on a layout change it
 * caused itself — focus left the textarea, `focusout` resized the composer, the
 * keyboard retracted and rewrote `--gw-vvh`, and by the time the click
 * resolved the button had moved out from under the finger.
 *
 * ISSUE 3 — THE LANE LIST AND THE LANE DISAGREED. The list printed the RUNTIME
 * phrase as the row's primary status while the lane it opens printed the
 * operator projection, so the list could describe a subsystem condition while
 * the lane showed CLAUDE · WORKING with live streamed output. Both were
 * computed from the same lane; only one answered "what is this lane doing".
 *
 * The lane header and the desktop rail had already been moved onto
 * `laneOperatorStatus`. The LIST — the whole of the phone experience — had not.
 * Measured against the live Gateway payload before the fix: five of twelve
 * lanes disagreed with their own headers.
 *
 * The projection itself was also wrong in one place: it collapsed OFFLINE into
 * READY, which is a promise the lane cannot keep — there is no runtime to take
 * the work.
 */
import assert from "node:assert/strict";

import {
  OPERATOR_STATE,
  canonicalLaneWorkState,
  composerCanSend,
  composerKeyAction,
  renderComposer,
  laneOperatorStatus,
  operatorState,
  operatorStatusLine,
  renderLaneList,
  sortLanesForIndex,
  touchPrimaryInput,
} from "../apps/vacilando/public/gateway-view.mjs";

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const key = (over = {}) => ({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, keyCode: 13, ...over });

// ---------------------------------------------------------------------------
// C — COMPOSER KEY SEMANTICS (ISSUE 1)
// ---------------------------------------------------------------------------

test("C1. on a touch keyboard Return is a NEWLINE and never a send", () => {
  assert.equal(composerKeyAction(key(), { touchPrimary: true }), "newline");
});

test("C2. on a hardware keyboard Enter still sends — the documented behaviour", () => {
  // The composer renders "Enter to send · Shift+Enter for a new line". That is
  // an explicit shipped promise, so this is intent, not accident, and is left
  // exactly as it was rather than changed on the way past.
  assert.equal(composerKeyAction(key(), { touchPrimary: false }), "send");
});

test("C3. Shift+Enter is a newline on every device", () => {
  for (const touchPrimary of [true, false]) {
    assert.equal(composerKeyAction(key({ shiftKey: true }), { touchPrimary }), "ignore",
      "the default insertion must be left alone, not re-implemented");
  }
});

test("C4. a composing Enter never sends, by either signal", () => {
  // Browsers disagree about which one they set. An IME Enter that sends
  // dispatches a prompt in the middle of choosing a character.
  assert.equal(composerKeyAction(key({ isComposing: true }), { touchPrimary: false }), "ignore");
  assert.equal(composerKeyAction(key({ keyCode: 229 }), { touchPrimary: false }), "ignore",
    "Android IMEs report keyCode 229 with isComposing false");
});

test("C5. modified Enter is left to the platform", () => {
  for (const mod of ["metaKey", "ctrlKey", "altKey"]) {
    assert.equal(composerKeyAction(key({ [mod]: true }), { touchPrimary: false }), "ignore", mod);
  }
});

test("C6. any other key is not this rule's business", () => {
  assert.equal(composerKeyAction(key({ key: "a" }), { touchPrimary: true }), "ignore");
  assert.equal(composerKeyAction(null, { touchPrimary: true }), "ignore");
});

test("C7. the device test is modality, not width", () => {
  const win = (q) => ({ matchMedia: (query) => ({ matches: query === q }) });
  assert.equal(touchPrimaryInput(win("(hover: none) and (pointer: coarse)")), true);
  assert.equal(touchPrimaryInput(win("(min-width: 900px)")), false);
  // A browser without matchMedia must keep the documented desktop behaviour
  // rather than silently disabling send.
  assert.equal(touchPrimaryInput({}), false);
  assert.equal(touchPrimaryInput(null), false);
  assert.equal(touchPrimaryInput({ matchMedia() { throw new Error("boom"); } }), false);
});

// ---------------------------------------------------------------------------
// S — THE SEND CONTROL MUST NOT SPEND THE TAP ON ITSELF (ISSUE 2)
// ---------------------------------------------------------------------------

test("S1. the pointer press on Send is prevented so focus never leaves the field", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(src, /function keepFocusForSend/, "the guard exists");
  assert.match(src, /addEventListener\("pointerdown", keepFocusForSend, true\)/);
  assert.match(src, /addEventListener\("mousedown", keepFocusForSend, true\)/,
    "not every engine emits pointer events; the focus transfer is what matters");
  // The tap must still be decided by the CLICK: a press that drags off the
  // button has to cancel, so send must not be wired to the press itself.
  assert.ok(!/addEventListener\("(pointerdown|touchstart)"[^)]*sendCurrent/.test(src),
    "send must never fire from the press");
  // And no timer-based workaround crept in.
  assert.ok(!/setTimeout\([^)]*sendCurrent/.test(src), "no delayed synthetic send");
});

test("S2. the guard only fires for the Send control while the field holds focus", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function keepFocusForSend"), src.indexOf("document.addEventListener(\"pointerdown\", keepFocusForSend"));
  assert.match(fn, /\[data-gw-send\]/, "scoped to the Send control");
  assert.match(fn, /btn\.disabled/, "a disabled Send is not protected");
  assert.match(fn, /activeElement\?\.id !== "gw-instruction"/,
    "with nothing focused there is nothing to protect, and preventing the default would suppress an ordinary press");
});

test("S3. a send in flight cannot be started twice", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  // Two independent guards: the composer is disabled while sending, so a rapid
  // second tap cannot reach the handler at all, and sendCurrent refuses a
  // re-entry if one does.
  assert.match(src, /disabled: G\.sending \|\| G\.releasing/, "the control is disabled while a send is in flight");
  assert.match(src, /if \(G\.sending\) \{/, "and the sender refuses re-entry");
});

// ---------------------------------------------------------------------------
// O — ONE OPERATOR-FACING STATE (ISSUE 3)
// ---------------------------------------------------------------------------

const laneWith = (over = {}) => ({ lane_id: "lane_x", label: "Payments", ...over });

test("O1. offline is its own operator state, not Ready", () => {
  const work = { key: "offline", group: "offline", label: "Offline", live: false };
  assert.equal(operatorState(work, laneWith()), OPERATOR_STATE.OFFLINE);
  assert.equal(laneOperatorStatus(laneWith(), work).label, "Offline",
    "a lane with no runtime cannot take work, so calling it Ready is a promise it cannot keep");
});

test("O2. being asked still outranks being offline", () => {
  const work = { key: "offline", group: "offline", label: "Offline", live: false };
  const lane = laneWith({ governed_action: { status: "awaiting_operator" } });
  assert.equal(operatorState(work, lane), OPERATOR_STATE.NEEDS_YOU,
    "whether a process is resident is not the operator's problem; being asked is");
});

test("O3. execution outranks a provider condition", () => {
  // The reported case: a run is executing, so the lane is Working whatever a
  // subsystem happens to say about the provider.
  const lane = laneWith({ execution_run: { state: "EXECUTING" }, provider_activity: { activity: "working" } });
  const work = canonicalLaneWorkState(lane);
  assert.equal(work.group, "active");
  assert.equal(laneOperatorStatus(lane, work).label, "Working");
});

test("O4. every runtime phrase in the active band projects to Working", () => {
  for (const label of ["Queued for capacity", "Refreshing Claude context", "Validating", "Recovering"]) {
    const work = { key: "waiting", group: "active", label, live: true };
    assert.equal(laneOperatorStatus(laneWith(), work).label, "Working", label);
  }
});

test("O5. THE REGRESSION: the lane row and the lane header say the same thing", () => {
  // This is the defect, stated as an invariant over every state the runtime can
  // produce rather than over the one screenshot that reported it.
  const lanes = [
    laneWith({ lane_id: "l1", label: "Working lane", execution_run: { state: "EXECUTING", updated_at: new Date().toISOString() }, provider_activity: { activity: "working" } }),
    laneWith({ lane_id: "l2", label: "Offline lane", runtime: "offline" }),
    laneWith({ lane_id: "l3", label: "Needs lane", execution_run: { state: "NEEDS_INPUT" } }),
    laneWith({ lane_id: "l4", label: "Idle lane" }),
    laneWith({ lane_id: "l5", label: "Failed lane", execution_run: { state: "FAILED" } }),
  ];
  const html = renderLaneList(lanes, null, {});
  const rows = [...html.matchAll(/<span class="gw-lane-title">([^<]*)[\s\S]*?<span class="gw-lane-posture[^"]*">([^<]*)<\/span>/g)];
  assert.equal(rows.length, lanes.length, "every lane rendered a row");
  for (const [, title, posture] of rows) {
    const lane = lanes.find((l) => l.label === title.trim());
    const header = laneOperatorStatus(lane, canonicalLaneWorkState(lane)).label;
    assert.equal(posture.trim(), header,
      `${lane.label}: the list said "${posture.trim()}" and the lane header says "${header}"`);
  }
});

test("O6. the runtime phrase is DEMOTED, not discarded", () => {
  // "Queued for capacity" is worth showing. It is not the answer to what the
  // lane is doing, so it rides with the provider and the clock.
  const lane = laneWith({ label: "Idle lane" });
  const html = renderLaneList([lane], null, {});
  assert.match(html, /class="gw-lane-posture[^"]*">Ready</, "the projection is the headline");
  assert.match(html, /class="gw-lane-meta">[^<]*Idle[^<]*</, "and the runtime phrase is still on the row");
});

test("O7. the headline never repeats itself in the meta line", () => {
  const lane = laneWith({ label: "Working lane", execution_run: { state: "EXECUTING" }, provider_activity: { activity: "working" } });
  const html = renderLaneList([lane], null, {});
  const meta = html.match(/class="gw-lane-meta">([^<]*)</)?.[1] || "";
  assert.ok(!meta.includes("Working"), `runtime phrase equals the projection, so it is dropped: "${meta}"`);
});

// ---------------------------------------------------------------------------
// R — ORDERING: STATE FIRST, RECENCY SECOND (ISSUE 3)
// ---------------------------------------------------------------------------

const at = (ms) => new Date(ms).toISOString();

test("R1. actively working lanes are never buried under idle ones", () => {
  const now = Date.now();
  const lanes = [
    // The oldest possible idle lane, and the freshest possible... nothing.
    laneWith({ lane_id: "idle_new", label: "Idle recent", last_activity_ms: now - 1000 }),
    laneWith({ lane_id: "work_old", label: "Working old", execution_run: { state: "EXECUTING", updated_at: at(now - 6 * 3600e3) }, provider_activity: { activity: "working" } }),
  ];
  const order = sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id);
  assert.deepEqual(order, ["work_old", "idle_new"],
    "a six-hour-old running lane still outranks a lane that was touched a second ago");
});

test("R2. within Working, newest active first", () => {
  const now = Date.now();
  const w = (id, ms) => laneWith({ lane_id: id, label: id, execution_run: { state: "EXECUTING", updated_at: at(ms) }, provider_activity: { activity: "working" } });
  const order = sortLanesForIndex([w("older", now - 60e3), w("newest", now - 1e3), w("mid", now - 30e3)], { nowMs: now })
    .map((l) => l.lane_id);
  assert.deepEqual(order, ["newest", "mid", "older"]);
});

test("R3. the full precedence: working, then needs-you, then ready/idle, then terminal, then offline", () => {
  const now = Date.now();
  const lanes = [
    laneWith({ lane_id: "off", label: "off", runtime: "offline" }),
    laneWith({ lane_id: "idle", label: "idle", last_activity_ms: now - 5e3 }),
    laneWith({ lane_id: "needs", label: "needs", execution_run: { state: "NEEDS_INPUT", updated_at: at(now - 5e3) } }),
    laneWith({ lane_id: "work", label: "work", execution_run: { state: "EXECUTING", updated_at: at(now - 5e3) }, provider_activity: { activity: "working" } }),
  ];
  const order = sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id);
  assert.deepEqual(order, ["work", "needs", "idle", "off"]);
});

test("R4. beginning execution moves a lane UP, never down", () => {
  const now = Date.now();
  const before = [
    laneWith({ lane_id: "other", label: "other", last_activity_ms: now - 1e3 }),
    laneWith({ lane_id: "subject", label: "subject", last_activity_ms: now - 60e3 }),
  ];
  assert.deepEqual(sortLanesForIndex(before, { nowMs: now }).map((l) => l.lane_id), ["other", "subject"]);
  const after = before.map((l) => (l.lane_id === "subject"
    ? { ...l, execution_run: { state: "EXECUTING", updated_at: at(now) }, provider_activity: { activity: "working" } }
    : l));
  assert.deepEqual(sortLanesForIndex(after, { nowMs: now }).map((l) => l.lane_id), ["subject", "other"],
    "the lane the operator just started must not sink");
});

test("R5. order is deterministic across identical repeated reads", () => {
  const now = Date.now();
  // Same activity timestamp on purpose: without a stable tiebreak two lanes
  // trade places between polls while the operator is reading the list.
  const lanes = ["b-lane", "a-lane", "c-lane"].map((id) => laneWith({ lane_id: id, label: id, last_activity_ms: now - 1000 }));
  const once = sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id);
  const twice = sortLanesForIndex([...lanes].reverse(), { nowMs: now }).map((l) => l.lane_id);
  assert.deepEqual(once, twice, "input order must not decide output order");
  assert.deepEqual(once, ["a-lane", "b-lane", "c-lane"]);
});

test("R6. passive observation is not activity", () => {
  const now = Date.now();
  // observed_at is stamped on every lane on every poll. If it counted, every
  // lane's recency would be "now" and the list would reshuffle continuously.
  const polled = laneWith({ lane_id: "polled", label: "polled", observed_at: at(now), last_activity_ms: now - 3600e3 });
  const real = laneWith({ lane_id: "real", label: "real", observed_at: at(now - 3600e3), last_activity_ms: now - 60e3 });
  assert.deepEqual(sortLanesForIndex([polled, real], { nowMs: now }).map((l) => l.lane_id), ["real", "polled"]);
});

test("R7. Working -> Ready when execution ends, and the lane stays where recency puts it", () => {
  const now = Date.now();
  const working = laneWith({ lane_id: "l", label: "l", execution_run: { state: "EXECUTING", updated_at: at(now) }, provider_activity: { activity: "working" } });
  assert.equal(laneOperatorStatus(working, canonicalLaneWorkState(working)).label, "Working");
  const done = laneWith({ lane_id: "l", label: "l", previous_run: { state: "COMPLETE", completed_at: at(now) }, provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" } });
  assert.equal(laneOperatorStatus(done, canonicalLaneWorkState(done)).label, "Ready");
  // And it is the most recently active lane, so it heads the non-working band.
  const others = [laneWith({ lane_id: "old", label: "old", last_activity_ms: now - 3600e3 })];
  assert.deepEqual(sortLanesForIndex([...others, done], { nowMs: now }).map((l) => l.lane_id), ["l", "old"]);
});

test("R8. one ordering model, so the rail and the list cannot drift", () => {
  const now = Date.now();
  const lanes = [
    laneWith({ lane_id: "idle", label: "idle", last_activity_ms: now - 1e3 }),
    laneWith({ lane_id: "work", label: "work", execution_run: { state: "EXECUTING", updated_at: at(now - 60e3) }, provider_activity: { activity: "working" } }),
  ];
  const listOrder = [...renderLaneList(lanes, null, {}).matchAll(/data-gw-lane="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listOrder, sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id),
    "the rendered list must be exactly what the shared sorter produced");
});

test("R9. the operator line reads state first, provider second", () => {
  const lane = laneWith({ execution_run: { state: "EXECUTING" }, provider_activity: { activity: "working" } });
  const status = laneOperatorStatus(lane, canonicalLaneWorkState(lane));
  assert.equal(operatorStatusLine(status, "Claude"), "Working · Claude",
    "primary = what it is doing; secondary = who is doing it");
});

// ---------------------------------------------------------------------------
// E — NOTHING TO SEND IS A DISABLED CONTROL (ISSUE 2, found while mounting it)
// ---------------------------------------------------------------------------

test("E1. an empty composer cannot send", () => {
  // Found by tapping Send on an empty composer during the mounted proof: it
  // dispatched an empty instruction to a live agent. Nothing on the client
  // refused it — there was no emptiness check anywhere.
  assert.equal(composerCanSend({ text: "" }), false);
  assert.equal(composerCanSend({ text: "   \n\t " }), false, "whitespace is not content");
});

test("E2. images with no words are a real prompt", () => {
  assert.equal(composerCanSend({ text: "", attachments: [{ attachment_id: "a" }] }), true);
});

test("E3. an upload in flight is not ready to send", () => {
  // Sending now would silently drop the image out of the prompt.
  assert.equal(composerCanSend({ text: "hello", uploading: 1 }), false);
});

test("E4. a send already in flight, or a disabled composer, cannot send again", () => {
  assert.equal(composerCanSend({ text: "hello", sending: true }), false);
  assert.equal(composerCanSend({ text: "hello", disabled: true }), false);
});

test("E5. the rendered Send control agrees with the rule", () => {
  const disabled = (html) => /data-gw-send[^>]*\sdisabled/.test(html);
  assert.equal(disabled(renderComposer({ draft: "" })), true, "empty");
  assert.equal(disabled(renderComposer({ draft: "hello" })), false, "has text");
  assert.equal(disabled(renderComposer({ draft: " ", attachments: [{ attachment_id: "a" }] })), false, "has an image");
  assert.equal(disabled(renderComposer({ draft: "hello", attachmentsUploading: 1 })), true, "upload in flight");
});

test("E6. the sender enforces it too, because Enter also reaches it", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(src, /View\.composerCanSend\(\{ text: instruction/, "sendCurrent refuses an empty send");
  assert.match(src, /function syncSendEnabled/, "and the control is kept in step while typing");
  // Repainting on every keystroke would replace the textarea the operator is
  // typing into, taking focus and the phone keyboard with it.
  assert.ok(!/syncSendEnabled[\s\S]{0,200}paint\(\)/.test(src), "the keystroke path must not repaint");
});

test("E7. every model symbol the view USES is imported, not merely re-exported", () => {
  // `export * from` makes a symbol available to importers of gateway-view while
  // leaving it undefined INSIDE it. composerCanSend shipped that way and threw
  // ReferenceError on the real page while every unit test passed, because the
  // tests import through the same re-export. Rendering is the check.
  assert.doesNotThrow(() => renderComposer({ draft: "x" }));
  assert.doesNotThrow(() => renderLaneList([{ lane_id: "l", label: "L" }], null, {}));
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

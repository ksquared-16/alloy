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
import { readFileSync } from "node:fs";

import {
  OPERATOR_STATE,
  canonicalLaneWorkState,
  composerCanSend,
  composerKeyAction,
  renderComposer,
  laneOperatorStatus,
  operatorState,
  operatorStatusLine as opLine,
  ATTENTION_CAUSE_COPY,
  LANE_LIST_GROUP_ORDER,
  OPERATOR_PRIORITY,
  OPERATOR_STATE_LABEL,
  attentionCauseCopy,
  laneOperatorPriority,
  laneOperatorPriorityRank,
  operatorStatusLine,
  buildLaneSummaries,
  laneRowV2,
  renderLaneHeaderV2,
  renderLaneList,
  railLaneRow,
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
  const rows = [...html.matchAll(/<span class="gw-lane-title">([^<]*)[\s\S]*?<span class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?([^<]*)<\/span>/g)];
  assert.equal(rows.length, lanes.length, "every lane rendered a row");
  for (const [, title, posture] of rows) {
    const lane = lanes.find((l) => l.label === title.trim());
    const header = laneOperatorStatus(lane, canonicalLaneWorkState(lane)).label;
    assert.equal(posture.trim(), header,
      `${lane.label}: the list said "${posture.trim()}" and the lane header says "${header}"`);
  }
});

test("O6. the runtime phrase is DEMOTED, not discarded", () => {
  // A finished run reads "Ready" to the operator, and "Complete" is a real
  // distinction underneath it — not a synonym — so it still rides as secondary.
  const lane = laneWith({ label: "Done lane", execution_run: { state: "COMPLETE" } });
  const html = renderLaneList([lane], null, {});
  assert.match(html, /class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?Ready</, "the projection is the headline");
  assert.match(html, /class="gw-lane-why">Complete</, "and the runtime phrase is still on the row");
});

test("O6b. a synonym is suppressed rather than dressed up as an exception", () => {
  // "Ready" over "Idle" says the same thing twice, and the secondary slot
  // otherwise holds exceptions — so a quiet lane would read as a problem.
  const html = renderLaneList([laneWith({ label: "Quiet lane" })], null, {});
  assert.match(html, /class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?Ready</);
  assert.ok(!/class="gw-lane-why">/.test(html));
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
  // A run that ENDED CLEANLY and has been read. Written this way deliberately:
  // the first version of this control used a bare COMPLETE previous_run, which
  // resolves to `completion_unreported` — a run that finished without a summary
  // — and that is an attention state, not Ready. See R11.
  const done = laneWith({
    lane_id: "l", label: "l",
    // report_id is the resolver's exact predicate for "an account of this turn
    // survives" — measured on this host across 104 terminal runs, present for
    // exactly the 82 that carry a durable agent report and absent for the 22
    // that do not. A summary string is not the predicate.
    previous_run: { state: "COMPLETE", completed_at: at(now), completion_report: { report_id: "rep_1", summary: "done" } },
    provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" },
    unseen_notifications: 0,
  });
  assert.equal(laneOperatorStatus(done, canonicalLaneWorkState(done)).label, "Ready",
    `runtime resolved to ${canonicalLaneWorkState(done).key}`);
  // And it is the most recently active lane, so it heads the non-working band.
  const others = [laneWith({ lane_id: "old", label: "old", last_activity_ms: now - 3600e3 })];
  assert.deepEqual(sortLanesForIndex([...others, done], { nowMs: now }).map((l) => l.lane_id), ["l", "old"]);
});

test("R10. EVERY group the runtime can return has a rank", () => {
  // THE DEFECT THIS CLOSES, measured on staging: canonicalLaneWorkState returns
  // six groups and LANE_LIST_GROUP_ORDER listed five. sortLanesForIndex ranks an
  // unlisted group at LANE_LIST_GROUP_ORDER.length — BELOW offline — so every
  // lane in the `attention` band sank to the bottom of the list, silently.
  // Nothing threw; the list merely looked wrong.
  const src = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url), "utf8");
  const resolver = src.slice(src.indexOf("export function canonicalLaneWorkState"));
  const body = resolver.slice(0, resolver.indexOf("\nexport function ", 1));
  const groups = [...new Set([...body.matchAll(/group: "([a-z_]+)"/g)].map((m) => m[1]))];
  assert.ok(groups.length >= 6, `expected the resolver to name several groups, found ${groups.join(", ")}`);
  for (const g of groups) {
    assert.ok(LANE_LIST_GROUP_ORDER.includes(g),
      `group "${g}" is produced by canonicalLaneWorkState but has no rank, so every lane in it sorts below offline`);
  }
});

test("R11. a lane wanting attention is near the top, not under the offline ones", () => {
  const now = Date.now();
  // The reported case: the provider is busy with no Execution Run open, which
  // renders "Provider active". It is fifteen minutes stale and still outranks a
  // lane touched seconds ago, because attention is a state and not a timestamp.
  const attn = laneWith({ lane_id: "attn", label: "attn", claude: { presence: "present" }, provider_activity: { activity: "working" }, last_activity_ms: now - 9e5 });
  assert.equal(canonicalLaneWorkState(attn, { nowMs: now }).group, "attention");
  const lanes = [
    laneWith({ lane_id: "off", label: "off", runtime: "offline" }),
    laneWith({ lane_id: "idle", label: "idle", last_activity_ms: now - 1e3 }),
    attn,
    laneWith({ lane_id: "work", label: "work", execution_run: { state: "EXECUTING", updated_at: at(now - 5e3) }, provider_activity: { activity: "working" } }),
  ];
  assert.deepEqual(sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id), ["work", "attn", "idle", "off"]);
});

test("R12. a run that finished without a summary is attention, not Ready", () => {
  // The other half of R7: "the run closed" and "the work was reported" are
  // different facts, and only the second one means the lane needs nobody.
  const now = Date.now();
  const unreported = laneWith({ previous_run: { state: "COMPLETE", completed_at: at(now) }, provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" } });
  const work = canonicalLaneWorkState(unreported, { nowMs: now });
  assert.equal(work.group, "attention");
  // It names WHICH attention, now split: the operational fact is that the run
  // finished, and the exception is that its account is missing.
  const op = laneOperatorStatus(unreported, work, { nowMs: now });
  assert.equal(op.label, "Finished");
  assert.match(op.explanation, /report/i);
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

// ---------------------------------------------------------------------------
// A — A STATE NAME MUST SAY WHAT IS TRUE (reported by the operator)
// ---------------------------------------------------------------------------

test("A1. every operator PRIMARY names an operational fact", () => {
  // The report that started this: "I don't understand what attention means in
  // this context." The first fix named the cause — "Working · untracked" — and
  // was still the wrong shape, because the operator's first question is what
  // the lane is DOING and a composite string answers two questions at once.
  for (const key of Object.keys(ATTENTION_CAUSE_COPY)) {
    const st = laneOperatorStatus(laneWith(), { key, group: "attention" });
    assert.notEqual(st.label, OPERATOR_STATE_LABEL.attention, `${key} still renders the bucket name`);
    assert.ok(!st.label.includes("·"), `${key} primary is composite: "${st.label}"`);
    assert.ok(st.explanation && st.explanation.length > 0, `${key} has no secondary`);
  }
});

test("A2. primary is the operational fact, secondary is the exception", () => {
  const untracked = laneOperatorStatus(laneWith(), { key: "provider_active", group: "attention" });
  assert.equal(untracked.label, "Working");
  assert.match(untracked.explanation, /tracked/i);

  const unreported = laneOperatorStatus(laneWith(), { key: "completion_unreported", group: "attention" });
  assert.equal(unreported.label, "Finished");
  assert.match(unreported.explanation, /report/i);
});

test("A3. the primary line every surface renders carries no exception copy", () => {
  const st = laneOperatorStatus(laneWith(), { key: "provider_active", group: "attention" });
  assert.equal(opLine(st, "Claude"), "Working · Claude",
    "the exception belongs beneath the line, not inside it");
});

test("A4. an unrecognised cause keeps the generic primary and routes to Details", () => {
  // Inventing an operational fact for a state nobody has described would be
  // worse than admitting the gap.
  const st = laneOperatorStatus(laneWith(), { key: "some_future_cause", group: "attention" });
  assert.equal(st.state, "attention");
  assert.equal(st.label, OPERATOR_STATE_LABEL.attention);
  assert.match(st.explanation, /Details/);
  assert.deepEqual(attentionCauseCopy("some_future_cause"), attentionCauseCopy(undefined),
    "one fallback, not a per-caller guess");
});

test("A5. attention does not outrank being asked, and does not swallow the rest", () => {
  assert.equal(operatorState({ key: "needs_input", group: "needs_input" }, laneWith()), "needs_you");
  assert.equal(operatorState({ key: "working", group: "active", live: true }, laneWith()), "working");
  assert.equal(operatorState({ key: "offline", group: "offline" }, laneWith()), "offline");
  assert.equal(operatorState({ key: "idle", group: "idle" }, laneWith()), "ready");
  // An attention lane the Director is being asked about is still Needs you:
  // being asked outranks being warned.
  assert.equal(operatorState({ key: "provider_active", group: "attention" },
    laneWith({ governed_action: { status: "awaiting_operator" } })), "needs_you");
});

test("A6. the lane row shows primary and secondary as separate elements", () => {
  const lane = laneWith({ label: "Backend", claude: { presence: "present" }, provider_activity: { activity: "working" } });
  assert.equal(canonicalLaneWorkState(lane).group, "attention", "fixture reproduces the reported state");
  const html = renderLaneList([lane], null, {});
  assert.match(html, /class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?Working</, "primary is the operational fact");
  assert.match(html, /class="gw-lane-why">Execution[^<]*tracked</, "secondary is its own element");
  assert.ok(!/class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?[^<]*·/.test(html), "primary carries no composite");
});

// ---------------------------------------------------------------------------
// P — CANONICAL CLASSIFICATION AND OPERATOR PRIORITY ARE DIFFERENT LAYERS
// ---------------------------------------------------------------------------

test("P1. sorting asks the operator layer, not the canonical band", () => {
  // THE BOUNDARY THIS HOLDS. sortLanesForIndex ranked by
  // canonicalLaneWorkState().group, so the internal classification WAS the
  // operator-facing sorting ontology. Two causes sharing a band could then only
  // be ranked apart by reclassifying one of them in the resolver — changing
  // canonical truth to obtain a presentation outcome.
  const src = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url), "utf8");
  const at = src.indexOf("export function sortLanesForIndex");
  // Comments stripped first: this function explains what it USED to read, and
  // matching that sentence would fail the check for describing the very defect
  // it closes.
  const fn = src.slice(at, src.indexOf("\n}", at))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(fn, /laneOperatorPriorityRank\(/, "rank comes from the operator layer");
  assert.ok(!/LANE_LIST_GROUP_ORDER\.indexOf/.test(fn),
    "the canonical band must no longer be the sort key");
});

test("P2. the two attention causes are SEPARATELY rankable", () => {
  // The whole point of the seam: same canonical band, different priorities,
  // with no change to how the runtime classifies either one.
  const a = { key: "provider_active", group: "attention" };
  const b = { key: "completion_unreported", group: "attention" };
  assert.equal(a.group, b.group, "same canonical band, by construction");
  assert.notEqual(laneOperatorPriority(a), laneOperatorPriority(b),
    "yet they can carry different operator priorities");
  assert.equal(laneOperatorPriority(a), "active_exception");
  assert.equal(laneOperatorPriority(b), "completion_exception");
});

test("P3. re-ranking a cause needs no canonical change", () => {
  // Stated as a property of the wiring rather than by mutating the table: the
  // priority function reads the runtime KEY, so a cause's rank is a function of
  // something the resolver already publishes and nothing has to be reclassified
  // to move it.
  const src = readFileSync(new URL("../apps/vacilando/public/vacilando-ui-model.mjs", import.meta.url), "utf8");
  const at = src.indexOf("export function laneOperatorPriority");
  const fn = src.slice(at, src.indexOf("\n}", at));
  assert.match(fn, /work\?\.key/, "priority is keyed on the runtime condition, not only the band");
  assert.match(src, /PRIORITY_BY_ATTENTION_CAUSE = Object\.freeze\(\{/, "and causes are listed individually");
});

test("P4. EVERY operator state and EVERY attention cause has an explicit rank", () => {
  // The exhaustive invariant, moved to the layer that now decides order.
  for (const state of Object.values(OPERATOR_STATE)) {
    const work = state === OPERATOR_STATE.ATTENTION
      ? { key: "provider_active", group: "attention" }
      : { key: state, group: state === "working" ? "active" : state, live: state === "working" };
    const p = laneOperatorPriority(work, laneWith());
    assert.ok(OPERATOR_PRIORITY.includes(p), `operator state ${state} resolved to unranked priority ${p}`);
  }
  for (const cause of Object.keys(ATTENTION_CAUSE_COPY)) {
    const p = laneOperatorPriority({ key: cause, group: "attention" });
    assert.ok(OPERATOR_PRIORITY.includes(p), `attention cause ${cause} has no rank`);
  }
  // And every canonical band still resolves to a ranked priority, so a band
  // cannot be added upstream and silently sink.
  for (const band of LANE_LIST_GROUP_ORDER) {
    const p = laneOperatorPriority({ key: `probe_${band}`, group: band });
    assert.ok(OPERATOR_PRIORITY.includes(p), `band ${band} has no ranked priority`);
  }
});

test("P5. an unknown exceptional condition fails SAFE — above ready, never Ready", () => {
  // The opposite default is the one that hurts: "I do not recognise this"
  // rendered as "nothing to see here", for a lane something just flagged.
  const unknown = { key: "some_future_cause", group: "attention" };
  assert.equal(laneOperatorPriority(unknown), "unclassified_exception");
  assert.ok(laneOperatorPriorityRank(unknown) < OPERATOR_PRIORITY.indexOf("ready"),
    "an unrecognised exception must outrank every lane that is fine");
  assert.notEqual(laneOperatorPriority(unknown), "ready");
  // Even a wholly unrecognised shape must not land on ready.
  assert.notEqual(laneOperatorPriority({ key: "??", group: "??" }), "ready");
});

test("P6. an exception lane can never fall beneath Offline", () => {
  const now = Date.now();
  const lanes = [
    laneWith({ lane_id: "off", label: "off", runtime: "offline", last_activity_ms: now - 1e3 }),
    laneWith({ lane_id: "attn", label: "attn", claude: { presence: "present" }, provider_activity: { activity: "working" }, last_activity_ms: now - 9e6 }),
  ];
  const order = sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id);
  assert.deepEqual(order, ["attn", "off"],
    "a two-and-a-half-hour-stale exception still outranks a lane touched a second ago");
});

test("P7. the certified order is unchanged for every state that exists today", () => {
  const now = Date.now();
  const mk = (id, over) => laneWith({ lane_id: id, label: id, ...over });
  const lanes = [
    mk("off", { runtime: "offline" }),
    mk("failed", { execution_run: { state: "FAILED", updated_at: at(now - 9e3) } }),
    mk("complete", { execution_run: { state: "COMPLETE", updated_at: at(now - 8500) } }),
    mk("idle", { last_activity_ms: now - 8e3 }),
    mk("unrep", { previous_run: { state: "COMPLETE", completed_at: at(now - 7e3) }, provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" } }),
    mk("provact", { claude: { presence: "present" }, provider_activity: { activity: "working" }, last_activity_ms: now - 6e3 }),
    mk("needs", { execution_run: { state: "NEEDS_INPUT", updated_at: at(now - 5e3) } }),
    mk("work", { execution_run: { state: "EXECUTING", updated_at: at(now - 4e3) }, provider_activity: { activity: "working" } }),
  ];
  assert.deepEqual(sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id),
    ["work", "needs", "provact", "unrep", "idle", "complete", "failed", "off"],
    "a finished run stays with the terminal lanes, below the merely quiet ones");
});

// ---------------------------------------------------------------------------
// H — HIERARCHY, HELD ON EVERY OPERATOR SURFACE
// ---------------------------------------------------------------------------

const attentionLane = (kind) => (kind === "untracked"
  ? laneWith({ lane_id: "u", label: "Untracked", claude: { presence: "present" }, provider_activity: { activity: "working" } })
  : laneWith({ lane_id: "r", label: "Unreported", previous_run: { state: "COMPLETE", completed_at: new Date().toISOString() }, provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" } }));

test("H1. no operator surface prints the internal identity", () => {
  // provider_active, completion_unreported, canonical band names and
  // execution-run bookkeeping belong in diagnostics, not on a lane row.
  const banned = /provider_active|completion_unreported|Provider active|Completed · no summary|canonical|execution_run/;
  for (const kind of ["untracked", "unreported"]) {
    const lane = attentionLane(kind);
    const list = renderLaneList([lane], null, {});
    assert.ok(!banned.test(list), `lane list leaks internals for ${kind}`);
    const rail = railLaneRow(lane, null, {}, {});
    assert.ok(!banned.test(rail), `rail leaks internals for ${kind}`);
  }
});

test("H2. the sidebar prints a dot, never an exclamation", () => {
  // "! Attention" in the nav was punctuation wedged into the status copy where
  // every other state showed a dot. The warning is carried by the tone class
  // the same span sets and by the explanation beneath it.
  const rail = railLaneRow(attentionLane("untracked"), null, {}, {});
  const attn = rail.match(/<span class="gw-lane-attn[^"]*">([^<]*)/)?.[1] || "";
  assert.ok(!attn.trim().startsWith("!"), `sidebar still leads with punctuation: "${attn.trim()}"`);
  assert.match(attn, /^\s*[\u25cf\u25cb]/, "and still leads with the dot convention");
  assert.match(rail, /is-needs/, "the warning is carried by tone");
  assert.match(rail, /class="gw-lane-why">/, "and by the explanation");
});

test("H3. row and header agree on both halves", () => {
  for (const kind of ["untracked", "unreported"]) {
    const lane = attentionLane(kind);
    const work = canonicalLaneWorkState(lane);
    const op = laneOperatorStatus(lane, work);
    const list = renderLaneList([lane], null, {});
    const rowPrimary = list.match(/class="gw-lane-posture[^"]*">(?:<span[^>]*>[^<]*<\/span>)?([^<]*)</)?.[1];
    const rowWhy = list.match(/class="gw-lane-why">([^<]*)</)?.[1];
    assert.equal(rowPrimary, op.label, `${kind}: row primary disagrees with the projection`);
    assert.equal(rowWhy, op.explanation, `${kind}: row secondary disagrees with the projection`);
    // The header renders the same projection, so agreement is structural.
    const header = renderLaneHeaderV2(lane, { work });
    assert.match(header, new RegExp(op.label));
    assert.match(header, /class="vlane-head-why"/);
  }
});

test("H4. Home and the mobile list carry the secondary as its own field", () => {
  const lane = attentionLane("untracked");
  const [summary] = buildLaneSummaries({ lanes: [lane], laneState: (l) => canonicalLaneWorkState(l) });
  assert.equal(summary.state.split(" · ")[0], "Working", "primary only in the state line");
  assert.ok(!summary.state.includes("tracked"), "the exception is not appended to the state string");
  assert.equal(summary.explanation, "Execution isn\u2019t being tracked");
  assert.match(laneRowV2(summary), /class="vlane-why">/);
});

test("H5. a healthy lane carries NO warning copy anywhere", () => {
  const working = laneWith({ lane_id: "w", label: "W", execution_run: { state: "EXECUTING" }, provider_activity: { activity: "working" } });
  const op = laneOperatorStatus(working, canonicalLaneWorkState(working));
  assert.equal(op.label, "Working");
  assert.equal(op.explanation, null, "an ordinary working lane has nothing to explain");
  const list = renderLaneList([working], null, {});
  assert.ok(!/class="gw-lane-why">/.test(list), "and renders no secondary element");
  // Nor does a quiet one: "Ready" over "Idle" says the same thing twice and, in
  // a slot that otherwise holds exceptions, reads like one.
  const quiet = renderLaneList([laneWith({ lane_id: "q", label: "Q" })], null, {});
  assert.ok(!/class="gw-lane-why">/.test(quiet), "a synonym is not an explanation");
});

test("H6. ordering is unchanged from the certified Batch 1C candidate", () => {
  // Presentation polish only: the same fixture set 1C pinned, asserted here so
  // a copy change can never quietly move a lane.
  const now = Date.now();
  const mk = (id, over) => laneWith({ lane_id: id, label: id, ...over });
  const lanes = [
    mk("off", { runtime: "offline" }),
    mk("failed", { execution_run: { state: "FAILED", updated_at: at(now - 9e3) } }),
    mk("complete", { execution_run: { state: "COMPLETE", updated_at: at(now - 8500) } }),
    mk("idle", { last_activity_ms: now - 8e3 }),
    mk("unrep", { previous_run: { state: "COMPLETE", completed_at: at(now - 7e3) }, provider_activity: { activity: "ready" }, execution_capacity: { state: "CONNECTED" } }),
    mk("provact", { claude: { presence: "present" }, provider_activity: { activity: "working" }, last_activity_ms: now - 6e3 }),
    mk("needs", { execution_run: { state: "NEEDS_INPUT", updated_at: at(now - 5e3) } }),
    mk("work", { execution_run: { state: "EXECUTING", updated_at: at(now - 4e3) }, provider_activity: { activity: "working" } }),
  ];
  assert.deepEqual(sortLanesForIndex(lanes, { nowMs: now }).map((l) => l.lane_id),
    ["work", "needs", "provact", "unrep", "idle", "complete", "failed", "off"]);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

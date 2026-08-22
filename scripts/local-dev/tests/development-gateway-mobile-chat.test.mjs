#!/usr/bin/env node
/**
 * The lane page is a conversation.
 *
 * Every law here was written against a screen that was wrong on this host:
 *
 *  - the details panel sat at the TOP of the mobile column taking up to 38vh
 *    before the conversation got a pixel, and a long instruction — unclamped
 *    and flex:0 0 auto — took the rest, so the assistant reply rendered in two
 *    rows;
 *  - lane rows printed the literal text "[object Object]" because
 *    execution_run.latest_progress is an OBJECT, not a string;
 *  - Lifecycle Cert and Processing read "Queued for capacity" for three days
 *    while having no worktree binding, so they were queued for capacity they
 *    could never receive — and they outranked genuinely running lanes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STALE_ADMISSION_MS,
  canonicalLaneWorkState,
  copySourcePlan,
  deriveLaneExecutionPosture,
  laneRowSummary,
  renderLaneList,
  renderLaneRuntimeControls,
  renderGatewayShell,
  renderLastInstruction,
  sortLanesForIndex,
  staleAdmissionClaim,
  summarizeExecutionCapacity,
  summaryText,
  userMessageNeedsClamp,
} from "../apps/vacilando/public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "vacilando", "public");
const css = readFileSync(join(PUBLIC, "styles.css"), "utf8");
const gwSrc = readFileSync(join(PUBLIC, "gateway.js"), "utf8");

const NOW = Date.parse("2026-08-22T15:00:00.000Z");

function boundLane(extra = {}) {
  return {
    lane_id: "lane_db3431e755a8",
    label: "Vacilando",
    durable: true,
    preferred_provider: "claude",
    claude: { presence: "present" },
    runtime: "online",
    worktree: { path: "/w", managed: true, name: "wt5" },
    binding: { worktree_path: "/w", slot: 5, tmux_session: "alloy-vacilando" },
    git: { branch: "b", state: "clean", ahead: 0, behind: 0 },
    execution_run: { state: "EXECUTING", state_reason: "instruction_delivered", updated_at: "2026-08-22T14:59:00.000Z" },
    ...extra,
  };
}

/** Lifecycle Cert as the live Gateway actually returned it. */
function staleQueuedLane(extra = {}) {
  return {
    lane_id: "lane_e04f184e7527",
    label: "Lifecycle Cert",
    durable: true,
    claude: { presence: "absent" },
    runtime: "offline",
    worktree: { name: null, path: null, managed: false },
    binding: null,
    binding_ok: false,
    binding_blockers: [{ code: "missing_worktree", detail: "Lane has no worktree binding" }],
    git: { branch: null, state: "unknown", ahead: 0, behind: 0 },
    admission: {
      admission_id: "eadm_97cb00a0aa6bab4f",
      state: "QUEUED",
      queue_position: 2,
      requested_at: "2026-08-19T16:21:17.615Z",
    },
    execution_run: {
      run_id: "erun_4e4d3b9ba5b4c101",
      state: "QUEUED",
      state_reason: "waiting_for_execution_capacity",
      created_at: "2026-08-19T16:21:17.615Z",
      updated_at: "2026-08-19T16:21:17.615Z",
      admission: { admission_id: "eadm_97cb00a0aa6bab4f", state: "QUEUED", queue_position: 2 },
    },
    ...extra,
  };
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

// ------------------------------------------------------- chat-only surface --

test("the default lane page is header, one status line, thread, composer", () => {
  const lane = boundLane();
  const html = renderGatewayShell({
    lanes: [lane],
    selectedId: lane.lane_id,
    lane,
    outputText: "assistant output",
    lastInstruction: { instruction: "do the thing", status: "delivered", delivered_at: "2026-08-22T14:58:00.000Z" },
    listReady: true,
    nowMs: NOW,
  });
  for (const marker of ["gw-chat-head", "gw-chat-title", "gw-stage-status", "data-gw-thread", "gw-msg-user", "gw-msg-assistant", "data-gw-composer"]) {
    assert.ok(html.includes(marker), `stage is missing ${marker}`);
  }
  // Exactly one status line in the stage, and exactly one details panel.
  const stage = html.slice(html.indexOf("gw-lane-stage"), html.indexOf('id="gw-details-panel"'));
  assert.equal((stage.match(/gw-work-state/g) || []).length, 1);
  assert.equal((html.match(/id="gw-details-panel"/g) || []).length, 1);
  // The old second home for lane facts is gone.
  assert.equal(html.includes("data-gw-lane-fold"), false);
  assert.equal(html.includes("gw-lane-compact"), false);
});

test("every non-chat control lives in the one details panel, after the stage", () => {
  const lane = boundLane();
  const html = renderGatewayShell({
    lanes: [lane], selectedId: lane.lane_id, lane, outputText: "out", listReady: true, nowMs: NOW,
  });
  const panelIdx = html.indexOf('id="gw-details-panel"');
  const stageEnd = html.indexOf("data-gw-composer");
  assert.ok(panelIdx > stageEnd, "the details panel must follow the whole conversation");
  for (const marker of ["data-gw-claude-run", "data-gw-runtime", "data-gw-status", "gw-notify", "data-gw-rename"]) {
    const at = html.indexOf(marker);
    assert.ok(at > panelIdx, `${marker} must live inside the details panel`);
  }
});

test("the details panel is off-canvas on mobile and beside the chat on desktop", () => {
  const mobile = css.slice(css.indexOf("@media (max-width:860px)"), css.lastIndexOf("@media (min-width:861px)"));
  assert.match(mobile, /\.gw-lane-aside,\.gw-lane-chrome\{[^}]*position:fixed/);
  assert.match(mobile, /transform:translateX\(100%\)/);
  assert.match(mobile, /is-aside-open[\s\S]{0,120}translateX\(0\)/);
  // The 38vh top block is what pushed the conversation off the screen.
  assert.equal(mobile.includes("max-height:38vh"), false);
  assert.match(gwSrc, /data-gw-aside-toggle/);
  assert.match(gwSrc, /function setAsideOpen/);
});

// -------------------------------------------------- clamped user messages --

test("a long instruction clamps to a handful of lines with View more / View less", () => {
  const long = "Resume the paused mobile UI acceptance assignment now.\n".repeat(12);
  assert.equal(userMessageNeedsClamp(long), true);
  assert.equal(userMessageNeedsClamp("short one"), false);
  assert.equal(userMessageNeedsClamp(""), false);

  const rec = { instruction: long, status: "delivered", delivered_at: "2026-08-22T14:58:00.000Z" };
  const collapsed = renderLastInstruction(rec, NOW);
  assert.match(collapsed, /is-clamped/);
  assert.match(collapsed, /data-gw-msg-more/);
  assert.match(collapsed, />View more</);
  assert.match(collapsed, /aria-expanded="false"/);

  const expanded = renderLastInstruction(rec, NOW, { expanded: true });
  assert.equal(expanded.includes("is-clamped"), false);
  assert.match(expanded, />View less</);
  assert.match(expanded, /aria-expanded="true"/);

  // A short message gets no control at all.
  const short = renderLastInstruction({ instruction: "hi", status: "delivered", delivered_at: "2026-08-22T14:58:00.000Z" }, NOW);
  assert.equal(short.includes("data-gw-msg-more"), false);

  assert.match(css, /is-clamped[\s\S]{0,200}-webkit-line-clamp:6/);
  assert.match(gwSrc, /data-gw-msg-more/);
});

// --------------------------------------------------- unclipped assistant --

test("the assistant reply has a height floor and no dead margin above it", () => {
  // The copy control used to be absolutely positioned over the output, which
  // forced margin-top:36px on every response.
  assert.match(css, /\.gw-msg-tools\{/);
  assert.match(css, /\.gw-msg-assistant \.gw-copy\{[^}]*position:static/);
  const outputRule = css.slice(css.indexOf(".gw-lane-stage .gw-output,"), css.indexOf(".gw-thread .gw-output-h"));
  assert.match(outputRule, /min-height:11rem/);
  assert.match(outputRule, /margin-top:0/);
  const mobile = css.slice(css.indexOf("@media (max-width:860px)"), css.lastIndexOf("@media (min-width:861px)"));
  assert.match(mobile, /\.gw-output\{[^}]*min-height:9rem/);
  assert.match(mobile, /\.gw-msg-user\{max-width:100%/);
});

test("copy takes the complete response, not the visible snapshot", () => {
  // A bounded recent pane on a finished run must reach for the transcript.
  const bounded = { mode: "recent", truncated: true, history_size: 900, returned_lines: 120, text: "tail" };
  const finished = copySourcePlan(bounded, { lane: { execution_run: { state: "COMPLETE" } } });
  assert.equal(finished.needsFetch, true);
  assert.equal(finished.mode, "latest_response");
  assert.equal(finished.fallback, "extended");

  // Mid-run there is no final response yet, so retained history is the best truth.
  const live = copySourcePlan(bounded, { lane: { execution_run: { state: "EXECUTING" } } });
  assert.equal(live.needsFetch, true);
  assert.equal(live.mode, "extended");

  // Nothing is bounded: what is on screen already is the whole thing.
  const whole = copySourcePlan({ mode: "recent", truncated: false, history_size: 40, returned_lines: 40 }, { lane: {} });
  assert.equal(whole.needsFetch, false);
  const already = copySourcePlan({ mode: "latest_response", available: true }, { lane: {} });
  assert.equal(already.needsFetch, false);

  assert.match(gwSrc, /async function completeCopyText/);
  assert.match(gwSrc, /const text = await completeCopyText\(\)/);
});

// ------------------------------------------------------ [object Object] ----

test("an object-shaped summary is read, never stringified", () => {
  assert.equal(summaryText({ summary: "Promotion: branch check", at: "2026-08-22T15:01:14.2Z" }), "Promotion: branch check");
  assert.equal(summaryText({ label: "browser certification" }), "browser certification");
  assert.equal(summaryText("plain"), "plain");
  assert.equal(summaryText(null), "");
  assert.equal(summaryText({ at: "x" }), "");
  assert.equal(summaryText([{ detail: "Lane has no worktree binding" }]), "Lane has no worktree binding");

  // The exact live shape that printed "[object Object]" on three lanes.
  const lane = boundLane({
    execution_run: { state: "EXECUTING", latest_progress: { summary: "Promotion: branch check, regression, smoke, PR", at: "2026-08-22T15:01:14.2Z" } },
  });
  assert.equal(laneRowSummary(lane, { hint: "Claude", label: "Working" }, "Claude"), "Promotion: branch check, regression, smoke, PR");
  const list = renderLaneList([lane], null, { nowMs: NOW });
  assert.equal(list.includes("[object Object]"), false);
  assert.match(list, /Promotion: branch check/);
});

test("a lane row is one canonical status and one readable summary", () => {
  const lane = boundLane({
    execution_run: { state: "EXECUTING", latest_progress: { summary: "Doing the work" }, updated_at: "2026-08-22T14:59:00.000Z" },
  });
  const row = renderLaneList([lane], null, { nowMs: NOW });
  assert.equal((row.match(/gw-lane-posture/g) || []).length, 1, "exactly one status");
  assert.equal((row.match(/gw-lane-summary/g) || []).length, 1, "exactly one summary");
  // Agent, elapsed and git collapse into a single meta line instead of three.
  assert.equal((row.match(/gw-lane-meta/g) || []).length, 1);
  assert.equal(row.includes("gw-lane-when"), false);
  assert.equal(row.includes("gw-lane-git-state"), false);
});

// ------------------------------------------------ truthful capacity state --

test("a queued lane that cannot be provisioned is proven stale, not 'Queued for capacity'", () => {
  const lane = staleQueuedLane();
  const claim = staleAdmissionClaim(lane, NOW);
  assert.ok(claim, "three days queued with no binding is stale");
  assert.equal(claim.admission_state, "QUEUED");
  assert.match(claim.reason, /no worktree binding/i);
  assert.match(claim.detail, /cannot receive/);

  const cap = deriveLaneExecutionPosture(lane, { nowMs: NOW });
  assert.equal(cap.state, "QUEUED_STALE");
  assert.equal(cap.label, "Stale capacity claim");

  // Every guard: a bound lane, a live agent, a live run, or a fresh queue entry
  // is NOT stale. This must never demote real work.
  assert.equal(staleAdmissionClaim(boundLane({ admission: lane.admission }), NOW), null);
  assert.equal(staleAdmissionClaim({ ...lane, claude: { presence: "present" } }, NOW), null);
  assert.equal(staleAdmissionClaim({ ...lane, execution_run: { ...lane.execution_run, state: "EXECUTING" } }, NOW), null);
  const fresh = staleQueuedLane();
  fresh.admission.requested_at = new Date(NOW - (STALE_ADMISSION_MS - 1000)).toISOString();
  assert.equal(staleAdmissionClaim(fresh, NOW), null);
  assert.equal(deriveLaneExecutionPosture(fresh, { nowMs: NOW }).state, "QUEUED_FOR_CAPACITY");
});

test("a stale claim offers a governed Release capacity action with its proof", () => {
  const lane = staleQueuedLane();
  const html = renderLaneRuntimeControls(lane, deriveLaneExecutionPosture(lane));
  assert.match(html, /data-posture="QUEUED_STALE"/);
  assert.match(html, /data-gw-runtime-release/);
  assert.match(html, /data-lane-id="lane_e04f184e7527"/);
  assert.match(html, /cannot receive/);
  assert.match(html, /durable lane, worktree and branch stay/);

  // The panel is where it lives, and the client posts it to the capacity owner.
  const shell = renderGatewayShell({ lanes: [lane], selectedId: lane.lane_id, lane, outputText: "", listReady: true, nowMs: NOW });
  assert.ok(shell.indexOf("data-gw-runtime-release") > shell.indexOf('id="gw-details-panel"'));
  assert.match(gwSrc, /runtime\/release/);
});

test("stale claims do not occupy the active band or the capacity queue", () => {
  const lanes = [staleQueuedLane(), boundLane()];
  const work = canonicalLaneWorkState(lanes[0]);
  assert.equal(work.group, "idle");
  assert.equal(work.label, "Stale capacity claim");

  const sorted = sortLanesForIndex(lanes, { nowMs: NOW });
  assert.equal(sorted[0].label, "Vacilando", "real work sorts ahead of a dead claim");

  const cap = summarizeExecutionCapacity(lanes, {});
  assert.equal(cap.queued.length, 0, "a dead claim is not queued work");
  assert.deepEqual(cap.stale_claims.map((s) => s.name), ["Lifecycle Cert"]);
});

test("active and needs-input lanes stay first", () => {
  const needs = boundLane({ lane_id: "lane_n", label: "Trust Runtime", execution_run: { state: "NEEDS_INPUT", updated_at: "2026-08-22T13:00:00.000Z" } });
  const idle = boundLane({ lane_id: "lane_i", label: "Idle", claude: { presence: "absent" }, runtime: "offline", execution_run: null, updated_at: null });
  const order = sortLanesForIndex([idle, staleQueuedLane(), needs, boundLane()], { nowMs: NOW })
    .map((l) => l.label);
  assert.equal(order[0], "Vacilando");
  assert.equal(order[1], "Trust Runtime");
  assert.ok(order.indexOf("Lifecycle Cert") > 1);
});

// ------------------------------------------------------ iPhone usability --

test("keyboard-open composer and safe areas survive the new panel", () => {
  assert.match(gwSrc, /visualViewport/);
  assert.match(gwSrc, /--gw-vvh/);
  const mobile = css.slice(css.indexOf("@media (max-width:860px)"), css.lastIndexOf("@media (min-width:861px)"));
  assert.match(mobile, /\.gw\.is-detail \.gw-composer\{[\s\S]*?padding-bottom:max\(10px, env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(mobile, /\.gw-composer textarea\{[^}]*font-size:16px/);
  // The slide-over must not sit under the notch or the home indicator.
  assert.match(mobile, /\.gw-lane-aside,\.gw-lane-chrome\{[\s\S]*?env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(mobile, /\.gw-chat-head\{padding:max\(2px, env\(safe-area-inset-top, 0px\)\)/);

  // Measured on an iPhone 14 Pro with the keyboard up: topbar + header + status
  // + composer left 61px of thread, so the reply the operator was writing about
  // was not on screen. Non-essential chrome stands down instead.
  assert.match(gwSrc, /const keyboardOpen = Boolean\(vv\) && h < window\.innerHeight \* 0\.75/);
  assert.match(gwSrc, /data-gw-keyboard/);
  assert.match(mobile, /:root\[data-gw-keyboard\] \.topbar\{display:none/);
  assert.match(mobile, /:root\[data-gw-keyboard\] \.gw-stage-status\{display:none/);
  assert.match(mobile, /:root\[data-gw-keyboard\] \.gw-msg-assistant\{min-height:max\(7rem/);
});

test("the thread pins to the newest message and honours a deliberate scroll-up", () => {
  // The thread is the scroller now that the reply has a real height. It was
  // never scrolled, so a repaint left the newest reply below the fold with the
  // composer on top of it.
  assert.match(gwSrc, /function threadScrollState/);
  assert.match(gwSrc, /function restoreThreadScroll/);
  assert.match(gwSrc, /THREAD_BOTTOM_SLACK_PX/);
  // Reading back is respected; everything else pins to the bottom.
  const fn = gwSrc.slice(gwSrc.indexOf("function restoreThreadScroll"), gwSrc.indexOf("function restoreComposer"));
  assert.match(fn, /saved\.atBottom === false/);
  assert.match(fn, /el\.scrollTop = el\.scrollHeight/);
  // The keyboard shrinks the viewport without a repaint, so the pin is re-applied
  // once layout has settled rather than inside the same frame.
  const sync = gwSrc.slice(gwSrc.indexOf("function syncGatewayViewport"));
  assert.match(sync, /const before = threadScrollState\(\)/);
  assert.match(sync, /requestAnimationFrame/);
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);

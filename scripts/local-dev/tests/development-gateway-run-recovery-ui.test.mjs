#!/usr/bin/env node
/**
 * Gateway surface for Execution Run durability.
 *
 *  - the agent is named by its PROVIDER, not hardcoded to Claude
 *  - the output panel is named for what it shows, not for who produced it
 *  - ABANDONED is presented as recoverable, distinctly from FAILED/COMPLETE
 *  - the lane's assigned localhost is listed on the right rail
 */
import assert from "node:assert/strict";

import {
  abandonedRecoveryNotice,
  claudeRunStatus,
  laneAgentLabel,
  laneAppUrl,
  lanePort,
  outputPanelHeading,
  outputReviewHint,
  renderLaneLocalhost,
  renderPreviousWork,
} from "../apps/vacilando/public/gateway-view.mjs";

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

const cursorLane = {
  lane_id: "lane_cursor0000001",
  slot: 1,
  binding: { provider: "cursor", worktree_path: "/tmp/wt1" },
  agent_session: { state: "ACTIVE", provider: "cursor" },
};
const claudeLane = {
  lane_id: "lane_claude0000001",
  slot: 3,
  binding: { provider: "claude", worktree_path: "/tmp/wt3" },
  claude: { presence: "present" },
  runtime: "online",
};

test("a Cursor lane is never described as Claude", () => {
  assert.equal(laneAgentLabel(cursorLane), "Cursor");
  const st = claudeRunStatus(cursorLane);
  assert.equal(st.provider, "cursor");
  assert.equal(st.running, true);
  assert.equal(st.label, "Cursor is running");
  assert.equal(st.label.includes("Claude"), false);
});

test("a Claude lane keeps its name, running or not", () => {
  assert.equal(claudeRunStatus(claudeLane).label, "Claude is running");
  const offline = { ...claudeLane, claude: { presence: "absent" }, runtime: "offline", agent_session: null };
  assert.equal(claudeRunStatus(offline).running, false);
  assert.equal(claudeRunStatus(offline).label, "Claude is not running");
});

test("an unknown provider is named neutrally, never guessed as Claude", () => {
  assert.equal(laneAgentLabel({ lane_id: "lane_x", binding: {} }), "Agent");
});

test("output panel is named for what it shows", () => {
  assert.equal(outputPanelHeading({ execution_run: { state: "EXECUTING" } }), "Recent output");
  assert.equal(outputPanelHeading({ execution_run: { state: "VALIDATING" } }), "Recent output");
  assert.equal(outputPanelHeading({ execution_run: null, previous_run: { state: "COMPLETE" } }), "Completed output");
  assert.equal(outputPanelHeading(null), "Recent output");

  const hint = outputReviewHint(
    { ok: true, mode: "recent", truncated: false, viewport_only: false, history_size: 0, line_count: 10 },
    { lane: { execution_run: null, previous_run: { state: "COMPLETE" } } },
  );
  assert.equal(hint.heading, "Completed output");
  // No provider name anywhere in the panel chrome.
  assert.equal(JSON.stringify(hint).includes("Claude"), false);
});

test("ABANDONED with a matching lane is offered recovery, not a new run", () => {
  const run = {
    run_id: "erun_abc",
    state: "ABANDONED",
    state_reason: "orphaned_pre_protocol_run",
    recoverable: true,
  };
  const notice = abandonedRecoveryNotice(run);
  assert.equal(notice.recoverable, true);
  assert.match(notice.label, /recoverable|still match/i);
  assert.equal(notice.action, "Continue this run");

  const html = renderPreviousWork(run);
  assert.match(html, /data-recoverable="1"/);
  assert.match(html, /data-gw-run-recover/);
  assert.match(html, /data-run-id="erun_abc"/);
  assert.match(html, /Continue this run/);
});

test("ABANDONED that cannot be recovered says why, and offers no action", () => {
  const run = {
    run_id: "erun_def",
    state: "ABANDONED",
    recoverable: false,
    recovery_blocked_reason: "lane_has_active_run",
  };
  const notice = abandonedRecoveryNotice(run);
  assert.equal(notice.recoverable, false);
  assert.equal(notice.action, null);
  assert.match(notice.detail, /Newer work is already running/);
  const html = renderPreviousWork(run);
  assert.match(html, /data-recoverable="0"/);
  assert.equal(html.includes("data-gw-run-recover"), false);
});

test("ABANDONED is distinct from FAILED and COMPLETE", () => {
  assert.equal(abandonedRecoveryNotice({ state: "FAILED" }), null);
  assert.equal(abandonedRecoveryNotice({ state: "COMPLETE" }), null);
  const failed = renderPreviousWork({ run_id: "e1", state: "FAILED" });
  assert.equal(failed.includes("data-gw-run-recover"), false);
  assert.equal(failed.includes("data-recoverable"), false);
  assert.match(failed, /data-run-state="FAILED"/);
});

test("the QA link is the SERVER's url, never one the client derived", () => {
  // This test used to assert `http://localhost:3011`. That was the defect: the
  // Director drives Vacilando from a MacBook while the apps run on the Mac mini,
  // so a client-derived localhost URL named the MacBook and the lane looked dead.
  // The client now renders what the server sends and derives nothing.
  assert.equal(lanePort(cursorLane), 3011);
  assert.equal(laneAppUrl(cursorLane), null, "no app_url from the server means no link");
  const routed = { ...cursorLane, name: "Trust Runtime", app_url: "https://mini.ts.net:3014" };
  assert.equal(laneAppUrl(routed), "https://mini.ts.net:3014");
  const html = renderLaneLocalhost(routed);
  assert.match(html, /data-gw-qalink/);
  assert.match(html, /https:\/\/mini\.ts\.net:3014/);
  assert.match(html, /QA Trust Runtime/, "the link names the lane");
  assert.ok(!/localhost/.test(html), "no localhost may reach a remote Director");
});

test("a lane with no route SAYS SO rather than rendering nothing", () => {
  // Returning "" made a running server with no route look identical to a lane
  // with nothing at all, and the operator debugged the wrong problem.
  const noRoute = { lane_id: "lane_y", name: "Financials", app_url: null,
    app_url_reason: "no_serve_mapping_for_port" };
  const html = renderLaneLocalhost(noRoute);
  assert.match(html, /No QA route/);
  assert.match(html, /data-gw-no-route/);
  assert.match(html, /server not running/, "the reason is stated in plain words");
  // Nothing known at all still renders nothing.
  assert.equal(renderLaneLocalhost({ lane_id: "lane_z" }), "");
  assert.equal(lanePort({ lane_id: "lane_y" }), null);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

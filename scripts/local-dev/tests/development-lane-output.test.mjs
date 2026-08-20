#!/usr/bin/env node
/**
 * Gateway V2 Slice 2 — bounded Development Lane pane observation.
 *
 * Fixtures only. Does not attach, send-keys, or talk to alloy-identity.
 */
import assert from "node:assert/strict";

import { validateInput, getCommand } from "../lib/vacilando/commands/registry.mjs";
import {
  LANE_OUTPUT_DEFAULT_LINES,
  LANE_OUTPUT_EXTENDED_LINES,
  LANE_OUTPUT_HISTORY_LINES,
  LANE_OUTPUT_MAX_LINES,
  LANE_OUTPUT_RECENT_LINES,
  boundVisibleText,
  capturePaneArgv,
  clampOutputLines,
  getLaneOutput,
  normalizeOutputMode,
  parsePaneFacts,
  resolvedTmuxTarget,
} from "../lib/vacilando/lanes.mjs";

const IDENTITY_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";
const WT_ROOT = "/Users/Kelly/Code/alloy-worktrees";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function paneLine({
  session = "alloy-identity",
  window = "0",
  pane = "0",
  paneId = "%1",
  pid = "7093",
  dead = "0",
  attached = "0",
  command = "2.1.220",
  cwd = IDENTITY_WT,
  title = "_ Access Identity V2",
} = {}) {
  return [session, window, pane, paneId, pid, dead, attached, "1786985224", command, cwd, title].join("|");
}

function identityFacts() {
  return { git: "clean", ahead_behind: "45/0", branch: "agent/claude/1-access-identity-v2" };
}

function laneOpts({ stdout, capturePane, extra = {} } = {}) {
  const captured = [];
  return {
    listPanes: async () => ({ ok: true, stdout: stdout ?? paneLine() + "\n" }),
    gitFacts: async () => identityFacts(),
    metadata: [],
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
    nowMs: 1_700_000_000_000,
    capturePane: capturePane || (async (target) => {
      captured.push(target);
      return { ok: true, stdout: "Visible Claude output\nnext line\n" };
    }),
    captured,
    ...extra,
  };
}

await test("valid discovered lane returns bounded pane output", async () => {
  const opts = laneOpts();
  const out = await getLaneOutput("alloy-identity", opts);
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.lane_id, "alloy-identity");
  assert.equal(out.empty, false);
  assert.match(out.text, /Visible Claude output/);
  assert.equal(out.captured_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(out.text.includes("\0"), false);
  assert.equal(typeof out.fingerprint, "string");
  assert.equal(out.fingerprint.length, 16);
});

await test("lane_id resolves server-side to its pane target", async () => {
  const opts = laneOpts();
  const out = await getLaneOutput("alloy-identity", opts);
  assert.equal(out.ok, true);
  assert.deepEqual(opts.captured, ["%1"]);
  const target = resolvedTmuxTarget({
    tmux: { pane_id: "%1", session: "alloy-identity", window: "0", pane: "0" },
  });
  assert.equal(target.ok, true);
  assert.equal(target.target, "%1");
});

await test("browser cannot specify or override tmux target", async () => {
  const capturePane = async () => {
    throw new Error("capture must not run when client supplies a tmux target");
  };
  const refused = await getLaneOutput("alloy-identity", laneOpts({
    capturePane,
    extra: { target: "%8", session: "alloy-test", pane: "0", pane_id: "%8" },
  }));
  assert.equal(refused.ok, false);
  assert.equal(refused.available, false);
  assert.equal(refused.error, "tmux_target_not_allowed");
  assert.equal(refused.text, null);

  const cmd = getCommand("lane.output");
  const validated = validateInput(cmd.input, {
    lane_id: "alloy-identity",
    target: "%8",
    session: "alloy-test",
    pane_id: "%8",
  });
  assert.equal(validated.ok, false);
  assert.ok(validated.errors.some((e) => /unexpected field/.test(e)));
});

await test("unknown lane fails safely without capture", async () => {
  let captured = false;
  const missing = await getLaneOutput("alloy-missing", laneOpts({
    capturePane: async () => {
      captured = true;
      return { ok: true, stdout: "invented" };
    },
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.available, false);
  assert.equal(missing.error, "lane_not_found");
  assert.equal(missing.text, null);
  assert.equal(captured, false);

  const invalid = await getLaneOutput("not a lane; rm", laneOpts());
  assert.equal(invalid.error, "invalid_lane_id");
  assert.equal(invalid.text, null);
});

await test("non-development pane alloy-test is not readable through the lane API", async () => {
  const stdout = [
    paneLine(),
    paneLine({
      session: "alloy-test",
      paneId: "%8",
      pid: "1",
      command: "zsh",
      cwd: "/Users/Kelly/Alloy",
      title: "shell",
    }),
  ].join("\n");
  let capturedTarget = null;
  const out = await getLaneOutput("alloy-test", laneOpts({
    stdout,
    capturePane: async (target) => {
      capturedTarget = target;
      return { ok: true, stdout: "should never leak" };
    },
  }));
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.error, "lane_not_found");
  assert.equal(out.text, null);
  assert.equal(capturedTarget, null);
});

await test("dead pane produces unavailable state, not invented output", async () => {
  const stdout = paneLine({ dead: "1", pid: "", paneId: "%1" }) + "\n";
  let captured = false;
  const out = await getLaneOutput("alloy-identity", laneOpts({
    stdout,
    capturePane: async () => {
      captured = true;
      return { ok: true, stdout: "stale invented output" };
    },
  }));
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.error, "pane_unavailable");
  assert.equal(out.text, null);
  assert.equal(captured, false);

  const failedCapture = await getLaneOutput("alloy-identity", laneOpts({
    capturePane: async () => ({ ok: false, stdout: "", error: "can't find pane %1" }),
  }));
  assert.equal(failedCapture.error, "pane_unavailable");
  assert.equal(failedCapture.text, null);
});

await test("output bounding is enforced server-side", () => {
  assert.equal(clampOutputLines(undefined), LANE_OUTPUT_DEFAULT_LINES);
  assert.equal(clampOutputLines(10_000), LANE_OUTPUT_MAX_LINES);
  assert.equal(clampOutputLines(-4), LANE_OUTPUT_DEFAULT_LINES);
  const many = Array.from({ length: LANE_OUTPUT_MAX_LINES + 80 }, (_, i) => `line-${i}`).join("\n");
  const bounded = boundVisibleText(many, { maxLines: 10_000 });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.line_count, LANE_OUTPUT_MAX_LINES);
  assert.equal(bounded.text.startsWith("line-0"), false);
  assert.match(bounded.text, new RegExp(`line-${LANE_OUTPUT_MAX_LINES + 79}$`));
});

await test("reading output never attaches or mutates tmux", async () => {
  const argv = capturePaneArgv("%1");
  assert.deepEqual(argv, ["capture-pane", "-p", "-J", "-S", `-${LANE_OUTPUT_HISTORY_LINES}`, "-t", "%1"]);
  assert.equal(argv.includes("attach"), false);
  assert.equal(argv.includes("attach-session"), false);
  assert.equal(argv.includes("send-keys"), false);
  assert.equal(argv.includes("load-buffer"), false);
  assert.equal(argv.includes("paste-buffer"), false);
  assert.equal(argv.includes("-S"), true);

  const opts = laneOpts();
  await getLaneOutput("alloy-identity", opts);
  assert.deepEqual(opts.captured, ["%1"]);
});

await test("empty visible pane is available empty, not an error", async () => {
  const out = await getLaneOutput("alloy-identity", laneOpts({
    capturePane: async () => ({ ok: true, stdout: "\n" }),
  }));
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.empty, true);
  assert.equal(out.text, "");
});

await test("recent output is the default poll mode and stays bounded", async () => {
  assert.equal(normalizeOutputMode(), "recent");
  assert.equal(normalizeOutputMode("EXTENDED"), "extended");
  assert.equal(normalizeOutputMode("latest"), "latest_response");
  assert.equal(LANE_OUTPUT_RECENT_LINES, 120);
  assert.equal(clampOutputLines(10_000, { max: LANE_OUTPUT_RECENT_LINES, fallback: LANE_OUTPUT_RECENT_LINES }), LANE_OUTPUT_RECENT_LINES);
  const many = Array.from({ length: 400 }, (_, i) => `line-${i}`).join("\n");
  let historyLines = null;
  const out = await getLaneOutput("alloy-identity", laneOpts({
    capturePane: async (target, opts = {}) => {
      historyLines = opts.historyLines;
      return { ok: true, stdout: many };
    },
    extra: { paneFacts: { alternate_screen: true, history_size: 0, history_limit: 2000, pane_height: 24 } },
  }));
  assert.equal(out.mode, "recent");
  assert.equal(out.truncated, true);
  assert.equal(out.line_count, LANE_OUTPUT_RECENT_LINES);
  assert.equal(out.viewport_only, true);
  assert.equal(historyLines, LANE_OUTPUT_RECENT_LINES);
});

await test("extended capture is larger but still bounded", async () => {
  const many = Array.from({ length: LANE_OUTPUT_EXTENDED_LINES + 40 }, (_, i) => `x-${i}`).join("\n");
  const out = await getLaneOutput("alloy-identity", laneOpts({
    extra: { mode: "extended", paneFacts: { alternate_screen: false, history_size: 9000, history_limit: 20000, pane_height: 24 } },
    capturePane: async (_t, opts = {}) => {
      assert.equal(opts.historyLines, LANE_OUTPUT_EXTENDED_LINES);
      return { ok: true, stdout: many };
    },
  }));
  assert.equal(out.mode, "extended");
  assert.equal(out.truncated, true);
  assert.equal(out.returned_lines, LANE_OUTPUT_EXTENDED_LINES);
  assert.equal(out.available_history_lines, 9000);
  assert.deepEqual(capturePaneArgv("%1", LANE_OUTPUT_EXTENDED_LINES), [
    "capture-pane", "-p", "-J", "-S", `-${LANE_OUTPUT_EXTENDED_LINES}`, "-t", "%1",
  ]);
});

await test("latest Claude response is presentation-only and fails soft", async () => {
  let captured = false;
  const latest = await getLaneOutput("alloy-identity", laneOpts({
    capturePane: async () => {
      captured = true;
      return { ok: true, stdout: "pane" };
    },
    extra: {
      mode: "latest_response",
      collectLatestResponse: () => ({
        available: true,
        text: "# Grant repair — full assistant reply\nNot truncated.",
        truncated: false,
        timestamp: "2026-08-19T02:48:13.733Z",
        session_id: "6186a022-0b0d-40f9-ac45-fa6fde67f044",
      }),
    },
  }));
  assert.equal(captured, false);
  assert.equal(latest.ok, true);
  assert.equal(latest.mode, "latest_response");
  assert.equal(latest.source, "claude_code_session_transcript");
  assert.match(latest.text, /Grant repair/);
  assert.equal(latest.truncated, false);

  const missing = await getLaneOutput("alloy-identity", laneOpts({
    extra: {
      mode: "latest_response",
      collectLatestResponse: () => ({ available: false, error: "transcript_missing", text: null }),
    },
  }));
  assert.equal(missing.ok, true);
  assert.equal(missing.available, false);
  assert.equal(missing.text, null);
  assert.equal(missing.error, "transcript_missing");
});

await test("pane facts parse alternate-screen empty history", () => {
  const facts = parsePaneFacts("1|0|2000|24\n");
  assert.equal(facts.alternate_screen, true);
  assert.equal(facts.history_size, 0);
  assert.equal(facts.pane_height, 24);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

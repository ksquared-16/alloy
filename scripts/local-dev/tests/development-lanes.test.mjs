#!/usr/bin/env node
/**
 * Gateway V2 Slice 1 — Development Lane discovery.
 *
 * Proves alloy-identity is discoverable from tmux + Git facts even when slot 1
 * registry names a different worktree. No tmux attach, no Claude spawn.
 */
import assert from "node:assert/strict";

import {
  composeLane,
  displayLabelForLane,
  getDevelopmentLane,
  inferClaudePresence,
  isAllowlistedSession,
  listDevelopmentLanes,
  parseTmuxPaneLines,
  selectPrimaryPane,
} from "../lib/vacilando/lanes.mjs";

const IDENTITY_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";
const OPS_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-operations-ux-convergence";
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

function identityLine() {
  return [
    "alloy-identity", "0", "0", "%1", "7093", "0", "0", "1786985224",
    "2.1.220", IDENTITY_WT, "_ Access Identity V2",
  ].join("|");
}

const OPS_SLOT_META = [
  { worktree: "wt1-operations-ux-convergence", slot: "1", path: OPS_WT },
  { worktree: "wt5-vacilando-gateway-v2", slot: "5", path: `${WT_ROOT}/wt5-vacilando-gateway-v2` },
];

function identityFacts() {
  return { git: "clean", ahead_behind: "45/0", branch: "agent/claude/1-access-identity-v2" };
}

await test("tmux session allowlist rejects arbitrary names", () => {
  assert.equal(isAllowlistedSession("alloy-identity"), true);
  assert.equal(isAllowlistedSession("alloy-test"), true);
  assert.equal(isAllowlistedSession("evil; rm -rf"), false);
  assert.equal(isAllowlistedSession("alloy-identity;new"), false);
});

await test("parseTmuxPaneLines maps live-shaped fields", () => {
  const panes = parseTmuxPaneLines(identityLine() + "\n");
  assert.equal(panes.length, 1);
  assert.equal(panes[0].session, "alloy-identity");
  assert.equal(panes[0].cwd, IDENTITY_WT);
  assert.equal(panes[0].title, "_ Access Identity V2");
  assert.equal(panes[0].dead, false);
  assert.equal(panes[0].attached, false);
  assert.equal(inferClaudePresence(panes[0]), "present");
});

await test("display label strips tmux title noise", () => {
  const label = displayLabelForLane({
    pane: { title: "_ Access Identity V2" },
    worktreeName: "wt1-access-identity-v2",
    session: "alloy-identity",
  });
  assert.equal(label, "Access Identity V2");
  assert.equal(displayLabelForLane({
    pane: { title: "✳ Access Identity V2" },
    worktreeName: "wt1-access-identity-v2",
    session: "alloy-identity",
  }), "Access Identity V2");
});

await test("selectPrimaryPane prefers a Claude command pane", () => {
  const panes = [
    { command: "zsh", title: "shell" },
    { command: "claude", title: "Access Identity V2" },
  ];
  assert.equal(selectPrimaryPane(panes).command, "claude");
});

await test("composeLane does not inherit slot 1 from a different occupant", () => {
  const pane = parseTmuxPaneLines(identityLine())[0];
  const lane = composeLane({
    pane,
    gitFacts: identityFacts(),
    slot: null,
    worktreeRoot: WT_ROOT,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(lane.lane_id, "alloy-identity");
  assert.equal(lane.label, "Access Identity V2");
  assert.equal(lane.tmux.session, "alloy-identity");
  assert.equal(lane.worktree.name, "wt1-access-identity-v2");
  assert.equal(lane.worktree.path, IDENTITY_WT);
  assert.equal(lane.git.branch, "agent/claude/1-access-identity-v2");
  assert.equal(lane.git.state, "clean");
  assert.equal(lane.git.ahead, 45);
  assert.equal(lane.git.behind, 0);
  assert.equal(lane.slot, null);
  assert.equal(lane.claude.presence, "present");
});

await test("alloy-identity is discovered even when slot 1 is a different worktree", async () => {
  const listed = await listDevelopmentLanes({
    listPanes: async () => ({ ok: true, stdout: identityLine() + "\n" }),
    gitFacts: async (path) => {
      assert.equal(path, IDENTITY_WT);
      return identityFacts();
    },
    metadata: OPS_SLOT_META,
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT, base_ref: "origin/staging" },
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.lanes.length, 1);
  const lane = listed.lanes[0];
  assert.equal(lane.lane_id, "alloy-identity");
  assert.equal(lane.tmux.session, "alloy-identity");
  assert.equal(lane.worktree.name, "wt1-access-identity-v2");
  assert.equal(lane.git.branch, "agent/claude/1-access-identity-v2");
  assert.notEqual(lane.worktree.name, "wt1-operations-ux-convergence");
  assert.equal(lane.slot, null);
});

await test("getDevelopmentLane refuses invalid ids and unknown sessions", async () => {
  const opts = {
    listPanes: async () => ({ ok: true, stdout: identityLine() + "\n" }),
    gitFacts: async () => identityFacts(),
    metadata: OPS_SLOT_META,
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
  };
  const bad = await getDevelopmentLane("not a lane; rm", opts);
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "invalid_lane_id");
  const missing = await getDevelopmentLane("alloy-missing", opts);
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "lane_not_found");
  const found = await getDevelopmentLane("alloy-identity", opts);
  assert.equal(found.ok, true);
  assert.equal(found.lane.tmux.session, "alloy-identity");
  assert.equal(found.lane.slot, null);
});

await test("a lane returned by list resolves by exact lane_id in detail", async () => {
  const opts = {
    listPanes: async () => ({ ok: true, stdout: identityLine() + "\n" }),
    gitFacts: async () => identityFacts(),
    metadata: OPS_SLOT_META,
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
  };
  const listed = await listDevelopmentLanes(opts);
  assert.equal(listed.ok, true);
  const row = listed.lanes.find((l) => l.lane_id === "alloy-identity");
  assert.equal(Boolean(row), true);
  assert.equal(row.slot, null);
  const scoped = await listDevelopmentLanes({ ...opts, laneId: row.lane_id });
  assert.equal(scoped.lanes.length, 1);
  assert.equal(scoped.lanes[0].lane_id, row.lane_id);
  const got = await getDevelopmentLane(row.lane_id, opts);
  assert.equal(got.ok, true);
  assert.equal(got.lane.lane_id, row.lane_id);
  assert.equal(got.lane.tmux.session, row.tmux.session);
  assert.equal(got.lane.slot, row.slot);
  assert.equal(got.lane.worktree.path, row.worktree.path);
});

await test("non-allowlisted tmux sessions are ignored", async () => {
  const lines = [
    identityLine(),
    ["default", "0", "0", "%9", "1", "0", "1", "0", "zsh", "/tmp", "scratch"].join("|"),
    ["alloy-test", "0", "0", "%8", "1", "0", "0", "0", "zsh", "/Users/Kelly/Alloy", "shell"].join("|"),
  ].join("\n");
  const listed = await listDevelopmentLanes({
    listPanes: async () => ({ ok: true, stdout: lines }),
    gitFacts: async () => identityFacts(),
    metadata: [],
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
  });
  assert.equal(listed.lanes.length, 1);
  assert.equal(listed.lanes[0].lane_id, "alloy-identity");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

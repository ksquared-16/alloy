#!/usr/bin/env node
/**
 * A SPAWNED CURSOR IS NOT AN ATTACHED CURSOR.
 *
 * THE MEASURED FAILURE. `cursor-agent` is a bash launcher that execs node, so
 * `tmux respawn-pane -k -- cursor-agent` walks the pane through three states:
 *
 *   ~0-300ms    pane_current_command=bash, pane_title = the OUTGOING provider's
 *   ~400-1100ms pane_current_command=node, pane_title STILL the outgoing one
 *   ~1200ms+    pane_current_command=node, pane_title="Cursor Agent", prompt up
 *
 * Readiness returned at the first sight of `node` — about 800ms before the TUI
 * could accept anything — because the cursor branch tested process presence
 * alone while Claude's branch also required a prompt on screen. Callers took
 * that as an attached transport; the next `cursorExecutableTransport` read
 * landed inside the `bash` window, saw no Cursor, and the operator's send was
 * refused with `cursor_delivery_unavailable` while Cursor was booting normally.
 *
 * Worse, the pane selector never asked tmux for `#{pane_title}` at all — so the
 * ONE field that identifies a booted Cursor Agent was discarded before it could
 * be tested, and every start respawned the pane even when a healthy Cursor
 * Agent was already running in it.
 *
 * These tests replay that exact pane timeline.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cursor-readiness-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.HOME = ROOT;
process.env.ALLOY_CONFIG_FILE = join(ROOT, ".config", "alloy-dev", "config");

const WT = join(ROOT, "Code", "alloy-worktrees", "wt5-cursor-readiness");
mkdirSync(WT, { recursive: true });
mkdirSync(join(ROOT, ".config", "alloy-dev"), { recursive: true });
writeFileSync(join(ROOT, ".config", "alloy-dev", "config"), [
  `ALLOY_REPO="${ROOT}/Alloy"`,
  `ALLOY_WORKTREE_ROOT="${ROOT}/Code/alloy-worktrees"`,
  `ALLOY_RUNTIME_ROOT="${ROOT}"`,
  "",
].join("\n"));

const {
  setAlloyAdapterImplForTests,
  resetAlloyAdapterImplForTests,
  waitForAgentPrompt,
} = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { inferAgentPresence } = await import("../lib/vacilando/lanes.mjs");

/** The real boot timeline, as measured on the Mac mini. */
const BOOT_TIMELINE = [
  { command: "bash", title: "✳ Governed approval workflow", screen: "" },
  { command: "node", title: "✳ Governed approval workflow", screen: "" },
  { command: "node", title: "Cursor Agent", screen: "  Cursor Agent\n  → Plan, search, build anything\n" },
];

/**
 * A tmux stub that walks the timeline one observation at a time and records
 * every respawn, so a test can assert what was and was not launched.
 */
function tmuxStub({ timeline = BOOT_TIMELINE, stickAt = null } = {}) {
  const state = { step: 0, respawns: [], listPaneCalls: 0 };
  const frame = () => timeline[Math.min(stickAt ?? state.step, timeline.length - 1)];
  const runTmux = (args) => {
    const cmd = args[0];
    // One readiness iteration reads list-panes and then capture-pane, so both
    // must see the SAME frame; the clock advances once the frame is spent.
    if (cmd === "list-panes") {
      const f = frame();
      state.listPaneCalls += 1;
      return { ok: true, stdout: `%1|${WT}|${f.command}|4242|${f.title}\n`, stderr: "" };
    }
    if (cmd === "capture-pane") {
      const f = frame();
      if (stickAt == null) state.step += 1;
      return { ok: true, stdout: f.screen, stderr: "" };
    }
    if (cmd === "respawn-pane") { state.respawns.push(args); return { ok: true, stdout: "", stderr: "" }; }
    if (cmd === "has-session") return { ok: true, stdout: "", stderr: "" };
    return { ok: true, stdout: "", stderr: "" };
  };
  return { state, runTmux };
}

let pass = 0;
let fail = 0;

async function test(name, fn) {
  resetAlloyAdapterImplForTests();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  } finally {
    resetAlloyAdapterImplForTests();
  }
}

await test("the launcher's bash window is never mistaken for an attached Cursor", async () => {
  // This is the exact frame the failing send observed.
  const booting = { command: "bash", title: "✳ Governed approval workflow", dead: false };
  assert.notEqual(
    inferAgentPresence(booting, { provider: "cursor" }),
    "present",
    "a bash launcher under the outgoing provider's title is not a Cursor transport",
  );
});

await test("readiness waits for the Cursor prompt, not merely for cmd=node", async () => {
  const { state, runTmux } = tmuxStub();
  setAlloyAdapterImplForTests({ runTmux });
  const out = await waitForAgentPrompt("alloy-cursor-readiness", {
    provider: "cursor",
    timeoutMs: 4000,
    intervalMs: 10,
  });
  assert.equal(out.ok, true, out.error);
  // Frame 1 (`node` + stale title) must NOT have satisfied readiness: that is
  // the ~800ms early return that produced cursor_delivery_unavailable.
  assert.ok(
    state.listPaneCalls >= 3,
    `readiness returned after ${state.listPaneCalls} observation(s); it must wait for the prompt frame`,
  );
});

await test("a pane that never reaches the Cursor prompt times out instead of claiming ready", async () => {
  // Stuck forever at `node` with no prompt on screen — a launcher that died
  // after exec, or a TUI that never came up.
  const { runTmux } = tmuxStub({ stickAt: 1 });
  setAlloyAdapterImplForTests({ runTmux });
  const out = await waitForAgentPrompt("alloy-cursor-readiness", {
    provider: "cursor",
    timeoutMs: 120,
    intervalMs: 20,
  });
  assert.equal(out.ok, false, "a promptless pane must not report ready");
  assert.equal(out.error, "cursor_prompt_timeout");
});

await test("a booted Cursor Agent is recognised by its title, so it is not respawned", async () => {
  // node + "Cursor Agent" is what a HEALTHY Cursor pane looks like. Before the
  // pane selector read #{pane_title} this was unrecognisable, so every start
  // killed a working Cursor Agent and started another one.
  const booted = { command: "node", title: "Cursor Agent", dead: false };
  assert.equal(inferAgentPresence(booted, { provider: "cursor" }), "present");
  const { runTmux } = tmuxStub({ stickAt: 2 });
  setAlloyAdapterImplForTests({ runTmux });
  const out = await waitForAgentPrompt("alloy-cursor-readiness", {
    provider: "cursor",
    timeoutMs: 500,
    intervalMs: 20,
  });
  assert.equal(out.ok, true, "an already-booted Cursor Agent is immediately ready");
});

await test("Claude's readiness contract is unchanged", async () => {
  const claudeTimeline = [
    { command: "zsh", title: "", screen: "" },
    { command: "claude", title: "Claude", screen: "some boot text\n" },
    { command: "claude", title: "Claude", screen: "❯ \n" },
  ];
  const { state, runTmux } = tmuxStub({ timeline: claudeTimeline });
  setAlloyAdapterImplForTests({ runTmux });
  const out = await waitForAgentPrompt("alloy-cursor-readiness", {
    provider: "claude",
    timeoutMs: 4000,
    intervalMs: 10,
  });
  assert.equal(out.ok, true, out.error);
  assert.ok(state.listPaneCalls >= 3, "Claude still waits for its ❯ prompt");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

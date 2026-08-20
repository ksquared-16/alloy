#!/usr/bin/env node
/**
 * Gateway V2 Slice 3 — governed instruction delivery.
 *
 * Fixtures only. Does not attach, send-keys to alloy-identity, or spawn Claude.
 */
import assert from "node:assert/strict";

import { validateInput, getCommand } from "../lib/vacilando/commands/registry.mjs";
import {
  LANE_INSTRUCTION_MAX,
  deleteBufferArgv,
  loadBufferArgv,
  pasteBufferArgv,
  resetLaneSendStateForTests,
  sendLaneInstruction,
  submitEnterArgv,
  validateLaneInstruction,
  validateSendTarget,
} from "../lib/vacilando/lanes.mjs";

const IDENTITY_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";
const OTHER_WT = "/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2";
const WT_ROOT = "/Users/Kelly/Code/alloy-worktrees";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetLaneSendStateForTests();
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
  command = "2.1.220",
  cwd = IDENTITY_WT,
  title = "_ Access Identity V2",
} = {}) {
  return [session, window, pane, paneId, pid, dead, "0", "1786985224", command, cwd, title].join("|");
}

function otherLine() {
  return paneLine({
    session: "alloy-other",
    paneId: "%4",
    pid: "4242",
    cwd: OTHER_WT,
    title: "claude other",
    command: "claude",
  });
}

function identityFacts() {
  return { git: "clean", ahead_behind: "45/0", branch: "agent/claude/1-access-identity-v2" };
}

function recordingTmux() {
  const calls = [];
  const tmux = async (argv, opts = {}) => {
    calls.push({ argv: [...argv], input: opts.input ?? null });
    return { ok: true, stdout: "", stderr: "" };
  };
  return { tmux, calls };
}

function baseOpts({ stdout, tmux, extra = {} } = {}) {
  const rec = tmux ? { tmux, calls: null } : recordingTmux();
  const audits = [];
  return {
    listPanes: async () => ({ ok: true, stdout: stdout ?? paneLine() + "\n" }),
    gitFacts: async () => identityFacts(),
    metadata: [],
    worktreeRoot: WT_ROOT,
    cfg: { worktree_root: WT_ROOT },
    nowMs: 1_700_000_000_000,
    tmux: rec.tmux,
    calls: rec.calls,
    writeAudit: (ev) => {
      const recd = { id: `evt_test_${audits.length}`, ...ev };
      audits.push(recd);
      return recd;
    },
    audits,
    duplicateWindowMs: 0,
    ...extra,
  };
}

const HARD_TEXT = [
  "Test literal delivery only.",
  "",
  "Do not execute this as shell:",
  'echo "$HOME"; rm -rf /definitely-not-real',
  "",
  "JSON:",
  '{"action":"test","value":"`quoted`; $VARIABLE"}',
  "",
  "Line 4.",
].join("\n");

await test("valid lane + instruction resolves target server-side", async () => {
  const opts = baseOpts();
  const out = await sendLaneInstruction("alloy-identity", "hello from gateway", opts);
  assert.equal(out.ok, true);
  assert.equal(out.status, "delivered");
  assert.equal(out.lane_id, "alloy-identity");
  assert.equal(opts.calls[0].argv[0], "load-buffer");
  assert.equal(opts.calls[1].argv.includes("%1"), true);
  assert.equal(opts.calls[1].argv[0], "paste-buffer");
  assert.deepEqual(opts.calls[2].argv, submitEnterArgv("%1"));
});

await test("literal multiline instruction is passed as data, never argv", async () => {
  const opts = baseOpts();
  const out = await sendLaneInstruction("alloy-identity", HARD_TEXT, opts);
  assert.equal(out.ok, true);
  assert.equal(opts.calls[0].input, HARD_TEXT);
  const joined = opts.calls.map((c) => c.argv.join(" ")).join("\n");
  assert.equal(joined.includes(HARD_TEXT), false);
  assert.equal(joined.includes("$HOME"), false);
  assert.equal(joined.includes("rm -rf"), false);
});

await test("quotes/backticks/semicolons/code blocks are not shell-executed", async () => {
  const opts = baseOpts();
  await sendLaneInstruction("alloy-identity", HARD_TEXT, opts);
  for (const call of opts.calls) {
    assert.equal(call.argv.includes("-c"), false);
    assert.equal(call.argv.includes("sh"), false);
    assert.equal(call.argv.includes("bash"), false);
    assert.equal(call.argv[0] === "claude", false);
  }
  assert.equal(opts.calls[0].argv[0], "load-buffer");
  assert.equal(opts.calls[0].argv.includes("-"), true);
});

await test("browser cannot override session/pane/target", async () => {
  const opts = baseOpts({ extra: { target: "%8", session: "alloy-test", pane: "0", pane_id: "%8", keys: "C-c" } });
  const out = await sendLaneInstruction("alloy-identity", "hello", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "unexpected_control_field");
  assert.equal(opts.calls.length, 0);

  const cmd = getCommand("lane.send_instruction");
  const validated = validateInput(cmd.input, {
    lane_id: "alloy-identity",
    instruction: "hello",
    session: "alloy-test",
    pane_id: "%8",
    keys: "Enter",
  });
  assert.equal(validated.ok, false);
  assert.ok(validated.errors.some((e) => /unexpected field/.test(e)));
});

await test("unknown lane refuses before tmux mutation", async () => {
  const opts = baseOpts();
  const out = await sendLaneInstruction("alloy-missing", "hello", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "lane_not_found");
  assert.equal(opts.calls.length, 0);
});

await test("dead pane refuses", async () => {
  const opts = baseOpts({ stdout: paneLine({ dead: "1", pid: "" }) + "\n" });
  const out = await sendLaneInstruction("alloy-identity", "hello", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "pane_unavailable");
  assert.equal(opts.calls.length, 0);
});

await test("target identity mismatch refuses", async () => {
  const zshManaged = paneLine({ command: "zsh", title: "shell" }) + "\n";
  const opts = baseOpts({ stdout: zshManaged });
  const out = await sendLaneInstruction("alloy-identity", "hello", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "target_mismatch");
  assert.equal(opts.calls.length, 0);

  const mismatch = validateSendTarget({
    lane_id: "alloy-identity",
    worktree: { managed: true, path: IDENTITY_WT },
    tmux: { alive: true, cwd: "/tmp", command: "2.1.220", title: "Access Identity V2", pane_id: "%1" },
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "target_mismatch");
});

await test("oversized input refuses", async () => {
  const opts = baseOpts();
  const huge = "x".repeat(LANE_INSTRUCTION_MAX + 1);
  const out = await sendLaneInstruction("alloy-identity", huge, opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "instruction_too_large");
  assert.equal(opts.calls.length, 0);
  assert.equal(validateLaneInstruction(huge).ok, false);
});

await test("empty input refuses", async () => {
  const opts = baseOpts();
  const out = await sendLaneInstruction("alloy-identity", "   \n", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "instruction_empty");
  assert.equal(opts.calls.length, 0);
});

await test("only the expected fixed tmux mutation sequence is used", async () => {
  const opts = baseOpts();
  await sendLaneInstruction("alloy-identity", "hello", opts);
  assert.equal(opts.calls.length, 3);
  assert.deepEqual(opts.calls[0].argv, loadBufferArgv("vacilando-alloy-identity"));
  assert.deepEqual(opts.calls[1].argv, pasteBufferArgv("vacilando-alloy-identity", "%1"));
  assert.deepEqual(opts.calls[2].argv, submitEnterArgv("%1"));
  assert.deepEqual(deleteBufferArgv("vacilando-alloy-identity"), ["delete-buffer", "-b", "vacilando-alloy-identity"]);
});

await test("no attach, no claude -p, no director.ask, no arbitrary shell", async () => {
  const opts = baseOpts();
  await sendLaneInstruction("alloy-identity", "hello `code`; $HOME", opts);
  const tokens = opts.calls.flatMap((c) => c.argv);
  assert.equal(tokens.includes("attach"), false);
  assert.equal(tokens.includes("attach-session"), false);
  assert.equal(tokens.includes("claude"), false);
  assert.equal(tokens.includes("director.ask"), false);
  assert.equal(tokens.includes("/bin/sh"), false);
  assert.equal(opts.calls.some((c) => c.argv[0] === "send-keys" && c.argv.includes("hello `code`; $HOME")), false);
  assert.equal(opts.calls.filter((c) => c.argv[0] === "send-keys").length, 1);
  assert.deepEqual(opts.calls.find((c) => c.argv[0] === "send-keys").argv.slice(-1), ["Enter"]);
});

await test("concurrent sends to one lane cannot interleave", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  const tmux = async (argv, opts = {}) => {
    calls.push({ argv: [...argv], input: opts.input ?? null });
    if (argv[0] === "load-buffer") await gate;
    return { ok: true, stdout: "" };
  };
  const opts1 = baseOpts({ extra: { tmux } });
  const opts2 = baseOpts({ extra: { tmux } });
  const p1 = sendLaneInstruction("alloy-identity", "first", opts1);
  await Promise.resolve();
  const p2 = sendLaneInstruction("alloy-identity", "second", opts2);
  const second = await p2;
  assert.equal(second.ok, false);
  assert.equal(second.error, "send_in_progress");
  release();
  const first = await p1;
  assert.equal(first.ok, true);
  assert.equal(calls.filter((c) => c.argv[0] === "load-buffer").length, 1);
  assert.equal(calls[0].input, "first");
});

await test("another lane is independently lockable", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const identCalls = [];
  const otherCalls = [];
  const identTmux = async (argv, opts = {}) => {
    identCalls.push({ argv, input: opts.input ?? null });
    if (argv[0] === "load-buffer") await gate;
    return { ok: true, stdout: "" };
  };
  const otherTmux = async (argv, opts = {}) => {
    otherCalls.push({ argv, input: opts.input ?? null });
    return { ok: true, stdout: "" };
  };
  const stdout = [paneLine(), otherLine()].join("\n");
  const p1 = sendLaneInstruction("alloy-identity", "one", baseOpts({ stdout, extra: { tmux: identTmux } }));
  await Promise.resolve();
  const other = await sendLaneInstruction("alloy-other", "two", baseOpts({ stdout, extra: { tmux: otherTmux } }));
  assert.equal(other.ok, true);
  assert.equal(otherCalls[0].input, "two");
  release();
  const first = await p1;
  assert.equal(first.ok, true);
});

await test("audit result is produced without storing full instruction", async () => {
  const opts = baseOpts();
  const out = await sendLaneInstruction("alloy-identity", HARD_TEXT, opts);
  assert.equal(out.ok, true);
  assert.ok(out.audit_id);
  assert.equal(opts.audits.length, 1);
  assert.equal(opts.audits[0].command, "lane.send_instruction");
  assert.equal(opts.audits[0].outcome, "succeeded");
  assert.equal(opts.audits[0].input.lane_id, "alloy-identity");
  assert.equal(opts.audits[0].input.instruction_size, HARD_TEXT.length);
  assert.equal(opts.audits[0].input.instruction, undefined);
  const refused = await sendLaneInstruction("alloy-missing", "hello", baseOpts());
  assert.equal(refused.ok, false);
  assert.ok(refused.audit_id);
});

await test("same-payload retry is refused as duplicate_send", async () => {
  const opts = baseOpts({ extra: { duplicateWindowMs: 8000 } });
  const first = await sendLaneInstruction("alloy-identity", "same", opts);
  assert.equal(first.ok, true);
  const second = await sendLaneInstruction("alloy-identity", "same", opts);
  assert.equal(second.ok, false);
  assert.equal(second.error, "duplicate_send");
  assert.equal(opts.calls.length, 3);
});

await test("non-development alloy-test is not sendable", async () => {
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
  const opts = baseOpts({ stdout });
  const out = await sendLaneInstruction("alloy-test", "hello", opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, "lane_not_found");
  assert.equal(opts.calls.length, 0);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * Provider health: stale login and update-required, across Claude and Cursor.
 *
 * Detection is a bounded read of already-captured pane text. It must never
 * mistake ordinary output for a login prompt, never tell a Cursor lane to run
 * a Claude command, and never influence Execution Run state.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectProviderHealth,
  providerHealthFix,
  providerHealthKey,
  providerHealthPushPayload,
} from "../lib/vacilando/provider-health.mjs";
import { notifyProviderHealth } from "../lib/vacilando/lane-notify.mjs";
import { inferAgentPresence, inferClaudePresence } from "../lib/vacilando/lanes.mjs";
import { renderProviderHealth } from "../apps/vacilando/public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

await test("a stale Claude login is detected with the command that fixes it", async () => {
  const h = detectProviderHealth("Invalid API key · Please run /login to authenticate", { provider: "claude" });
  assert.equal(h.kind, "login_required");
  assert.equal(h.provider, "claude");
  assert.equal(h.fix_command, "/login");
  assert.match(h.title, /sign in again/i);
});

await test("a stale Cursor login is never told to run a Claude command", async () => {
  const h = detectProviderHealth("You are not logged in to Cursor. Run `cursor-agent login` to authenticate.", { provider: "cursor" });
  assert.equal(h.kind, "login_required");
  assert.equal(h.provider, "cursor");
  assert.equal(h.fix_command, "cursor-agent login");
  assert.equal(h.fix_command.includes("/login"), false);
});

await test("a Claude-only signature never fires on a Cursor lane", async () => {
  const claudePrompt = "Invalid API key · Please run /login to authenticate";
  assert.equal(detectProviderHealth(claudePrompt, { provider: "cursor" }), null);
  assert.ok(detectProviderHealth(claudePrompt, { provider: "claude" }));
});

await test("update-required is detected for both providers", async () => {
  const c = detectProviderHealth("Please update Claude Code to continue.", { provider: "claude" });
  assert.equal(c.kind, "update_required");
  assert.equal(c.fix_command, "claude update");
  const u = detectProviderHealth("Restart cursor-agent to apply the update.", { provider: "cursor" });
  assert.equal(u.kind, "update_required");
  assert.equal(u.fix_command, "cursor-agent upgrade");
});

await test("ordinary output is never mistaken for a login prompt", async () => {
  const noise = [
    "",
    "   ",
    "npm install completed in 4.2s",
    "The login route is defined in app/api/login/route.ts",
    "git commit -m 'fix: login redirect'",
    "// TODO: handle expired session tokens",
    "Running 42 tests... 42 passed",
  ];
  for (const text of noise) {
    assert.equal(detectProviderHealth(text, { provider: "claude" }), null, `false positive on: ${text}`);
    assert.equal(detectProviderHealth(text, { provider: "cursor" }), null, `false positive on: ${text}`);
  }
});

await test("only the tail is scanned, so a cleared prompt does not resurrect", async () => {
  const old = "Invalid API key · Please run /login to authenticate\n";
  const since = "x".repeat(8000);
  assert.equal(detectProviderHealth(old + since, { provider: "claude" }), null);
  // ...but a prompt showing NOW is caught.
  assert.ok(detectProviderHealth(since + "\n" + old, { provider: "claude" }));
});

await test("one condition notifies once per lane, not once per poll", async () => {
  const sent = [];
  const seen = new Set();
  const text = "Invalid API key · Please run /login to authenticate";
  const opts = { provider: "claude", sendPush: async (p) => { sent.push(p); }, seen };

  const first = await notifyProviderHealth("lane_abc", text, opts);
  assert.equal(first.notified, true);
  const second = await notifyProviderHealth("lane_abc", text, opts);
  assert.equal(second.notified, false);
  assert.equal(second.reason, "already_notified");
  assert.equal(sent.length, 1);

  assert.equal(sent[0].type, "provider_health.login_required");
  assert.match(sent[0].body, /\/login/);
  assert.equal(sent[0].path, "/#/lanes/lane_abc");

  // A different lane with the same condition is its own notification.
  await notifyProviderHealth("lane_def", text, opts);
  assert.equal(sent.length, 2);
});

await test("a healthy lane notifies nothing", async () => {
  const sent = [];
  const out = await notifyProviderHealth("lane_abc", "All tests passed.", {
    provider: "claude", sendPush: async (p) => sent.push(p), seen: new Set(),
  });
  assert.equal(out.notified, false);
  assert.equal(out.reason, "healthy");
  assert.equal(sent.length, 0);
});

await test("the banner states the fix as a runnable command", async () => {
  const h = detectProviderHealth("Invalid API key · Please run /login to authenticate", { provider: "claude" });
  const html = renderProviderHealth(h);
  assert.match(html, /data-gw-provider-health/);
  assert.match(html, /data-kind="login_required"/);
  assert.match(html, /data-provider="claude"/);
  assert.match(html, /gw-health-fix/);
  assert.match(html, /&#x2F;login|\/login/);
  assert.equal(renderProviderHealth(null), "");
});

await test("presence detection recognises Cursor, not only Claude", async () => {
  assert.equal(inferAgentPresence({ command: "cursor-agent" }, { provider: "cursor" }), "present");
  assert.equal(inferAgentPresence({ command: "1.2.3" }, { provider: "cursor" }), "present");
  assert.equal(inferAgentPresence({ command: "zsh", dead: true }, { provider: "cursor" }), "absent");
  // Claude behaviour is unchanged.
  assert.equal(inferAgentPresence({ command: "claude" }, {}), "present");
  assert.equal(inferClaudePresence({ command: "claude" }), "present");
  assert.equal(inferAgentPresence({ command: "zsh" }, {}), "unknown");
});

await test("provider health decides nothing about an Execution Run", async () => {
  // Structural guard: the run state machine and the stale classifier must never
  // import this module. A banner must not be able to terminalize work.
  for (const f of ["execution-run.mjs", "execution-stale.mjs"]) {
    const src = readFileSync(join(HERE, "../lib/vacilando", f), "utf8");
    assert.equal(src.includes("provider-health"), false, `${f} must not depend on provider health`);
    assert.equal(src.includes("detectProviderHealth"), false, `${f} must not call the detector`);
  }
});

await test("keys and payloads are stable and bounded", async () => {
  const h = detectProviderHealth("Please run /login to authenticate", { provider: "claude" });
  assert.equal(providerHealthKey("lane_1", h), "lane_1:login_required:claude");
  assert.equal(providerHealthKey("lane_1", null), null);
  assert.equal(providerHealthPushPayload("lane_1", null), null);
  assert.equal(providerHealthFix("usage_limit", "claude").command, null);
  assert.ok(h.signal.length <= 120);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

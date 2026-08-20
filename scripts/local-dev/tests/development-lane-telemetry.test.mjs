#!/usr/bin/env node
/**
 * Gateway V2 — Claude session telemetry (read-only adapter).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectClaudeSessionTelemetry,
  collectLatestClaudeResponse,
  contextUsedTokens,
  encodeClaudeProjectDir,
  inferContextWindow,
  resetClaudeTelemetryCacheForTests,
  usageFromRecord,
} from "../lib/vacilando/providers/claude/telemetry.mjs";
import {
  TELEMETRY_TTL_MS,
  getLaneAgentTelemetry,
  normalizeTelemetry,
  peekLaneTelemetryCache,
  resetLaneTelemetryCacheForTests,
  unavailableTelemetry,
} from "../lib/vacilando/lane-telemetry.mjs";
import { listDevelopmentLanes } from "../lib/vacilando/lanes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const lanesSrc = readFileSync(join(HERE, "../lib/vacilando/lanes.mjs"), "utf8");
const telSrc = readFileSync(join(HERE, "../lib/vacilando/providers/claude/telemetry.mjs"), "utf8");
const gwSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway.js"), "utf8");
const viewSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway-view.mjs"), "utf8");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetClaudeTelemetryCacheForTests();
  resetLaneTelemetryCacheForTests();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

const CWD = "/Users/test/wt1-access-identity-v2";
const SID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vac-tel-"));
  const configDir = join(root, ".claude");
  const proj = join(configDir, "projects", encodeClaudeProjectDir(CWD));
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(root, ".claude.json"), JSON.stringify({
    oauthAccount: {
      billingType: "stripe_subscription",
      organizationType: "claude_max",
      organizationRateLimitTier: "default_claude_max_20x",
      hasExtraUsageEnabled: true,
    },
  }));
  const jsonl = join(proj, `${SID}.jsonl`);
  const lines = [
    { type: "system", subtype: "init", sessionId: SID, timestamp: "2026-08-17T10:00:00.000Z" },
    { type: "assistant", timestamp: "2026-08-17T10:01:00.000Z", message: { id: "msg_1", role: "assistant", model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } },
    { type: "assistant", timestamp: "2026-08-17T10:02:00.000Z", message: { id: "msg_2", role: "assistant", model: "claude-opus-5", usage: { input_tokens: 2, output_tokens: 40, cache_read_input_tokens: 250000, cache_creation_input_tokens: 1000 } } },
  ];
  writeFileSync(jsonl, lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
  return { root, configDir, jsonl, cwd: CWD };
}

await test("supported telemetry source parsing", () => {
  const { configDir, cwd } = fixture();
  const out = collectClaudeSessionTelemetry({ cwd, configDir, nowMs: 1_700_000_000_000 });
  assert.equal(out.available, true);
  assert.equal(out.provider, "claude");
  assert.equal(out.agent.session_id, SID);
  assert.equal(out.agent.model, "claude-opus-5");
  assert.equal(out.usage.input_tokens, 12);
  assert.equal(out.usage.output_tokens, 60);
  assert.equal(out.usage.cache_read_tokens, 250100);
  assert.equal(out.usage.cache_write_tokens, 1050);
  assert.equal(out.context.used_tokens, 2 + 250000 + 1000);
  assert.equal(out.context.max_tokens, 1_000_000);
  assert.equal(out.context.percent_used, 25);
  assert.equal(out.cost.reported_usd, null);
  assert.equal(out.cost.estimated_usd, null);
  assert.equal(out.cost.billing_mode, "claude_max_subscription");
});

await test("missing telemetry fails soft", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-tel-miss-"));
  const configDir = join(root, ".claude");
  mkdirSync(join(configDir, "projects"), { recursive: true });
  const out = collectClaudeSessionTelemetry({ cwd: "/no/such/tree", configDir });
  assert.equal(out.ok, true);
  assert.equal(out.available, false);
  const norm = normalizeTelemetry(out, { lane_id: "alloy-identity" });
  assert.equal(norm.available, false);
  assert.equal(norm.context.used_tokens, null);
  assert.equal(norm.cost.reported_usd, null);
});

await test("malformed provider telemetry fails soft", () => {
  const { configDir, cwd, jsonl } = fixture();
  writeFileSync(jsonl, "not-json\n{broken\n" + JSON.stringify({ type: "assistant", message: { id: "m", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + "\n");
  const out = collectClaudeSessionTelemetry({ cwd, configDir });
  assert.equal(out.available, true);
  assert.equal(out.usage.input_tokens, 1);
});

await test("no TUI parsing as token/cost authority", () => {
  assert.equal(telSrc.includes("capture-pane"), false);
  assert.equal(telSrc.includes("❯"), false);
  assert.equal(telSrc.includes("⏺"), false);
  assert.match(telSrc, /claude_code_session_transcript/);
  assert.equal(usageFromRecord({ type: "assistant", message: { content: "❯ 12k tokens" } }), null);
});

await test("lane identity independent from agent session identity", async () => {
  const { configDir, cwd } = fixture();
  const lane = {
    lane_id: "alloy-identity",
    worktree: { path: cwd, managed: true },
    tmux: { cwd, alive: true },
  };
  const out = await getLaneAgentTelemetry(lane, {
    nowMs: Date.now(),
    collectClaude: () => collectClaudeSessionTelemetry({ cwd, configDir }),
  });
  assert.equal(out.lane_id, "alloy-identity");
  assert.equal(out.agent.session_id, SID);
  assert.notEqual(out.lane_id, out.agent.session_id);
});

await test("context current vs cumulative tokens remain distinct", () => {
  const last = usageFromRecord({
    type: "assistant",
    message: { id: "x", usage: { input_tokens: 2, output_tokens: 9, cache_read_input_tokens: 400000, cache_creation_input_tokens: 2000 } },
  });
  assert.equal(contextUsedTokens(last), 402002);
  const small = inferContextWindow(50_000);
  assert.equal(small.max_tokens, null);
  assert.equal(small.percent_used, null);
  const big = inferContextWindow(402002);
  assert.equal(big.max_tokens, 1_000_000);
  assert.equal(big.percent_used, 40);
});

await test("unknown cost does not become $0 and stays distinguishable", async () => {
  const { contextCompact, sessionCostLabel } = await import("../apps/vacilando/public/gateway-view.mjs");
  const tel = unavailableTelemetry({ lane_id: "alloy-identity" });
  assert.equal(tel.cost.reported_usd, null);
  assert.equal(tel.cost.estimated_usd, null);
  const label = sessionCostLabel({
    available: true,
    cost: { reported_usd: null, estimated_usd: null, billing_mode: "claude_max_subscription" },
  });
  assert.equal(/\$0/.test(label), false);
  assert.match(label, /Not reported/);
  assert.match(label, /Max subscription/);
  const reported = sessionCostLabel({ available: true, cost: { reported_usd: 8.42, estimated_usd: null } });
  assert.equal(reported, "$8.42");
  const estimated = sessionCostLabel({ available: true, cost: { reported_usd: null, estimated_usd: 8.42 } });
  assert.match(estimated, /estimated/);
  assert.equal(contextCompact(tel), null);
});

await test("telemetry TTL prevents expensive repeated collection", async () => {
  let calls = 0;
  const collectClaude = async () => {
    calls += 1;
    return { available: true, provider: "claude", agent: { session_id: SID }, context: {}, usage: {}, cost: {} };
  };
  const lane = { lane_id: "alloy-identity", worktree: { path: CWD } };
  const a = await getLaneAgentTelemetry(lane, { nowMs: 1000, ttlMs: TELEMETRY_TTL_MS, collectClaude });
  const b = await getLaneAgentTelemetry(lane, { nowMs: 2000, ttlMs: TELEMETRY_TTL_MS, collectClaude });
  assert.equal(calls, 1);
  assert.equal(a.agent.session_id, b.agent.session_id);
  const peeked = peekLaneTelemetryCache("alloy-identity", { nowMs: 2000, ttlMs: TELEMETRY_TTL_MS });
  assert.equal(peeked?.agent?.session_id, SID);
  assert.equal(peekLaneTelemetryCache("alloy-identity", { nowMs: 1000 + TELEMETRY_TTL_MS + 1, ttlMs: TELEMETRY_TTL_MS }), null);
  await getLaneAgentTelemetry(lane, { nowMs: 1000 + TELEMETRY_TTL_MS + 1, ttlMs: TELEMETRY_TTL_MS, collectClaude });
  assert.equal(calls, 2);
});

await test("no all-lane telemetry fan-out", () => {
  assert.equal(lanesSrc.includes("getLaneAgentTelemetry"), false);
  assert.equal(lanesSrc.includes("collectClaudeSessionTelemetry"), false);
  assert.match(lanesSrc, /collectLatestClaudeResponse/);
  assert.equal(typeof listDevelopmentLanes, "function");
  const outPoll = gwSrc.slice(gwSrc.indexOf("function startOutputPoll"), gwSrc.indexOf("function startListPoll"));
  assert.equal(outPoll.includes("fetchTelemetry"), false);
  assert.match(gwSrc, /fetchTelemetry\(hydrateId\)/);
  assert.equal(/Promise\.all\(\[[^\]]*fetchTelemetry/.test(gwSrc), false);
});

await test("latest assistant text prefers newest transcript and fails soft", () => {
  const { configDir, cwd, jsonl } = fixture();
  const empty = collectLatestClaudeResponse({ cwd, configDir });
  assert.equal(empty.available, false);
  assert.equal(empty.error, "no_assistant_text");
  writeFileSync(jsonl, JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-19T02:48:13.733Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "# Grant repair — release gate report" }],
    },
  }) + "\n", { flag: "a" });
  const hit = collectLatestClaudeResponse({ cwd, configDir });
  assert.equal(hit.available, true);
  assert.match(hit.text, /Grant repair/);
  const missing = collectLatestClaudeResponse({ cwd: "/no/such/worktree", configDir });
  assert.equal(missing.available, false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

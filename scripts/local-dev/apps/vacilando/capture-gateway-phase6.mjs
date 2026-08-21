#!/usr/bin/env node
/**
 * Phase 6 — fixture screenshots of session rotation overlay.
 * Does not send instructions or attach to live Claude.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  railHtml,
  renderGatewayShell,
} from "./public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const OUT = join(HERE, "qa/gateway-v2");
mkdirSync(OUT, { recursive: true });

const css = readFileSync(join(HERE, "public/styles.css"), "utf8");

const resources = {
  machine_exclusive: { active: false, phase: null, conflict_count: 0, quiet: true },
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
  ],
};

const tel = {
  available: true,
  provider: "claude",
  agent: { model: "claude-opus-5", session_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", started_at: new Date(Date.now() - 2 * 60 * 60 * 1000 - 14 * 60 * 1000).toISOString() },
  context: { used_tokens: 610000, max_tokens: 1000000, percent_used: 61 },
  usage: { input_tokens: 12000, output_tokens: 3400, cache_read_tokens: 180000, cache_write_tokens: 2200 },
  cost: { reported_usd: null, estimated_usd: null, billing_mode: "claude_max_subscription" },
};

const records = {
  lane_id: "alloy-records",
  label: "Records / Roster",
  slot: null,
  claude: { presence: "present" },
  tmux: { alive: true, session: "alloy-records", attached: false },
  git: { branch: "agent/claude/2-records", state: "dirty", ahead: 3, behind: 0 },
  worktree: { name: "wt2-records", path: "/x/wt2-records", managed: true },
  last_activity_ms: Date.now() - 90000,
  execution_run: {
    state: "EXECUTING",
    instruction: "Finish remaining Records/Roster certification",
    started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  agent_session: {
    state: "ACTIVE",
    provider: "claude",
    model: "claude-opus-5",
    lane_economics: { session_count: 2, lifetime_cost: { reported_usd: null, note: "Not reported · Claude Max subscription" } },
  },
  session_rotation: { need: "none", hint: null, policy: "automatic" },
};

const recordsRotating = {
  ...records,
  runtime_posture: { state: "SESSION_ROTATING", reason: "Refreshing Claude context" },
  execution_run: {
    ...records.execution_run,
    runtime_posture: { state: "SESSION_ROTATING", reason: "Refreshing Claude context" },
  },
  agent_session: { ...records.agent_session, state: "HANDOFF" },
  session_rotation: { need: "in_progress", hint: "Refreshing Claude context", policy: "automatic" },
};

const recordsRefreshed = {
  ...records,
  recent_system_activity: [
    { summary: "Claude context refreshed automatically." },
  ],
  agent_session: {
    ...records.agent_session,
    state: "ACTIVE",
    lane_economics: { session_count: 3, lifetime_cost: { reported_usd: null, note: "Not reported · Claude Max subscription" } },
  },
};

const rotatingLanes = [recordsRotating];
const refreshedLanes = [recordsRefreshed];

function page(html, title, lanes, selectedId) {
  const rail = railHtml(lanes, selectedId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head><body><div class="app"><aside class="rail"><div class="brand"><div class="word">Vacilando</div><div class="sub">Development Gateway</div></div><nav class="nav nav-missions"><div class="nav-missions-label">Development Lanes</div><div id="lane-rail" class="mission-rail">${rail}</div></nav></aside><main class="main"><div class="topbar"><div class="crumb">Development Lanes</div></div><div class="view">${html}</div></main></div></body></html>`;
}

const rotatingList = renderGatewayShell({
  lanes: rotatingLanes,
  selectedId: null,
  listReady: true,
  developmentResources: resources,
  telemetryByLane: { "alloy-records": tel },
});
const rotatingDetail = renderGatewayShell({
  lanes: rotatingLanes,
  selectedId: "alloy-records",
  lane: recordsRotating,
  outputText: "Vacilando session-rotation checkpoint.\nHANDOFF_READY.",
  listReady: true,
  statusOpen: true,
  developmentResources: resources,
  telemetry: tel,
  telemetryByLane: { "alloy-records": tel },
});
const refreshedDetail = renderGatewayShell({
  lanes: refreshedLanes,
  selectedId: "alloy-records",
  lane: recordsRefreshed,
  outputText: "ORIENTED\nlane = alloy-records\nrun unchanged\nnext_action = continue certification",
  listReady: true,
  statusOpen: true,
  developmentResources: resources,
  telemetry: tel,
  telemetryByLane: { "alloy-records": tel },
});

writeFileSync(join(OUT, "phase6-rotating-list.html"), page(rotatingList, "Phase 6 rotating list", rotatingLanes, null));
writeFileSync(join(OUT, "phase6-rotating.html"), page(rotatingDetail, "Phase 6 rotating", rotatingLanes, "alloy-records"));
writeFileSync(join(OUT, "phase6-refreshed.html"), page(refreshedDetail, "Phase 6 refreshed", refreshedLanes, "alloy-records"));
writeFileSync(join(OUT, "phase6-rotating.txt"), rotatingDetail);
writeFileSync(join(OUT, "phase6-refreshed.txt"), refreshedDetail);

const pwPath = join(ROOT, "web/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ headless: true });
try {
  for (const [file, shot] of [
    ["phase6-rotating-list.html", "phase6-desktop-rotating-list.png"],
    ["phase6-rotating.html", "phase6-desktop-rotating.png"],
    ["phase6-refreshed.html", "phase6-desktop-refreshed.png"],
  ]) {
    const pageRef = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pageRef.goto(`file://${join(OUT, file)}`, { waitUntil: "domcontentloaded" });
    await pageRef.screenshot({ path: join(OUT, shot), fullPage: true });
    await pageRef.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`file://${join(OUT, "phase6-rotating-list.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase6-mobile-rotating-list.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase6-rotating.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase6-mobile-rotating.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase6-refreshed.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase6-mobile-refreshed.png"), fullPage: true });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, out: OUT, live_rotation: false, alloy_identity_untouched: true }));

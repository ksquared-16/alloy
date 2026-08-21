#!/usr/bin/env node
/**
 * Phase 5 — fixture screenshots of recovering / recovered validating.
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

const recoveringResources = {
  machine_exclusive: { active: false, phase: null, conflict_count: 0, quiet: true },
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 0, holders: [], queue: [{ lane_id: "alloy-comms" }], health: "stale_owner", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
  ],
};

const recoveredResources = {
  machine_exclusive: { active: false, phase: null, conflict_count: 0, quiet: true },
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 1, holders: [{ lane_id: "alloy-comms" }], queue: [], health: "held", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
  ],
};

const records = {
  lane_id: "alloy-records",
  label: "Records / Roster",
  slot: null,
  claude: { presence: "present" },
  tmux: { alive: true, session: "alloy-records", attached: false },
  git: { branch: "agent/claude/2-records", state: "clean", ahead: 3, behind: 0 },
  worktree: { name: "wt2-records", path: "/x/wt2-records", managed: true },
  last_activity_ms: Date.now() - 120000,
  execution_run: {
    state: "COMPLETE",
    instruction: "Finish remaining Records/Roster certification",
    started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
};

const commsRecovering = {
  ...records,
  lane_id: "alloy-comms",
  label: "Communications",
  tmux: { alive: true, session: "alloy-comms", attached: false },
  git: { branch: "agent/claude/3-comms", state: "clean", ahead: 1, behind: 0 },
  worktree: { name: "wt3-comms", path: "/x/wt3-comms", managed: true },
  last_activity_ms: Date.now() - 40000,
  runtime_posture: { state: "RECOVERING", reason: "Browser certification ownership" },
  execution_run: {
    state: "VALIDATING",
    runtime_posture: { state: "RECOVERING", reason: "Browser certification ownership" },
    instruction: "Communications ingress certification",
    started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    resource_wait: { label: "Browser certification", request_state: "GRANTED" },
  },
  recent_system_activity: [
    { summary: "Recovered stale browser-cert ownership" },
    { summary: "Verified resource available" },
    { summary: "Resumed validation" },
  ],
};

const commsValidating = {
  ...commsRecovering,
  runtime_posture: undefined,
  execution_run: {
    state: "VALIDATING",
    instruction: "Communications ingress certification",
    started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    resource_wait: {
      label: "Browser certification",
      request_state: "GRANTED",
      resume_event: { summary: "Vacilando resumed this run automatically" },
    },
  },
  recent_system_activity: [
    { summary: "Recovered stale browser-cert ownership" },
    { summary: "Verified resource available" },
    { summary: "Resumed validation" },
  ],
};

const recoveringLanes = [records, commsRecovering];
const recoveredLanes = [records, commsValidating];

function page(html, title, lanes, selectedId) {
  const rail = railHtml(lanes, selectedId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head><body><div class="app"><aside class="rail"><div class="brand"><div class="word">Vacilando</div><div class="sub">Development Gateway</div></div><nav class="nav nav-missions"><div class="nav-missions-label">Development Lanes</div><div id="lane-rail" class="mission-rail">${rail}</div></nav></aside><main class="main"><div class="topbar"><div class="crumb">Development Lanes</div></div><div class="view">${html}</div></main></div></body></html>`;
}

const recoveringList = renderGatewayShell({
  lanes: recoveringLanes,
  selectedId: null,
  listReady: true,
  developmentResources: recoveringResources,
});
const recoveringDetail = renderGatewayShell({
  lanes: recoveringLanes,
  selectedId: "alloy-comms",
  lane: commsRecovering,
  outputText: "Validation continues.\nRecovering stale browser-cert ownership.",
  listReady: true,
  statusOpen: true,
  developmentResources: recoveringResources,
});
const recoveredDetail = renderGatewayShell({
  lanes: recoveredLanes,
  selectedId: "alloy-comms",
  lane: commsValidating,
  outputText: "Validation continues.\nResource available.",
  listReady: true,
  statusOpen: true,
  developmentResources: recoveredResources,
});

writeFileSync(join(OUT, "phase5-recovering-list.html"), page(recoveringList, "Phase 5 recovering list", recoveringLanes, null));
writeFileSync(join(OUT, "phase5-recovering.html"), page(recoveringDetail, "Phase 5 recovering", recoveringLanes, "alloy-comms"));
writeFileSync(join(OUT, "phase5-recovered.html"), page(recoveredDetail, "Phase 5 recovered", recoveredLanes, "alloy-comms"));
writeFileSync(join(OUT, "phase5-recovering.txt"), recoveringDetail);
writeFileSync(join(OUT, "phase5-recovered.txt"), recoveredDetail);

const pwPath = join(ROOT, "web/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ headless: true });
try {
  for (const [file, shot] of [
    ["phase5-recovering-list.html", "phase5-desktop-recovering-list.png"],
    ["phase5-recovering.html", "phase5-desktop-recovering.png"],
    ["phase5-recovered.html", "phase5-desktop-recovered.png"],
  ]) {
    const pageRef = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pageRef.goto(`file://${join(OUT, file)}`, { waitUntil: "domcontentloaded" });
    await pageRef.screenshot({ path: join(OUT, shot), fullPage: true });
    await pageRef.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`file://${join(OUT, "phase5-recovering-list.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase5-mobile-recovering-list.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase5-recovering.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase5-mobile-recovering.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase5-recovered.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase5-mobile-recovered.png"), fullPage: true });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, out: OUT, continuation_sent: false, sessions_destroyed: false }));

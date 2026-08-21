#!/usr/bin/env node
/**
 * Phase 4 — fixture screenshots of exclusive preparing / quiesced / exclusive active.
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

const drainingResources = {
  machine_exclusive: {
    phase: "DRAINING_CONFLICTS",
    owner_lane_id: "alloy-runtime",
    conflict_count: 1,
    blockers: [{ type: "browser_certification", reason: "Browser certification still held" }],
  },
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 1, holders: [{ lane_id: "alloy-records" }], queue: [{ lane_id: "alloy-comms" }], health: "held", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [{ lane_id: "alloy-runtime" }], health: "draining", capacity: 1, exclusive: { detail: "Waiting for 1 browser certification to finish" } },
  ],
};

const activeResources = {
  machine_exclusive: {
    phase: "EXCLUSIVE_ACTIVE",
    owner_lane_id: "alloy-runtime",
    conflict_count: 0,
    blockers: [],
  },
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 0, holders: [], queue: [{ lane_id: "alloy-comms" }], health: "available", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 1, holders: [{ lane_id: "alloy-runtime" }], queue: [], health: "held", capacity: 1 },
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
    state: "WAITING_RESOURCE",
    instruction: "Finish remaining Records/Roster certification",
    started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    resource_wait: { label: "Browser certification", request_state: "GRANTED", ready_to_resume: true },
  },
};
const comms = {
  ...records,
  lane_id: "alloy-comms",
  label: "Communications",
  tmux: { alive: true, session: "alloy-comms", attached: false },
  git: { branch: "agent/claude/3-comms", state: "clean", ahead: 1, behind: 0 },
  worktree: { name: "wt3-comms", path: "/x/wt3-comms", managed: true },
  runtime_posture: { state: "QUIESCED", reason: "Runtime Performance timing certification" },
  execution_run: {
    state: "WAITING_RESOURCE",
    runtime_posture: { state: "QUIESCED", reason: "Runtime Performance timing certification" },
    instruction: "Communications ingress certification",
    started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    resource_wait: { label: "Browser certification", request_state: "QUEUED", queue_position: 1, ready_to_resume: false },
  },
};
const runtimePreparing = {
  ...records,
  lane_id: "alloy-runtime",
  label: "Runtime Performance",
  tmux: { alive: true, session: "alloy-runtime", attached: false },
  git: { branch: "agent/claude/4-runtime", state: "clean", ahead: 0, behind: 0 },
  worktree: { name: "wt4-runtime", path: "/x/wt4-runtime", managed: true },
  runtime_posture: { state: "EXCLUSIVE_OWNER", reason: "Preparing exclusive timing window" },
  execution_run: {
    state: "WAITING_RESOURCE",
    runtime_posture: { state: "EXCLUSIVE_OWNER" },
    instruction: "Exclusive timing certification",
    started_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    resource_wait: {
      label: "Exclusive machine timing",
      request_state: "QUEUED",
      exclusive_phase: "DRAINING_CONFLICTS",
      exclusive_detail: "Waiting for 1 browser certification to finish",
      ready_to_resume: false,
    },
  },
};
const runtimeActive = {
  ...runtimePreparing,
  execution_run: {
    state: "VALIDATING",
    runtime_posture: { state: "EXCLUSIVE_OWNER" },
    instruction: "Exclusive timing certification",
    started_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    resource_wait: {
      label: "Exclusive machine timing",
      request_state: "GRANTED",
      resource_key: "runtime_timing_certification",
      exclusive_phase: "EXCLUSIVE_ACTIVE",
      exclusive_detail: "Exclusive timing window",
      continuation_state: "DELIVERED",
      resume_event: { summary: "The exclusive timing window requested for this run is now active." },
    },
  },
};

const preparingLanes = [records, comms, runtimePreparing];
const activeLanes = [
  { ...records, execution_run: { ...records.execution_run, state: "WAITING_RESOURCE", resource_wait: { label: "Browser certification", request_state: "QUEUED", queue_position: 1, ready_to_resume: false } } },
  comms,
  runtimeActive,
];

function page(html, title, lanes, selectedId) {
  const rail = railHtml(lanes, selectedId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head><body><div class="app"><aside class="rail"><div class="brand"><div class="word">Vacilando</div><div class="sub">Development Gateway</div></div><nav class="nav nav-missions"><div class="nav-missions-label">Development Lanes</div><div id="lane-rail" class="mission-rail">${rail}</div></nav></aside><main class="main"><div class="topbar"><div class="crumb">Development Lanes</div></div><div class="view">${html}</div></main></div></body></html>`;
}

const preparingList = renderGatewayShell({
  lanes: preparingLanes,
  selectedId: null,
  listReady: true,
  developmentResources: drainingResources,
});
const preparingDetail = renderGatewayShell({
  lanes: preparingLanes,
  selectedId: "alloy-runtime",
  lane: runtimePreparing,
  outputText: "Waiting for exclusive timing window.\nSessions remain alive.",
  listReady: true,
  statusOpen: true,
  developmentResources: drainingResources,
});
const activeDetail = renderGatewayShell({
  lanes: activeLanes,
  selectedId: "alloy-runtime",
  lane: runtimeActive,
  outputText: "Exclusive timing window active.\nRun timing certification now.",
  listReady: true,
  statusOpen: true,
  developmentResources: activeResources,
});

writeFileSync(join(OUT, "phase4-preparing-list.html"), page(preparingList, "Phase 4 preparing list", preparingLanes, null));
writeFileSync(join(OUT, "phase4-preparing.html"), page(preparingDetail, "Phase 4 preparing", preparingLanes, "alloy-runtime"));
writeFileSync(join(OUT, "phase4-active.html"), page(activeDetail, "Phase 4 exclusive active", activeLanes, "alloy-runtime"));
writeFileSync(join(OUT, "phase4-preparing.txt"), preparingDetail);
writeFileSync(join(OUT, "phase4-active.txt"), activeDetail);

const pwPath = join(ROOT, "web/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ headless: true });
try {
  for (const [file, shot] of [
    ["phase4-preparing-list.html", "phase4-desktop-preparing-list.png"],
    ["phase4-preparing.html", "phase4-desktop-preparing.png"],
    ["phase4-active.html", "phase4-desktop-active.png"],
  ]) {
    const pageRef = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pageRef.goto(`file://${join(OUT, file)}`, { waitUntil: "domcontentloaded" });
    await pageRef.screenshot({ path: join(OUT, shot), fullPage: true });
    await pageRef.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`file://${join(OUT, "phase4-preparing-list.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase4-mobile-preparing-list.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase4-preparing.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase4-mobile-preparing.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase4-active.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase4-mobile-active.png"), fullPage: true });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, out: OUT, continuation_sent: false, sessions_destroyed: false }));

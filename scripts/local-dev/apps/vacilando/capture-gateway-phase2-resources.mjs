#!/usr/bin/env node
/**
 * Phase 2 — fixture screenshots of resource wait / ready-to-resume / compact resources.
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
  resources: [
    { key: "browser_certification", label: "Browser certification", held_count: 1, holders: [{ lane_id: "alloy-records" }], queue: [{ lane_id: "alloy-comms" }], health: "held", capacity: 1 },
    { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
    { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [], queue: [], health: "available", capacity: 3 },
    { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [{ lane_id: "alloy-runtime" }], health: "not_configured", capacity: 1 },
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
  execution_run: {
    state: "WAITING_RESOURCE",
    instruction: "Communications ingress certification",
    started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    resource_wait: { label: "Browser certification", request_state: "QUEUED", queue_position: 1, ready_to_resume: false },
  },
};
const runtime = {
  ...records,
  lane_id: "alloy-runtime",
  label: "Runtime Performance",
  tmux: { alive: true, session: "alloy-runtime", attached: false },
  git: { branch: "agent/claude/4-runtime", state: "clean", ahead: 0, behind: 0 },
  worktree: { name: "wt4-runtime", path: "/x/wt4-runtime", managed: true },
  execution_run: {
    state: "WAITING_RESOURCE",
    instruction: "Exclusive timing certification",
    started_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    resource_wait: { label: "Exclusive machine timing", request_state: "QUEUED", queue_position: 1, ready_to_resume: false },
  },
};

const lanes = [records, comms, runtime];

function page(html, title, selectedId) {
  const rail = railHtml(lanes, selectedId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head><body><div class="app"><aside class="rail"><div class="brand"><div class="word">Vacilando</div><div class="sub">Development Gateway</div></div><nav class="nav nav-missions"><div class="nav-missions-label">Development Lanes</div><div id="lane-rail" class="mission-rail">${rail}</div></nav></aside><main class="main"><div class="topbar"><div class="crumb">Development Lanes</div></div><div class="view">${html}</div></main></div></body></html>`;
}

const listHtml = renderGatewayShell({
  lanes,
  selectedId: null,
  listReady: true,
  developmentResources: resources,
});
const waitHtml = renderGatewayShell({
  lanes,
  selectedId: "alloy-comms",
  lane: comms,
  outputText: "Waiting on browser certification.\nLane remains healthy.",
  listReady: true,
  statusOpen: true,
  developmentResources: resources,
});
const readyHtml = renderGatewayShell({
  lanes,
  selectedId: "alloy-records",
  lane: records,
  outputText: "Browser certification available.\nReady to resume.",
  listReady: true,
  statusOpen: true,
  developmentResources: resources,
});

writeFileSync(join(OUT, "phase2-list.html"), page(listHtml, "Phase 2 list", null));
writeFileSync(join(OUT, "phase2-waiting.html"), page(waitHtml, "Phase 2 waiting", "alloy-comms"));
writeFileSync(join(OUT, "phase2-ready.html"), page(readyHtml, "Phase 2 ready", "alloy-records"));
writeFileSync(join(OUT, "phase2-waiting.txt"), waitHtml);
writeFileSync(join(OUT, "phase2-ready.txt"), readyHtml);

const pwPath = join(ROOT, "web/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ headless: true });
try {
  for (const [file, shot] of [
    ["phase2-list.html", "phase2-desktop-list.png"],
    ["phase2-waiting.html", "phase2-desktop-waiting.png"],
    ["phase2-ready.html", "phase2-desktop-ready.png"],
  ]) {
    const pageRef = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pageRef.goto(`file://${join(OUT, file)}`, { waitUntil: "domcontentloaded" });
    await pageRef.screenshot({ path: join(OUT, shot), fullPage: true });
    await pageRef.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`file://${join(OUT, "phase2-waiting.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase2-mobile-waiting.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase2-ready.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase2-mobile-ready.png"), fullPage: true });
  await mobile.goto(`file://${join(OUT, "phase2-list.html")}`, { waitUntil: "domcontentloaded" });
  await mobile.screenshot({ path: join(OUT, "phase2-mobile-list.png"), fullPage: true });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, out: OUT, continuation_sent: false }));

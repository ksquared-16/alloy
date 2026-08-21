#!/usr/bin/env node
/**
 * Phase 1 Execution Run UI evidence. Renders Gateway view functions with
 * fixture run state. Does not send to a live Claude session.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";
import {
  renderGatewayShell,
  renderLaneList,
} from "./public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const OUT = join(HERE, "qa/gateway-v2");
const css = readFileSync(join(HERE, "public/styles.css"), "utf8");

mkdirSync(OUT, { recursive: true });

const identity = {
  lane_id: "alloy-identity",
  label: "Access Identity V2",
  slot: null,
  claude: { presence: "present" },
  tmux: { alive: true, session: "alloy-identity", attached: false },
  git: { branch: "agent/claude/1-access-identity-v2", state: "clean", ahead: 47, behind: 0 },
  worktree: { name: "wt1-access-identity-v2", path: "/x/wt1", managed: true },
  last_activity_ms: Date.now() - 12000,
};

const comms = {
  ...identity,
  lane_id: "alloy-comms",
  label: "Communications",
  git: { ...identity.git, branch: "agent/claude/2-comms" },
  execution_run: {
    state: "WAITING_RESOURCE",
    instruction: "Certify ingress",
    resource_wait: { label: "Waiting for browser certification" },
  },
};

function pageHtml(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body><div class="app"><main class="main" style="padding:16px">${inner}</main></div></body></html>`;
}

const executing = {
  ...identity,
  execution_run: {
    state: "EXECUTING",
    instruction: "Complete the remaining Communications ingress certification",
    started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
};

const needs = {
  ...identity,
  execution_run: {
    state: "NEEDS_INPUT",
    instruction: "Complete the remaining Communications ingress certification",
    state_reason: "Which host should we certify against?",
    completion_report: { summary: "Which host should we certify against?" },
    started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
};

const complete = {
  ...identity,
  execution_run: {
    state: "COMPLETE",
    instruction: "Vacilando Execution Run certification only.",
    completion_report: { summary: "EXECUTION_RUN_CERTIFIED" },
    started_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    completed_at: new Date().toISOString(),
  },
};

const failed = {
  ...identity,
  execution_run: {
    state: "FAILED",
    instruction: "Vacilando Execution Run certification only.",
    completion_report: { summary: "delivery_failed" },
    state_reason: "delivery_failed",
  },
};

const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
const { chromium } = pw;

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function shot(name, html, width, height) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(pageHtml(html), { waitUntil: "domcontentloaded" });
      await page.screenshot({ path: join(OUT, name), fullPage: true });
      await page.close();
    }

    const list = renderLaneList([executing, comms, complete], "alloy-identity");
    await shot("desktop-run-list.png", list, 1440, 900);
    await shot("mobile-run-list.png", list, 390, 844);

    await shot("desktop-run-executing.png", renderGatewayShell({
      lanes: [executing, comms],
      selectedId: "alloy-identity",
      lane: executing,
      outputText: "fixture output — not TUI-derived run state",
      listReady: true,
      lastInstruction: {
        instruction: executing.execution_run.instruction,
        status: "delivered",
        delivered_at: executing.execution_run.started_at,
      },
    }), 1440, 900);

    await shot("mobile-run-needs-input.png", renderGatewayShell({
      lanes: [needs],
      selectedId: "alloy-identity",
      lane: needs,
      outputText: "waiting on operator",
      listReady: true,
    }), 390, 844);

    await shot("desktop-run-complete.png", renderGatewayShell({
      lanes: [complete],
      selectedId: "alloy-identity",
      lane: complete,
      outputText: "done",
      listReady: true,
    }), 1440, 900);

    await shot("desktop-run-failed.png", renderGatewayShell({
      lanes: [failed],
      selectedId: "alloy-identity",
      lane: failed,
      outputText: "pane still alive",
      listReady: true,
    }), 1440, 900);

    writeFileSync(join(OUT, "execution-run-ui.txt"), [
      "Phase 1 Execution Run UI evidence",
      "Source: Gateway view functions + fixture run store objects",
      "Not TUI scraping. Live identity Claude was not instructed.",
      "",
    ].join("\n"));
    console.log("wrote", OUT);
  } finally {
    await browser.close();
  }
});

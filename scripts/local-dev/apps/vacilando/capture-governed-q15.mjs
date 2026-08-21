#!/usr/bin/env node
/**
 * Browser-certify Q15 governed-action UX (desktop + mobile viewport).
 * Renders the real Gateway view helpers. Optionally snapshots live Identity.
 * Holds the browser-certification lease. Never prints the Gateway token.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";
import {
  renderCurrentWork,
  renderGatewayShell,
  deriveLaneExecutionPosture,
} from "./public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const OUT = join(HERE, "qa/gateway-v2");
const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3020";

mkdirSync(OUT, { recursive: true });

const run = {
  run_id: "erun_q15cert",
  lane_id: "alloy-identity",
  state: "WAITING_RESOURCE",
  state_reason: "Waiting on Director",
  instruction: "Continue Access & Identity V2 — Q15 census then W-15/W-20",
  resource_wait: {
    resource_key: "director_governed_action",
    label: "Director",
    summary: "Q15 census requested",
    governed_request_id: "gar_q15cert",
  },
  governed_action: {
    request_id: "gar_q15cert",
    status: "awaiting_operator",
    title: "Q15 census requested",
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    reason_worker_cannot_execute: "Worker cannot access deployed tenant credentials by design.",
  },
};

const lane = {
  lane_id: "alloy-identity",
  label: "Access Identity V2",
  durable: true,
  aliases: ["alloy-identity"],
  execution_run: run,
  binding: { worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2" },
};

const html = `<!doctype html><html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="${BASE}/styles.css"/>
<style>body{margin:0;background:#0e1116}</style>
</head><body>${renderGatewayShell({
  lanes: [lane],
  selectedId: "alloy-identity",
  lane,
  outputText: "Worker: I need a governed read-only census against alloy_deployed_primary.",
  composer: { draft: "" },
})}</body></html>`;

writeFileSync(join(OUT, "q15-waiting-on-director.html"), html);
const work = renderCurrentWork(run);
writeFileSync(join(OUT, "q15-waiting-on-director.txt"), [
  deriveLaneExecutionPosture(lane).headline,
  work.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
].join("\n"));

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

await withBrowserCertLease(async () => {
  const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
  const { chromium } = pw;
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.setContent(html, { waitUntil: "domcontentloaded" });
    const state = await desktop.locator("[data-gw-work] .gw-work-state").textContent();
    if (!/Waiting on Director/i.test(state || "")) fail(`expected Waiting on Director, got ${state}`);
    const ready = await desktop.locator("text=Ready for instruction").count();
    if (ready) fail("Ready for instruction visible during governed wait");
    await desktop.screenshot({ path: join(OUT, "desktop-q15-waiting-director.png") });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.setContent(html, { waitUntil: "domcontentloaded" });
    await mobile.screenshot({ path: join(OUT, "mobile-q15-waiting-director.png") });

    try {
      const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      live.setDefaultTimeout(12000);
      await live.goto(`${BASE}/?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
      const login = live.locator("#gw-login");
      if (await login.isVisible().catch(() => false)) {
        console.log(JSON.stringify({ live: "login_required", note: "fixture screenshots captured" }));
      } else {
        await live.waitForSelector("[data-gw]", { timeout: 10000 }).catch(() => {});
        await live.screenshot({ path: join(OUT, "desktop-q15-live-gateway.png") });
      }
    } catch (e) {
      console.log(JSON.stringify({ live: "skipped", error: String(e && e.message || e) }));
    }

    console.log(JSON.stringify({
      ok: !process.exitCode,
      posture: deriveLaneExecutionPosture(lane),
      artifacts: [
        "desktop-q15-waiting-director.png",
        "mobile-q15-waiting-director.png",
        "q15-waiting-on-director.html",
        "q15-waiting-on-director.txt",
      ],
    }));
  } finally {
    await browser.close();
  }
});

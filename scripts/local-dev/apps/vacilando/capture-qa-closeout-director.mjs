#!/usr/bin/env node
/** QA capture: Closeout readiness (Slot 4) + Trustworthy Director sends (Slot 6). node 18+. */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/closeout-and-director-delivery-v1";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
const openTab = async (slot, tab) => {
  await p.goto(`${BASE}/?_=${Date.now()}#/command/worker/${slot}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(`[data-tab="${tab}"]`, { timeout: 25000 }).catch(() => {});
  await sleep(1200);
  for (let i = 0; i < 4 && !(await p.$(`.tab.on`)); i++) { const t = await p.$(`[data-tab="${tab}"]`); if (t) await t.click(); await sleep(800); }
  const t = await p.$(`[data-tab="${tab}"]`); if (t) await t.click();
  await sleep(2500);
};
try {
  // 01 — Closeout readiness on the real Slot 4 (Review planning; Delete blocked).
  await openTab(4, "closeout"); await shot("01-closeout-readiness-slot4");
  // 02 — Trustworthy Director sends on Slot 6 (durable requests + statuses).
  await openTab(6, "director"); await shot("02-director-durable-sends-slot6");
  console.log("QA capture complete →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }

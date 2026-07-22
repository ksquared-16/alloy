#!/usr/bin/env node
/** Persist V1 acceptance-gate screenshots by driving the LIVE Project OS.
 *  Run with node 18+: node scripts/local-dev/apps/vacilando/capture-qa-v1.mjs */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/v1";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
const goto = async (h) => { await p.goto(`${BASE}/?_=${Date.now()}#/${h}`, { waitUntil: "domcontentloaded" }); await sleep(3000); };
try {
  await goto("command"); await sleep(2500); await shot("01-dashboard"); // dashboard is the default center
  await p.click('[data-sel="4"]'); await sleep(2500); await shot("02-worker-selected"); // replaces in place
  await p.click('[data-tab="director"]'); await sleep(1500); await shot("03-director"); // real round-trip log
  await p.click('[data-tab="resources"]'); await sleep(1200); await shot("04-resources");
  await p.click('[data-tab="outputs"]'); await sleep(2500); await shot("05-outputs-screenshot");
  await p.click('[data-tab="repository"]'); await sleep(1800); await shot("06-repository-pr");
  await p.click('[data-prcmd]'); await sleep(600); await p.click('.ov .ok'); await sleep(1200); await shot("07-promotion-preview"); await p.click('.ov .cancel'); await sleep(500);
  await goto("command"); await sleep(2000);
  await p.click('[data-start]'); await sleep(600); await p.fill('.ov .f-name', "cert-fixture-mission"); await shot("08-start-work-preview"); await p.click('.ov .cancel'); await sleep(400);
  await p.click('[data-end="4"]'); await sleep(700); await shot("09-end-work-preview"); await p.click('.ov .cancel'); await sleep(400);
  await p.click('[data-review]'); await sleep(1000); await shot("10-review"); await p.click('.ov .cancel'); await sleep(400);
  await goto("policies"); await sleep(1800); await shot("11-policies");
  await goto("history"); await sleep(1800); await shot("12-work-history");
  console.log("V1 QA capture complete →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }

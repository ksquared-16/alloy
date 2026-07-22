#!/usr/bin/env node
/** QA: governed-action immediate feedback (Discard, Slot 4). node 18+. */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/closeout-and-director-delivery-v1";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
try {
  await p.goto(`${BASE}/?_=${Date.now()}#/command/worker/4`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-tab="closeout"]', { timeout: 25000 }).catch(() => {});
  await sleep(1200);
  const ct = await p.$('[data-tab="closeout"]'); if (ct) await ct.click();
  await p.waitForSelector('[data-discardcmd]', { timeout: 20000 }).catch(() => {});
  await sleep(600);
  // open the typed dialog, type the phrase, confirm — then screenshot the IMMEDIATE running toast
  const d = await p.$('[data-discardcmd]'); if (d) await d.click();
  await sleep(400);
  await p.fill('.ov .f-ct', 'discard 4').catch(() => {});
  await p.click('.ov .ok').catch(() => {});
  await sleep(150); // toast fires synchronously; capture it before it dismisses
  await shot("03-governed-action-immediate-feedback");
  console.log("captured governed-feedback QA →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }

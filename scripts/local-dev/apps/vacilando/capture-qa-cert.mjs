#!/usr/bin/env node
/** Persist V1-CERTIFICATION screenshots by driving the LIVE Project OS after the
 *  disposable-fixture lifecycle (commit→push→draft PR→read→close→delete→free slot).
 *  Run with node 18+: node scripts/local-dev/apps/vacilando/capture-qa-cert.mjs */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/v1-certification";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
const goto = async (h) => { await p.goto(`${BASE}/?_=${Date.now()}#/${h}`, { waitUntil: "domcontentloaded" }); await sleep(3500); };
try {
  // 01 — dashboard reflects the completed lifecycle: slot 2 freed, 1 capacity available,
  //      scheduler recommends the freed slot 2.
  await goto("command"); await sleep(2500); await shot("01-dashboard-slot2-freed");
  // 02 — a live worker's Repository tab: authoritative PR state + governed repo commands.
  await p.click('[data-sel="1"]'); await sleep(2500);
  await p.click('[data-tab="repository"]'); await sleep(2000); await shot("02-repository-governed");
  // 03 — Policies surface the exact governed command list (commit/push/open_pr/close_pr/merge/delete).
  await goto("policies"); await sleep(2000); await shot("03-policies-governed-commands");
  // 04 — Work History: the execution audit records the fixture lifecycle events.
  await goto("history"); await sleep(2000); await shot("04-work-history-audit");
  console.log("V1 certification QA capture complete →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }
